import { createHash, randomBytes } from 'node:crypto';

/** 256 bits de entropía: el enlace no se puede adivinar ni enumerar. */
export function generateLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

/** En la base solo se guarda el hash: una fuga de la tabla no entrega enlaces válidos. */
export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isPlausibleToken(token: string | undefined | null): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function buildSupplierLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/rfq/respond/${token}`;
}
