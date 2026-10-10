/**
 * Uses the real supabase-js client (no mocks) pointed at a port where nothing listens,
 * to prove that writes fail loudly instead of reporting a fake save or falling back to memory.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('database unavailable', () => {
  let repository: typeof import('@/lib/db/repository').repository;
  const org = randomUUID();

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unreachable-service-key');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'unreachable-anon-key');
    ({ repository } = await import('@/lib/db/repository'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rejects salary band creation and never stores it in memory', { timeout: 60_000 }, async () => {
    await expect(repository.createSalaryBand({ organization_id: org, name: 'Banda', status: 'ACTIVE' }, 3_100_000, '2026-01-01', org))
      .rejects.toThrow();
    await expect(repository.getSalaryBands(org)).rejects.toThrow();
  });

  it('rejects employee creation', async () => {
    await expect(repository.createPersonnel({ organization_id: org, employee_code: 'E1', display_name: 'E1', status: 'ACTIVE', hire_date: '2026-01-01' }, undefined, undefined, org))
      .rejects.toThrow();
  });

  it('rejects starting a packing session', async () => {
    await expect(repository.startPackingSession({ line_name: 'Polipapel', initial_headcount: 3 }, org, { requestId: randomUUID() }))
      .rejects.toThrow();
  });
});
