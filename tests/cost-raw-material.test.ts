import { describe, it, expect } from 'vitest';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { applyRawMaterial, bottomDiverges, readRawMaterial } from '@/lib/cost/raw-material';
import type { IndustrialProductCostInput } from '@/types';

function sheet(over: Partial<IndustrialProductCostInput> = {}): IndustrialProductCostInput {
  return {
    sku: 'CUP-12OZ-DW',
    paper_formula: {
      cif_price_ton_usd: 1000,
      customs_dispatch_percent: 13,
      financial_cost_percent: 6,
      printing_method: 'OFFSET',
      sheet_width_mm: 700,
      sheet_height_mm: 1000,
      gsm: 260,
      coating_gsm: 18,
      units_per_sheet: 40,
      paper_yield_units_per_ton: 0,
    },
    bottom_formula: { cif_price_ton_usd: 1000, customs_dispatch_percent: 13, financial_cost_percent: 6, gsm: 210, coating_gsm: 18, units_per_m2: 200 },
    bottom_paper_cost_ton_usd: 1000,
    bottom_yield_units_per_ton: 0,
    printing_cost_mode: 'PER_THOUSAND',
    quoted_printing_rate_usd: 4,
    operational_cost_per_thousand_usd: 3,
    machine_depreciation_per_thousand_usd: 1,
    scrap_rate_percent: 5,
    packaging_cost_per_thousand_usd: 2,
    batch_size: 100000,
    ...over,
  };
}

const cost = (i: IndustrialProductCostInput) => IndustrialCostEngine.calculateCost(i);

describe('Materia prima: FOB + flete = CIF, un solo costo para cuerpo y fondo', () => {
  it('lee una hoja vieja (solo CIF) como FOB con flete 0, sin alterar nada', () => {
    const rm = readRawMaterial(sheet());
    expect(rm).toMatchObject({ fob: 1000, freight: 0, cif: 1000, customsPercent: 13, financialPercent: 6 });
    expect(rm.customsUsd).toBe(130);
    expect(rm.financialUsd).toBe(60);
    expect(rm.landedUsd).toBe(1190); // CIF 1000 × 1,19
  });

  it('FOB + flete producen el mismo costo que cargar el CIF directo (el cálculo no cambia)', () => {
    const legacy = cost(sheet());
    const split = cost(applyRawMaterial(sheet(), { fob: 900, freight: 100 }));
    expect(split.true_unit_cost_usd).toBe(legacy.true_unit_cost_usd);
    expect(split.cost_paper_cone_usd).toBe(legacy.cost_paper_cone_usd);
    expect(split.cost_bottom_usd).toBe(legacy.cost_bottom_usd);
  });

  it('un cambio de flete sube el cuerpo Y el fondo (se desprenden del mismo costo)', () => {
    const before = cost(sheet());
    const after = cost(applyRawMaterial(sheet(), { fob: 1000, freight: 150 }));
    expect(after.cost_paper_cone_usd).toBeGreaterThan(before.cost_paper_cone_usd);
    expect(after.cost_bottom_usd).toBeGreaterThan(before.cost_bottom_usd);
    // proporcional: CIF 1000 → 1150 (+15%) en ambos
    expect(after.cost_paper_cone_usd / before.cost_paper_cone_usd).toBeCloseTo(1.15, 1); // tolerancia: el motor redondea a 5 decimales
    expect(after.cost_bottom_usd / before.cost_bottom_usd).toBeCloseTo(1.15, 1);
  });

  it('despacho y costo del dinero también se propagan al fondo', () => {
    const next = applyRawMaterial(sheet(), { customsPercent: 10, financialPercent: 4 });
    expect(next.bottom_formula).toMatchObject({ customs_dispatch_percent: 10, financial_cost_percent: 4, cif_price_ton_usd: 1000 });
    expect(next.paper_formula).toMatchObject({ customs_dispatch_percent: 10, financial_cost_percent: 4 });
    expect(readRawMaterial(next).landedUsd).toBe(1140);
  });

  it('un cambio parcial conserva el resto (editar solo el flete no pisa el FOB)', () => {
    const a = applyRawMaterial(sheet(), { fob: 800 });
    const b = applyRawMaterial(a, { freight: 90 });
    expect(readRawMaterial(b)).toMatchObject({ fob: 800, freight: 90, cif: 890 });
    expect(b.paper_formula.cif_price_ton_usd).toBe(890);
    expect(b.bottom_paper_cost_ton_usd).toBe(890);
  });

  it('no toca lo que no es materia prima (gramaje, geometría, impresión)', () => {
    const next = applyRawMaterial(sheet(), { fob: 700, freight: 50 });
    expect(next.paper_formula).toMatchObject({ gsm: 260, coating_gsm: 18, units_per_sheet: 40, sheet_width_mm: 700, printing_method: 'OFFSET' });
    expect(next.bottom_formula).toMatchObject({ gsm: 210, units_per_m2: 200 });
    expect(next.quoted_printing_rate_usd).toBe(4);
    expect(next.batch_size).toBe(100000);
  });

  it('el método de impresión cambia el rendimiento del papel (offset vs flexo), independiente de la materia prima', () => {
    const offset = cost(sheet());
    const flexo = cost(
      sheet({ paper_formula: { ...sheet().paper_formula, printing_method: 'FLEXO', web_width_mm: 700, units_per_linear_meter: 20, units_per_sheet: undefined, sheet_width_mm: undefined, sheet_height_mm: undefined } }),
    );
    expect(flexo.cost_paper_cone_usd).not.toBe(offset.cost_paper_cone_usd);
    // misma materia prima: el cuerpo cambia por el rendimiento, no por el costo por tonelada
    expect(readRawMaterial(sheet()).landedUsd).toBe(1190);
  });

  it('avisa si el fondo guardó un costo distinto, y se unifica al editar', () => {
    const divergent = sheet({ bottom_formula: { ...sheet().bottom_formula!, cif_price_ton_usd: 900 } });
    expect(bottomDiverges(sheet())).toBe(false);
    expect(bottomDiverges(divergent)).toBe(true);
    const unified = applyRawMaterial(divergent, { freight: 0 });
    expect(bottomDiverges(unified)).toBe(false);
    expect(unified.bottom_formula!.cif_price_ton_usd).toBe(1000);
  });

  it('sin fondo definido: crea uno vacío con el costo de materia prima (no revienta)', () => {
    const next = applyRawMaterial(sheet({ bottom_formula: undefined }), { fob: 500, freight: 50 });
    expect(next.bottom_formula).toMatchObject({ cif_price_ton_usd: 550, gsm: 0, units_per_m2: 0 });
  });
});
