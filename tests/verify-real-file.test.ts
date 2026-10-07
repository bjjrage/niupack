import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { extractSpreadsheetStructure, inferCommercialFileSchema } from '@/lib/crm/ingestion/schema-inference';
import { createIngestionJob, getIngestionCockpitSummary, resolveProductGroup } from '@/lib/crm/ingestion/staging';
import { commitEntireIngestionJob } from '@/lib/crm/ingestion/commit';
import { crmRepository } from '@/lib/crm/repository';
import { purchaseService } from '@/lib/crm/purchase-service';
import { OpenAIService } from '@/lib/openai/openai-service';

const NIUPACK_ORG = '869f5c79-7b10-4297-9ba2-996a23f4b4ef';

function detectSkuFromDescription(raw: string): string | null {
  const upper = raw.toUpperCase().replace(/\s+/g, '');
  if (upper.includes('8OZ') || upper.includes('VASOS8')) return 'CUP-8OZ-SW';
  if (upper.includes('12OZ') || upper.includes('VASOS12')) return 'CUP-12OZ-SW';
  if (upper.includes('16OZ') || upper.includes('VASOS16')) return 'CUP-16OZ-SW';
  if (upper.includes('21OZ') || upper.includes('VASOS21')) return 'CUP-21OZ-SW';
  if (upper.includes('24OZ') || upper.includes('VASOS24')) return 'CUP-24OZ-SW';
  if (upper.includes('4OZ') || upper.includes('VASOS4')) return 'CUP-4OZ-SW';
  if (upper.includes('6OZ') || upper.includes('VASOS6')) return 'CUP-6OZ-SW';
  if (upper.includes('9OZ') || upper.includes('VASOS9')) return 'CUP-9OZ-DW';
  if (upper.includes('POTE') || upper.includes('POT3') || upper.includes('BOWLS3') || upper.includes('BOWL3')) return 'POT-3OZ';
  return null;
}

