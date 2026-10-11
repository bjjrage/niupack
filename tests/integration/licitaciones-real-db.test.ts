/**
 * Licitaciones contra PostgreSQL + PostgREST reales (sin mocks). Se omite salvo NIUPACK_QA_DB=1 y se niega a correr fuera de localhost.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);
}

const fixture = (ocid: string) => JSON.parse(readFileSync(`tests/fixtures/dncp/${ocid}.json`, 'utf8')).releases[0];

describe.skipIf(!enabled)('Licitaciones sobre PostgreSQL real', () => {
  let svc: typeof import('@/lib/licitaciones/service');
  let ocds: typeof import('@/lib/licitaciones/ocds');
  let manual: typeof import('@/lib/licitaciones/manual');
  let normalize: typeof import('@/lib/crm/purchase-import');
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const profileA = randomUUID();

  beforeAll(async () => {
    svc = await import('@/lib/licitaciones/service');
    ocds = await import('@/lib/licitaciones/ocds');
    manual = await import('@/lib/licitaciones/manual');
    normalize = await import('@/lib/crm/purchase-import');
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    for (const [id, slug] of [[orgA, 'lic-a'], [orgB, 'lic-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    const { error } = await admin.from('profiles').insert({ id: profileA, organization_id: orgA, email: `lic-${profileA}@qa.local`, full_name: 'QA Analista', role: 'analyst' });
    if (error) throw error;
  });

  const importReal = (org: string, ocid: string) =>
    svc.importTender(org, org === orgA ? profileA : null, ocds.parseOcdsRelease(fixture(ocid)), fixture(ocid));

  it('importa una licitación real de DNCP con ítems, partes y candidatas, y reimportar no duplica', async () => {
    const first = await importReal(orgA, 'ocds-03ad3f-402876-1');
    expect(first.created).toBe(true);
    expect(first.items).toBe(1);
    const again = await importReal(orgA, 'ocds-03ad3f-402876-1');
    expect(again.created).toBe(false);
    expect(again.tender_id).toBe(first.tender_id);

    const tenders = await svc.listTenders(orgA);
    expect(tenders.filter((t: any) => t.external_id === 'ocds-03ad3f-402876-1')).toHaveLength(1);
    const detail = await svc.getTenderDetail(orgA, first.tender_id);
    expect(detail.items).toHaveLength(1);
    expect(detail.parties.filter((p: any) => p.role === 'ADJUDICATARIO').map((p: any) => p.name)).toContain('EXXEL TECHNOLOGIES S.A.E.');
    expect((detail.tender as any).source_url).toContain('/ocds/releases/ocid/ocds-03ad3f-402876-1');
    expect(detail.parties.every((p: any) => p.evidence && p.evidence.length > 3)).toBe(true);
  });

  it('crea una candidata por empresa con puntaje explicable y sin duplicados al reimportar', async () => {
    await importReal(orgA, 'ocds-03ad3f-341163-1');
    const candidates = await svc.listCandidates(orgA);
    const scavone = candidates.filter((c: any) => c.ruc_digits === '800019164');
    expect(scavone).toHaveLength(1); // invitado en una licitación y adjudicatario en otra: una sola empresa por RUC
    expect(scavone[0].reasons.length).toBeGreaterThan(2);
    expect(scavone[0].reasons.reduce((s: number, r: any) => s + r.points, 0)).toBe(scavone[0].score);
    const before = candidates.length;
    await importReal(orgA, 'ocds-03ad3f-341163-1');
    expect((await svc.listCandidates(orgA)).length).toBe(before);
  });

  it('la normalización de nombres en SQL coincide con la de TypeScript', async () => {
    const samples = ['EXXEL TECHNOLOGIES S.A.E.', 'Laboratorios Bagó S.A.', 'Droguería Ñandú SRL', 'INDUFAR C.I.S.A.', 'Pty Foo-Bar & Cía. Ltda.', '  Doble   Espacio  '];
    for (const name of samples) {
      const { data, error } = await admin.rpc('licitaciones_normalize_name', { p_input: name });
      expect(error).toBeNull();
      expect(data).toBe(normalize.normalizeName(name));
    }
  });

  it('exige revisión humana antes de convertir y no convierte descartadas', async () => {
    const candidate = (await svc.listCandidates(orgA)).find((c: any) => c.ruc_digits === '800019164')!;
    await expect(svc.convertCandidateToProspect(orgA, profileA, candidate.id)).rejects.toMatchObject({ code: 'LICITACION_CANDIDATE_NOT_REVIEWED', status: 409 });
    const other = (await svc.listCandidates(orgA)).find((c: any) => c.ruc_digits === '800247795')!;
    await svc.reviewCandidate(orgA, other.id, profileA, 'DESCARTADA', 'No aplica');
    await expect(svc.convertCandidateToProspect(orgA, profileA, other.id)).rejects.toMatchObject({ code: 'LICITACION_CANDIDATE_DISCARDED' });
  });

  it('convierte a PROSPECT con oportunidad, conserva la trazabilidad y es idempotente', async () => {
    const candidate = (await svc.listCandidates(orgA)).find((c: any) => c.ruc_digits === '800019164')!;
    await svc.reviewCandidate(orgA, candidate.id, profileA, 'APROBADA', 'Compra ampollas de morfina');
    const first = await svc.convertCandidateToProspect(orgA, profileA, candidate.id, { createOpportunity: true });
    expect(first.company_created).toBe(true);
    expect(first.opportunity_id).toBeTruthy();
    const second = await svc.convertCandidateToProspect(orgA, profileA, candidate.id, { createOpportunity: true });
    expect(second).toMatchObject({ company_id: first.company_id, opportunity_id: first.opportunity_id, already_converted: true });

    const { data: companies } = await admin.from('crm_companies').select('*').eq('organization_id', orgA).eq('tax_id', '80001916-4');
    expect(companies).toHaveLength(1);
    expect(companies![0]).toMatchObject({ lifecycle_stage: 'PROSPECT', source: 'LICITACIONES' });
    const { data: opportunities } = await admin.from('crm_opportunities').select('id, company_id, stage').eq('organization_id', orgA).eq('company_id', first.company_id);
    expect(opportunities).toHaveLength(1);
    expect(opportunities![0].stage).toBe('NUEVO');
    const { data: activities } = await admin.from('crm_activities').select('metadata').eq('organization_id', orgA).eq('company_id', first.company_id);
    expect(activities).toHaveLength(1);
    expect((activities![0].metadata as any).candidate_id).toBe(candidate.id);

    // "Salir y volver": lectura fresca desde la base.
    const reloaded = (await svc.listCandidates(orgA)).find((c: any) => c.id === candidate.id);
    expect(reloaded).toMatchObject({ review_status: 'CONVERTIDA', crm_company_id: first.company_id, crm_opportunity_id: first.opportunity_id });
    expect((reloaded as any).tender_ids.length).toBeGreaterThan(0);
    await expect(svc.reviewCandidate(orgA, candidate.id, profileA, 'DESCARTADA')).rejects.toMatchObject({ code: 'LICITACION_CANDIDATE_ALREADY_CONVERTED' });
  });

  it('conversiones concurrentes de la misma candidata crean una sola empresa', async () => {
    await importReal(orgA, 'ocds-03ad3f-402876-1');
    const target = (await svc.listCandidates(orgA)).find((c: any) => c.ruc_digits === '800024230')!;
    await svc.reviewCandidate(orgA, target.id, profileA, 'APROBADA');
    const results = await Promise.all(Array.from({ length: 6 }, () => svc.convertCandidateToProspect(orgA, profileA, target.id, { createOpportunity: true })));
    expect(new Set(results.map((r) => r.company_id)).size).toBe(1);
    expect(results.filter((r) => r.company_created)).toHaveLength(1);
    const { data } = await admin.from('crm_companies').select('id').eq('organization_id', orgA).eq('tax_id', '80002423-0');
    expect(data).toHaveLength(1);
    const { data: opps } = await admin.from('crm_opportunities').select('id').eq('organization_id', orgA).eq('company_id', results[0].company_id);
    expect(opps).toHaveLength(1);
  });

  it('reutiliza una empresa del CRM con el mismo RUC o nombre y no la pasa a cliente', async () => {
    const existing = await admin.from('crm_companies').insert({ organization_id: orgA, name: 'Farmacéutica Paraguaya', tax_id: '80006276-0', lifecycle_stage: 'CUSTOMER', source: 'MANUAL' }).select('id').single();
    expect(existing.error).toBeNull();
    const candidate = (await svc.listCandidates(orgA)).find((c: any) => c.ruc_digits === '800062760')!;
    await svc.reviewCandidate(orgA, candidate.id, profileA, 'APROBADA');
    const result = await svc.convertCandidateToProspect(orgA, profileA, candidate.id);
    expect(result).toMatchObject({ company_id: existing.data!.id, company_created: false });
    const { data } = await admin.from('crm_companies').select('lifecycle_stage').eq('id', existing.data!.id).single();
    expect(data!.lifecycle_stage).toBe('CUSTOMER'); // no se degrada ni se toca
  });

  it('exige resolución humana cuando el nombre coincide con otra empresa de RUC distinto', async () => {
    const manualTender = manual.buildManualTender({
      title: 'Documento de prueba (dato rotulado)', is_test_data: true,
      items: [{ description: 'Solución inyectable ampolla 5 ml', quantity: 50000 }],
      parties: [{ role: 'OFERENTE', name: 'Indufar CISA', ruc: '80001812-5', evidence: 'Acta de apertura, pág. 2' }],
    });
    await svc.importTender(orgA, profileA, manualTender);
    await admin.from('crm_companies').insert({ organization_id: orgA, name: 'INDUFAR C.I.S.A.', tax_id: '99999999-9', source: 'MANUAL' });
    const candidate = (await svc.listCandidates(orgA)).find((c: any) => c.ruc_digits === '800018125')!;
    await svc.reviewCandidate(orgA, candidate.id, profileA, 'APROBADA');
    await expect(svc.convertCandidateToProspect(orgA, profileA, candidate.id)).rejects.toMatchObject({ code: 'LICITACION_AMBIGUOUS_COMPANY', status: 409 });
    const { data } = await admin.from('crm_companies').select('id').eq('organization_id', orgA).eq('tax_id', '80001812-5');
    expect(data).toHaveLength(0); // nada se creó a medias
    const forced = await svc.convertCandidateToProspect(orgA, profileA, candidate.id, { forceCreate: true });
    expect(forced.company_created).toBe(true);
  });

  it('una organización no ve ni convierte datos de otra', async () => {
    await importReal(orgB, 'ocds-03ad3f-341163-1');
    expect(await svc.listTenders(orgB)).toHaveLength(1);
    const aCandidate = (await svc.listCandidates(orgA))[0];
    await expect(svc.convertCandidateToProspect(orgB, profileA, aCandidate.id)).rejects.toMatchObject({ code: 'LICITACION_CANDIDATE_NOT_FOUND' });
    await expect(svc.reviewCandidate(orgB, aCandidate.id, profileA, 'APROBADA')).rejects.toMatchObject({ code: 'LICITACION_CANDIDATE_NOT_FOUND' });
    const aTender = (await svc.listTenders(orgA))[0] as any;
    await expect(svc.getTenderDetail(orgB, aTender.id)).rejects.toMatchObject({ code: 'LICITACION_NOT_FOUND' });
    const { data: leaked } = await admin.from('crm_companies').select('id').eq('organization_id', orgB);
    expect(leaked).toHaveLength(0);
  });

  it('un error de la base no se reporta como éxito', async () => {
    await expect(svc.importTender(orgA, profileA, { ...ocds.parseOcdsRelease(fixture('ocds-03ad3f-341163-1')), title: '' })).rejects.toMatchObject({ code: 'INVALID_LICITACION_IMPORT' });
    await expect(svc.importTender(randomUUID(), null, ocds.parseOcdsRelease(fixture('ocds-03ad3f-341163-1')))).rejects.toThrow();
  });
});
