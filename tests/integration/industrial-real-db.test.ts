/**
 * Real-database integration test (no mocks). Runs repository.ts against a local
 * PostgreSQL + PostgREST stack with every migration applied.
 *
 * Skipped unless NIUPACK_QA_DB=1. Refuses to run against anything but localhost.
 * See docs/qa-local-db.md for how to start the local stack.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);
}

describe.skipIf(!enabled)('industrial workflows against real PostgreSQL', () => {
  let repository: typeof import('@/lib/db/repository').repository;
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const supervisor = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const bands: Record<string, string> = {};
  const people: Record<string, string> = {};

  beforeAll(async () => {
    ({ repository } = await import('@/lib/db/repository'));
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    for (const [id, slug] of [[orgA, 'qa-a'], [orgB, 'qa-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    const { error } = await admin.from('profiles').insert({ id: supervisor, organization_id: orgA, email: `sup-${supervisor}@qa.local`, full_name: 'QA Supervisor', role: 'admin' });
    if (error) throw error;
    const params = await admin.from('plant_process_parameters').insert({ organization_id: orgA, monthly_salary_hours: 200, labor_charges_percent: 16.5 });
    if (params.error) throw params.error;
  });

  it('scenario 1: three bands + three employees persist and sum Gs. 10.600.000 without duplication', async () => {
    for (const [name, salary] of [['Empaque', 3_100_000], ['Operador', 3_500_000], ['Calidad', 4_000_000]] as const) {
      const band = await repository.createSalaryBand(
        { organization_id: orgA, name, status: 'ACTIVE' }, salary, '2026-01-01', orgA, supervisor);
      bands[name] = band.id;
    }
    const plan = [['E-A', 'Empleado A', 'Empaque', 'EMPAQUE'], ['E-B', 'Empleado B', 'Operador', 'FORMADO'], ['E-C', 'Empleado C', 'Calidad', 'CALIDAD']] as const;
    for (const [code, name, band, sector] of plan) {
      const person = await repository.createPersonnel(
        { organization_id: orgA, employee_code: code, display_name: name, status: 'ACTIVE', hire_date: '2026-01-01' },
        bands[band], sector, orgA);
      people[code] = person.id;
    }

    // "Leave and come back": fresh reads straight from the database.
    const personnel = await repository.getPersonnel(orgA, undefined, today);
    expect(personnel.map((p) => p.employee_code).sort()).toEqual(['E-A', 'E-B', 'E-C']);
    const base = personnel.reduce((sum, p) => sum + Number(p.current_salary_pyg), 0);
    expect(base).toBe(10_600_000);

    // Split employee B 50% Gen1 / 50% Gen2: one person, one salary.
    await repository.savePersonnelAssignment({ organization_id: orgA, personnel_id: people['E-B'], salary_band_id: bands.Operador, sector: 'FORMADO', machine_generation: 'GEN1', allocation_percent: 50, valid_from: '2026-01-01', valid_to: null }, orgA);
    await repository.savePersonnelAssignment({ organization_id: orgA, personnel_id: people['E-B'], salary_band_id: bands.Operador, sector: 'FORMADO', machine_generation: 'GEN2', allocation_percent: 50, valid_from: '2026-01-01', valid_to: null }, orgA);

    const summary = await repository.getSectorPersonnelSummary(orgA, today, 200, 16.5);
    expect(summary.FORMADO.assigned_count).toBe(1);
    expect(summary.FORMADO.monthly_salary_base_pyg).toBe(3_500_000);
    expect(summary.FORMADO.personnel[0].generation_allocations).toEqual({ GEN1: 50, GEN2: 50 });
    const totalBase = summary.FORMADO.monthly_salary_base_pyg + summary.CALIDAD.monthly_salary_base_pyg + summary.EMPAQUE.monthly_salary_base_pyg;
    expect(totalBase).toBe(10_600_000);

    // Over-allocation must be rejected by the database.
    await expect(repository.savePersonnelAssignment({ organization_id: orgA, personnel_id: people['E-B'], salary_band_id: bands.Operador, sector: 'CALIDAD', allocation_percent: 10, valid_from: '2026-01-01', valid_to: null }, orgA))
      .rejects.toThrow();

    // Tenant isolation: org B sees nothing of org A.
    expect(await repository.getPersonnel(orgB, undefined, today)).toEqual([]);
    expect(await repository.getSalaryBands(orgB, today, false)).toEqual([]);
  });

  it('scenario 2: packing stopwatch 3 -> 4 people gives 9 person-hours, approval is costed once', async () => {
    const ctx = (extra: object = {}) => ({ requestId: randomUUID(), actorProfileId: supervisor, ...extra });
    const backdate = async (minutesAgo: number) => {
      const { data } = await admin.from('packing_session_segments').select('id').eq('session_id', sessionId).is('ended_at', null).single();
      const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
      await admin.from('packing_session_segments').update({ started_at: at }).eq('id', data!.id);
      return at;
    };

    const started = await repository.startPackingSession({ line_name: 'Polipapel', initial_headcount: 3 }, orgA, ctx());
    const sessionId = started.id;
    // Simulated clock: segment 1 ran 60 min with 3 people.
    const sessionStart = await backdate(150);
    await admin.from('packing_sessions').update({ started_at: sessionStart }).eq('id', sessionId);
    await backdate(60);

    // Idempotent retry of the same request must not create a second segment.
    const changeCtx = ctx();
    await repository.changePackingHeadcount(sessionId, 4, 'refuerzo', orgA, changeCtx);
    await repository.changePackingHeadcount(sessionId, 4, 'refuerzo', orgA, changeCtx);
    // Segment 2 ran 90 min with 4 people.
    await backdate(90);
    const stopped = await repository.stopPackingSession(sessionId, orgA, ctx());
    expect(stopped.status).toBe('STOPPED');

    // "Leave and come back": read from the DB.
    const reloaded = await repository.getPackingSession(sessionId, orgA);
    expect(reloaded?.segments?.length).toBe(2);
    expect(Number(reloaded?.total_person_hours)).toBeCloseTo(9, 2);

    const segments = reloaded!.segments!;
    const approveCtx = ctx();
    const allocations = segments.map((s) => ({ segment_id: s.id, salary_band_id: bands.Empaque, headcount: s.headcount }));
    const approved = await repository.approvePackingSessionWithLaborAllocations(sessionId, allocations, supervisor, orgA, approveCtx);
    expect(approved.status).toBe('APPROVED');

    // Same request replayed: idempotent. New request: rejected (already approved).
    await repository.approvePackingSessionWithLaborAllocations(sessionId, allocations, supervisor, orgA, approveCtx);
    await expect(repository.approvePackingSessionWithLaborAllocations(sessionId, allocations, supervisor, orgA, ctx())).rejects.toThrow();

    const labor = await repository.getPackingLaborAllocations(sessionId, orgA);
    expect(labor).toHaveLength(2);
    const hourly = 3_100_000 * 1.165 / 200;
    const cost = labor.reduce((sum, a) => sum + a.calculated_cost_pyg, 0);
    expect(cost).toBeCloseTo(9 * hourly, 0);

    // Org B cannot see or approve org A's session.
    expect(await repository.getPackingSession(sessionId, orgB)).toBeUndefined();
  });
});
