import { normalizeName } from '@/lib/crm/purchase-import';

export type InjectableKind = 'AMPOLLA' | 'FRASCO_AMPOLLA' | 'VIAL' | 'INYECTABLE';

export interface InjectableMatch {
  kind: InjectableKind;
  evidence: string;
}

// Orden: la presentación más específica primero. "frasco ampolla" es un vial; "ampolla" es la que usa la cuna NIUPACK.
const RULES: Array<{ kind: InjectableKind; pattern: RegExp }> = [
  { kind: 'FRASCO_AMPOLLA', pattern: /\bfrasco[\s-]*ampolla\b/ },
  { kind: 'AMPOLLA', pattern: /\bampoll(?:a|as|eta|etas)\b/ },
  { kind: 'VIAL', pattern: /\bvial(?:es)?\b/ },
  { kind: 'INYECTABLE', pattern: /\binyectable(?:s)?\b|\bsolucion inyectable\b|\bjeringa prellenada\b/ },
];

/**
 * Detecta presentaciones inyectables en los textos del ítem. Devuelve la evidencia literal
 * (campo y fragmento) para poder mostrarla al revisor; nunca infiere por similitud.
 */
export function detectInjectable(fields: Array<{ field: string; text?: string | null }>): InjectableMatch | null {
  for (const rule of RULES) {
    for (const { field, text } of fields) {
      if (!text) continue;
      const folded = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const hit = rule.pattern.exec(folded);
      if (hit) return { kind: rule.kind, evidence: `${field}: "…${text.slice(Math.max(0, hit.index - 12), hit.index + hit[0].length + 12).trim()}…"` };
    }
  }
  return null;
}

/** Un identificador opaco (base64/hash) no es un nombre legible: el campo se considera cifrado y no confirmado. */
export function isOpaqueValue(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!v) return true;
  if (/\s/.test(v)) return false;
  return /^[A-Za-z0-9+/_-]{12,}={0,2}$/.test(v) && /[0-9+/=]/.test(v);
}

export function companyKey(name: string, rucDigits?: string | null): string {
  return rucDigits ? `ruc:${rucDigits}` : `n:${normalizeName(name)}`;
}
