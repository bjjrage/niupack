import * as XLSX from 'xlsx';
import { crmRepository } from './repository';
import { crmService } from './service';
import type { LifecycleStage } from './types';
import { normalizePhone } from '@/lib/niupackbot/outreach/phone';
import {
  type CanonicalField,
  type ColumnMapping,
  type ConfidenceMapping,
  extractSpreadsheetStructure,
  inferAccountSpreadsheetSchema,
} from './account-import-schema';

export type ImportLifecycle = Extract<LifecycleStage, 'CUSTOMER' | 'PROSPECT'>;

export interface AccountImportRow {
  index: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  country_code: string | null;
  city: string | null;
  tax_id: string | null;
  website: string | null;
  errors: string[];
}

export interface AccountPreviewResult {
  sheet_name: string;
  sheet_names: string[];
  header_row_index: number;
  columns: string[];
  mapping: ColumnMapping;
  confidence: ConfidenceMapping | null;
  llm_inferred: boolean;
  rows: AccountImportRow[];
  total_rows: number;
  valid_rows_count: number;
  error_rows_count: number;
}

export interface PreviewAccountListInput {
  buffer: Buffer;
  filename: string;
  overrideSheetName?: string;
  overrideHeaderRowIndex?: number;
  overrideMapping?: Partial<ColumnMapping>;
}

const clean = (value: unknown): string => String(value ?? '').trim();
const norm = (value: unknown): string =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function countryCode(value: string): string | null {
  const n = norm(value);
  if (!n) return null;
  if (['py', 'paraguay'].includes(n)) return 'PY';
  if (['br', 'brasil', 'brazil'].includes(n)) return 'BR';
  if (['ar', 'argentina'].includes(n)) return 'AR';
  if (['bo', 'bolivia'].includes(n)) return 'BO';
  if (['uy', 'uruguay'].includes(n)) return 'UY';
  if (['cl', 'chile'].includes(n)) return 'CL';
  return value.trim().length === 2 ? value.trim().toUpperCase() : null;
}

/**
 * Pure deterministic extraction of account rows from a sheet matrix.
 * No LLM calls. No heuristic column guessing.
 */
