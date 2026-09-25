/**
 * NIUPACK Query Deduplication and Normalization Utility
 */

export function normalizeQueryText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[¿?¡!.,;:_\-"'/()[\]{}#*~`]/g, ' ') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DedupeResult<T> {
  unique: T[];
  duplicatesCount: number;
  duplicateKeys: string[];
}

export function deduplicateQueries<T extends { text: string; country_code?: string; sku?: string }>(
  queries: T[],
  options: { matchScope?: 'text_only' | 'text_and_market' } = {}
): DedupeResult<T> {
  const scope = options.matchScope || 'text_and_market';
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicateKeys: string[] = [];

  for (const q of queries) {
    const normalized = normalizeQueryText(q.text);
    const key = scope === 'text_and_market' && q.country_code ? `${q.country_code}:${normalized}` : normalized;

    if (seen.has(key)) {
      duplicateKeys.push(key);
    } else {
      seen.add(key);
      unique.push(q);
    }
  }

  return {
    unique,
    duplicatesCount: duplicateKeys.length,
    duplicateKeys,
  };
}

export function calculateBatteryChecksum(queries: Array<{ text: string; country_code: string; sku?: string }>): string {
  const normalizedSorted = queries
    .map((q) => `${q.country_code}:${normalizeQueryText(q.text)}:${q.sku || ''}`)
    .sort()
    .join('||');

  // Simple deterministic hash for checksum (Fowler–Noll–Vo 32-bit hex)
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalizedSorted.length; i++) {
    hash ^= normalizedSorted.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}
