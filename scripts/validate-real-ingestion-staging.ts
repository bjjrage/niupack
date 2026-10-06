import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { crmRepository } from '../src/lib/crm/repository';
import { createIngestionJob, getIngestionCockpitSummary } from '../src/lib/crm/ingestion/staging';

const NIUPACK_ORG = '869f5c79-7b10-4297-9ba2-996a23f4b4ef';
const MARCELO_PROFILE_ID = 'b1c08fae-eced-4e0c-8652-bb8759851b4d';

async function main() {
  console.log('===============================================================');
  console.log('NIUPACK CRM — VALIDACIÓN REAL NO DESTRUCTIVA DEL INGESTION ENGINE');
  console.log('===============================================================\n');

  // Verify persistence mode
  const mode = crmRepository.persistenceMode();
  console.log('Repository Persistence Mode:', mode);
  if (mode !== 'SUPABASE') {
    throw new Error(`Expected persistence mode SUPABASE, got ${mode}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabase = createClient(supabaseUrl, serviceKey);

  // Pre-check existing counts in Supabase
  console.log('\n--- VERIFICACIÓN PREVIA EN SUPABASE LIVE ---');
  const [compBefore, purchBefore, jobsBefore] = await Promise.all([
    supabase.from('crm_companies').select('count', { count: 'exact', head: true }).eq('organization_id', NIUPACK_ORG),
    supabase.from('crm_customer_purchases').select('count', { count: 'exact', head: true }).eq('organization_id', NIUPACK_ORG),
    supabase.from('crm_import_jobs').select('count', { count: 'exact', head: true }).eq('organization_id', NIUPACK_ORG),
  ]);

  console.log(`crm_companies pre-existentes: ${compBefore.count}`);
  console.log(`crm_customer_purchases pre-existentes: ${purchBefore.count}`);
  console.log(`crm_import_jobs pre-existentes: ${jobsBefore.count}`);

  // Read real Excel file
  const filePath = path.resolve(process.cwd(), 'listado clientes acumulado 2026.xlsx');
  console.log('\nLeyendo archivo real:', filePath);
  const buffer = fs.readFileSync(filePath);
  console.log(`Tamaño del archivo: ${buffer.length} bytes`);

  console.log('\n--- EJECUTANDO INGESTIÓN HASTA STAGING (SIN OVERRIDES) ---');
  console.log('Llamando createIngestionJob con targetLifecycle = CUSTOMER y LLM real...');

  const startTime = Date.now();
  const cockpit = await createIngestionJob(NIUPACK_ORG, {
    buffer,
    filename: 'listado clientes acumulado 2026.xlsx',
    targetLifecycle: 'CUSTOMER',
    createdBy: MARCELO_PROFILE_ID,
    // NO overrideSheetName
    // NO overrideHeaderRowIndex
    // NO overrideDatasetType
    // NO overrideMapping
    // NO pendingResolutions
  });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Ingestión y staging completados en ${duration}s.`);

  console.log('\n--- INTERPRETACIÓN DE LA LLM (SIN OVERRIDES) ---');
  console.log('Dataset Type detectado:', cockpit.dataset_type);
  console.log('Sheet detectada:', cockpit.sheet_name);
  console.log('Header Row Index detectado:', cockpit.header_row_index);
  console.log('Mapping detectado:');
  for (const [canonical, colIdx] of Object.entries(cockpit.mapping)) {
    if (colIdx !== null) {
      console.log(`  ${canonical} -> Columna ${colIdx} ("${cockpit.columns[colIdx] || ''}")`);
    }
  }

  console.log('\n--- COCKPIT DE STAGING ---');
  console.log('Job ID:', cockpit.job_id);
  console.log('Job Status:', cockpit.status);
  console.log('Movimientos Totales:', cockpit.total_movements);
  console.log('Clientes Únicos:', cockpit.unique_clients_count);
  console.log('Vasos Resueltos (Maestro SKU):', cockpit.resolved_cups_count);
  console.log('No-Vasos Resueltos (Maestro SKU):', cockpit.resolved_non_cups_count);
  console.log('Filas con Producto Pendiente:', cockpit.unresolved_products_count);
  console.log('Grupos de Productos Pendientes:', cockpit.unresolved_product_groups.length);
  console.log('Filas con Cliente Pendiente:', cockpit.unresolved_clients_count);
  console.log('Filas Inválidas:', cockpit.invalid_rows_count);

  console.log('\nPrimeros 10 grupos de productos pendientes (para revisión humana):');
  cockpit.unresolved_product_groups.slice(0, 10).forEach((g, idx) => {
    console.log(`  ${idx + 1}. "${g.raw_value}": ${g.occurrences} ocurrencias`);
  });

  // Verify directly from Supabase Live database
  console.log('\n--- VERIFICACIÓN DIRECTA EN SUPABASE LIVE ---');
  const { data: jobInDb, error: jobErr } = await supabase
    .from('crm_import_jobs')
    .select('*')
    .eq('id', cockpit.job_id)
    .single();

  if (jobErr) throw jobErr;
  console.log('Job en crm_import_jobs:', {
    id: jobInDb.id,
    status: jobInDb.status,
    dataset_type: jobInDb.dataset_type,
    total_rows: jobInDb.total_rows,
    resolved_rows: jobInDb.resolved_rows,
    pending_rows: jobInDb.pending_rows,
    invalid_rows: jobInDb.invalid_rows,
    ignored_rows: jobInDb.ignored_rows,
    committed_at: jobInDb.committed_at,
  });

  const { count: rowsInDbCount, error: rowsErr } = await supabase
    .from('crm_import_rows')
    .select('count', { count: 'exact', head: true })
    .eq('job_id', cockpit.job_id);

  if (rowsErr) throw rowsErr;
  console.log(`Filas persistidas en crm_import_rows para este job: ${rowsInDbCount}`);

  // Verify that purchases remain 0
  const { count: purchAfterCount } = await supabase
    .from('crm_customer_purchases')
    .select('count', { count: 'exact', head: true })
    .eq('organization_id', NIUPACK_ORG);

  console.log(`crm_customer_purchases actuales en Supabase: ${purchAfterCount} (Nuevas insertadas: ${(purchAfterCount || 0) - (purchBefore.count || 0)})`);

  // Query Cockpit via getIngestionCockpitSummary (equivalent to GET /api/crm/ingestion/jobs/{id})
  const cockpitReloaded = await getIngestionCockpitSummary(NIUPACK_ORG, cockpit.job_id);
  console.log('\n--- VERIFICACIÓN DE RECARGA DE COCKPIT (GET /api/crm/ingestion/jobs/{id}) ---');
  console.log('Cockpit reloaded ID:', cockpitReloaded?.job_id);
  console.log('Cockpit reloaded Status:', cockpitReloaded?.status);
  console.log('Cockpit reloaded Muestra (sample_rows length):', cockpitReloaded?.sample_rows.length);
  console.log('Cockpit reloaded Grupos Pendientes:', cockpitReloaded?.unresolved_product_groups.length);

  console.log('\n===============================================================');
  console.log('STOP — VALIDACIÓN REAL NO DESTRUCTIVA FINALIZADA.');
  console.log('NO SE HA EJECUTADO COMMIT. DATOS EN STAGING LISTOS PARA REVISIÓN.');
  console.log('===============================================================');
}

main().catch(console.error);
