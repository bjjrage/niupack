import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectInjectable, isOpaqueValue } from '@/lib/licitaciones/injectables';
import { parseOcdsRelease, resolveDncpOcid } from '@/lib/licitaciones/ocds';
import { scoreCompany } from '@/lib/licitaciones/scoring';
import { buildManualTender } from '@/lib/licitaciones/manual';
import { fetchDncpTender, searchDncp, DncpError } from '@/lib/licitaciones/dncp-client';

// Releases reales descargadas de la API pública de DNCP (licencia CC-BY 4.0).
const load = (ocid: string) => JSON.parse(readFileSync(`tests/fixtures/dncp/${ocid}.json`, 'utf8')).releases[0];

describe('identificadores DNCP', () => {
  it('resuelve OCID, número de llamado y URLs', () => {
    expect(resolveDncpOcid('ocds-03ad3f-402876-1')).toBe('ocds-03ad3f-402876-1');
    expect(resolveDncpOcid('402876')).toBe('ocds-03ad3f-402876-1');
    expect(resolveDncpOcid('https://www.contrataciones.gov.py/datos/api/v3/doc/ocds/releases/ocid/ocds-03ad3f-341163-1')).toBe('ocds-03ad3f-341163-1');
    expect(resolveDncpOcid('https://www.contrataciones.gov.py/datos/id/convocatorias/402876-lco-n-25-21')).toBe('ocds-03ad3f-402876-1');
    expect(resolveDncpOcid('hola')).toBeNull();
    expect(resolveDncpOcid('')).toBeNull();
  });
});

describe('parser OCDS con releases reales', () => {
  it('distingue invitados, oferentes y adjudicatario (un invitado no es oferente)', () => {
    const tender = parseOcdsRelease(load('ocds-03ad3f-402876-1'));
    const byRole = (role: string) => tender.parties.filter((p) => p.role === role).map((p) => p.name);
    expect(byRole('ADJUDICATARIO')).toContain('EXXEL TECHNOLOGIES S.A.E.');
    expect(byRole('OFERENTE')).toEqual(expect.arrayContaining(['EXXEL TECHNOLOGIES S.A.E.', 'FARMACEUTICA PARAGUAYA S.A.']));
    expect(byRole('INVITADO')).toEqual(expect.arrayContaining(['INDUFAR C.I.S.A.', 'SCAVONE HERMANOS SA']));
    expect(byRole('OFERENTE')).not.toContain('INDUFAR C.I.S.A.');
    expect(byRole('CONVOCANTE')[0]).toMatch(/Salud/);
    expect(tender.parties.find((p) => p.name === 'EXXEL TECHNOLOGIES S.A.E.' && p.role === 'ADJUDICATARIO')?.ruc).toBe('80024779-5');
  });

  it('no confirma fabricante cuando DNCP publica los atributos cifrados', () => {
    const tender = parseOcdsRelease(load('ocds-03ad3f-402876-1'));
    expect(tender.parties.some((p) => p.role === 'FABRICANTE' || p.role === 'LABORATORIO')).toBe(false);
    expect(tender.unconfirmed.join(' ')).toMatch(/Fabricante/);
  });

  it('detecta ampolla/inyectable con evidencia literal y guarda la fuente verificable', () => {
    const morfina = parseOcdsRelease(load('ocds-03ad3f-341163-1'));
    expect(morfina.items[0].is_injectable).toBe(true);
    expect(morfina.items[0].injectable_evidence).toMatch(/AMPOLLA/);
    expect(morfina.items[0].quantity).toBe(125000);
    expect(morfina.source_url).toBe('https://www.contrataciones.gov.py/datos/api/v3/doc/ocds/releases/ocid/ocds-03ad3f-341163-1');
    expect(morfina.parties.find((p) => p.role === 'ADJUDICATARIO')?.name).toBe('SCAVONE HERMANOS SA');
  });

  it('rechaza una release sin OCID o sin título', () => {
    expect(() => parseOcdsRelease({ tender: {} })).toThrow('OCDS_RELEASE_INVALID');
  });
});

