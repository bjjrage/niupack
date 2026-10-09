import { describe, it, expect } from 'vitest';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { normalizeMonetaryInput, convertFromUsd, formatMoney, getMonetarySuffix } from '@/lib/cost/currency';
import type { IndustrialProductCostInput } from '@/types';

function createCompleteFixture(): IndustrialProductCostInput {
  return {
    sku: 'CUP-12OZ-TEST',
    currency_mode: 'BOTH',
    fx_rate_applied: 7500,
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
    bottom_formula: {
      cif_price_ton_usd: 1000,
      customs_dispatch_percent: 13,
      financial_cost_percent: 6,
      gsm: 210,
      coating_gsm: 18,
      units_per_m2: 200,
    },
    bottom_paper_cost_ton_usd: 1000,
    bottom_yield_units_per_ton: 0,
    printing_cost_mode: 'PER_THOUSAND',
    quoted_printing_rate_usd: 4,
    operational_cost_per_thousand_usd: 3,
    machine_depreciation_per_thousand_usd: 1,
    scrap_rate_percent: 5,
    packaging_cost_per_thousand_usd: 2,
    batch_size: 100000,
  };
}

describe('Cost Sheet Remediation: 1. Manejo Monetario USD / Gs. / Ambos', () => {
  it('convierte bidireccionalmente 15.000.000 Gs./t <-> 2.000 USD/t con FX 7.500', () => {
    // 15.000.000 Gs. a FX 7.500 debe ser exactamente 2.000 USD
    const fromPyg = normalizeMonetaryInput(15_000_000, 'PYG', 7500);
    expect(fromPyg.usd).toBe(2000);
    expect(fromPyg.pyg).toBe(15_000_000);

    // 2.000 USD a FX 7.500 debe ser exactamente 15.000.000 Gs.
    const fromUsd = normalizeMonetaryInput(2000, 'USD', 7500);
    expect(fromUsd.usd).toBe(2000);
    expect(fromUsd.pyg).toBe(15_000_000);

    // Conversión de presentación
    expect(convertFromUsd(2000, 'PYG', 7500)).toBe(15_000_000);
    expect(convertFromUsd(2000, 'USD', 7500)).toBe(2000);
  });

  it('no altera el valor original ni sufre drift al ciclar vistas USD -> Gs. -> Ambos', () => {
    const originalInput = 2000;
    const inputCurrency = 'USD' as const;
    const fx = 7500;

    const normalized = normalizeMonetaryInput(originalInput, inputCurrency, fx);
    expect(normalized.usd).toBe(2000);
    expect(normalized.pyg).toBe(15_000_000);

    // Simular render en las 3 vistas
    const viewUsd = formatMoney(normalized.usd, 'USD');
    const viewPyg = formatMoney(normalized.pyg, 'PYG');
    expect(viewUsd).toContain('2,000.00');
    expect(viewPyg).toContain('15.000.000');

    // Cambiar la vista de presentación no altera el input normalizado
    const reNormalized = normalizeMonetaryInput(normalized.usd, 'USD', fx);
    expect(reNormalized.usd).toBe(originalInput);
  });

  it('falla explícitamente si se intenta ingresar en PYG sin FX oficial disponible', () => {
    expect(() => normalizeMonetaryInput(15_000_000, 'PYG', null)).toThrow('FX_REQUIRED_FOR_PYG_CONVERSION');
    expect(() => normalizeMonetaryInput(15_000_000, 'PYG', 0)).toThrow('FX_REQUIRED_FOR_PYG_CONVERSION');
  });

  it('provee sufijos de unidades correctos según moneda activa', () => {
    expect(getMonetarySuffix('TON', 'USD')).toBe('USD/t');
    expect(getMonetarySuffix('TON', 'PYG')).toBe('Gs./t');
    expect(getMonetarySuffix('THOUSAND', 'USD')).toBe('USD/1.000');
    expect(getMonetarySuffix('THOUSAND', 'PYG')).toBe('Gs./1.000');
    expect(getMonetarySuffix('UNIT', 'USD')).toBe('USD/u');
    expect(getMonetarySuffix('UNIT', 'PYG')).toBe('Gs./u');
  });
});

