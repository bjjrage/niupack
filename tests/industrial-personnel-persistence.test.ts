import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  adminConfigured: true,
  adminClient: null as null | { rpc: (...args: any[]) => any; from: (...args: any[]) => any },
}));

supabaseMock.adminClient = { rpc: supabaseMock.rpc, from: supabaseMock.from };

vi.mock('@/lib/db/supabase', () => ({
  get isSupabaseAdminConfigured() { return supabaseMock.adminConfigured; },
  get supabaseAdmin() { return supabaseMock.adminClient; },
  isSupabaseConfigured: true,
  supabase: null,
  isSupabasePublicConfigured: false,
}));

import { repository } from '@/lib/db/repository';
import { INITIAL_SALARY_BANDS } from '@/lib/db/seed-data';

function queryResult(result: unknown) {
  const query: any = {};
  for (const method of ['select', 'eq', 'lte', 'order', 'upsert', 'insert', 'update', 'delete', 'single', 'maybeSingle', 'in']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

describe('industrial salary and personnel persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    supabaseMock.adminConfigured = true;
    supabaseMock.adminClient = { rpc: supabaseMock.rpc, from: supabaseMock.from };
  });

  afterEach(() => vi.unstubAllEnvs());

  it('fails closed on a missing salary table instead of returning seeded memory data', async () => {
    const seededOrganizationId = INITIAL_SALARY_BANDS[0].organization_id;
    supabaseMock.from.mockReturnValue(queryResult({
      data: null,
      error: { code: 'PGRST205', message: 'Could not find the table plant_salary_bands in the schema cache' },
    }));

    await expect(repository.getSalaryBands(seededOrganizationId))
      .rejects.toThrow('SUPABASE_SCHEMA_NOT_READY:plant_salary_bands');
  });

  it('fails closed in production when the Supabase service client is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    supabaseMock.adminConfigured = false;
    supabaseMock.adminClient = null;

    await expect(repository.getSalaryBands(INITIAL_SALARY_BANDS[0].organization_id))
      .rejects.toThrow('SUPABASE_PERSISTENCE_UNAVAILABLE');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('creates a salary band and its initial rate through one atomic database operation', async () => {
    const persistedBand = {
      id: 'band-persisted',
      organization_id: 'org-persisted',
      name: 'Operador A',
      status: 'ACTIVE',
      monthly_salary_pyg: 4200000,
      current_rate: { id: 'rate-persisted', band_id: 'band-persisted', organization_id: 'org-persisted', monthly_salary_pyg: 4200000, valid_from: '2026-10-10' },
    };
    supabaseMock.rpc.mockResolvedValue({ data: persistedBand, error: null });

    const created = await repository.createSalaryBand({
      organization_id: 'org-persisted', name: 'Operador A', status: 'ACTIVE',
    }, 4200000, '2026-10-10', 'org-persisted');

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_plant_salary_band_with_rate', expect.objectContaining({
      p_organization_id: 'org-persisted', p_monthly_salary_pyg: 4200000,
    }));
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(created.current_rate?.id).toBe('rate-persisted');
  });

  it('does not report a successful band update when the requested row is absent', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'SALARY_BAND_NOT_FOUND' } });

    await expect(repository.updateSalaryBand('missing-band', { name: 'Nueva' }, undefined, undefined, 'org-persisted'))
      .rejects.toThrow('SALARY_BAND_NOT_FOUND');
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('update_plant_salary_band_with_rate', expect.objectContaining({
      p_band_id: 'missing-band', p_organization_id: 'org-persisted',
    }));
  });

  it('creates personnel, salary history and optional process assignment through one atomic operation', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: {
      id: 'person-persisted', organization_id: 'org-persisted', employee_code: 'E-01',
      display_name: 'Empleado', status: 'ACTIVE', hire_date: '2026-10-10',
    }, error: null });

    await repository.createPersonnel({
      organization_id: 'org-persisted', employee_code: 'E-01', display_name: 'Empleado',
      status: 'ACTIVE', hire_date: '2026-10-10',
    }, 'band-persisted', 'FORMADO', 'org-persisted');

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_plant_personnel_with_assignments', expect.objectContaining({
      p_salary_band_id: 'band-persisted', p_sector: 'FORMADO', p_machine_generation: 'GEN1',
    }));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('routes concurrent allocation writes to the database transaction that locks the employee row', async () => {
    supabaseMock.rpc.mockImplementation(async (_name: string, args: any) => ({
      data: {
        id: `assignment-${args.p_sector}`,
        organization_id: 'org-persisted', personnel_id: 'person-persisted',
        salary_band_id: 'band-persisted', sector: args.p_sector,
        machine_generation: args.p_machine_generation, allocation_percent: args.p_allocation_percent,
        valid_from: args.p_valid_from, valid_to: null,
      },
      error: null,
    }));
    const assignment = (sector: 'CALIDAD' | 'EMPAQUE') => repository.savePersonnelAssignment({
      organization_id: 'org-persisted', personnel_id: 'person-persisted', salary_band_id: 'band-persisted',
      sector, machine_generation: null, allocation_percent: 40, valid_from: '2026-10-10',
    }, 'org-persisted');

    await Promise.all([assignment('CALIDAD'), assignment('EMPAQUE')]);

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(2);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_plant_personnel_assignment', expect.any(Object));
    const migration = await import('node:fs/promises').then(({ readFile }) =>
      readFile('supabase/migrations/20261010154756_industrial_salary_personnel_atomic_persistence.sql', 'utf8'));
    const allocationFunction = migration.split('CREATE OR REPLACE FUNCTION public.save_plant_personnel_assignment')[1]
      .split('CREATE OR REPLACE FUNCTION public.create_plant_personnel_with_assignments')[0];
    expect(allocationFunction.indexOf('FOR UPDATE')).toBeLessThan(allocationFunction.indexOf('ASSIGNMENT_ALLOCATION_EXCEEDED'));
  });

  it('recovers the persisted band and rate on a later read after navigation', async () => {
    const band = { id: 'band-persisted', organization_id: 'org-persisted', name: 'Operador A', status: 'ACTIVE' };
    const rate = {
      id: 'rate-persisted', organization_id: 'org-persisted', band_id: 'band-persisted',
      monthly_salary_pyg: 4200000, valid_from: '2026-10-01', valid_to: null,
    };
    supabaseMock.from
      .mockReturnValueOnce(queryResult({ data: [band], error: null }))
      .mockReturnValueOnce(queryResult({ data: [rate], error: null }))
      .mockReturnValueOnce(queryResult({ data: [band], error: null }))
      .mockReturnValueOnce(queryResult({ data: [rate], error: null }));

    const firstRead = await repository.getSalaryBands('org-persisted', '2026-10-10');
    const readAfterNavigation = await repository.getSalaryBands('org-persisted', '2026-10-10');

    expect(firstRead[0].monthly_salary_pyg).toBe(4200000);
    expect(readAfterNavigation[0].current_rate?.id).toBe('rate-persisted');
  });

  it('does not convert a parameter upsert failure into a local success', async () => {
    supabaseMock.from.mockReturnValue(queryResult({
      data: null,
      error: { code: 'PGRST205', message: 'Could not find the table plant_process_parameters in the schema cache' },
    }));

    await expect(repository.updatePlantParameters({ labor_charges_percent: 20 }, 'org-persisted'))
      .rejects.toThrow('SUPABASE_SCHEMA_NOT_READY:plant_process_parameters');
  });
});
