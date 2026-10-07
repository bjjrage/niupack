import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { resetOutreachMemory } from '@/lib/niupackbot/outreach/repository';
import { emptyAccountDependencies } from '@/lib/crm/account-deletion';
import { requireNiuIdentity, NiuAuthError } from '@/lib/auth/identity';
import { DELETE } from '@/app/api/crm/accounts/[id]/route';
import { POST as bulkDelete } from '@/app/api/crm/accounts/bulk-delete/route';
import { POST as previewDelete } from '@/app/api/crm/accounts/bulk-delete/preview/route';

vi.mock('@/lib/auth/identity', async (original) => ({
  ...await original<typeof import('@/lib/auth/identity')>(), requireNiuIdentity: vi.fn(),
}));

const A = '00000000-0000-0000-0000-00000000aa01';
const B = '00000000-0000-0000-0000-00000000bb02';
const create = (org = A) => crmRepository.createCompany({ organization_id: org, name: `Cuenta ${crypto.randomUUID()}` });
const request = (ids: string[], extra = {}) => new Request('http://localhost/api/crm/accounts/bulk-delete', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_ids: ids, ...extra }),
});

beforeEach(() => {
  resetCrmMemory(); resetOutreachMemory(); vi.restoreAllMocks();
  vi.mocked(requireNiuIdentity).mockResolvedValue({ organizationId: A, userId: 'test', profileId: 'test' });
});

