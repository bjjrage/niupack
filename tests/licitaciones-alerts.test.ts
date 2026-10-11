import { describe, expect, it } from 'vitest';
import { describeAlerts, type TenderAlerts } from '@/lib/licitaciones/alerts';

const base: TenderAlerts = { closing_soon: 0, new_24h: 0, awarded_7d: 0, open_total: 0, total: 0, scan_enabled: true, last_run_status: 'OK', last_run_at: null };

describe('tarjeta de alertas de Licitaciones', () => {
  it('sin escaneo ni datos no inventa un número: invita a activarlo', () => {
    expect(describeAlerts({ ...base, scan_enabled: false })).toEqual({ value: '—', subtitle: 'Escaneo diario apagado: activalo en Licitaciones', alert: false });
  });

  it('activo pero sin cargar: cero y explica cómo cargar', () => {
    const card = describeAlerts(base);
    expect(card.value).toBe('0');
    expect(card.subtitle).toMatch(/Actualizar ahora/);
  });

  it('suma cierres próximos, nuevas y adjudicadas, y marca alerta si hay cierres cerca', () => {
    const card = describeAlerts({ ...base, total: 40, closing_soon: 3, new_24h: 2, awarded_7d: 4 });
    expect(card).toEqual({ value: '9', subtitle: '3 cierran en 7 d · 2 nuevas · 4 adjudicadas', alert: true });
  });

  it('sin urgencias no marca alerta; si el último escaneo falló lo avisa y marca alerta', () => {
    expect(describeAlerts({ ...base, total: 10, awarded_7d: 1 }).alert).toBe(false);
    const failed = describeAlerts({ ...base, total: 10, last_run_status: 'FAILED' });
    expect(failed.alert).toBe(true);
    expect(failed.subtitle).toMatch(/último escaneo falló/);
  });

  it('con el escaneo apagado pero datos viejos lo aclara', () => {
    expect(describeAlerts({ ...base, total: 5, scan_enabled: false }).subtitle).toMatch(/escaneo apagado/);
  });
});
