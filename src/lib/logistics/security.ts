import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createMagicToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashMagicToken(token) };
}

export function hashMagicToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeTokenHashEquals(storedHash: string, candidateToken: string): boolean {
  const candidate = Buffer.from(hashMagicToken(candidateToken), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
