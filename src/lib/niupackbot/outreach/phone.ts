// Normalización E.164 para los mercados de NIUPACK: Paraguay, Brasil, Argentina y Bolivia.
// Adaptado de utils/sfContactImport.js (AutoLead), que solo aceptaba Paraguay.

export interface PhoneResult {
  ok: boolean;
  e164: string;
  country: 'PY' | 'BR' | 'AR' | 'BO' | null;
  reason: string;
}

/** Prefijo país → dígitos totales válidos (incluye el prefijo). */
const COUNTRIES: Array<{ code: string; iso: PhoneResult['country']; min: number; max: number }> = [
  { code: '595', iso: 'PY', min: 12, max: 12 },
  { code: '591', iso: 'BO', min: 11, max: 11 },
  { code: '55', iso: 'BR', min: 12, max: 13 },
  { code: '54', iso: 'AR', min: 12, max: 13 },
];

const E164_RE = /^\+[1-9][0-9]{7,14}$/;

export function isE164(value: string | null | undefined): boolean {
  return E164_RE.test(String(value ?? ''));
}

/**
 * Normaliza un teléfono libre a E.164. Un número local con 0 inicial se interpreta
 * como Paraguay (mercado de origen); para el resto exige código de país.
 */
export function normalizePhone(input: string | null | undefined): PhoneResult {
  const fail = (reason: string): PhoneResult => ({ ok: false, e164: '', country: null, reason });
  const original = String(input ?? '').trim().replace(/^whatsapp:/i, '');
  if (!original) return fail('Teléfono vacío');
  if (/[A-Za-z]/.test(original)) return fail('Teléfono inválido');

  const hasPlus = original.startsWith('+');
  let digits = original.replace(/[^0-9]/g, '');
  if (!hasPlus && digits.startsWith('00')) digits = digits.slice(2);
  else if (!hasPlus && digits.startsWith('0') && digits.length >= 9) digits = `595${digits.slice(1)}`;

  const country = COUNTRIES.find((c) => digits.startsWith(c.code));
  if (!country) return fail(hasPlus || digits.length >= 11 ? 'País no soportado (BR, AR, BO, PY)' : 'Falta el código de país');
  if (digits.length < country.min || digits.length > country.max) return fail(`Largo inválido para ${country.iso}`);
  return { ok: true, e164: `+${digits}`, country: country.iso, reason: '' };
}

/** Clave de comparación estable: solo dígitos del E.164. */
export function phoneKey(e164: string): string {
  return e164.replace(/[^0-9]/g, '');
}
