import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireNiuIdentity: vi.fn(),
  verifyPackingToken: vi.fn(),
  getPackingOperatorToken: vi.fn(),
  getPackingSessions: vi.fn(),
  startPackingSession: vi.fn(),
  changePackingHeadcount: vi.fn(),
  stopPackingSession: vi.fn(),
  correctPackingSession: vi.fn(),
  voidPackingSession: vi.fn(),
}));

vi.mock('@/lib/auth/identity', () => ({
  NiuAuthError: class NiuAuthError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  },
  requireNiuIdentity: mocks.requireNiuIdentity,
  authErrorResponse: (error: unknown) => {
    const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: number }).status) : 500;
    return Response.json({ error: (error as Error)?.message || 'AUTH_FAILED' }, { status });
  },
}));

vi.mock('@/lib/auth/packing-token', () => ({
  verifyPackingToken: mocks.verifyPackingToken,
}));

vi.mock('@/lib/db/repository', () => ({
  repository: {
    getPackingOperatorToken: mocks.getPackingOperatorToken,
    getPackingSessions: mocks.getPackingSessions,
    startPackingSession: mocks.startPackingSession,
    changePackingHeadcount: mocks.changePackingHeadcount,
    stopPackingSession: mocks.stopPackingSession,
    correctPackingSession: mocks.correctPackingSession,
    voidPackingSession: mocks.voidPackingSession,
  },
}));

import { GET, POST } from '@/app/api/cost/processes/packing/sessions/route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const tokenId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const session = {
  id: sessionId,
  organization_id: organizationId,
  status: 'RUNNING',
  started_at: '2026-10-10T12:00:00.000Z',
  total_person_hours: 0,
  segments: [],
  created_at: '2026-10-10T12:00:00.000Z',
  updated_at: '2026-10-10T12:00:00.000Z',
  server_now: '2026-10-10T12:01:00.000Z',
};

function mobileTokenRequest(url: string, body?: unknown, method = 'GET') {
  return new NextRequest(url, {
    method,
    headers: { 'x-packing-token': 'mobile-token', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireNiuIdentity.mockResolvedValue({ userId: 'admin', organizationId, profileId: '55555555-5555-4555-8555-555555555555', role: 'admin' });
  mocks.verifyPackingToken.mockReturnValue({ org: organizationId, jti: tokenId, role: 'packing_operator', line: 'Polipapel', scope: 'planta_empaque', exp: 2_100_000_000 });
  mocks.getPackingOperatorToken.mockResolvedValue({
    token_id: tokenId, organization_id: organizationId, line_name: 'Polipapel',
    issued_at: '2026-10-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null,
  });
  mocks.getPackingSessions.mockResolvedValue([]);
  mocks.startPackingSession.mockResolvedValue(session);
  mocks.changePackingHeadcount.mockResolvedValue(session);
  mocks.stopPackingSession.mockResolvedValue(session);
  mocks.correctPackingSession.mockResolvedValue(session);
  mocks.voidPackingSession.mockResolvedValue(session);
});

describe('packing session route hardening', () => {
  it('revalidates the registered token and scopes reads to the token line', async () => {
    const response = await GET(mobileTokenRequest('https://niupack.test/api/cost/processes/packing/sessions?line_name=Other'));
    expect(response.status).toBe(200);
    expect(mocks.getPackingOperatorToken).toHaveBeenCalledWith(tokenId, organizationId);
    expect(mocks.getPackingSessions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'RUNNING', line_name: 'Polipapel' }), organizationId
    );
    expect((await response.json()).server_now).toBeTruthy();
    expect(mocks.requireNiuIdentity).not.toHaveBeenCalled();
  });

  it('restricts a mobile capability to the live line session instead of historical sessions', async () => {
    const response = await GET(mobileTokenRequest('https://niupack.test/api/cost/processes/packing/sessions?status=APPROVED&sku=SKU-1&period=2026-10'));

    expect(response.status).toBe(403);
    expect(mocks.getPackingSessions).not.toHaveBeenCalled();
  });

  it('rejects invalid and revoked mobile tokens without falling back to an admin session', async () => {
    mocks.verifyPackingToken.mockReturnValue(null);
    const invalidResponse = await GET(mobileTokenRequest('https://niupack.test/api/cost/processes/packing/sessions'));
    expect(invalidResponse.status).toBe(401);

    mocks.verifyPackingToken.mockReturnValue({ org: organizationId, jti: tokenId, role: 'packing_operator', line: 'Polipapel', scope: 'planta_empaque', exp: 2_100_000_000 });
    mocks.getPackingOperatorToken.mockResolvedValueOnce({ token_id: tokenId, organization_id: organizationId, line_name: 'Polipapel', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: '2026-10-09T00:00:00.000Z' });
    const revokedResponse = await GET(mobileTokenRequest('https://niupack.test/api/cost/processes/packing/sessions'));
    expect(revokedResponse.status).toBe(401);
    expect(mocks.requireNiuIdentity).not.toHaveBeenCalled();
  });

  it('passes the mobile token id, line and retained request id while omitting synthetic profile FKs', async () => {
    const response = await POST(mobileTokenRequest(
      'https://niupack.test/api/cost/processes/packing/sessions',
      { action: 'start', initial_headcount: 3, request_id: requestId },
      'POST'
    ));
    expect(response.status).toBe(200);
    const [input, org, context] = mocks.startPackingSession.mock.calls[0];
    expect(input.operator_user_id).toBeUndefined();
    expect(org).toBe(organizationId);
    expect(context).toMatchObject({ requestId, tokenId, lineName: 'Polipapel' });
    expect(context.actorProfileId).toBeUndefined();
    expect((await response.json()).server_now).toBe(session.server_now);
  });

  it('limits mobile tokens to start, change-headcount and stop', async () => {
    const response = await POST(mobileTokenRequest(
      'https://niupack.test/api/cost/processes/packing/sessions',
      { action: 'void', session_id: sessionId, reason: 'x' },
      'POST'
    ));
    expect(response.status).toBe(403);
    expect(mocks.voidPackingSession).not.toHaveBeenCalled();
  });
});
