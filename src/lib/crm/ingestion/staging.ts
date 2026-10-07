import * as XLSX from 'xlsx';
import { crmRepository } from '@/lib/crm/repository';
import { repository as dbRepo } from '@/lib/db/repository';
import {
  extractSpreadsheetStructure,
  inferCommercialFileSchema,
} from './schema-inference';
import {
  extractProductAttributes,
  matchCompanyRecord,
  matchProductRecord,
  matchProductRecordWithAttributes,
  normalizeName,
  normalizeSku,
  normalizeTaxId,
  parseDateCell,
  parseNum,
  type SkuRef,
  type ProductMatchResult,
  type ProductMatchType,
  type ProductExtractedAttributes,
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

  const skus: SkuRef[] = (attrs as Array<{
    sku: string;
    product_id: string;
    size_oz?: number | null;
    size_ml?: number | null;
    wall_type?: 'single' | 'double' | 'n/a' | null;
    material?: string | null;
  }>).map((a) => {
    const prod = productById.get(a.product_id);
    return {
      sku: a.sku,
      product_id: a.product_id,
      name: prod?.name ?? a.sku,
      category: prod?.category ?? null,
      size_oz: a.size_oz ?? null,
      size_ml: a.size_ml ?? null,
      wall_type: a.wall_type ?? null,
      material: a.material ?? null,
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
      product_line: null,
      product_subline: null,
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
        product_line: null,
        product_subline: null,
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
  const productGroupsMap = new Map<string, {
    raw_value: string;
    normalized_value: string;
    sku_raw: string | null;
    line: string | null;
    subline: string | null;
    line_values: Set<string>;
    subline_values: Set<string>;
    raw_payload: Record<string, unknown>;
    count: number;
  }>();

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
    const productLine = get('product_line') || cleanStr(strPayload['Linea']) || cleanStr(strPayload['linea']) || null;
    const productSubline = get('product_subline') || cleanStr(strPayload['SUB-LINEA']) || cleanStr(strPayload['sublinea']) || cleanStr(strPayload['sub_linea']) || null;
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

    // Collect product group accumulator
    const prodKey = productDesc || skuRaw;
    if (prodKey) {
      const normKey = normalizeName(prodKey);
      if (!productGroupsMap.has(normKey)) {
        productGroupsMap.set(normKey, {
          raw_value: prodKey,
          normalized_value: normKey,
          sku_raw: skuRaw,
          line: productLine,
          subline: productSubline,
          line_values: new Set(productLine ? [productLine] : []),
          subline_values: new Set(productSubline ? [productSubline] : []),
          raw_payload: strPayload,
          count: 1,
        });
      } else {
        const existing = productGroupsMap.get(normKey)!;
        existing.count += 1;
        if (!existing.line && productLine) existing.line = productLine;
        if (!existing.subline && productSubline) existing.subline = productSubline;
        if (productLine) existing.line_values.add(productLine);
        if (productSubline) existing.subline_values.add(productSubline);
      }
    }

    if (rowErrors.length > 0) {
      errorsSummary.push({ row_index: rowIdx, error: rowErrors.join(', ') });
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
      sku: null,
      customer_status: customerStatus,
      product_status: 'PRODUCT_UNRESOLVED',
      row_status: 'READY',
      errors: rowErrors,
      raw_payload: strPayload,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  // Reconcile product groups once per unique group
  const resolvedProductGroupsMap = new Map<string, {
    sku: string | null;
    product_status: ProductRowStatus;
    match_type: ProductMatchType;
    candidates: Array<{ sku: string; name: string }> | null;
    detected_attributes?: ProductExtractedAttributes;
  }>();

  for (const [normKey, grp] of productGroupsMap.entries()) {
    const manualTarget = pendingResolutions[grp.raw_value] || pendingResolutions[normKey];
    if (manualTarget) {
      const matchInCatalog = cat.skus.find((s) => normalizeSku(s.sku) === normalizeSku(manualTarget));
      if (matchInCatalog) {
        resolvedProductGroupsMap.set(normKey, {
          sku: matchInCatalog.sku,
          product_status: matchInCatalog.category === 'cups' ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
          match_type: 'EXACT_SKU',
          candidates: null,
        });
      } else {
        // STRICT SKU INVENTION GUARD: Target SKU not in catalog -> do NOT resolve!
        resolvedProductGroupsMap.set(normKey, {
          sku: null,
          product_status: 'PRODUCT_UNRESOLVED',
          match_type: 'NO_MATCH',
          candidates: null,
        });
      }
      continue;
    }

    if (grp.line_values.size > 1 || grp.subline_values.size > 1) {
      resolvedProductGroupsMap.set(normKey, {
        sku: null,
        product_status: 'PRODUCT_UNRESOLVED',
        match_type: 'AMBIGUOUS',
        candidates: [],
        detected_attributes: { family: null, capacity_oz: null, wall_type: null, material_line: null, is_custom_print: null },
      });
      continue;
    }

    const pm = matchProductRecordWithAttributes(
      {
        producto: grp.raw_value,
        sku_raw: grp.sku_raw,
        line: grp.line,
        subline: grp.subline,
        rawPayload: grp.raw_payload,
      },
      cat.skus,
      cat.productAliases,
    );

    if (pm.match_type === 'ATTRIBUTE_UNIQUE_MATCH' && pm.sku) {
      // Unequivocal match! Auto-learn alias safely
      const alreadyHas = cat.productAliases.some((a) => a.alias_normalized === normKey);
      if (!alreadyHas) {
        await crmRepository.saveProductAlias(organizationId, normKey, pm.sku);
        cat.productAliases.push({ alias_normalized: normKey, sku: pm.sku });
      }
    }

    resolvedProductGroupsMap.set(normKey, {
      sku: pm.sku,
      product_status: pm.status,
      match_type: pm.match_type,
      candidates: pm.candidates,
      detected_attributes: pm.detected_attributes,
    });
  }

  // Apply group resolutions to stagedRows
  for (const row of stagedRows) {
    const prodKey = row.product_raw || row.sku_raw;
    if (!prodKey) {
      row.product_status = 'SKIPPED';
      row.sku = null;
    } else {
      const normKey = normalizeName(prodKey);
      const grpRes = resolvedProductGroupsMap.get(normKey);
      if (grpRes) {
        row.sku = grpRes.sku;
        row.product_status = grpRes.product_status;
      }
    }

    // Determine final row_status
    if (row.errors.length > 0) {
      row.row_status = 'INVALID';
    } else if (datasetType !== 'ACCOUNT_LIST' && row.product_status === 'PRODUCT_UNRESOLVED') {
      row.row_status = 'PRODUCT_UNRESOLVED';
    } else if (row.customer_status === 'UNRESOLVED') {
      row.row_status = 'CUSTOMER_UNRESOLVED';
    } else {
      row.row_status = 'READY';
    }
  }

  // Populate unresolved, ambiguous, no-match, and auto-resolved groups for the cockpit
  const unresolvedProductGroups: UnresolvedGroup[] = [];
  const ambiguousProductGroups: UnresolvedGroup[] = [];
  const noMatchProductGroups: UnresolvedGroup[] = [];
  const autoResolvedProductGroups: Array<{ raw_value: string; sku: string; occurrences: number; match_type: string }> = [];

  for (const [normKey, grp] of productGroupsMap.entries()) {
    const res = resolvedProductGroupsMap.get(normKey);
    if (!res) continue;

    if (res.product_status === 'PRODUCT_UNRESOLVED') {
      const uGroup: UnresolvedGroup = {
        type: 'product',
        raw_value: grp.raw_value,
        normalized_value: normKey,
        occurrences: grp.count,
        candidates: res.candidates ?? [],
        match_type: res.match_type,
        detected_attributes: res.detected_attributes as Record<string, unknown> | undefined,
      };
      unresolvedProductGroups.push(uGroup);
      if (res.match_type === 'AMBIGUOUS') {
        ambiguousProductGroups.push(uGroup);
      } else {
        noMatchProductGroups.push(uGroup);
      }
    } else if (res.sku) {
      autoResolvedProductGroups.push({
        raw_value: grp.raw_value,
        sku: res.sku,
        occurrences: grp.count,
        match_type: res.match_type,
      });
    }
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
    unresolved_product_groups: unresolvedProductGroups,
    ambiguous_product_groups: ambiguousProductGroups,
    no_match_product_groups: noMatchProductGroups,
    auto_resolved_product_groups: autoResolvedProductGroups,
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

  const productGroupsMap = new Map<string, {
    raw_value: string;
    normalized_value: string;
    sku_raw: string | null;
    line: string | null;
    subline: string | null;
    line_values: Set<string>;
    subline_values: Set<string>;
    raw_payload: Record<string, unknown>;
    count: number;
    rows: CrmImportRow[];
  }>();
  const unresolvedCustomerGroupsMap = new Map<string, UnresolvedGroup>();
  const errorsSummary: Array<{ row_index: number; error: string }> = [];
  const headerRow = rows.find((row) => row.row_index === 0);
  const headerColumnByName = new Map<string, string>();
  for (const [columnKey, headerValue] of Object.entries(headerRow?.raw_payload ?? {})) {
    if (!/^Columna \d+$/i.test(columnKey)) continue;
    const normalizedHeader = normalizeName(cleanStr(headerValue));
    if (normalizedHeader) headerColumnByName.set(normalizedHeader, columnKey);
  }
  const readProductContext = (row: CrmImportRow, names: string[]): string | null => {
    for (const name of names) {
      const directValue = cleanStr(row.raw_payload?.[name]);
      if (directValue) return directValue;
      const columnKey = headerColumnByName.get(normalizeName(name));
      const columnValue = columnKey ? cleanStr(row.raw_payload?.[columnKey]) : '';
      if (columnValue) return columnValue;
    }
    return null;
  };

  for (const r of rows) {
    if (r.product_raw || r.sku_raw) {
      const raw = r.product_raw || r.sku_raw || '';
      const key = normalizeName(raw);
      const line = readProductContext(r, ['Linea', 'Línea', 'product_line']) || r.product_line_raw || null;
      const subline = readProductContext(r, ['SUB-LINEA', 'sublinea', 'sub_linea', 'product_subline']) || r.product_subline_raw || null;
      if (!productGroupsMap.has(key)) {
        productGroupsMap.set(key, {
          raw_value: raw,
          normalized_value: key,
          sku_raw: r.sku_raw,
          line,
          subline,
          line_values: new Set(line ? [line] : []),
          subline_values: new Set(subline ? [subline] : []),
          raw_payload: r.raw_payload,
          count: 1,
          rows: [r],
        });
      } else {
        const grp = productGroupsMap.get(key)!;
        grp.count += 1;
        grp.rows.push(r);
        if (!grp.line && line) grp.line = line;
        if (!grp.subline && subline) grp.subline = subline;
        if (line) grp.line_values.add(line);
        if (subline) grp.subline_values.add(subline);
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

  const unresolvedProductGroups: UnresolvedGroup[] = [];
  const ambiguousProductGroups: UnresolvedGroup[] = [];
  const noMatchProductGroups: UnresolvedGroup[] = [];
  const autoResolvedProductGroups: Array<{ raw_value: string; sku: string; occurrences: number; match_type: string }> = [];

  for (const [normKey, grp] of productGroupsMap.entries()) {
    const isUnresolved = grp.rows.some((r) => r.row_status === 'PRODUCT_UNRESOLVED');
    if (isUnresolved) {
      const contextConflict = grp.line_values.size > 1 || grp.subline_values.size > 1;
      const pm = matchProductRecordWithAttributes(
        {
          producto: grp.raw_value,
          sku_raw: grp.sku_raw,
          line: grp.line,
          subline: grp.subline,
          rawPayload: grp.raw_payload,
        },
        cat.skus,
        cat.productAliases,
      );

      const uGroup: UnresolvedGroup = {
        type: 'product',
        raw_value: grp.raw_value,
        normalized_value: normKey,
        occurrences: grp.count,
        candidates: contextConflict ? [] : pm.candidates ?? [],
        match_type: contextConflict ? 'AMBIGUOUS' : pm.match_type,
        detected_attributes: contextConflict
          ? { context_conflict: true }
          : pm.detected_attributes as Record<string, unknown> | undefined,
      };
      unresolvedProductGroups.push(uGroup);
      if (contextConflict || pm.match_type === 'AMBIGUOUS') {
        ambiguousProductGroups.push(uGroup);
      } else {
        noMatchProductGroups.push(uGroup);
      }
    } else {
      const sampleSku = grp.rows.find((r) => r.sku)?.sku || '';
      autoResolvedProductGroups.push({
        raw_value: grp.raw_value,
        sku: sampleSku,
        occurrences: grp.count,
        match_type: 'RESOLVED',
      });
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
    unresolved_product_groups: unresolvedProductGroups,
    ambiguous_product_groups: ambiguousProductGroups,
    no_match_product_groups: noMatchProductGroups,
    auto_resolved_product_groups: autoResolvedProductGroups,
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

export interface ExistingJobReconciliationSummary {
  job_id: string;
  auto_resolved_groups: number;
  auto_resolved_rows: number;
  ambiguous_groups: number;
  no_match_groups: number;
  resolved_non_cup_groups: number;
}

/**
 * Re-runs deterministic product matching over an existing, uncommitted staging job.
 * It only updates unresolved staging rows and safe attribute-unique aliases; it never
 * changes job commit metadata or writes customer purchases.
 */
export async function reconcileExistingJobProducts(
  organizationId: string,
  jobId: string,
): Promise<ExistingJobReconciliationSummary> {
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
  const job = await crmRepository.getImportJob(jobId, organizationId);
  if (!job) throw new Error('IMPORT_JOB_NOT_FOUND');
  if (job.committed_at || ['COMPLETED', 'COMMITTING', 'CANCELLED'].includes(job.status)) {
    throw new Error('JOB_NOT_RECONCILABLE');
  }

  const [rows, catalog] = await Promise.all([
    crmRepository.listImportRows(organizationId, jobId),
    loadOrgCatalog(organizationId),
  ]);

  const headerRow = rows.find((row) => row.row_index === 0);
  const headerColumnByName = new Map<string, string>();
  for (const [columnKey, headerValue] of Object.entries(headerRow?.raw_payload ?? {})) {
    if (!/^Columna \d+$/i.test(columnKey)) continue;
    const normalizedHeader = normalizeName(cleanStr(headerValue));
    if (normalizedHeader) headerColumnByName.set(normalizedHeader, columnKey);
  }

  const readProductContext = (row: CrmImportRow, names: string[]): string | null => {
    for (const name of names) {
      const directValue = cleanStr(row.raw_payload?.[name]);
      if (directValue) return directValue;
      const columnKey = headerColumnByName.get(normalizeName(name));
      const columnValue = columnKey ? cleanStr(row.raw_payload?.[columnKey]) : '';
      if (columnValue) return columnValue;
    }
    return null;
  };

  const groups = new Map<string, {
    rawValue: string;
    rows: CrmImportRow[];
    skuRaw: string | null;
    line: string | null;
    subline: string | null;
    lineValues: Set<string>;
    sublineValues: Set<string>;
    rawPayload: Record<string, unknown>;
  }>();

  for (const row of rows) {
    if (row.row_status !== 'PRODUCT_UNRESOLVED' || row.product_status !== 'PRODUCT_UNRESOLVED') continue;
    const rawValue = row.product_raw || row.sku_raw || '';
    const key = normalizeName(rawValue);
    if (!key) continue;
    const line = readProductContext(row, ['Linea', 'Línea', 'product_line']) || row.product_line_raw || null;
    const subline = readProductContext(row, ['SUB-LINEA', 'sublinea', 'sub_linea', 'product_subline']) || row.product_subline_raw || null;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
      if (!group.line && line) group.line = line;
      if (!group.subline && subline) group.subline = subline;
      if (line) group.lineValues.add(line);
      if (subline) group.sublineValues.add(subline);
    } else {
      groups.set(key, {
        rawValue,
        rows: [row],
        skuRaw: row.sku_raw,
        line,
        subline,
        lineValues: new Set(line ? [line] : []),
        sublineValues: new Set(subline ? [subline] : []),
        rawPayload: {
          ...(row.raw_payload ?? {}),
          ...(line ? { Linea: line } : {}),
          ...(subline ? { 'SUB-LINEA': subline } : {}),
        },
      });
    }
  }

  const summary: ExistingJobReconciliationSummary = {
    job_id: jobId,
    auto_resolved_groups: 0,
    auto_resolved_rows: 0,
    ambiguous_groups: 0,
    no_match_groups: 0,
    resolved_non_cup_groups: 0,
  };

  for (const [normalizedValue, group] of groups) {
    if (group.lineValues.size > 1 || group.sublineValues.size > 1) {
      summary.ambiguous_groups += 1;
      continue;
    }

    const match = matchProductRecordWithAttributes(
      {
        producto: group.rawValue,
        sku_raw: group.skuRaw,
        line: group.line,
        subline: group.subline,
        rawPayload: group.rawPayload,
      },
      catalog.skus,
      catalog.productAliases,
    );

    if (!match.sku || !['EXACT_SKU', 'ALIAS_CONFIRMED', 'ATTRIBUTE_UNIQUE_MATCH'].includes(match.match_type)) {
      if (match.match_type === 'AMBIGUOUS') summary.ambiguous_groups += 1;
      else summary.no_match_groups += 1;
      continue;
    }

    const masterSku = catalog.skus.find((sku) => normalizeSku(sku.sku) === normalizeSku(match.sku));
    if (!masterSku) {
      summary.no_match_groups += 1;
      continue;
    }

    if (match.match_type === 'ATTRIBUTE_UNIQUE_MATCH') {
      await crmRepository.saveProductAlias(organizationId, normalizedValue, masterSku.sku);
      catalog.productAliases.push({ alias_normalized: normalizedValue, sku: masterSku.sku });
    }

    const productStatus: ProductRowStatus = masterSku.category === 'cups' ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP';
    const updatedRows = await crmRepository.updateUnresolvedImportRowsByIds(
      organizationId,
      jobId,
      group.rows.map((row) => row.id),
      { sku: masterSku.sku, product_status: productStatus, row_status: 'READY' },
    );
    if (updatedRows !== group.rows.length) throw new Error('RECONCILIATION_ROW_COUNT_MISMATCH');

    summary.auto_resolved_groups += 1;
    summary.auto_resolved_rows += updatedRows;
    if (productStatus === 'RESOLVED_NON_CUP') summary.resolved_non_cup_groups += 1;
  }

  return summary;
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

  if (!matched) {
    throw new Error('SKU_NOT_FOUND_IN_MASTER');
  }

  const isCup = matched.category === 'cups';
  const newProductStatus: ProductRowStatus = isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP';

  const updatedRows = await crmRepository.updateImportRowsByProduct(
    organizationId,
    jobId,
    rawProduct,
    {
      sku: matched.sku,
      product_status: newProductStatus,
      row_status: 'READY',
    },
  );

  if (saveAlias && rawProduct) {
    await crmRepository.saveProductAlias(
      organizationId,
      normalizeName(rawProduct),
      matched.sku,
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

export interface DeleteIngestionJobSummary {
  job_id: string;
  deleted_job: boolean;
  deleted_rows: number;
}

/**
 * Permanently removes only an uncommitted import job and its staged rows.
 * The expected row count is required as an explicit deletion guard.
 */
export async function deleteIngestionJob(
  organizationId: string,
  jobId: string,
  expectedRowCount: number,
): Promise<DeleteIngestionJobSummary> {
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
  if (!Number.isInteger(expectedRowCount) || expectedRowCount < 0) {
    throw new Error('EXPECTED_ROW_COUNT_INVALID');
  }

  const job = await crmRepository.getImportJob(jobId, organizationId);
  if (!job) throw new Error('IMPORT_JOB_NOT_FOUND');
  if (job.committed_at || ['COMPLETED', 'COMMITTING'].includes(job.status)) {
    throw new Error('COMMITTED_JOB_CANNOT_BE_DELETED');
  }

  const rows = await crmRepository.listImportRows(organizationId, jobId);
  if (rows.length !== expectedRowCount) throw new Error('IMPORT_ROW_COUNT_MISMATCH');

  const deleted = await crmRepository.deleteImportJob(jobId, organizationId, job.status);
  if (!deleted) throw new Error('IMPORT_JOB_CHANGED_BEFORE_DELETE');

  return {
    job_id: jobId,
    deleted_job: true,
    deleted_rows: rows.length,
  };
}
