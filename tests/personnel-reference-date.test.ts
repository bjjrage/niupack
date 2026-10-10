import { describe, expect, it } from 'vitest';
import { personnelReferenceDate } from '@/lib/cost/period';
import { repository } from '@/lib/db/repository';

describe('personnel reference date for a costing period', () => {
  it('uses today inside the current period so mid-month hires are counted', () => {
    expect(personnelReferenceDate('2026-10', '2026-10-10')).toBe('2026-10-10');
  });

  it('uses the last day of a past period and the first day of a future one', () => {
    expect(personnelReferenceDate('2026-09', '2026-10-10')).toBe('2026-09-30');
    expect(personnelReferenceDate('2026-02', '2026-10-10')).toBe('2026-02-28');
    expect(personnelReferenceDate('2024-02', '2026-10-10')).toBe('2024-02-29');
    expect(personnelReferenceDate('2026-12', '2026-10-10')).toBe('2026-12-01');
  });

  it('falls back to today for a missing or malformed period', () => {
    expect(personnelReferenceDate(undefined, '2026-10-10')).toBe('2026-10-10');
    expect(personnelReferenceDate('2026-13', '2026-10-10')).toBe('2026-10-10');
  });
});

describe('regression: an employee hired on the 10th disappeared from the October panel', () => {
  it('is excluded on Oct 1 (the old behaviour) but included on the reference date', async () => {
    const org = undefined; // in-memory store, no Supabase
    const band = await repository.createSalaryBand({ organization_id: '', name: 'Banda mitad de mes', status: 'ACTIVE' }, 3_500_000, '2026-01-01', org);
    const person = await repository.createPersonnel(
      { organization_id: '', employee_code: 'MID-10', display_name: 'Ingreso 10 oct', status: 'ACTIVE', hire_date: '2026-10-10' },
      band.id, 'EMPAQUE', org
    );
    const onFirst = await repository.getSectorPersonnelSummary(org, '2026-10-01', 200, 16.5);
    const onReference = await repository.getSectorPersonnelSummary(org, personnelReferenceDate('2026-10', '2026-10-10'), 200, 16.5);

    expect(onFirst.EMPAQUE.personnel.some((item) => item.personnel_id === person.id)).toBe(false);
    const found = onReference.EMPAQUE.personnel.find((item) => item.personnel_id === person.id);
    expect(found?.monthly_salary_pyg).toBe(3_500_000);
    expect(onReference.EMPAQUE.is_configured).toBe(true);
  });
});
