import * as XLSX from 'xlsx';
import { crmRepository } from '@/lib/crm/repository';
import { repository as dbRepo } from '@/lib/db/repository';
import {
  extractSpreadsheetStructure,
  inferCommercialFileSchema,
} from './schema-inference';
import {
  matchCompanyRecord,
  matchProductRecord,
  normalizeName,
  normalizeSku,
  normalizeTaxId,
  parseDateCell,
  parseNum,
  type SkuRef,
} from './reconciliation';
import type {
  CrmImportJob,
  CrmImportRow,
  DatasetType,
  IngestionCockpitSummary,
  IngestionRowStatus,
  ProductRowStatus,
  CustomerRowStatus,
  TargetLifecycle,
  UnresolvedGroup,
} from './types';

function cleanStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

async function loadOrgCatalog(organizationId: string): Promise<{
  companies: Array<{ id: string; name: string; legal_name?: string | null; tax_id?: string | null; external_id?: string | null; lifecycle_stage?: string | null }>;
  skus: SkuRef[];
  customerAliases: Array<{ alias_normalized: string; company_id: string }>;
  productAliases: Array<{ alias_normalized: string; sku: string }>;
}> {
  const [companies, products, attrs, customerAliases, productAliases] = await Promise.all([
    crmRepository.listCompanies(organizationId),
    dbRepo.getProducts(organizationId).catch(() => []),
    dbRepo.getSKUs(organizationId).catch(() => []),
    crmRepository.listCustomerAliases(organizationId),
    crmRepository.listProductAliases(organizationId),
  ]);

  const productById = new Map(
    (products as Array<{ id: string; name: string; category?: string }>).map((p) => [p.id, p]),
  );

  const skus: SkuRef[] = (attrs as Array<{ sku: string; product_id: string }>).map((a) => {
    const prod = productById.get(a.product_id);
    return {
      sku: a.sku,
      product_id: a.product_id,
      name: prod?.name ?? a.sku,
      category: prod?.category ?? null,
    };
  });

  return { companies, skus, customerAliases, productAliases };
}

export interface IngestionOptions {
  buffer: Buffer;
  filename: string;
  targetLifecycle: TargetLifecycle;
  createdBy?: string | null;
  overrideSheetName?: string;
  overrideHeaderRowIndex?: number;
  overrideMapping?: Record<string, number | null>;
  overrideDatasetType?: DatasetType;
  pendingResolutions?: Record<string, string>; // raw product -> target SKU
}

