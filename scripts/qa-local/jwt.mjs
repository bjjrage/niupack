// HS256 helpers for the local QA stack only. The secret never leaves this machine.
import crypto from 'node:crypto';

export const SECRET = 'local-qa-jwt-secret-local-qa-jwt-secret-000';
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}

export function verify(token) {
  const [head, body, signature] = (token || '').split('.');
  if (!signature || crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url') !== signature) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  return claims.exp * 1000 > Date.now() ? claims : null;
}
