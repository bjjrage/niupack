/** Conteos de alertas de Licitaciones contra PostgreSQL real. Se omite salvo NIUPACK_QA_DB=1 y solo corre contra localhost. */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);

describe.skipIf(!enabled)('alertas de Licitaciones sobre PostgreSQL real', () => {
  let alerts: typeof import('@/lib/licitaciones/alerts');
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const day = 86_400_000;
  const now = new Date();

  const tender = (org: string, n: string, over: Record<string, unknown>) => ({
    organization_id: org, source: 'DNCP_OCDS', external_id: `ocds-alert-${n}-${org.slice(0, 6)}`, title: `Licitación ${n}`, phase: 'ABIERTA', is_test_data: false, created_at: now.toISOString(), ...over,
  });

  beforeAll(async () => {
    alerts = await import('@/lib/licitaciones/alerts');
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    for (const [id, slug] of [[orgA, 'alr-a'], [orgB, 'alr-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    const old = new Date(now.getTime() - 30 * day).toISOString();
    const rows = [
      tender(orgA, '1', { closing_at: new Date(now.getTime() + 3 * day).toISOString(), created_at: old }),            // cierra en 3 d
      tender(orgA, '2', { closing_at: new Date(now.getTime() + 6 * day).toISOString(), created_at: old }),            // cierra en 6 d
      tender(orgA, '3', { closing_at: new Date(now.getTime() + 20 * day).toISOString(), created_at: old }),           // cierra en 20 d (no alerta)
      tender(orgA, '4', { closing_at: new Date(now.getTime() - 2 * day).toISOString(), phase: 'EN_EVALUACION', created_at: old }), // ya cerró
      tender(orgA, '5', { phase: 'ADJUDICADA', awarded_at: new Date(now.getTime() - 2 * day).toISOString(), created_at: old }),     // adjudicada hace 2 d
      tender(orgA, '6', { phase: 'ADJUDICADA', awarded_at: new Date(now.getTime() - 40 * day).toISOString(), created_at: old }),    // adjudicada hace 40 d
      tender(orgA, '7', { phase: 'CERRADA', created_at: old }),
      tender(orgA, '8', { closing_at: new Date(now.getTime() + 2 * day).toISOString(), is_test_data: true, created_at: old }),       // dato de prueba: no cuenta
      tender(orgB, '9', { closing_at: new Date(now.getTime() + 1 * day).toISOString() }),                                           // otra organización
    ];
    const { error } = await admin.from('licitaciones_tenders').insert(rows);
    if (error) throw error;
    // Una detectada hoy (created_at por defecto = ahora).
    const fresh = await admin.from('licitaciones_tenders').insert(tender(orgA, '10', { closing_at: new Date(now.getTime() + 30 * day).toISOString() }));
    if (fresh.error) throw fresh.error;
  });

  it('cuenta cierres próximos, nuevas, adjudicadas recientes y en curso, sin datos de prueba', async () => {
    const result = await alerts.getTenderAlerts(orgA, now);
    expect(result).toMatchObject({ closing_soon: 2, new_24h: 1, awarded_7d: 1, open_total: 5, total: 8, scan_enabled: false, last_run_status: null });
  });

  it('refleja el estado del escaneo y el último resultado', async () => {
    // El cron de otras pruebas escanea toda organización activada: se activa y se apaga dentro de la misma prueba.
    await admin.from('licitaciones_scan_settings').upsert({ organization_id: orgA, enabled: true }, { onConflict: 'organization_id' });
    await admin.from('licitaciones_scan_runs').insert({ organization_id: orgA, trigger: 'CRON', status: 'FAILED', finished_at: new Date().toISOString() });
    let result;
    try {
      result = await alerts.getTenderAlerts(orgA, now);
    } finally {
      await admin.from('licitaciones_scan_settings').update({ enabled: false }).eq('organization_id', orgA);
    }
    expect(result).toMatchObject({ scan_enabled: true, last_run_status: 'FAILED' });
    expect(alerts.describeAlerts(result).alert).toBe(true);
  });

  it('aísla por organización', async () => {
    const b = await alerts.getTenderAlerts(orgB, now);
    expect(b).toMatchObject({ closing_soon: 1, new_24h: 1, total: 1, scan_enabled: false });
    const empty = await alerts.getTenderAlerts(randomUUID(), now);
    expect(empty).toMatchObject({ closing_soon: 0, total: 0 });
  });
});
