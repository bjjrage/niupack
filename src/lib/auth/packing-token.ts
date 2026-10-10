import crypto from 'crypto';

export const PACKING_OPERATOR_LINES = ['Polipapel'] as const;

export interface PackingTokenPayload {
  org: string;
  jti: string;
  role: 'packing_operator';
  line: (typeof PACKING_OPERATOR_LINES)[number];
  scope: 'planta_empaque';
  exp: number;
}

function packingTokenSecret(): string {
  const secret = process.env.PACKING_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('PACKING_TOKEN_SECRET_REQUIRED');
  }
  return secret;
}

export function isAllowedPackingLine(line: string): line is PackingTokenPayload['line'] {
  return (PACKING_OPERATOR_LINES as readonly string[]).includes(line);
}

/** Signs an operator capability; the matching jti must also exist in Supabase. */
export function generatePackingToken(
  orgId: string,
  line: string = 'Polipapel',
  validityDays: number = 7,
  jti: string = crypto.randomUUID()
): string {
  if (!orgId || !isAllowedPackingLine(line)) throw new Error('INVALID_PACKING_TOKEN_SCOPE');
  if (!Number.isFinite(validityDays) || validityDays <= 0 || validityDays > 30) {
    throw new Error('INVALID_PACKING_TOKEN_EXPIRY');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jti)) {
    throw new Error('INVALID_PACKING_TOKEN_ID');
  }

  const payload: PackingTokenPayload = {
    org: orgId,
    jti,
    role: 'packing_operator',
    line,
    scope: 'planta_empaque',
    exp: Math.floor(Date.now() / 1000) + Math.floor(validityDays * 86400),
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', packingTokenSecret()).update(payloadStr).digest('hex');
  return `${payloadStr}.${hmac}`;
}

/** Cryptographically validates an operator token. Registry status is checked separately in Supabase. */
export function verifyPackingToken(token: string): PackingTokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, hmac] = parts;
    if (typeof hmac !== 'string' || hmac.length !== 64 || !/^[0-9a-f]{64}$/i.test(hmac)) return null;

    const expectedHmac = crypto.createHmac('sha256', packingTokenSecret()).update(payloadStr).digest('hex');
    const hmacBuf = Buffer.from(hmac, 'hex');
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as Partial<PackingTokenPayload>;
    if (
      typeof payload.org !== 'string' || !payload.org ||
      typeof payload.jti !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.jti) ||
      typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) ||
      payload.scope !== 'planta_empaque' || payload.role !== 'packing_operator' ||
      typeof payload.line !== 'string' || !isAllowedPackingLine(payload.line)
    ) return null;
    return payload as PackingTokenPayload;
  } catch {
    return null;
  }
}

export function buildPackingOperatorLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/planta/empaque#token=${encodeURIComponent(token)}`;
}