export function extractAccountRows(
  matrix: unknown[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
): AccountImportRow[] {
  const dataRows = matrix.slice(headerRowIndex + 1);
  const rows: AccountImportRow[] = [];

  let rowIndex = 0;
  for (const rawRow of dataRows) {
    if (!Array.isArray(rawRow)) continue;

    const isEmpty = rawRow.every((c) => String(c ?? '').trim() === '');
    if (isEmpty) continue;

    const get = (field: CanonicalField): string => {
      const colIdx = mapping[field];
      if (colIdx === null || colIdx === undefined || colIdx < 0) return '';
      return clean(rawRow[colIdx]);
    };

    const company = get('company_name');
    const email = get('email').toLowerCase();
    const phone = get('phone');
    const errors: string[] = [];

    if (company.length < 2) errors.push('Empresa requerida');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push('Email inválido');

    rows.push({
      index: rowIndex++,
      company_name: company.slice(0, 200),
      contact_name: get('contact_name').slice(0, 160) || null,
      phone: phone.slice(0, 80) || null,
      email: email.slice(0, 200) || null,
      country_code: countryCode(get('country_code')),
      city: get('city').slice(0, 120) || null,
      tax_id: get('tax_id').slice(0, 80) || null,
      website: get('website').slice(0, 240) || null,
      errors,
    });

    if (rows.length >= 2000) break;
  }

  return rows;
}

/**
 * Generates an account import preview.
 * When overrides are provided, runs pure deterministic extraction without calling the LLM.
 * When no overrides are provided, asks the LLM to infer sheet, header row, and column mapping.
 * If LLM is unavailable or fails, returns structural defaults allowing manual mapping in the UI.
 */
export async function previewAccountList(input: PreviewAccountListInput): Promise<AccountPreviewResult> {
  const structure = extractSpreadsheetStructure(input.buffer);
  if (structure.sheetNames.length === 0) throw new Error('EMPTY_FILE');

  const hasManualOverrides = Boolean(
    input.overrideSheetName !== undefined ||
      input.overrideMapping !== undefined ||
      input.overrideHeaderRowIndex !== undefined,
  );

  let chosenSheet: string;
  let headerRowIndex: number;
  let mapping: ColumnMapping;
  let confidence: ConfidenceMapping | null = null;
  let llmInferred = false;

  if (hasManualOverrides) {
    chosenSheet =
      input.overrideSheetName && structure.sheetNames.includes(input.overrideSheetName)
        ? input.overrideSheetName
        : structure.sheetNames[0];

    headerRowIndex = input.overrideHeaderRowIndex ?? 0;
    mapping = {
      company_name: null,
      contact_name: null,
      phone: null,
      email: null,
      country_code: null,
      city: null,
      tax_id: null,
      website: null,
      ...input.overrideMapping,
    };
  } else {
    const inferred = await inferAccountSpreadsheetSchema(structure);
    if (inferred) {
      chosenSheet = inferred.sheet_name;
      headerRowIndex = inferred.header_row_index;
      mapping = inferred.mapping;
      confidence = inferred.confidence;
      llmInferred = true;
    } else {
      chosenSheet = structure.sheetNames[0];
      const sheetSample = structure.sheets[chosenSheet];
      headerRowIndex = 0;
      if (sheetSample?.rawSampleRows) {
        const firstNonEmptyIdx = sheetSample.rawSampleRows.findIndex((r) =>
          r.some((c) => c.trim().length > 0),
        );
        if (firstNonEmptyIdx >= 0) {
          headerRowIndex = firstNonEmptyIdx;
        }
      }
      mapping = {
        company_name: null,
        contact_name: null,
        phone: null,
        email: null,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      };
      llmInferred = false;
    }
  }

  const wb = XLSX.read(input.buffer, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[chosenSheet];
  if (!ws) throw new Error('EMPTY_FILE');

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (matrix.length === 0) throw new Error('EMPTY_FILE');
  if (matrix.length > 5000) throw new Error('FILE_TOO_LARGE');

  const rawHeaderRow = Array.isArray(matrix[headerRowIndex]) ? matrix[headerRowIndex] : [];
  const maxCols = Math.max(rawHeaderRow.length, structure.sheets[chosenSheet]?.colCount || 0);
  const columns: string[] = [];
  for (let i = 0; i < maxCols; i++) {
    const val = String(rawHeaderRow[i] ?? '').trim();
    columns.push(val || `Columna ${i + 1}`);
  }

  const rows = extractAccountRows(matrix, headerRowIndex, mapping);

  return {
    sheet_name: chosenSheet,
    sheet_names: structure.sheetNames,
    header_row_index: headerRowIndex,
    columns,
    mapping,
    confidence,
    llm_inferred: llmInferred,
    rows,
    total_rows: rows.length,
    valid_rows_count: rows.filter((r) => r.errors.length === 0).length,
    error_rows_count: rows.filter((r) => r.errors.length > 0).length,
  };
}

export async function commitAccountList(
  organizationId: string,
  input: { lifecycleStage: ImportLifecycle; rows: AccountImportRow[]; actorProfileId?: string | null },
): Promise<{
  created: number;
  updated: number;
  keptCustomers: number;
  contactsCreated: number;
  contactsUpdated: number;
  errors: Array<{ index: number; error: string }>;
}> {
  const rows = input.rows.slice(0, 2000);
  const companies = await crmRepository.listCompanies(organizationId);
  const contacts = await crmRepository.listContacts(organizationId);
  let created = 0;
  let updated = 0;
  let keptCustomers = 0;
  let contactsCreated = 0;
  let contactsUpdated = 0;
  const errors: Array<{ index: number; error: string }> = [];

  for (const row of rows) {
    try {
      if (row.errors?.length || row.company_name.trim().length < 2) throw new Error('INVALID_ROW');
      const nameKey = norm(row.company_name);
      const taxKey = norm(row.tax_id);
      const emailKey = norm(row.email);
      const phoneNorm = row.phone ? normalizePhone(row.phone) : null;
      const phoneKey = phoneNorm?.ok ? phoneNorm.e164 : clean(row.phone);

      let company = companies.find((c) =>
        (nameKey && norm(c.name) === nameKey) ||
        (taxKey && norm(c.tax_id) === taxKey) ||
        (emailKey && norm(c.email) === emailKey) ||
        (phoneKey && clean(c.phone) === phoneKey),
      );

      const targetStage: ImportLifecycle =
        input.lifecycleStage === 'PROSPECT' && company?.lifecycle_stage === 'CUSTOMER'
          ? 'CUSTOMER'
          : input.lifecycleStage;
      if (input.lifecycleStage === 'PROSPECT' && company?.lifecycle_stage === 'CUSTOMER') {
        keptCustomers += 1;
      }

      if (!company) {
        company = await crmService.createCompany(
          organizationId,
          {
            name: row.company_name,
            legal_name: null,
            tax_id: row.tax_id,
            external_id: null,
            country_code: row.country_code,
            city: row.city,
            website: row.website,
            phone: phoneKey || null,
            email: row.email,
            source: input.lifecycleStage === 'CUSTOMER' ? 'IMPORT_CUSTOMER_LIST' : 'IMPORT_PROSPECT_LIST',
            notes: null,
            owner_profile_id: input.actorProfileId ?? null,
            lifecycle_stage: targetStage,
          },
          input.actorProfileId ?? undefined,
        );
        companies.push(company);
        created += 1;
      } else {
        company = await crmService.updateCompany(
          organizationId,
          company.id,
          {
            tax_id: company.tax_id || row.tax_id || null,
            country_code: company.country_code || row.country_code || null,
            city: company.city || row.city || null,
            website: company.website || row.website || null,
            phone: company.phone || phoneKey || null,
            email: company.email || row.email || null,
            lifecycle_stage: targetStage,
          },
          input.actorProfileId ?? undefined,
        );
        const idx = companies.findIndex((c) => c.id === company!.id);
        if (idx >= 0) companies[idx] = company;
        updated += 1;
      }

      if (row.contact_name || row.phone || row.email) {
        const contact = contacts.find((c) => {
          const cPhone = c.whatsapp_phone || c.phone || '';
          const cPhoneNorm = cPhone ? normalizePhone(cPhone) : null;
          const cKey = cPhoneNorm?.ok ? cPhoneNorm.e164 : clean(cPhone);
          return (phoneKey && cKey === phoneKey) || (row.email && norm(c.email) === norm(row.email));
        });
        const whatsapp = phoneNorm?.ok ? phoneNorm.e164 : null;

        if (!contact) {
          const createdContact = await crmService.createContact(
            organizationId,
            {
              company_id: company.id,
              full_name: row.contact_name || row.company_name,
              job_title: null,
              phone: phoneKey || null,
              whatsapp_phone: whatsapp,
              email: row.email,
              language: null,
              country_code: row.country_code,
              source: input.lifecycleStage === 'CUSTOMER' ? 'IMPORT_CUSTOMER_LIST' : 'IMPORT_PROSPECT_LIST',
              owner_profile_id: input.actorProfileId ?? null,
            },
            input.actorProfileId ?? undefined,
          );
          contacts.push(createdContact);
          contactsCreated += 1;
        } else {
          const updatedContact = await crmRepository.updateContact(contact.id, organizationId, {
            company_id: contact.company_id || company.id,
            full_name: contact.full_name || row.contact_name || row.company_name,
            phone: contact.phone || phoneKey || null,
            whatsapp_phone: contact.whatsapp_phone || whatsapp,
            email: contact.email || row.email || null,
            country_code: contact.country_code || row.country_code || null,
          });
          const ci = contacts.findIndex((c) => c.id === contact.id);
          if (ci >= 0) contacts[ci] = updatedContact;
          contactsUpdated += 1;
        }
      }
    } catch (error) {
      errors.push({ index: row.index, error: error instanceof Error ? error.message : 'IMPORT_FAILED' });
    }
  }

  return { created, updated, keptCustomers, contactsCreated, contactsUpdated, errors };
}