export async function createIngestionJob(
  organizationId: string,
  options: IngestionOptions,
): Promise<IngestionCockpitSummary> {
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');

  const structure = extractSpreadsheetStructure(options.buffer);
  if (structure.sheetNames.length === 0) throw new Error('EMPTY_FILE');

  const hasManualOverrides = Boolean(
    options.overrideSheetName !== undefined ||
      options.overrideMapping !== undefined ||
      options.overrideHeaderRowIndex !== undefined ||
      options.overrideDatasetType !== undefined,
  );

  let chosenSheet: string;
  let headerRowIndex: number;
  let mapping: Record<string, number | null>;
  let datasetType: DatasetType;
  let llmInferred = false;

  if (hasManualOverrides) {
    chosenSheet =
      options.overrideSheetName && structure.sheetNames.includes(options.overrideSheetName)
        ? options.overrideSheetName
        : structure.sheetNames[0];
    headerRowIndex = options.overrideHeaderRowIndex ?? 0;
    datasetType = options.overrideDatasetType ?? 'TRANSACTION_HISTORY';
    mapping = {
      company_name: null,
      contact_name: null,
      phone: null,
      email: null,
      country_code: null,
      city: null,
      tax_id: null,
      website: null,
      customer_name: null,
      purchase_date: null,
      product_description: null,
      sku: null,
      quantity: null,
      document_number: null,
      line_number: null,
      unit_price: null,
      total_value: null,
      currency: null,
      ...(options.overrideMapping ?? {}),
    };
  } else {
    const inferred = await inferCommercialFileSchema(structure);
    if (inferred) {
      chosenSheet = inferred.sheet_name;
      headerRowIndex = inferred.header_row_index;
      mapping = inferred.mapping;
      datasetType = inferred.dataset_type;
      llmInferred = true;
    } else {
      chosenSheet = structure.sheetNames[0];
      const sheetSample = structure.sheets[chosenSheet];
      headerRowIndex = 0;
      if (sheetSample?.rawSampleRows) {
        const firstNonEmpty = sheetSample.rawSampleRows.findIndex((r) =>
          r.some((c) => c.trim().length > 0),
        );
        if (firstNonEmpty >= 0) headerRowIndex = firstNonEmpty;
      }
      datasetType = 'TRANSACTION_HISTORY';
      mapping = {
        company_name: null,
        contact_name: null,
        phone: null,
        email: null,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
        customer_name: null,
        purchase_date: null,
        product_description: null,
        sku: null,
        quantity: null,
        document_number: null,
        line_number: null,
        unit_price: null,
        total_value: null,
        currency: null,
      };
      llmInferred = false;
    }
  }

  const wb = XLSX.read(options.buffer, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[chosenSheet];
  if (!ws) throw new Error('EMPTY_FILE');

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (matrix.length === 0) throw new Error('EMPTY_FILE');

  const rawHeaderRow = Array.isArray(matrix[headerRowIndex]) ? matrix[headerRowIndex] : [];
  const maxCols = Math.max(rawHeaderRow.length, structure.sheets[chosenSheet]?.colCount || 0);
  const columns: string[] = [];
  for (let i = 0; i < maxCols; i++) {
    const val = cleanStr(rawHeaderRow[i]);
    columns.push(val || `Columna ${i + 1}`);
  }

  const cat = await loadOrgCatalog(organizationId);
  const dataRows = matrix.slice(headerRowIndex + 1);

  const jobId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Pre-scan unique customer names/tax IDs across data rows for transaction/mixed files
  const discoveredCustomers = new Map<string, { id: string; name: string; taxId: string | null }>();

  // Extract and process each row up to 10,000 rows
  const stagedRows: CrmImportRow[] = [];
  const unresolvedProductGroupsMap = new Map<string, UnresolvedGroup>();
  const unresolvedCustomerGroupsMap = new Map<string, UnresolvedGroup>();
  const errorsSummary: Array<{ row_index: number; error: string }> = [];

  const pendingResolutions = options.pendingResolutions ?? {};

  let rowIndex = 0;
  for (const rawRow of dataRows) {
    if (!Array.isArray(rawRow)) continue;
    if (rawRow.every((c) => cleanStr(c) === '')) continue;
    if (rowIndex >= 10000) break;

    const rowIdx = rowIndex++;
    const strPayload: Record<string, unknown> = {};
    rawRow.forEach((val, idx) => {
      strPayload[columns[idx] || String(idx)] = val;
    });

    const get = (key: string): string => {
      const idx = mapping[key];
      if (idx == null || idx < 0 || idx >= rawRow.length) return '';
      return cleanStr(rawRow[idx]);
    };

    const getRaw = (key: string): unknown => {
      const idx = mapping[key];
      if (idx == null || idx < 0 || idx >= rawRow.length) return null;
      return rawRow[idx];
    };

    // Customer fields
    const customerName = get('customer_name') || get('company_name') || null;
    const taxId = get('tax_id') || null;
    const contactName = get('contact_name') || null;
    const phone = get('phone') || null;
    const email = get('email') || null;
    const countryCode = get('country_code') || 'PY';
    const city = get('city') || null;
    const website = get('website') || null;

    // Transaction fields
    const purchaseDate = parseDateCell(getRaw('purchase_date'));
    const productDesc = get('product_description') || null;
    const skuRaw = get('sku') || null;
    const quantity = parseNum(getRaw('quantity'));
    const docNum = get('document_number') || null;
    const lineNum = parseNum(getRaw('line_number'));
    const unitPrice = parseNum(getRaw('unit_price'));
    const totalVal = parseNum(getRaw('total_value'));
    const currency = get('currency') || 'USD';

    const rowErrors: string[] = [];

    // Validation per dataset type
    if (datasetType === 'ACCOUNT_LIST') {
      if (!customerName) rowErrors.push('Falta nombre de empresa');
    } else {
      if (!customerName) rowErrors.push('Falta cliente');
      if (!purchaseDate) rowErrors.push('Fecha de compra inválida o ausente');
      if (quantity == null || quantity <= 0) rowErrors.push('Cantidad inválida o ausente');
      if (!productDesc && !skuRaw) rowErrors.push('Falta producto o SKU');
    }

    // Customer resolution
    let resolvedCompanyId: string | null = null;
    let customerStatus: CustomerRowStatus = 'UNRESOLVED';

    if (customerName) {
      const cm = matchCompanyRecord({ cliente: customerName, tax_id: taxId }, cat.companies, cat.customerAliases);
      if (cm.company_id) {
        resolvedCompanyId = cm.company_id;
        customerStatus = 'RESOLVED';
      } else if (cm.candidates && cm.candidates.length > 0) {
        customerStatus = 'UNRESOLVED';
        const key = normalizeName(customerName);
        if (!unresolvedCustomerGroupsMap.has(key)) {
          unresolvedCustomerGroupsMap.set(key, {
            type: 'customer',
            raw_value: customerName,
            normalized_value: key,
            occurrences: 1,
            candidates: cm.candidates,
          });
        } else {
          unresolvedCustomerGroupsMap.get(key)!.occurrences += 1;
        }
      } else {
        // New unique company discovered for creation
        const normKey = normalizeName(customerName);
        let discovered = discoveredCustomers.get(normKey);
        if (!discovered) {
          discovered = {
            id: crypto.randomUUID(),
            name: customerName,
            taxId: taxId || null,
          };
          discoveredCustomers.set(normKey, discovered);
        }
        resolvedCompanyId = discovered.id;
        customerStatus = 'RESOLVED';
      }
    } else {
      customerStatus = 'INVALID';
    }

    // Product & SKU resolution
    let resolvedSku: string | null = null;
    let productStatus: ProductRowStatus = 'SKIPPED';

    const prodKey = productDesc || skuRaw;
    if (prodKey) {
      if (pendingResolutions[prodKey]) {
        const targetSku = pendingResolutions[prodKey];
        const matchInCatalog = cat.skus.find((s) => normalizeSku(s.sku) === normalizeSku(targetSku));
        if (matchInCatalog) {
          resolvedSku = matchInCatalog.sku;
          productStatus = matchInCatalog.category === 'cups' ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP';
        } else {
          resolvedSku = targetSku;
          productStatus = 'RESOLVED_CUP';
        }
      } else {
        const pm = matchProductRecord({ producto: productDesc, sku_raw: skuRaw }, cat.skus, cat.productAliases);
        resolvedSku = pm.sku;
        productStatus = pm.status;

        if (pm.status === 'PRODUCT_UNRESOLVED') {
          const normProdKey = normalizeName(prodKey);
          if (!unresolvedProductGroupsMap.has(normProdKey)) {
            const cupCandidates = cat.skus
              .filter((s) => s.category === 'cups')
              .map((s) => ({ sku: s.sku, name: s.name }))
              .slice(0, 6);
            unresolvedProductGroupsMap.set(normProdKey, {
              type: 'product',
              raw_value: prodKey,
              normalized_value: normProdKey,
              occurrences: 1,
              candidates: pm.candidates && pm.candidates.length > 0 ? pm.candidates : cupCandidates,
            });
          } else {
            unresolvedProductGroupsMap.get(normProdKey)!.occurrences += 1;
          }
        }
      }
    }

    // Overall row status
    let rowStatus: IngestionRowStatus = 'READY';
    if (rowErrors.length > 0) {
      rowStatus = 'INVALID';
      errorsSummary.push({ row_index: rowIdx, error: rowErrors.join(', ') });
    } else if (datasetType !== 'ACCOUNT_LIST' && productStatus === 'PRODUCT_UNRESOLVED') {
      rowStatus = 'PRODUCT_UNRESOLVED';
    } else if (customerStatus === 'UNRESOLVED') {
      rowStatus = 'CUSTOMER_UNRESOLVED';
    } else {
      rowStatus = 'READY';
    }

    stagedRows.push({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      job_id: jobId,
      row_index: rowIdx,
      customer_raw: customerName,
      tax_id_raw: taxId,
      contact_name_raw: contactName,
      phone_raw: phone,
      email_raw: email,
      country_code_raw: countryCode,
      city_raw: city,
      website_raw: website,
      purchase_date: purchaseDate,
      product_raw: productDesc,
      sku_raw: skuRaw,
      quantity,
      document_number: docNum,
      line_number: lineNum != null && Number.isInteger(lineNum) ? lineNum : null,
      unit_price: unitPrice,
      total_value: totalVal,
      currency,
      company_id: resolvedCompanyId,
      sku: resolvedSku,
      customer_status: customerStatus,
      product_status: productStatus,
      row_status: rowStatus,
      errors: rowErrors,
      raw_payload: strPayload,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  // Calculate metrics
  const totalRows = stagedRows.length;
  const resolvedCups = stagedRows.filter((r) => r.product_status === 'RESOLVED_CUP').length;
  const resolvedNonCups = stagedRows.filter((r) => r.product_status === 'RESOLVED_NON_CUP').length;
  const unresolvedProducts = stagedRows.filter((r) => r.row_status === 'PRODUCT_UNRESOLVED').length;
  const unresolvedClients = stagedRows.filter((r) => r.row_status === 'CUSTOMER_UNRESOLVED').length;
  const invalidRows = stagedRows.filter((r) => r.row_status === 'INVALID').length;
  const ignoredRows = stagedRows.filter((r) => r.row_status === 'IGNORED').length;
  const readyRows = stagedRows.filter((r) => r.row_status === 'READY').length;

  const uniqueClients = new Set(
    stagedRows.map((r) => r.customer_raw).filter((c): c is string => Boolean(c)),
  ).size;

  const jobStatus =
    unresolvedProducts > 0 || unresolvedClients > 0
      ? 'NEEDS_REVIEW'
      : invalidRows === totalRows
        ? 'FAILED'
        : 'READY';

  const jobRecord: CrmImportJob = {
    id: jobId,
    organization_id: organizationId,
    filename: options.filename,
    target_lifecycle: options.targetLifecycle,
    dataset_type: datasetType,
    status: jobStatus,
    sheet_name: chosenSheet,
    header_row_index: headerRowIndex,
    mapping_json: mapping,
    total_rows: totalRows,
    resolved_rows: readyRows,
    pending_rows: unresolvedProducts + unresolvedClients,
    invalid_rows: invalidRows,
    ignored_rows: ignoredRows,
    created_by: options.createdBy ?? null,
    created_at: nowIso,
    updated_at: nowIso,
    committed_at: null,
  };

  // Persist job and staged rows
  await crmRepository.createImportJob(jobRecord);
  await crmRepository.insertImportRows(stagedRows);

  const sampleRows = stagedRows.slice(0, 50).map((r) => ({
    row_index: r.row_index,
    cliente: r.customer_raw,
    fecha: r.purchase_date,
    producto: r.product_raw,
    sku: r.sku,
    cantidad: r.quantity,
    status: r.row_status,
  }));

  return {
    job_id: jobId,
    filename: options.filename,
    dataset_type: datasetType,
    target_lifecycle: options.targetLifecycle,
    status: jobStatus,
    sheet_name: chosenSheet,
    header_row_index: headerRowIndex,
    columns,
    mapping,
    total_movements: totalRows,
    unique_clients_count: uniqueClients,
    resolved_cups_count: resolvedCups,
    resolved_non_cups_count: resolvedNonCups,
    unresolved_products_count: unresolvedProducts,
    unresolved_clients_count: unresolvedClients,
    invalid_rows_count: invalidRows,
    unresolved_product_groups: Array.from(unresolvedProductGroupsMap.values()),
    unresolved_customer_groups: Array.from(unresolvedCustomerGroupsMap.values()),
    errors_summary: errorsSummary.slice(0, 100),
    sample_rows: sampleRows,
    llm_inferred: llmInferred,
  };
}

export async function getIngestionCockpitSummary(
  organizationId: string,
  jobId: string,
): Promise<IngestionCockpitSummary | null> {
  const job = await crmRepository.getImportJob(jobId, organizationId);
  if (!job) return null;

  const rows = await crmRepository.listImportRows(organizationId, jobId, 10000);
  const cat = await loadOrgCatalog(organizationId);

  const unresolvedProductGroupsMap = new Map<string, UnresolvedGroup>();
  const unresolvedCustomerGroupsMap = new Map<string, UnresolvedGroup>();
  const errorsSummary: Array<{ row_index: number; error: string }> = [];

  for (const r of rows) {
    if (r.row_status === 'PRODUCT_UNRESOLVED' && (r.product_raw || r.sku_raw)) {
      const raw = r.product_raw || r.sku_raw || '';
      const key = normalizeName(raw);
      if (!unresolvedProductGroupsMap.has(key)) {
        const cupCandidates = cat.skus
          .filter((s) => s.category === 'cups')
          .map((s) => ({ sku: s.sku, name: s.name }))
          .slice(0, 6);
        unresolvedProductGroupsMap.set(key, {
          type: 'product',
          raw_value: raw,
          normalized_value: key,
          occurrences: 1,
          candidates: cupCandidates,
        });
      } else {
        unresolvedProductGroupsMap.get(key)!.occurrences += 1;
      }
    }

    if (r.row_status === 'CUSTOMER_UNRESOLVED' && r.customer_raw) {
      const key = normalizeName(r.customer_raw);
      if (!unresolvedCustomerGroupsMap.has(key)) {
        unresolvedCustomerGroupsMap.set(key, {
          type: 'customer',
          raw_value: r.customer_raw,
          normalized_value: key,
          occurrences: 1,
          candidates: cat.companies.map((c) => ({ id: c.id, name: c.name })).slice(0, 5),
        });
      } else {
        unresolvedCustomerGroupsMap.get(key)!.occurrences += 1;
      }
    }

    if (r.row_status === 'INVALID' && r.errors && r.errors.length > 0) {
      errorsSummary.push({ row_index: r.row_index, error: r.errors.join(', ') });
    }
  }

  const uniqueClients = new Set(
    rows.map((r) => r.customer_raw).filter((c): c is string => Boolean(c)),
  ).size;

  const resolvedCups = rows.filter((r) => r.product_status === 'RESOLVED_CUP').length;
  const resolvedNonCups = rows.filter((r) => r.product_status === 'RESOLVED_NON_CUP').length;
  const unresolvedProducts = rows.filter((r) => r.row_status === 'PRODUCT_UNRESOLVED').length;
  const unresolvedClients = rows.filter((r) => r.row_status === 'CUSTOMER_UNRESOLVED').length;
  const invalidRows = rows.filter((r) => r.row_status === 'INVALID').length;

  return {
    job_id: job.id,
    filename: job.filename,
    dataset_type: job.dataset_type,
    target_lifecycle: job.target_lifecycle,
    status: job.status,
    sheet_name: job.sheet_name ?? '',
    header_row_index: job.header_row_index ?? 0,
    columns: [],
    mapping: job.mapping_json,
    total_movements: rows.length,
    unique_clients_count: uniqueClients,
    resolved_cups_count: resolvedCups,
    resolved_non_cups_count: resolvedNonCups,
    unresolved_products_count: unresolvedProducts,
    unresolved_clients_count: unresolvedClients,
    invalid_rows_count: invalidRows,
    unresolved_product_groups: Array.from(unresolvedProductGroupsMap.values()),
    unresolved_customer_groups: Array.from(unresolvedCustomerGroupsMap.values()),
    errors_summary: errorsSummary.slice(0, 100),
    sample_rows: rows.slice(0, 50).map((r) => ({
      row_index: r.row_index,
      cliente: r.customer_raw,
      fecha: r.purchase_date,
      producto: r.product_raw,
      sku: r.sku,
      cantidad: r.quantity,
      status: r.row_status,
    })),
    llm_inferred: false,
  };
}

export async function resolveProductGroup(
  organizationId: string,
  jobId: string,
  rawProduct: string,
  targetSku: string,
  saveAlias = true,
): Promise<{ updatedRows: number }> {
  const cat = await loadOrgCatalog(organizationId);
  const matched = cat.skus.find((s) => normalizeSku(s.sku) === normalizeSku(targetSku));

  const isCup = matched?.category === 'cups';
  const newProductStatus: ProductRowStatus = isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP';

  const updatedRows = await crmRepository.updateImportRowsByProduct(
    organizationId,
    jobId,
    rawProduct,
    {
      sku: matched?.sku ?? normalizeSku(targetSku),
      product_status: newProductStatus,
      row_status: 'READY',
    },
  );

  if (saveAlias && rawProduct) {
    await crmRepository.saveProductAlias(
      organizationId,
      normalizeName(rawProduct),
      matched?.sku ?? normalizeSku(targetSku),
    );
  }

  // Check if job is now fully resolved and update job status
  const remaining = await crmRepository.listImportRows(organizationId, jobId);
  const stillPending = remaining.some(
    (r) => r.row_status === 'PRODUCT_UNRESOLVED' || r.row_status === 'CUSTOMER_UNRESOLVED',
  );

  await crmRepository.updateImportJob(jobId, organizationId, {
    status: stillPending ? 'NEEDS_REVIEW' : 'READY',
    pending_rows: remaining.filter(
      (r) => r.row_status === 'PRODUCT_UNRESOLVED' || r.row_status === 'CUSTOMER_UNRESOLVED',
    ).length,
    resolved_rows: remaining.filter((r) => r.row_status === 'READY').length,
  });

  return { updatedRows };
}

export async function cancelIngestionJob(
  organizationId: string,
  jobId: string,
): Promise<void> {
  const job = await crmRepository.getImportJob(jobId, organizationId);
  if (!job) throw new Error('IMPORT_JOB_NOT_FOUND');
  if (job.status === 'COMPLETED') throw new Error('CANNOT_CANCEL_COMPLETED_JOB');

  await crmRepository.updateImportJob(jobId, organizationId, {
    status: 'CANCELLED',
  });
}
