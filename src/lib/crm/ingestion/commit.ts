import { crmRepository } from '@/lib/crm/repository';
import { computePurchaseFingerprint, normalizeName, normalizeSku } from './reconciliation';
import type { BatchCommitResult, CrmImportRow, TargetLifecycle } from './types';

export async function commitIngestionJobBatch(
  organizationId: string,
  jobId: string,
  options: {
    batchSize?: number;
    batchIndex?: number;
    actorProfileId?: string | null;
  } = {},
): Promise<BatchCommitResult> {
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');

  const job = await crmRepository.getImportJob(jobId, organizationId);
  if (!job) throw new Error('IMPORT_JOB_NOT_FOUND');
  if (job.status === 'CANCELLED') throw new Error('JOB_IS_CANCELLED');
  if (job.status === 'COMPLETED') {
    return {
      job_id: jobId,
      batch_index: 0,
      total_batches: 1,
      batch_size: 0,
      inserted_companies: 0,
      inserted_purchases: 0,
      duplicate_purchases: 0,
      errors: [],
      status: 'COMPLETED',
    };
  }

  // Set job status to COMMITTING if not already
  if (job.status !== 'COMMITTING') {
    await crmRepository.updateImportJob(jobId, organizationId, {
      status: 'COMMITTING',
    });
  }

  const allRows = await crmRepository.listImportRows(organizationId, jobId, 10000);
  const readyRows = allRows.filter((r) => r.row_status === 'READY');

  const batchSize = Math.max(1, options.batchSize ?? 500);
  const batchIndex = options.batchIndex ?? 0;
  const totalBatches = Math.max(1, Math.ceil(readyRows.length / batchSize));

  const startIdx = batchIndex * batchSize;
  const currentBatchRows = readyRows.slice(startIdx, startIdx + batchSize);

  let insertedCompanies = 0;
  let insertedPurchases = 0;
  let duplicatePurchases = 0;
  const batchErrors: Array<{ row_index: number; error: string }> = [];

  // Cache companies in memory for fast lookup during batch
  const existingCompanies = await crmRepository.listCompanies(organizationId);
  const companyByName = new Map<string, string>();
  const companyByTax = new Map<string, string>();

  for (const c of existingCompanies) {
    companyByName.set(normalizeName(c.name), c.id);
    if (c.tax_id) companyByTax.set(c.tax_id.replace(/[^0-9a-zA-Z]/g, '').toUpperCase(), c.id);
  }

  try {
    for (const row of currentBatchRows) {
      try {
        let finalCompanyId = row.company_id;

        // 1. Reconcile or create Company
        if (row.customer_raw) {
          const normName = normalizeName(row.customer_raw);
          const normTax = row.tax_id_raw ? row.tax_id_raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase() : '';

          let matchedId = normTax ? companyByTax.get(normTax) : undefined;
          if (!matchedId) matchedId = companyByName.get(normName);

          if (!matchedId) {
            // Company does not exist in CRM -> Create it
            const newCompany = await crmRepository.createCompany({
              organization_id: organizationId,
              name: row.customer_raw,
              legal_name: null,
              tax_id: row.tax_id_raw || null,
              external_id: null,
              country_code: row.country_code_raw || 'PY',
              city: row.city_raw || null,
              website: row.website_raw || null,
              phone: row.phone_raw || null,
              email: row.email_raw || null,
              source: 'IMPORT',
              notes: null,
              owner_profile_id: options.actorProfileId ?? null,
              lifecycle_stage: job.target_lifecycle,
            });

            matchedId = newCompany.id;
            companyByName.set(normName, matchedId);
            if (normTax) companyByTax.set(normTax, matchedId);
            insertedCompanies += 1;

            // Create contact if contact_name_raw is present
            if (row.contact_name_raw) {
              await crmRepository.createContact({
                organization_id: organizationId,
                company_id: matchedId,
                full_name: row.contact_name_raw,
                email: row.email_raw || null,
                whatsapp_phone: row.phone_raw || null,
                phone: row.phone_raw || null,
                job_title: null,
              });
            }
          } else {
            // Company exists -> Apply lifecycle preservation rules
            const existing = await crmRepository.getCompany(matchedId, organizationId);
            if (existing) {
              // If target is CUSTOMER and existing is PROSPECT -> upgrade to CUSTOMER
              if (job.target_lifecycle === 'CUSTOMER' && existing.lifecycle_stage === 'PROSPECT') {
                await crmRepository.updateCompany(matchedId, organizationId, {
                  lifecycle_stage: 'CUSTOMER',
                });
              }
              // If target is PROSPECT and existing is CUSTOMER -> NEVER downgrade
            }
          }

          finalCompanyId = matchedId;
        }

        // 2. Insert Purchase if applicable
        if (
          finalCompanyId &&
          row.sku &&
          row.purchase_date &&
          row.quantity != null &&
          row.quantity > 0 &&
          (job.dataset_type === 'TRANSACTION_HISTORY' || job.dataset_type === 'MIXED_TRANSACTIONAL_EXPORT')
        ) {
          const hasDoc = Boolean(row.document_number && row.line_number != null);
          const fingerprint = hasDoc
            ? null
            : computePurchaseFingerprint({
                organization_id: organizationId,
                company_id: finalCompanyId,
                purchase_date: row.purchase_date,
                document: row.document_number,
                sku: row.sku,
                quantity: row.quantity,
                total_value: row.total_value,
              });

          const { duplicate } = await crmRepository.insertPurchaseIdempotent({
            organization_id: organizationId,
            company_id: finalCompanyId,
            contact_id: null,
            purchase_date: row.purchase_date,
            external_document_id: row.document_number || null,
            document_number: row.document_number || null,
            line_number: row.line_number ?? null,
            product_id: null,
            sku: normalizeSku(row.sku),
            product_name: row.product_raw?.slice(0, 200) || row.sku,
            quantity: row.quantity,
            unit: 'u',
            unit_price: row.unit_price ?? null,
            total_value: row.total_value ?? null,
            currency: row.currency || 'USD',
            source: 'IMPORT',
            fingerprint,
            metadata: {},
          });

          if (duplicate) duplicatePurchases += 1;
          else insertedPurchases += 1;
        }
      } catch (err) {
        batchErrors.push({
          row_index: row.row_index,
          error: err instanceof Error ? err.message : 'ROW_COMMIT_FAILED',
        });
      }
    }

    const isLastBatch = batchIndex >= totalBatches - 1;
    const finalStatus = isLastBatch
      ? batchErrors.length === readyRows.length && readyRows.length > 0
        ? 'FAILED'
        : 'COMPLETED'
      : 'COMMITTING';

    if (isLastBatch) {
      await crmRepository.updateImportJob(jobId, organizationId, {
        status: finalStatus,
        committed_at: finalStatus === 'COMPLETED' ? new Date().toISOString() : null,
      });
    }

    return {
      job_id: jobId,
      batch_index: batchIndex,
      total_batches: totalBatches,
      batch_size: currentBatchRows.length,
      inserted_companies: insertedCompanies,
      inserted_purchases: insertedPurchases,
      duplicate_purchases: duplicatePurchases,
      errors: batchErrors,
      status: finalStatus,
    };
  } catch (error) {
    // If an unhandled error happens, mark job as FAILED (resumable)
    await crmRepository.updateImportJob(jobId, organizationId, {
      status: 'FAILED',
    });
    throw error;
  }
}

