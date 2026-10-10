import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requirePersonnelAdminIdentity: vi.fn(),
  getProductionPeriod: vi.fn(),
  getProductionPeriods: vi.fn(),
  saveProductionPeriod: vi.fn(),
}));

vi.mock('@/lib/auth/personnel-guard', () => ({
  requirePersonnelAdminIdentity: mocks.requirePersonnelAdminIdentity,
}));

vi.mock('@/lib/auth/identity', () => ({
  authErrorResponse: (error: unknown) => {
    const status = error && typeof error === 'object' && 'status' in error
      ? Number((error as { status: number }).status)
      : 500;
    return Response.json({ error: (error as Error)?.message || 'AUTH_FAILED' }, { status });
  },
}));

vi.mock('@/lib/db/repository', () => ({
  repository: {
    getProductionPeriod: mocks.getProductionPeriod,
    getProductionPeriods: mocks.getProductionPeriods,
    saveProductionPeriod: mocks.saveProductionPeriod,
  },
}));

import { GET, POST } from '@/app/api/cost/processes/periods/route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const identity = { userId: 'admin', organizationId, profileId: '22222222-2222-4222-8222-222222222222', role: 'admin' as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePersonnelAdminIdentity.mockResolvedValue(identity);
  mocks.getProductionPeriods.mockResolvedValue([]);
  mocks.getProductionPeriod.mockResolvedValue(undefined);
  mocks.saveProductionPeriod.mockImplementation(async (record) => ({ ...record, organization_id: organizationId }));
});

describe('production periods API', () => {
  it('restricts production-volume reads to personnel admins', async () => {
    mocks.requirePersonnelAdminIdentity.mockRejectedValue(Object.assign(new Error('PERSONNEL_ADMIN_REQUIRED'), { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/cost/processes/periods'));

    expect(response.status).toBe(403);
    expect(mocks.getProductionPeriods).not.toHaveBeenCalled();
    expect(mocks.getProductionPeriod).not.toHaveBeenCalled();
  });

  it('scopes a production-period read to the authenticated organization', async () => {
    mocks.getProductionPeriod.mockResolvedValue({ sku: 'SKU-1', period: '2026-10', good_units_produced: 120 });

    const response = await GET(new NextRequest('http://localhost/api/cost/processes/periods?sku=SKU-1&period=2026-10'));

    expect(response.status).toBe(200);
    expect(mocks.getProductionPeriod).toHaveBeenCalledWith('SKU-1', '2026-10', organizationId);
  });

  it.each(['operating_hours', 'notes'])('rejects unsupported %s instead of reporting a false save', async (field) => {
    const body = {
      sku: 'SKU-1',
      period: '2026-10',
      good_units_produced: 120,
      [field]: field === 'notes' ? 'turno de noche' : 8,
    };

    const response = await POST(new NextRequest('http://localhost/api/cost/processes/periods', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'UNSUPPORTED_PRODUCTION_PERIOD_FIELDS' });
    expect(mocks.saveProductionPeriod).not.toHaveBeenCalled();
  });

  it('persists only the fields supported by the production-period table', async () => {
    const response = await POST(new NextRequest('http://localhost/api/cost/processes/periods', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku: 'SKU-1', period: '2026-10', good_units_produced: 120 }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.saveProductionPeriod).toHaveBeenCalledWith({
      sku: 'SKU-1', period: '2026-10', good_units_produced: 120,
    }, organizationId);
    expect(await response.json()).toMatchObject({ success: true, period: { sku: 'SKU-1', good_units_produced: 120 } });
  });
});
