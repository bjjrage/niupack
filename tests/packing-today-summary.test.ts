import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { asuncionDate, asuncionMonth, longDayLabel, shiftFor, toTodaySummary } from '@/lib/packing/shift';

const mocks = vi.hoisted(() => ({
  requireNiuIdentity: vi.fn(),
  verifyPackingToken: vi.fn(),
  getPackingOperatorToken: vi.fn(),
  getPackingSessions: vi.fn(),
}));

vi.mock('@/lib/auth/identity', () => ({
  NiuAuthError: class NiuAuthError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  },
  requireNiuIdentity: mocks.requireNiuIdentity,
  authErrorResponse: (error: unknown) => Response.json({ error: (error as Error)?.message }, { status: (error as { status?: number })?.status ?? 500 }),
}));
vi.mock('@/lib/auth/packing-token', () => ({ verifyPackingToken: mocks.verifyPackingToken }));
vi.mock('@/lib/db/repository', () => ({
  repository: { getPackingOperatorToken: mocks.getPackingOperatorToken, getPackingSessions: mocks.getPackingSessions },
}));

import { GET } from '@/app/api/cost/processes/packing/sessions/route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const tokenId = '22222222-2222-4222-8222-222222222222';

describe('shift and day helpers (Asunción time)', () => {
  it('uses Paraguay time, not UTC: 02:30 UTC is still the previous evening in Asunción', () => {
    expect(asuncionDate('2026-10-11T02:30:00.000Z')).toBe('2026-10-10');
    expect(asuncionMonth('2026-11-01T01:00:00.000Z')).toBe('2026-10');
  });

  it('splits morning and afternoon at 13:00 local time', () => {
    expect(shiftFor('2026-10-10T11:59:00.000Z').code).toBe('MANANA'); // 08:59 Asunción
    expect(shiftFor('2026-10-10T15:59:00.000Z').code).toBe('MANANA'); // 12:59 Asunción
    expect(shiftFor('2026-10-10T16:00:00.000Z').code).toBe('TARDE');  // 13:00 Asunción
    expect(shiftFor('2026-10-10T16:00:00.000Z').label).toBe('Tarde');
  });

  it('labels the day in Spanish', () => {
    expect(longDayLabel('2026-10-10T15:00:00.000Z')).toBe('Sábado, 10 de octubre');
  });

  it('the operator summary drops everything except times, headcount and hours', () => {
    const summary = toTodaySummary({
      id: 's1', status: 'APPROVED', started_at: 'a', stopped_at: 'b', total_person_hours: 6.033, total_duration_minutes: 90.64,
      segments: [{ headcount: 4, started_at: 'a', ended_at: 'b', id: 'seg', session_id: 's1', person_hours: 6 } as never],
      approved_by: 'supervisor-uuid', notes: 'private', supervisor_name: 'Boss', sku: 'SKU-1',
    } as never);
    expect(Object.keys(summary).sort()).toEqual(['id', 'segments', 'started_at', 'status', 'stopped_at', 'total_duration_minutes', 'total_person_hours']);
    expect(Object.keys(summary.segments[0]).sort()).toEqual(['ended_at', 'headcount', 'started_at']);
  });
});

describe('GET sessions?scope=today for the floor operator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T18:00:00.000Z')); // 15:00 on Oct 10 in Asunción
    vi.clearAllMocks();
    mocks.verifyPackingToken.mockReturnValue({ org: organizationId, jti: tokenId, role: 'packing_operator', line: 'Polipapel', scope: 'planta_empaque', exp: 2_100_000_000 });
    mocks.getPackingOperatorToken.mockResolvedValue({ token_id: tokenId, organization_id: organizationId, line_name: 'Polipapel', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null });
    const base = { organization_id: organizationId, line_name: 'Polipapel', total_person_hours: 6, segments: [], created_at: 'x', updated_at: 'x' };
    mocks.getPackingSessions.mockImplementation(async (filters: { status?: string; period?: string }) =>
      filters.status === 'RUNNING' ? [] : [
        { ...base, id: 'today-approved', status: 'APPROVED', started_at: '2026-10-10T11:00:00.000Z', stopped_at: '2026-10-10T13:00:00.000Z', approved_by: 'secret-profile', notes: 'private' },
        { ...base, id: 'today-voided', status: 'VOIDED', started_at: '2026-10-10T12:00:00.000Z' },
        { ...base, id: 'yesterday', status: 'STOPPED', started_at: '2026-10-09T14:00:00.000Z' },
        { ...base, id: 'today-running', status: 'RUNNING', started_at: '2026-10-10T17:00:00.000Z' },
      ]
    );
  });
  afterEach(() => vi.useRealTimers());

  const request = (query: string) => new NextRequest(`https://niupack.test/api/cost/processes/packing/sessions?${query}`, { headers: { 'x-packing-token': 'mobile-token' } });

  it('returns only today, non-voided sessions of the bound line, in minimal form', async () => {
    const response = await GET(request('status=RUNNING&scope=today&line_name=OtherLine'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.today_sessions.map((item: { id: string }) => item.id)).toEqual(['today-approved', 'today-running']);
    expect(JSON.stringify(body.today_sessions)).not.toMatch(/secret-profile|private|organization_id/);
    for (const call of mocks.getPackingSessions.mock.calls.slice(1)) {
      expect(call[0]).toEqual(expect.objectContaining({ line_name: 'Polipapel' }));
    }
  });

  it('keeps the previous response shape when scope is not requested', async () => {
    const body = await (await GET(request('status=RUNNING'))).json();
    expect(body.today_sessions).toBeUndefined();
    expect(mocks.getPackingSessions).toHaveBeenCalledTimes(1);
  });

  it('still refuses historical queries for the operator', async () => {
    expect((await GET(request('status=APPROVED&scope=today'))).status).toBe(403);
  });
});
