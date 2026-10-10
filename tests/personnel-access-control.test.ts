import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireNiuIdentity: vi.fn(),
  verifyPackingToken: vi.fn(),
}));

vi.mock('@/lib/auth/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/identity')>();
  return { ...actual, requireNiuIdentity: mocks.requireNiuIdentity };
});

vi.mock('@/lib/auth/packing-token', () => ({
  verifyPackingToken: mocks.verifyPackingToken,
}));

import { requirePersonnelAdminIdentity } from '@/lib/auth/personnel-guard';

describe('personnel and salary authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyPackingToken.mockReturnValue(null);
    mocks.requireNiuIdentity.mockResolvedValue({
      userId: 'user-1',
      organizationId: 'org-1',
      profileId: 'profile-1',
      role: 'admin',
    });
  });

  it('allows an authenticated administrator', async () => {
    await expect(requirePersonnelAdminIdentity(new NextRequest('https://niupack.test/api/personnel')))
      .resolves.toMatchObject({ role: 'admin', organizationId: 'org-1' });
  });

  it.each(['analyst', 'operator', 'executive'] as const)('denies the %s profile role', async (role) => {
    mocks.requireNiuIdentity.mockResolvedValue({
      userId: 'user-1', organizationId: 'org-1', profileId: 'profile-1', role,
    });

    await expect(requirePersonnelAdminIdentity(new NextRequest('https://niupack.test/api/personnel')))
      .rejects.toMatchObject({ message: 'PERSONNEL_ADMIN_REQUIRED', status: 403 });
  });

  it('denies a valid mobile packing token before resolving an administrator session', async () => {
    mocks.verifyPackingToken.mockReturnValue({
      org: 'org-1', role: 'packing_operator', line: 'Polipapel', scope: 'planta_empaque', exp: 2_000_000_000,
    });
    const request = new NextRequest('https://niupack.test/api/personnel', {
      headers: { 'x-packing-token': 'signed-packing-token' },
    });

    await expect(requirePersonnelAdminIdentity(request))
      .rejects.toMatchObject({ message: 'FORBIDDEN_OPERATOR_NO_SALARY_ACCESS', status: 403 });
    expect(mocks.requireNiuIdentity).not.toHaveBeenCalled();
  });
});