describe('detección de inyectables', () => {
  it('reconoce presentaciones y no confunde otros productos', () => {
    expect(detectInjectable([{ field: 'd', text: 'Ceftriaxona 1 g frasco ampolla' }])?.kind).toBe('FRASCO_AMPOLLA');
    expect(detectInjectable([{ field: 'd', text: 'Solución inyectable 10 mg/ml' }])?.kind).toBe('INYECTABLE');
    expect(detectInjectable([{ field: 'd', text: 'AMPOLLAS DE VIDRIO' }])?.kind).toBe('AMPOLLA');
    expect(detectInjectable([{ field: 'd', text: 'Paracetamol comprimidos 500 mg' }])).toBeNull();
    expect(detectInjectable([{ field: 'd', text: 'Construcción de muralla' }])).toBeNull();
  });

  it('trata los valores base64 como opacos y los nombres como legibles', () => {
    expect(isOpaqueValue('kYZ060zQyx0y32UickjWEQ==')).toBe(true);
    expect(isOpaqueValue('Laboratorios Bagó S.A.')).toBe(false);
    expect(isOpaqueValue('')).toBe(true);
  });
});

describe('puntaje explicable', () => {
  const base = { tender_id: 't1', confirmed: true, injectable_items: 1, injectable_units: 125000, ampolla_items: 1 };
  it('un adjudicatario no confirmado como fabricante nunca suma por fabricante', () => {
    const result = scoreCompany({ ruc: '800019164', roles: [{ ...base, role: 'ADJUDICATARIO' }] });
    expect(result.reasons.map((r) => r.code)).toContain('FABRICANTE_NO_CONFIRMADO');
    expect(result.reasons.map((r) => r.code)).not.toContain('FABRICANTE_CONFIRMADO');
    expect(result.reasons.reduce((s, r) => s + r.points, 0)).toBe(result.score);
    expect(result.potential).toBe('MEDIO');
  });
  it('un fabricante confirmado con recurrencia llega a ALTO y cada punto tiene razón', () => {
    const result = scoreCompany({ ruc: '800019164', roles: [
      { ...base, role: 'FABRICANTE' }, { ...base, role: 'ADJUDICATARIO' }, { ...base, tender_id: 't2', role: 'ADJUDICATARIO' },
    ] });
    expect(result.potential).toBe('ALTO');
    expect(result.reasons.every((r) => r.text.length > 5)).toBe(true);
  });
  it('un invitado sin oferta puntúa muy bajo y sin RUC lo indica', () => {
    const result = scoreCompany({ roles: [{ ...base, role: 'INVITADO' }] });
    expect(result.potential).toBe('BAJO');
    expect(result.score).toBeLessThan(10);
    expect(result.reasons.map((r) => r.code)).not.toContain('VOLUMEN_ALTO');
    expect(result.reasons.map((r) => r.code)).toContain('SIN_RUC');
  });
  it('una empresa que solo participó en licitaciones no inyectables es BAJO', () => {
    const result = scoreCompany({ ruc: '1', roles: [{ ...base, role: 'ADJUDICATARIO', injectable_items: 0, injectable_units: 0, ampolla_items: 0 }] });
    expect(result.potential).toBe('BAJO');
  });
});

describe('carga manual', () => {
  it('sin evidencia el rol queda no confirmado; con evidencia queda confirmado', () => {
    const tender = buildManualTender({
      title: 'Documento de prueba rotulado', is_test_data: true,
      items: [{ description: 'Ampolla 2 ml', quantity: 1000 }],
      parties: [{ role: 'FABRICANTE', name: 'Lab Prueba S.A.' }, { role: 'IMPORTADOR', name: 'Imp Prueba SRL', evidence: 'Página 3 del pliego' }],
    });
    expect(tender.parties[0].role_confirmed).toBe(false);
    expect(tender.parties[1].role_confirmed).toBe(true);
    expect(tender.is_test_data).toBe(true);
    expect(tender.external_id).toMatch(/^doc:/);
    expect(tender.unconfirmed.length).toBe(1);
  });
});

describe('cliente DNCP sin red', () => {
  it('informa DNCP_UNREACHABLE si la fuente no responde, sin inventar resultados', async () => {
    const failing = async () => { throw new Error('ECONNRESET'); };
    await expect(fetchDncpTender('402876', failing as never)).rejects.toMatchObject({ code: 'DNCP_UNREACHABLE', status: 502 });
    await expect(searchDncp('ampolla', 1, failing as never)).rejects.toBeInstanceOf(DncpError);
  });
  it('informa not found y rechaza identificadores inválidos', async () => {
    const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await expect(fetchDncpTender('402876', notFound as never)).rejects.toMatchObject({ code: 'DNCP_NOT_FOUND' });
    await expect(fetchDncpTender('???', notFound as never)).rejects.toMatchObject({ code: 'DNCP_INVALID_IDENTIFIER' });
  });
});
