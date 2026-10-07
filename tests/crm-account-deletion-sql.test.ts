import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import type { AccountDeletionInspection } from '@/lib/crm/account-deletion';

// An isolated in-memory PostgreSQL instance. No network or Supabase credentials.
const db = new PGlite({ extensions: { uuid_ossp } });
const A = '00000000-0000-0000-0000-00000000aa01';
const B = '00000000-0000-0000-0000-00000000bb02';
const migration = 'supabase/migrations/20261007221238_crm_account_safe_deletion.sql';

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA private;
    CREATE FUNCTION private.current_organization_id() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE organizations (id uuid PRIMARY KEY);
    CREATE TABLE profiles (id uuid PRIMARY KEY);
    CREATE TABLE products (id uuid PRIMARY KEY);
  `);
  for (const file of [
    '20261003163426_crm_v1_additive.sql', '20261004000002_crm_sales_cockpit.sql',
    '20261004000003_crm_purchase_intelligence.sql', '20261005180000_crm_commercial_data_ingestion.sql',
    '20261004000004_niupackbot_outreach.sql',
  ]) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(readFileSync(migration, 'utf8'));
}, 30000);

beforeEach(async () => {
  await db.exec('TRUNCATE organizations CASCADE');
  await db.query('INSERT INTO organizations VALUES ($1), ($2)', [A, B]);
});
afterAll(() => db.close());

async function company(org = A, name = 'Cuenta') {
  const id = crypto.randomUUID();
  await db.query('INSERT INTO crm_companies (id,organization_id,name) VALUES ($1,$2,$3)', [id, org, name]);
  return id;
}
async function contact(id: string, org = A) {
  const contactId = crypto.randomUUID();
  await db.query('INSERT INTO crm_contacts (id,organization_id,company_id,full_name) VALUES ($1,$2,$3,$4)', [contactId, org, id, 'Contacto']);
  return contactId;
}
async function rpc(id: string, execute = false, org = A) {
  return (await db.query<{ result: AccountDeletionInspection }>('SELECT public.crm_account_deletion($1,$2,$3) result', [org, id, execute])).rows[0].result;
}

describe('Account deletion SQL against actual repository migrations', () => {
  it('preview does not mutate; safe delete removes only the company and its contacts', async () => {
    const id = await company(); const cid = await contact(id);
    expect(await rpc(id)).toMatchObject({ status: 'SAFE_TO_DELETE', contacts: 1, deleted: false });
    expect(await rpc(id, true)).toMatchObject({ status: 'DELETED', deleted_contacts: 1 });
    expect((await db.query('SELECT id FROM crm_contacts WHERE id=$1', [cid])).rows).toHaveLength(0);
    expect((await db.query('SELECT id FROM crm_companies WHERE id=$1', [id])).rows).toHaveLength(0);
  });

  it.each(['purchases','opportunities','conversations','leads','tasks','activities','aliases','staged_rows','campaign_recipients'])(
    'protects actual FK %s without mutating contacts or business data', async (kind) => {
      const id = await company(); const cid = await contact(id);
      if (kind === 'purchases') await db.query("INSERT INTO crm_customer_purchases (organization_id,company_id,contact_id,purchase_date,sku,product_name,quantity) VALUES ($1,$2,$3,'2026-01-01','SKU','Vaso',1)", [A,id,cid]);
      if (kind === 'opportunities') await db.query("INSERT INTO crm_opportunities (organization_id,contact_id,title) VALUES ($1,$2,'Venta')", [A,cid]);
      if (kind === 'conversations') await db.query("INSERT INTO crm_conversations (organization_id,contact_id,external_conversation_id) VALUES ($1,$2,'chat')", [A,cid]);
      if (kind === 'leads') await db.query('INSERT INTO crm_leads (organization_id,contact_id) VALUES ($1,$2)', [A,cid]);
      if (kind === 'tasks') await db.query("INSERT INTO crm_tasks (organization_id,company_id,title) VALUES ($1,$2,'Tarea')", [A,id]);
      if (kind === 'activities') await db.query("INSERT INTO crm_activities (organization_id,contact_id,type) VALUES ($1,$2,'NOTE')", [A,cid]);
      if (kind === 'aliases') await db.query("INSERT INTO crm_customer_aliases (organization_id,company_id,alias_normalized) VALUES ($1,$2,'alias')", [A,id]);
      if (kind === 'staged_rows') {
        const job = crypto.randomUUID();
        await db.query("INSERT INTO crm_import_jobs (id,organization_id,filename,target_lifecycle,dataset_type,status) VALUES ($1,$2,'fixture','CUSTOMER','ACCOUNT_LIST','STAGED')", [job,A]);
        await db.query("INSERT INTO crm_import_rows (organization_id,job_id,company_id,row_index,customer_status,product_status,row_status) VALUES ($1,$2,$3,1,'RESOLVED','SKIPPED','READY')", [A,job,id]);
      }
      if (kind === 'campaign_recipients') {
        const campaign = crypto.randomUUID();
        const template = crypto.randomUUID();
        await db.query("INSERT INTO niupackbot_templates (id,organization_id,name,body) VALUES ($1,$2,'test_template','Hola')", [template,A]);
        await db.query("INSERT INTO niupackbot_campaigns (id,organization_id,name,template_id) VALUES ($1,$2,'Campaña',$3)", [campaign,A,template]);
        await db.query("INSERT INTO niupackbot_campaign_recipients (organization_id,campaign_id,contact_id,name,phone_e164) VALUES ($1,$2,$3,'Nombre','+595981111111')", [A,campaign,cid]);
      }
      expect(await rpc(id, true)).toMatchObject({ status: 'BLOCKED_BY_BUSINESS_DATA', deleted: false, dependencies: { [kind]: 1 } });
      expect((await db.query('SELECT id FROM crm_companies WHERE id=$1', [id])).rows).toHaveLength(1);
      expect((await db.query('SELECT id FROM crm_contacts WHERE id=$1', [cid])).rows).toHaveLength(1);
    },
  );

  it('blocks newly introduced external FKs and shared contacts across tenants', async () => {
    const id = await company(); const cid = await contact(id, B);
    expect(await rpc(id, true)).toMatchObject({ dependencies: { shared_contacts: 1 }, deleted: false });
    await db.exec('CREATE TABLE public.future_contact_history (contact_id uuid REFERENCES crm_contacts(id) ON DELETE CASCADE)');
    await db.query('INSERT INTO future_contact_history VALUES ($1)', [cid]);
    expect(await rpc(id, true)).toMatchObject({ dependencies: { other: 1 }, references: { 'public.future_contact_history': 1 }, deleted: false });
    await db.exec('DROP TABLE future_contact_history');
  });

  it('tenant guard returns NOT_FOUND and preserves another tenant', async () => {
    const id = await company(B); await contact(id, B);
    expect(await rpc(id, true)).toMatchObject({ status: 'NOT_FOUND', deleted: false });
    expect(await rpc(crypto.randomUUID(), true)).toMatchObject({ status: 'NOT_FOUND' });
    expect((await db.query('SELECT id FROM crm_companies WHERE id=$1', [id])).rows).toHaveLength(1);
  });

  it('batch returns mixed outcomes and rolls back an account if company deletion fails', async () => {
    const safe = await company(); const blocked = await company(); const failed = await company(A, 'Simular fallo');
    await contact(failed);
    await db.query("INSERT INTO crm_tasks (organization_id,company_id,title) VALUES ($1,$2,'Historial')", [A,blocked]);
    await db.exec(`CREATE FUNCTION public.test_company_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.name='Simular fallo' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN OLD; END $$;
      CREATE TRIGGER fixture_failure BEFORE DELETE ON crm_companies FOR EACH ROW EXECUTE FUNCTION public.test_company_failure();`);
    const { rows } = await db.query<{ result: AccountDeletionInspection[] }>('SELECT public.crm_account_deletion_batch($1,$2,true) result', [A,[safe,blocked,failed,crypto.randomUUID()]]);
    expect(rows[0].result.map((r) => r.status).sort()).toEqual(['BLOCKED_BY_BUSINESS_DATA','DELETED','FAILED','NOT_FOUND']);
    expect((await db.query('SELECT id FROM crm_contacts WHERE company_id=$1', [failed])).rows).toHaveLength(1);
    expect((await db.query('SELECT id FROM crm_companies WHERE id=$1', [failed])).rows).toHaveLength(1);
    await db.exec('DROP TRIGGER fixture_failure ON crm_companies; DROP FUNCTION test_company_failure()');
  });

  it('rechecks newly created history after a successful preview', async () => {
    const id = await company();
    expect((await rpc(id)).status).toBe('SAFE_TO_DELETE');
    await db.query("INSERT INTO crm_tasks (organization_id,company_id,title) VALUES ($1,$2,'Nueva tarea')", [A,id]);
    expect((await rpc(id, true)).status).toBe('BLOCKED_BY_BUSINESS_DATA');
  });

  it('RPC is SECURITY INVOKER and only service_role can execute', async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean; definer: boolean }>(`SELECT
      has_function_privilege('anon','public.crm_account_deletion(uuid,uuid,boolean)','EXECUTE') anon,
      has_function_privilege('authenticated','public.crm_account_deletion(uuid,uuid,boolean)','EXECUTE') authenticated,
      has_function_privilege('service_role','public.crm_account_deletion(uuid,uuid,boolean)','EXECUTE') service,
      (SELECT prosecdef FROM pg_proc WHERE oid='public.crm_account_deletion(uuid,uuid,boolean)'::regprocedure) definer`);
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true, definer: false });
  });

  it('safe deletion leaves product/SKU aliases and unrelated customer aliases intact', async () => {
    const retained = await company(); const safe = await company();
    await db.query("INSERT INTO crm_customer_aliases (organization_id,company_id,alias_normalized) VALUES ($1,$2,'retained')", [A,retained]);
    await db.query("INSERT INTO crm_product_aliases (organization_id,sku,alias_normalized) VALUES ($1,'SKU','retained')", [A]);
    const productId = crypto.randomUUID();
    await db.query('INSERT INTO products VALUES ($1)', [productId]);
    const snapshots = async () => Promise.all(['products','crm_customer_aliases','crm_product_aliases'].map(async (table) => (await db.query(`SELECT * FROM ${table}`)).rows));
    const before = await snapshots();
    expect((await rpc(safe, true)).deleted).toBe(true);
    expect(await snapshots()).toEqual(before);
  });
});
