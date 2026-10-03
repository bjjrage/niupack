import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveOrganizationIdStrict } from '@/lib/niupackbot/whatsapp/webhook';

describe('Tenant resolver estricto', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('test env usa org explícita sin DB', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NIUPACKBOT_ORGANIZATION_ID', '');
    await expect(resolveOrganizationIdStrict()).resolves.toBe('00000000-0000-0000-0000-000000000001');
  });

  it('producción sin NIUPACKBOT_ORGANIZATION_ID => reject, sin limit(1)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NIUPACKBOT_ORGANIZATION_ID', '');
    await expect(resolveOrganizationIdStrict()).rejects.toThrow('ORGANIZATION_NOT_CONFIGURED');
  });

  it('producción con org inválida y sin Supabase => reject (no crea org)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NIUPACKBOT_ORGANIZATION_ID', '00000000-0000-0000-0000-00000000ffff');
    await expect(resolveOrganizationIdStrict()).rejects.toThrow();
  });
});
