import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ requireNiuIdentity: vi.fn(), createPackingOperatorToken: vi.fn(), revokePackingOperatorToken: vi.fn() }));

vi.mock('@/lib/auth/identity', () => ({
  NiuAuthError: class NiuAuthError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } },
  requireNiuIdentity: mocks.requireNiuIdentity,
  authErrorResponse: (error: unknown) => Response.json({ error: (error as Error)?.message }, { status: Number((error as any)?.status) || 500 }),
}));
vi.mock('@/lib/db/repository', () => ({ repository: {
  createPackingOperatorToken: mocks.createPackingOperatorToken,
  revokePackingOperatorToken: mocks.revokePackingOperatorToken,
} }));

import { DELETE, GET, POST } from '@/app/api/cost/processes/packing/qr-token/route';

const organizationId = '11111111-1111-4111-8111-111111111111';

describe('packing QR credential endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNiuIdentity.mockResolvedValue({
      userId: 'admin-user', organizationId, profileId: '55555555-5555-4555-8555-555555555555', role: 'admin',
    });
    mocks.createPackingOperatorToken.mockImplementation(async (record) => record);
    mocks.revokePackingOperatorToken.mockResolvedValue(true);
  });

  it('does not issue a credential from GET', async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(mocks.createPackingOperatorToken).not.toHaveBeenCalled();
  });

  it('persists a UUID token registry entry before returning a fragment link', async () => {
    const response = await POST(new NextRequest('https://niupack.test/api/cost/processes/packing/qr-token?line=Polipapel', { method: 'POST' }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.relative_url).toMatch(/^\/planta\/empaque#token=/);
    expect(body.relative_url).not.toContain('?token=');
    expect(body.token_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.createPackingOperatorToken).toHaveBeenCalledWith(expect.objectContaining({
      token_id: body.token_id, organization_id: organizationId, line_name: 'Polipapel',
    }), organizationId);
  });

  it('allows a supervisor to revoke an issued token by UUID', async () => {
    const tokenId = '22222222-2222-4222-8222-222222222222';
    const response = await DELETE(new NextRequest('https://niupack.test/api/cost/processes/packing/qr-token', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token_id: tokenId, reason: 'rotacion' }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.revokePackingOperatorToken).toHaveBeenCalledWith(tokenId, organizationId, expect.any(String), 'rotacion');
  });
});
