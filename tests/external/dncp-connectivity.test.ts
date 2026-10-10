/**
 * Conectividad REAL con la API pública de DNCP. Opt-in (NIUPACK_EXTERNAL=1): no corre en la suite normal ni en CI.
 * Si la fuente no responde, el test FALLA (no se reporta PASS por una fuente que no se pudo consultar).
 */
import { describe, expect, it } from 'vitest';
import { fetchDncpTender, searchDncp } from '@/lib/licitaciones/dncp-client';

const enabled = process.env.NIUPACK_EXTERNAL === '1';

describe.skipIf(!enabled)('DNCP datos abiertos (conectividad real)', () => {
  it('trae y parsea una release OCDS real por número de llamado', async () => {
    const { tender } = await fetchDncpTender('341163');
    expect(tender.external_id).toBe('ocds-03ad3f-341163-1');
    expect(tender.items.some((i) => i.is_injectable)).toBe(true);
    expect(tender.parties.some((p) => p.role === 'ADJUDICATARIO')).toBe(true);
    expect(tender.source_url).toContain('contrataciones.gov.py');
  }, 60_000);

  it('el buscador oficial devuelve resultados para "ampolla"', async () => {
    const result = await searchDncp('ampolla');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0].ocid).toMatch(/^ocds-03ad3f-/);
  }, 60_000);
});