/**
 * Commits an entire job across all batches sequentially.
 */
export async function commitEntireIngestionJob(
  organizationId: string,
  jobId: string,
  options: {
    batchSize?: number;
    actorProfileId?: string | null;
  } = {},
): Promise<{
  inserted_companies: number;
  inserted_purchases: number;
  duplicate_purchases: number;
  errors: Array<{ row_index: number; error: string }>;
  status: string;
}> {
  const batchSize = options.batchSize ?? 500;
  let batchIndex = 0;
  let totalBatches = 1;
  let totalCompanies = 0;
  let totalPurchases = 0;
  let totalDuplicates = 0;
  const allErrors: Array<{ row_index: number; error: string }> = [];

  do {
    const res = await commitIngestionJobBatch(organizationId, jobId, {
      batchSize,
      batchIndex,
      actorProfileId: options.actorProfileId,
    });
    totalBatches = res.total_batches;
    totalCompanies += res.inserted_companies;
    totalPurchases += res.inserted_purchases;
    totalDuplicates += res.duplicate_purchases;
    allErrors.push(...res.errors);
    batchIndex++;
  } while (batchIndex < totalBatches);

  return {
    inserted_companies: totalCompanies,
    inserted_purchases: totalPurchases,
    duplicate_purchases: totalDuplicates,
    errors: allErrors,
    status: 'COMPLETED',
  };
}
