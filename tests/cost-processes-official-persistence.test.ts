import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';

const mocks = vi.hoisted(() => ({
  getPlantParameters: vi.fn(),
  getProductionPeriod: vi.fn(),
  getProductionPeriods: vi.fn(),
  saveIndustrialProcessSnapshotAtomic: vi.fn(),
  applyIndustrialProcessCostAtomic: vi.fn(),
}));

vi.mock('@/lib/auth/personnel-guard', () => ({
  requirePersonnelAdminIdentity: vi.fn().mockResolvedValue({
    organizationId: 'org-1',
    profileId: 'profile-1',
    userId: 'user-1',
    role: 'admin',
  }),
}));

vi.mock('@/lib/auth/identity', () => ({
  requireNiuIdentity: vi.fn(),
  authErrorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: 500 }),
}));

vi.mock('@/lib/db/repository', () => ({
  repository: {
    getPlantParameters: mocks.getPlantParameters,
    getProductionPeriod: mocks.getProductionPeriod,
    getProductionPeriods: mocks.getProductionPeriods,
    saveIndustrialProcessSnapshotAtomic: mocks.saveIndustrialProcessSnapshotAtomic,
    applyIndustrialProcessCostAtomic: mocks.applyIndustrialProcessCostAtomic,
  },
}));

vi.mock('@/lib/fx/fx-provider', () => ({
  FxEngine: {
    getEffectiveQuote: vi.fn().mockResolvedValue({
      costingRate: 7_500,
      quote: { source: 'TEST', effectiveAt: '2026-10-10T00:00:00.000Z' },
      settings: { costing_rate_mode: 'FIXED' },
    }),
  },
}));

import { POST } from '@/app/api/cost/processes/calculate/route';

describe('official industrial calculation persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlantParameters.mockResolvedValue({});
    mocks.getProductionPeriod.mockResolvedValue(undefined);
  });

  it('refuses to snapshot or apply without a persisted production record', async () => {
    const request = new NextRequest('https://niupack.test/api/cost/processes/calculate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sku: 'SKU-1', period: '2026-10', apply_to_cost_sheet: true,
        request_id: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('PRODUCTION_BASE_NOT_CONFIGURED');
    expect(mocks.getProductionPeriods).not.toHaveBeenCalled();
    expect(mocks.saveIndustrialProcessSnapshotAtomic).not.toHaveBeenCalled();
    expect(mocks.applyIndustrialProcessCostAtomic).not.toHaveBeenCalled();
  });

  it('refuses an official calculation when the submitted units differ from persisted units', async () => {
    mocks.getProductionPeriod.mockResolvedValue({ good_units_produced: 120_000 });
    const request = new NextRequest('https://niupack.test/api/cost/processes/calculate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sku: 'SKU-1', period: '2026-10', good_units_produced: 130_000, persist_snapshot: true,
        request_id: '00000000-0000-4000-8000-000000000002',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('PRODUCTION_INPUT_NOT_SAVED');
    expect(mocks.saveIndustrialProcessSnapshotAtomic).not.toHaveBeenCalled();
  });

  it('requires an idempotency key before an official write can start', async () => {
    const request = new NextRequest('https://niupack.test/api/cost/processes/calculate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku: 'SKU-1', period: '2026-10', persist_snapshot: true }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('IDEMPOTENCY_REQUEST_ID_REQUIRED');
    expect(mocks.getPlantParameters).not.toHaveBeenCalled();
  });

  it('statically requires a single active Cost Sheet version before the apply RPC', async () => {
    const migration = await readFile(
      'supabase/migrations/20261010170248_packing_session_atomic_workflow.sql',
      'utf8'
    );
    const activeIndex = migration.indexOf('idx_cost_sheet_versions_one_active_per_org_sku');
    const applyFunctionIndex = migration.indexOf('CREATE OR REPLACE FUNCTION public.apply_industrial_cost_to_cost_intelligence_atomic');

    expect(activeIndex).toBeGreaterThan(-1);
    expect(migration.slice(activeIndex, applyFunctionIndex)).toMatch(/WHERE status = 'ACTIVE'/);
    expect(applyFunctionIndex).toBeGreaterThan(activeIndex);
  });
});
