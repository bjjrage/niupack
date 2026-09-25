import { describe, it, expect } from 'vitest';
import { normalizeQueryText, deduplicateQueries, calculateBatteryChecksum } from '@/lib/utils/query-dedupe';

describe('Query Deduplication & Normalization Utility', () => {
  it('should normalize accents, casing, and punctuation correctly', () => {
    const raw = '¿Dónde comprar VASOS descartables de polipapel, 12 oz?!';
    const normalized = normalizeQueryText(raw);
    expect(normalized).toBe('donde comprar vasos descartables de polipapel 12 oz');
  });

  it('should treat queries with accents and different punctuation as identical', () => {
    const q1 = normalizeQueryText('Fabricación de embalagens em São Paulo.');
    const q2 = normalizeQueryText('fabricacion de embalagens em sao paulo');
    expect(q1).toBe(q2);
  });

  it('should remove duplicate queries within the same market', () => {
    const queries = [
      { text: 'Proveedores de vasos en Asunción', country_code: 'PY', sku: 'CUP-12OZ-SW' },
      { text: '¿Proveedores de vasos en Asuncion?', country_code: 'PY', sku: 'CUP-12OZ-SW' },
      { text: 'proveedores de vasos en asuncion', country_code: 'PY', sku: 'CUP-12OZ-SW' },
      { text: 'Fabrica de vasos polipapel', country_code: 'PY', sku: 'CUP-12OZ-SW' },
    ];

    const result = deduplicateQueries(queries, { matchScope: 'text_and_market' });
    expect(result.unique.length).toBe(2);
    expect(result.duplicatesCount).toBe(2);
    expect(result.unique[0].text).toBe('Proveedores de vasos en Asunción');
    expect(result.unique[1].text).toBe('Fabrica de vasos polipapel');
  });

  it('should allow identical text if country_code differs when scope is text_and_market', () => {
    const queries = [
      { text: 'Precio mayorista de vasos descartables', country_code: 'BR', sku: 'CUP-12OZ-SW' },
      { text: 'Precio mayorista de vasos descartables', country_code: 'AR', sku: 'CUP-12OZ-SW' },
    ];

    const result = deduplicateQueries(queries, { matchScope: 'text_and_market' });
    expect(result.unique.length).toBe(2);
    expect(result.duplicatesCount).toBe(0);
  });

  it('should generate a deterministic checksum regardless of input order', () => {
    const queriesA = [
      { text: 'Query Alpha', country_code: 'BR', sku: 'SKU-1' },
      { text: 'Query Beta', country_code: 'AR', sku: 'SKU-2' },
    ];
    const queriesB = [
      { text: 'Query Beta', country_code: 'AR', sku: 'SKU-2' },
      { text: 'Query Alpha', country_code: 'BR', sku: 'SKU-1' },
    ];

    const hashA = calculateBatteryChecksum(queriesA);
    const hashB = calculateBatteryChecksum(queriesB);
    expect(hashA).toBe(hashB);
    expect(typeof hashA).toBe('string');
    expect(hashA.length).toBe(8);
  });
});
