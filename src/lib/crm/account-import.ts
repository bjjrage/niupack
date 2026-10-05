import * as XLSX from 'xlsx';
import { crmRepository } from './repository';
import { crmService } from './service';
import type { LifecycleStage } from './types';
import { normalizePhone } from '@/lib/niupackbot/outreach/phone';

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

const HEADERS = {
  company_name: ['empresa', 'cliente', 'cuenta', 'company', 'razon social', 'nombre empresa', 'empresa cliente'],
  contact_name: ['contacto', 'contact', 'nombre contacto', 'persona contacto', 'responsable'],
  phone: ['telefono', 'celular', 'whatsapp', 'phone', 'mobile', 'numero', 'telefone'],
  email: ['email', 'correo', 'e mail', 'mail'],
  country_code: ['pais', 'country', 'country code', 'codigo pais'],
  city: ['ciudad', 'city', 'localidad'],
  tax_id: ['ruc', 'tax id', 'tax_id', 'documento', 'cuit', 'nit'],
  website: ['website', 'web', 'sitio', 'sitio web'],
} as const;

const clean = (value: unknown): string => String(value ?? '').trim();
const norm = (value: unknown): string =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function mapColumns(columns: string[]): Record<keyof typeof HEADERS, string | null> {
  const normalized = columns.map((c) => ({ raw: c, key: norm(c) }));
  const out = {} as Record<keyof typeof HEADERS, string | null>;
  for (const key of Object.keys(HEADERS) as Array<keyof typeof HEADERS>) {
    out[key] = normalized.find((c) => (HEADERS[key] as readonly string[]).includes(c.key))?.raw ?? null;
  }
  return out;
}

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

export async function previewAccountList(file: { buffer: Buffer; filename: string }): Promise<{ columns: string[]; mapping: Record<string, string | null>; rows: AccountImportRow[] }> {
  const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('EMPTY_FILE');
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (data.length === 0) throw new Error('EMPTY_FILE');
  if (data.length > 5000) throw new Error('FILE_TOO_LARGE');

  const columns = [...new Set(data.flatMap((row) => Object.keys(row)))].slice(0, 50);
  const mapping = mapColumns(columns);
  if (!mapping.company_name) throw new Error('COMPANY_COLUMN_REQUIRED');

  const rows = data.slice(0, 2000).map((raw, index): AccountImportRow => {
    const get = (key: keyof typeof HEADERS) => (mapping[key] ? clean(raw[mapping[key]!]) : '');
    const company = get('company_name');
    const email = get('email').toLowerCase();
    const errors: string[] = [];
    if (company.length < 2) errors.push('Empresa requerida');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push('Email inválido');
    return {
      index,
      company_name: company.slice(0, 200),
      contact_name: get('contact_name').slice(0, 160) || null,
      phone: get('phone').slice(0, 80) || null,
      email: email.slice(0, 200) || null,
      country_code: countryCode(get('country_code')),
      city: get('city').slice(0, 120) || null,
      tax_id: get('tax_id').slice(0, 80) || null,
      website: get('website').slice(0, 240) || null,
      errors,
    };
  });

  return { columns, mapping, rows };
}

export async function commitAccountList(
  organizationId: string,
  input: { lifecycleStage: ImportLifecycle; rows: AccountImportRow[]; actorProfileId?: string | null },
): Promise<{ created: number; updated: number; keptCustomers: number; contactsCreated: number; contactsUpdated: number; errors: Array<{ index: number; error: string }> }> {
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
        (phoneKey && clean(c.phone) === phoneKey)
      );

      const targetStage: ImportLifecycle =
        input.lifecycleStage === 'PROSPECT' && company?.lifecycle_stage === 'CUSTOMER' ? 'CUSTOMER' : input.lifecycleStage;
      if (input.lifecycleStage === 'PROSPECT' && company?.lifecycle_stage === 'CUSTOMER') keptCustomers += 1;

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