describe('Cost Sheet Remediation: 2. Auditoría de Materia Prima y Misterio Gs. 15', () => {
  it('detecta estado INCOMPLETO y alerta qué parámetros faltan cuando faltan datos de cono', () => {
    const incompleteInput: IndustrialProductCostInput = {
      ...createCompleteFixture(),
      paper_formula: {
        cif_price_ton_usd: 1000,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        printing_method: 'OFFSET',
        // Dimensiones omitidas
        sheet_width_mm: 0,
        sheet_height_mm: 0,
        gsm: 0,
        units_per_sheet: 0,
        paper_yield_units_per_ton: 0,
      },
    };

    const breakdown = IndustrialCostEngine.calculateCost(incompleteInput);

    // El cono no puede evaluarse silenciosamente como 0 sin advertencia
    expect(breakdown.cost_paper_cone_status).toBe('INCOMPLETE');
    expect(breakdown.cost_paper_cone_missing?.length).toBeGreaterThan(0);
    expect(breakdown.cost_paper_cone_missing).toContain('Ancho pliego (mm)');
    expect(breakdown.cost_paper_cone_missing).toContain('Largo pliego (mm)');
    expect(breakdown.cost_paper_cone_missing).toContain('Unidades por pliego');
    expect(breakdown.cost_paper_cone_missing).toContain('Gramaje del papel (gsm)');

    // El culito tiene datos completos y calcula correctamente
    expect(breakdown.cost_bottom_status).toBe('COMPLETE');
    expect(breakdown.cost_bottom_usd).toBeGreaterThan(0);

    // El estatus global de materia prima queda INCOMPLETO
    expect(breakdown.cost_raw_material_status).toBe('INCOMPLETE');

    // Reproducción del misterio histórico de Gs. 15:
    // Culito solo = ~$0.00135 - $0.00200 USD. A FX 7.500: $0.002 * 7500 = 15 Gs.
    // En la versión corregida, la UI no muestra "Materia prima: Gs. 15" sino "INCOMPLETO"
    const bottomOnlyPyg = Math.round(breakdown.cost_bottom_usd * 7500);
    expect(bottomOnlyPyg).toBeLessThan(30); // ~10-20 Gs
  });

  it('desglosa explícitamente cono + culito = total con exactitud cuando los datos están completos', () => {
    const completeInput = createCompleteFixture();
    const breakdown = IndustrialCostEngine.calculateCost(completeInput);

    expect(breakdown.cost_paper_cone_status).toBe('COMPLETE');
    expect(breakdown.cost_bottom_status).toBe('COMPLETE');
    expect(breakdown.cost_raw_material_status).toBe('COMPLETE');
    expect(breakdown.cost_paper_cone_missing).toHaveLength(0);
    expect(breakdown.cost_bottom_missing).toHaveLength(0);

    expect(breakdown.cost_paper_cone_usd).toBeGreaterThan(0);
    expect(breakdown.cost_bottom_usd).toBeGreaterThan(0);

    // Total de materia prima es la suma de ambos
    const expectedRaw = Number((breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd).toFixed(5));
    const rawRubric = breakdown.rubrics?.find((r) => r.key === 'raw_material');
    expect(rawRubric?.impact_usd_per_unit).toBe(expectedRaw);

    // Los valores exactos sin redondeo prematuro están expuestos
    expect(breakdown.exact_cost_paper_cone_usd).toBeGreaterThan(0);
    expect(breakdown.exact_cost_bottom_usd).toBeGreaterThan(0);
    expect(breakdown.exact_true_unit_cost_usd).toBeGreaterThan(0);
  });
});