describe('Safe CRM account deletion', () => {
  it('inspects clean accounts and deletes only their owned safe contacts', async () => {
    const account = await create();
    const other = await create(B);
    const contact = await crmRepository.createContact({ organization_id: A, company_id: account.id, full_name: 'Seguro' });
    const preserved = await crmRepository.createContact({ organization_id: B, company_id: other.id, full_name: 'Otro tenant' });
    expect(await crmService.inspectCompanyDeletion(A, account.id)).toMatchObject({ status: 'SAFE_TO_DELETE', contacts: 1, dependencies: emptyAccountDependencies() });
    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: account.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deleted: true, company_id: account.id, deleted_contacts: 1 });
    expect(await crmRepository.getCompany(account.id, A)).toBeUndefined();
    expect(await crmRepository.getContact(contact.id, A)).toBeUndefined();
    expect(await crmRepository.getContact(preserved.id, B)).toEqual(preserved);
  });

  it.each(['purchases', 'opportunities', 'conversations', 'leads', 'tasks', 'activities'] as const)(
    'blocks %s, including contact-only history, without partial cleanup', async (kind) => {
      const account = await create();
      const contact = await crmRepository.createContact({ organization_id: A, company_id: account.id, full_name: 'Preservado' });
      const refs = { organization_id: A, contact_id: contact.id };
      if (kind === 'purchases') await crmRepository.insertPurchaseIdempotent({ ...refs, company_id: account.id, purchase_date: '2026-01-01', sku: 'SKU', product_name: 'Vaso', quantity: 1, source: 'TEST', unit: 'unit' });
      if (kind === 'opportunities') await crmRepository.createOpportunity({ ...refs, title: 'Venta', stage: 'GANADO', currency: 'USD' });
      if (kind === 'conversations') await crmRepository.createConversation({ ...refs, channel: 'WHATSAPP', provider: 'MANUAL', external_conversation_id: 'chat', status: 'CLOSED', control_mode: 'HUMAN' });
      if (kind === 'leads') await crmRepository.createLead({ ...refs, status: 'NUEVO' });
      if (kind === 'tasks') await crmRepository.createTask({ organization_id: A, company_id: account.id, title: 'Llamar', status: 'DONE', priority: 'LOW' });
      if (kind === 'activities') await crmRepository.createActivity({ ...refs, type: 'NOTE', body: 'Historial', occurred_at: new Date().toISOString() });
      const before = structuredClone(global.__niu_crm_store);
      const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: account.id }) });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: 'ACCOUNT_HAS_BUSINESS_DATA', dependencies: { [kind]: 1 } });
      expect(global.__niu_crm_store).toEqual(before);
    },
  );

  it('protects shared contacts and aliases', async () => {
    const account = await create();
    await crmRepository.createContact({ organization_id: B, company_id: account.id, full_name: 'Compartido' });
    await crmRepository.saveCustomerAlias(A, 'alias', account.id);
    const before = structuredClone(global.__niu_crm_store);
    expect(await crmService.deleteCompany(A, account.id)).toMatchObject({ deleted: false, dependencies: { aliases: 1, shared_contacts: 1 } });
    expect(global.__niu_crm_store).toEqual(before);
  });

  it('does not reveal or delete accounts in another tenant; nonexistent IDs return 404', async () => {
    const account = await create(B);
    for (const id of [account.id, crypto.randomUUID()]) {
      const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(404);
    }
    expect(await crmRepository.getCompany(account.id, B)).toEqual(account);
    expect(await crmService.bulkDeleteCompanies(A, [account.id])).toMatchObject({ deleted: 0, not_found: 1 });
    await expect(crmService.deleteCompany('', account.id)).rejects.toThrow('ORGANIZATION_REQUIRED');
  });

  it.each([0, 10])('bulk deletes %i blocked / 100 accounts and preserves every blocked record', async (blocked) => {
    const accounts = await Promise.all(Array.from({ length: 100 }, () => create()));
    for (const account of accounts.slice(0, blocked)) {
      await crmRepository.createTask({ organization_id: A, company_id: account.id, title: 'Preservar', status: 'PENDING', priority: 'LOW' });
    }
    const preview = await crmService.previewCompanyDeletion(A, accounts.map((c) => c.id));
    expect(preview).toMatchObject({ requested: 100, deletable: 100 - blocked, blocked });
    expect(await crmRepository.listCompanies(A)).toHaveLength(100);
    const result = await crmService.bulkDeleteCompanies(A, accounts.map((c) => c.id));
    expect(result).toMatchObject({ requested: 100, deleted: 100 - blocked, blocked, failed_accounts: [] });
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect((await crmRepository.listCompanies(A)).sort(byId)).toEqual(accounts.slice(0, blocked).sort(byId));
    expect(await crmRepository.listTasks(A)).toHaveLength(blocked);
  });

  it('rechecks dependencies after the service inspection', async () => {
    const account = await create();
    const original = crmRepository.deleteSafeCompany.bind(crmRepository);
    vi.spyOn(crmRepository, 'deleteSafeCompany').mockImplementationOnce(async (id, org) => {
      await crmRepository.createTask({ organization_id: org, company_id: id, title: 'Nuevo historial', status: 'PENDING', priority: 'LOW' });
      return original(id, org);
    });
    expect(await crmService.deleteCompany(A, account.id)).toMatchObject({ status: 'BLOCKED_BY_BUSINESS_DATA', deleted: false });
    expect(await crmRepository.getCompany(account.id, A)).toEqual(account);
  });

  it('validates auth, UUIDs, 500-ID limit and refuses a frontend organization_id', async () => {
    const account = await create();
    for (const ids of [[], ['bad-id'], Array.from({ length: 501 }, () => crypto.randomUUID())]) {
      expect((await bulkDelete(request(ids))).status).toBe(400);
    }
    expect((await bulkDelete(request([account.id], { organization_id: B }))).status).toBe(400);
    const preview = await previewDelete(request([account.id, account.id]));
    expect(await preview.json()).toMatchObject({ requested: 1, deletable: 1 });
    expect(await crmRepository.getCompany(account.id, A)).toEqual(account);
    vi.mocked(requireNiuIdentity).mockRejectedValue(new NiuAuthError('AUTH_REQUIRED', 401));
    expect((await bulkDelete(request([account.id]))).status).toBe(401);
  });

  it('never touches ingestion, aliases or the product catalog during safe deletion', async () => {
    const { createIngestionJob } = await import('@/lib/crm/ingestion/staging');
    await createIngestionJob(A, { buffer: Buffer.from('Empresa,Contacto\nStaging,Nombre\n'), filename: 'fixture.csv', targetLifecycle: 'PROSPECT', overrideDatasetType: 'ACCOUNT_LIST', overrideMapping: { company_name: 0, contact_name: 1 } });
    const retained = await create();
    await crmRepository.saveCustomerAlias(A, 'retained', retained.id);
    await crmRepository.saveProductAlias(A, 'vaso', 'SKU');
    const before = structuredClone(global.__niu_crm_store);
    const account = await create();
    await crmService.deleteCompany(A, account.id);
    expect(global.__niu_crm_store).toEqual(before);
  });
});
