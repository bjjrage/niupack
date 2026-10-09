import crypto from 'crypto';

const PACKING_SECRET =
  process.env.APP_SECRET ||
  process.env.SUPABASE_JWT_SECRET ||
  'niupack-packing-hmac-token-secret-2026';

export interface PackingTokenPayload {
  org: string;
  role: 'packing_operator';
  line: string;
  scope: 'planta_empaque';
  exp: number; // Unix timestamp in seconds
}

/**
 * Generates an HMAC-SHA256 signed token scoped for the mobile packing operator screen.
 * Does not expose administrative credentials or permissions.
 */
export function generatePackingToken(
  orgId: string,
  line: string = 'Polipapel',
  validityDays: number = 7
): string {
  const exp = Math.floor(Date.now() / 1000) + validityDays * 86400;
  const payload: PackingTokenPayload = {
    org: orgId,
    role: 'packing_operator',
    line,
    scope: 'planta_empaque',
    exp,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', PACKING_SECRET).update(payloadStr).digest('hex');
  return `${payloadStr}.${hmac}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 signed packing token.
 * Returns null if the token is invalid, expired, or has an unauthorized scope.
 */
export function verifyPackingToken(token: string): PackingTokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, hmac] = parts;
    if (typeof hmac !== 'string' || hmac.length !== 64 || !/^[0-9a-f]{64}$/i.test(hmac)) {
      return null;
    }
    const expectedHmac = crypto.createHmac('sha256', PACKING_SECRET).update(payloadStr).digest('hex');
    
    // Constant time comparison to prevent timing attacks
    const hmacBuf = Buffer.from(hmac, 'hex');
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
      return null;
    }

    const payload: PackingTokenPayload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    if (payload.scope !== 'planta_empaque' || payload.role !== 'packing_operator' || !payload.org) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