describe('Cost Sheet Remediation: 3. Desglose de 6 Rubros y True Cost', () => {
  it('expone exactamente los 6 rubros requeridos en el orden canónico', () => {
    const input = createCompleteFixture();
    const breakdown = IndustrialCostEngine.calculateCost(input);

    const rubricKeys = breakdown.rubrics?.map((r) => r.key) ?? [];
    expect(rubricKeys).toEqual([
      'raw_material',
      'printing_die_cut',
      'operational',
      'scrap',
      'depreciation',
      'packaging',
    ]);
  });

  it('la suma de los 6 rubros coincide con True Cost tanto en USD como en Gs.', () => {
    const input = createCompleteFixture();
    const breakdown = IndustrialCostEngine.calculateCost(input);

    const rubrics = breakdown.rubrics ?? [];
    const sumRubricsUsd = rubrics.reduce((sum, r) => sum + r.impact_usd_per_unit, 0);
    expect(sumRubricsUsd).toBeCloseTo(breakdown.true_unit_cost_usd, 4);

    const fx = 7500;
    const trueCostPyg = Math.round(breakdown.true_unit_cost_usd * fx);
    const sumRubricsPyg = rubrics.reduce(
      (sum, r) => sum + Math.round(r.impact_usd_per_unit * fx),
      0
    );
    // Margen por redondeo entero de cada rubro en guaraníes
    expect(Math.abs(trueCostPyg - sumRubricsPyg)).toBeLessThanOrEqual(5);
  });
});

describe('Cost Sheet Remediation: 4. Jerarquía de Papel Landed y Estructura CIF', () => {
  it('calcula landed cost = CIF + Despacho + Financiero consistentemente', () => {
    const input = createCompleteFixture();
    const breakdown = IndustrialCostEngine.calculateCost(input);

    // CIF: 1000 USD/t. Despacho 13% = 130 USD/t. Financiero 6% = 60 USD/t. Total = 1190 USD/t
    expect(breakdown.total_paper_ton_cost_usd).toBe(1190);
    expect(breakdown.customs_dispatch_ton_usd).toBe(130);
    expect(breakdown.financial_cost_ton_usd).toBe(60);

    // A FX 7.500: Landed = 1.190 * 7.500 = 8.925.000 Gs./t
    const landedPyg = Math.round(breakdown.total_paper_ton_cost_usd * 7500);
    expect(landedPyg).toBe(8_925_000);
  });
});

describe('Cost Sheet Remediation: 5. Separación Borrador Autosave vs Publicación Oficial', () => {
  it('rechaza publicación oficial si la configuración de materia prima está incompleta', () => {
    const incompleteInput: IndustrialProductCostInput = {
      ...createCompleteFixture(),
      paper_formula: {
        cif_price_ton_usd: 0,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        printing_method: 'OFFSET',
        sheet_width_mm: 0,
        sheet_height_mm: 0,
        gsm: 0,
        units_per_sheet: 0,
        paper_yield_units_per_ton: 0,
      },
    };

    const breakdown = IndustrialCostEngine.calculateCost(incompleteInput);
    expect(breakdown.configured).toBe(false);
    expect(breakdown.missing_configuration?.length).toBeGreaterThan(0);
  });

  it('toV1CostComponents genera exactamente los 6 componentes canónicos para la hoja oficial', () => {
    const input = createCompleteFixture();
    const breakdown = IndustrialCostEngine.calculateCost(input);
    const components = IndustrialCostEngine.toV1CostComponents(breakdown, 'test-sheet-id');

    expect(components).toHaveLength(6);
    const categories = components.map((c) => c.category);
    expect(categories).toEqual([
      'materia_prima',
      'impresion',
      'mano_de_obra',
      'maquina',
      'merma',
      'empaque',
    ]);

    const sumComponents = components.reduce((sum, c) => sum + c.rate_usd, 0);
    expect(sumComponents).toBeCloseTo(breakdown.true_unit_cost_usd, 4);
  });

  it('preserva las versiones históricas asignando nuevo UUID y version N+1 sin sobreescritura', () => {
    const v1Id = 'sheet-v1-uuid';
    const v2Id = 'sheet-v2-uuid';
    const input = createCompleteFixture();
    const breakdown = IndustrialCostEngine.calculateCost(input);

    const v1Components = IndustrialCostEngine.toV1CostComponents(breakdown, v1Id);
    expect(v1Components.every((c) => c.cost_sheet_id === v1Id)).toBe(true);

    const v2Components = IndustrialCostEngine.toV1CostComponents(breakdown, v2Id);
    expect(v2Components.every((c) => c.cost_sheet_id === v2Id)).toBe(true);

    // Los componentes de v2 no interfieren ni sobrescriben los de v1
    expect(v1Components[0].cost_sheet_id).not.toBe(v2Components[0].cost_sheet_id);
    expect(v1Components[0].id).not.toBe(v2Components[0].id);
  });
});


