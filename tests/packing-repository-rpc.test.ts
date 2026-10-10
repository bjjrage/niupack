import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/db/supabase', () => ({
  supabase: null,
  supabaseAdmin: { rpc: mocks.rpc },
  isSupabaseConfigured: false,
  isSupabaseAdminConfigured: true,
}));

import { repository } from '@/lib/db/repository';

const organizationId = '11111111-1111-4111-8111-111111111111';
const sessionId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const supervisorId = '55555555-5555-4555-8555-555555555555';
const rpcSession = {
  id: sessionId,
  organization_id: organizationId,
  line_name: 'Polipapel',
  status: 'RUNNING',
  started_at: '2026-10-10T12:00:00.000Z',
  total_person_hours: 0,
  total_duration_minutes: 0,
  segments: [{ id: '66666666-6666-4666-8666-666666666666', segment_order: 1, headcount: 3 }],
  server_now: '2026-10-10T12:01:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: rpcSession, error: null });
});

describe('packing repository atomic RPC contracts', () => {
  it('starts only with a request key and forwards nullable mobile profile references', async () => {
    await expect(repository.startPackingSession({ line_name: 'Polipapel', initial_headcount: 3 }, organizationId))
      .rejects.toThrow('PACKING_REQUEST_ID_REQUIRED');
    expect(mocks.rpc).not.toHaveBeenCalled();

    const session = await repository.startPackingSession({ line_name: 'Polipapel', initial_headcount: 3 }, organizationId, {
      requestId, tokenId: '22222222-2222-4222-8222-222222222222', lineName: 'Polipapel',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('start_packing_session_atomic', expect.objectContaining({
      p_organization_id: organizationId,
      p_idempotency_key: requestId,
      p_line_name: 'Polipapel',
      p_operator_user_id: null,
      p_actor_profile_id: null,
      p_token_id: '22222222-2222-4222-8222-222222222222',
    }));
    expect(session).toMatchObject({ id: sessionId, segments: [{ headcount: 3 }], server_now: rpcSession.server_now });
  });

  it('propagates missing-schema failures without returning a memory-store success', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function unavailable' } });
    await expect(repository.startPackingSession({ line_name: 'Polipapel', initial_headcount: 3 }, organizationId, { requestId }))
      .rejects.toThrow('SUPABASE_SCHEMA_NOT_READY:start_packing_session_atomic');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('uses atomic approval with the supervisor profile and full allocation payload', async () => {
    const allocations = [{ segment_id: '66666666-6666-4666-8666-666666666666', salary_band_id: '77777777-7777-4777-8777-777777777777', headcount: 3 }];
    await repository.approvePackingSessionWithLaborAllocations(sessionId, allocations, supervisorId, organizationId, { requestId });
    expect(mocks.rpc).toHaveBeenCalledWith('approve_packing_session_with_labor_atomic', expect.objectContaining({
      p_organization_id: organizationId,
      p_session_id: sessionId,
      p_idempotency_key: requestId,
      p_allocations: allocations,
      p_supervisor_id: supervisorId,
      p_line_name: null,
      p_token_id: null,
    }));
  });

  it('refuses to confirm approval without a real supervisor id', async () => {
    await expect(repository.approvePackingSessionWithLaborAllocations(sessionId, [], undefined, organizationId, { requestId }))
      .rejects.toThrow('PACKING_SUPERVISOR_REQUIRED');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
