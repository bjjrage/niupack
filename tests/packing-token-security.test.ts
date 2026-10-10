import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPackingOperatorLink,
  generatePackingToken,
  verifyPackingToken,
} from '@/lib/auth/packing-token';

const organizationId = '11111111-1111-4111-8111-111111111111';
const tokenId = '22222222-2222-4222-8222-222222222222';


afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('packing operator token security', () => {
  it('requires a dedicated secret and emits a signed UUID jti', () => {
    vi.stubEnv('PACKING_TOKEN_SECRET', '');
    expect(() => generatePackingToken(organizationId, 'Polipapel', 7, tokenId))
      .toThrow('PACKING_TOKEN_SECRET_REQUIRED');

    vi.stubEnv('PACKING_TOKEN_SECRET', 'test-only-packing-token-secret-has-32-bytes');
    const token = generatePackingToken(organizationId, 'Polipapel', 7, tokenId);
    expect(verifyPackingToken(token)).toMatchObject({
      org: organizationId, jti: tokenId, line: 'Polipapel', role: 'packing_operator', scope: 'planta_empaque',
    });
  });

  it('rejects unsupported lines and expired or tampered tokens', () => {
    vi.stubEnv('PACKING_TOKEN_SECRET', 'test-only-packing-token-secret-has-32-bytes');
    expect(() => generatePackingToken(organizationId, 'Other Line', 7, tokenId))
      .toThrow('INVALID_PACKING_TOKEN_SCOPE');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
    const token = generatePackingToken(organizationId, 'Polipapel', 1, tokenId);
    vi.setSystemTime(new Date('2026-10-11T12:00:01.000Z'));
    expect(verifyPackingToken(token)).toBeNull();
    expect(verifyPackingToken(`${token.slice(0, -1)}0`)).toBeNull();
  });

  it('keeps the bearer out of the request URL by placing it in the fragment', () => {
    const token = generatePackingToken(organizationId, 'Polipapel', 7, tokenId);
    const link = buildPackingOperatorLink('https://preview.niupack.test/', token);
    expect(link).toContain('/planta/empaque#token=');
    expect(link).not.toContain('?token=');
    expect(new URL(link).search).toBe('');
  });
});