describe('REAL COMMERCIAL SPREADSHEET VERIFICATION (10 STEPS)', () => {
  it('Steps 1-10 on listado clientes acumulado 2026.xlsx', async () => {
    // Guard: tests must run strictly against memory fallback and never live Supabase
    expect(crmRepository.persistenceMode()).toBe('MEMORY_FALLBACK');

    if (process.env.OPENAI_API_KEY) {
      OpenAIService.setApiKey(process.env.OPENAI_API_KEY);
    }

    const filePath = path.resolve(process.cwd(), 'listado clientes acumulado 2026.xlsx');
    expect(fs.existsSync(filePath)).toBe(true);

    const buffer = fs.readFileSync(filePath);
    expect(buffer.length).toBeGreaterThan(100000);

    // 1. Structure inspection
    const structure = extractSpreadsheetStructure(buffer);
    expect(structure.sheetNames).toContain('ACUMULADO');
    const sheetInfo = structure.sheets['ACUMULADO'];
    console.log(`[PASS] Sheet: ACUMULADO, Total rows in sheet: ${sheetInfo.rowCount}, Cols: ${sheetInfo.colCount}`);

    // Test LLM Schema Inference
    const inference = await inferCommercialFileSchema(structure);
    if (!inference) {
      console.log('[WARN] LLM inference returned null, testing fallback inference');
    } else {
      console.log(`[PASS] LLM Inferred: dataset_type=${inference.dataset_type}, sheet=${inference.sheet_name}, header_row=${inference.header_row_index}`);
    }

    // 2-5. Create Ingestion Job (with targetLifecycle = 'CUSTOMER')
    // Real file has headers at row index 1:
    // Col 0: CLIENTES (customer_name)
    // Col 3: Producto (product_description)
    // Col 5: FechaFacturacion (purchase_date)
    // Col 6: FacturaNº (document_number)
    // Col 7: Importe (unit_price)
    // Col 8: Cantidad (quantity)
    // Col 9: TOTAL (total_value)
    const summary = await createIngestionJob(NIUPACK_ORG, {
      buffer,
      filename: 'listado clientes acumulado 2026.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideSheetName: 'ACUMULADO',
      overrideHeaderRowIndex: 1,
      overrideDatasetType: 'TRANSACTION_HISTORY',
      overrideMapping: {
        customer_name: 0,
        product_description: 3,
        purchase_date: 5,
        document_number: 6,
        unit_price: 7,
        quantity: 8,
        total_value: 9,
      },
    });

    console.log('\n--- INGESTION COCKPIT SUMMARY ---');
    console.log(`Job ID: ${summary.job_id}`);
    console.log(`Dataset Type: ${summary.dataset_type}`);
    console.log(`Total Movements: ${summary.total_movements}`);
    console.log(`Unique Clients Count: ${summary.unique_clients_count}`);
    console.log(`Target Lifecycle: ${summary.target_lifecycle}`);
    console.log(`Resolved Cups Count: ${summary.resolved_cups_count}`);
    console.log(`Resolved Non-Cups Count: ${summary.resolved_non_cups_count}`);
    console.log(`Pending Product Rows: ${summary.unresolved_products_count}`);
    console.log(`Pending Customer Rows: ${summary.unresolved_clients_count}`);
    console.log(`Invalid Rows: ${summary.invalid_rows_count}`);
    console.log(`Unresolved Product Groups: ${summary.unresolved_product_groups.length}`);

    expect(summary.total_movements).toBeGreaterThan(1300);
    expect(summary.unique_clients_count).toBeGreaterThan(100);

    // 6. Group Resolution: Resolve pending product groups with confirmed SKU aliases
    let resolvedGroupsCount = 0;
    for (const group of summary.unresolved_product_groups) {
      const targetSku = detectSkuFromDescription(group.raw_value);
      if (targetSku) {
        resolvedGroupsCount++;
        await resolveProductGroup(NIUPACK_ORG, summary.job_id, group.raw_value, targetSku);
      }
    }
    console.log(`\nResolved ${resolvedGroupsCount} groups to official SKUs.`);

    // Refresh summary after group resolutions
    const refreshed = await getIngestionCockpitSummary(NIUPACK_ORG, summary.job_id);
    expect(refreshed).not.toBeNull();
    console.log(`After Resolution: Pending Product Rows: ${refreshed?.unresolved_products_count}, Resolved Cups: ${refreshed?.resolved_cups_count}`);

    // 7. Commit import job
    const commitResult = await commitEntireIngestionJob(NIUPACK_ORG, summary.job_id);
    console.log('\n--- COMMIT RESULT ---');
    console.log(`Inserted Companies: ${commitResult.inserted_companies}`);
    console.log(`Inserted Purchases: ${commitResult.inserted_purchases}`);
    console.log(`Duplicate Purchases: ${commitResult.duplicate_purchases}`);
    console.log(`Errors: ${commitResult.errors.length}`);
    console.log(`Status: ${commitResult.status}`);

    expect(commitResult.inserted_purchases).toBeGreaterThan(500);

    // 8. Verify Job Persistence
    const completedJob = await crmRepository.getImportJob(summary.job_id, NIUPACK_ORG);
    expect(completedJob).not.toBeNull();
    expect(completedJob?.status).toBe('COMPLETED');
    console.log(`[PASS] Job status in persistence: ${completedJob?.status}`);

    // 9. Verify Companies created in CRM
    const companies = await crmRepository.listCompanies(NIUPACK_ORG);
    expect(companies.length).toBeGreaterThanOrEqual(90);
    const sampleCompany = companies.find((c) => c.name.includes('PARQUE SERENIDAD') || c.name.includes('FOODCO') || c.name.includes('ALISER'));
    expect(sampleCompany).toBeDefined();
    expect(sampleCompany?.lifecycle_stage).toBe('CUSTOMER');
    console.log(`[PASS] Verified company "${sampleCompany?.name}": lifecycle_stage = ${sampleCompany?.lifecycle_stage}`);

    // 10. Verify Purchases and Cadence calculation
    const purchases = await crmRepository.listPurchases(NIUPACK_ORG, sampleCompany!.id);
    expect(purchases.length).toBeGreaterThan(0);
    console.log(`[PASS] Sample company "${sampleCompany?.name}" has ${purchases.length} purchases in crm_purchases`);

    const consumption = await purchaseService.getConsumption(NIUPACK_ORG, sampleCompany!.id);
    const bySku = consumption.by_sku ?? [];
    console.log(`[PASS] Purchase Intelligence Cadence calculated for ${bySku.length} SKUs`);
    for (const item of bySku) {
      console.log(`  SKU: ${item.sku} | Product: ${item.product_name} | Purchases: ${item.purchase_count} | Status: ${item.repurchase_status} | Median days: ${item.median_days_between_orders} | Confidence: ${item.cadence_confidence} | Expected next: ${item.expected_next_purchase_at}`);
      expect(item.purchase_count).toBeGreaterThan(0);
      expect(item.repurchase_status).toBeDefined();
    }
    expect(bySku.length).toBeGreaterThan(0);
  });
});
