import {
  IndustrialCostBreakdown,
  IndustrialPaperFormula,
  IndustrialProductCostInput,
} from '@/types';

export class IndustrialCostEngine {
  /**
   * Calculate exact industrial cost from real plant parameters
   * No mocks, no Excel formulas required outside the OS.
   */
  public static calculateCost(input: IndustrialProductCostInput): IndustrialCostBreakdown {
    const {
      paper_formula: pf,
      bottom_paper_cost_ton_usd,
      bottom_yield_units_per_ton,
      printing_cost_mode,
      quoted_printing_rate_usd,
      operational_cost_per_thousand_usd,
      machine_depreciation_per_thousand_usd,
      scrap_rate_percent,
      packaging_cost_per_thousand_usd,
      batch_size,
    } = input;

    // 1. Total Costo por Tonelada de Papel = CIF + Despacho
    const total_paper_ton_cost_usd = Number(
      (Number(pf.cif_price_ton_usd || 0) + Number(pf.customs_dispatch_ton_usd || 0)).toFixed(2)
    );

    let cost_paper_cone_usd = 0;
    let price_per_sheet_usd: number | undefined = undefined;
    let price_per_linear_meter_usd: number | undefined = undefined;

    const totalGSM = Number(pf.gsm || 0) + Number(pf.coating_gsm || 0);

    if (pf.printing_method === 'OFFSET') {
      if (pf.sheet_width_mm && pf.sheet_height_mm && totalGSM > 0) {
        // Peso en kg por pliego = (ancho_mm * largo_mm * gsm) / 1,000,000,000
        const sheetWeightKg = (pf.sheet_width_mm * pf.sheet_height_mm * totalGSM) / 1_000_000_000;
        const sheetsPerTon = sheetWeightKg > 0 ? 1000 / sheetWeightKg : 0;
        price_per_sheet_usd = sheetsPerTon > 0 ? total_paper_ton_cost_usd / sheetsPerTon : 0;

        if (pf.units_per_sheet && pf.units_per_sheet > 0) {
          cost_paper_cone_usd = price_per_sheet_usd / pf.units_per_sheet;
        }
      }
    } else if (pf.printing_method === 'FLEXO') {
      if (pf.web_width_mm && totalGSM > 0) {
        // Peso en kg por metro lineal = (ancho_mm * 1000mm * gsm) / 1,000,000,000
        const meterWeightKg = (pf.web_width_mm * 1000 * totalGSM) / 1_000_000_000;
        const metersPerTon = meterWeightKg > 0 ? 1000 / meterWeightKg : 0;
        price_per_linear_meter_usd = metersPerTon > 0 ? total_paper_ton_cost_usd / metersPerTon : 0;

        if (pf.units_per_linear_meter && pf.units_per_linear_meter > 0) {
          cost_paper_cone_usd = price_per_linear_meter_usd / pf.units_per_linear_meter;
        }
      }
    }

    // Direct yield fallback / override if yield is given and no specific sheet/meter was provided
    if (cost_paper_cone_usd <= 0 && pf.paper_yield_units_per_ton > 0) {
      cost_paper_cone_usd = total_paper_ton_cost_usd / pf.paper_yield_units_per_ton;
    }

    // 2. Costo de Culito (Fondo del Vaso)
    const cost_bottom_usd =
      bottom_yield_units_per_ton > 0
        ? Number((bottom_paper_cost_ton_usd / bottom_yield_units_per_ton).toFixed(5))
        : 0;

    // 3. Impresión y Troquelado (Cotización variable cargada al cotizar)
    let cost_printing_diecut_usd = 0;
    if (printing_cost_mode === 'PER_THOUSAND') {
      cost_printing_diecut_usd = Number((quoted_printing_rate_usd / 1000).toFixed(5));
    } else if (printing_cost_mode === 'PER_UNIT') {
      cost_printing_diecut_usd = Number(quoted_printing_rate_usd.toFixed(5));
    } else if (printing_cost_mode === 'TOTAL_BATCH') {
      cost_printing_diecut_usd =
        batch_size > 0 ? Number((quoted_printing_rate_usd / batch_size).toFixed(5)) : 0;
    }

    // 4. Costos Operativos (Mano de obra directa, energía, planta)
    const cost_operational_usd = Number((operational_cost_per_thousand_usd / 1000).toFixed(5));

    // 5. Depreciación de Maquinaria
    const cost_depreciation_usd = Number((machine_depreciation_per_thousand_usd / 1000).toFixed(5));

    // 6. Merma (% calculada sobre la materia prima directa cono + culito)
    const rawMaterialDirectCost = cost_paper_cone_usd + cost_bottom_usd;
    const cost_scrap_usd = Number((rawMaterialDirectCost * (scrap_rate_percent / 100)).toFixed(5));

    // 7. Empaque (Cajas corrugadas, bolsas polietileno, pallet)
    const cost_packaging_usd = Number((packaging_cost_per_thousand_usd / 1000).toFixed(5));

    // Total Costo Unitario Industrial (True Cost)
    const true_unit_cost_usd = Number(
      (
        cost_paper_cone_usd +
        cost_bottom_usd +
        cost_printing_diecut_usd +
        cost_operational_usd +
        cost_depreciation_usd +
        cost_scrap_usd +
        cost_packaging_usd
      ).toFixed(5)
    );

    const batch_total_cost_usd = Number((true_unit_cost_usd * batch_size).toFixed(2));

    // Participation %
    const calcShare = (itemCost: number) =>
      true_unit_cost_usd > 0 ? Number(((itemCost / true_unit_cost_usd) * 100).toFixed(1)) : 0;

    return {
      cost_paper_cone_usd: Number(cost_paper_cone_usd.toFixed(5)),
      cost_bottom_usd,
      cost_printing_diecut_usd,
      cost_operational_usd,
      cost_depreciation_usd,
      cost_scrap_usd,
      cost_packaging_usd,
      true_unit_cost_usd,
      batch_total_cost_usd,
      total_paper_ton_cost_usd,
      price_per_sheet_usd: price_per_sheet_usd ? Number(price_per_sheet_usd.toFixed(4)) : undefined,
      price_per_linear_meter_usd: price_per_linear_meter_usd
        ? Number(price_per_linear_meter_usd.toFixed(4))
        : undefined,
      share_paper_cone_percent: calcShare(cost_paper_cone_usd),
      share_bottom_percent: calcShare(cost_bottom_usd),
      share_printing_percent: calcShare(cost_printing_diecut_usd),
      share_operational_percent: calcShare(cost_operational_usd),
      share_depreciation_percent: calcShare(cost_depreciation_usd),
      share_scrap_percent: calcShare(cost_scrap_usd),
      share_packaging_percent: calcShare(cost_packaging_usd),
    };
  }

  /**
   * Convert industrial breakdown into CostComponents format to sync with CostSheetVersion
   */
  public static toCostComponents(breakdown: IndustrialCostBreakdown, sheetId: string) {
    const today = new Date().toISOString().split('T')[0];
    return [
      {
        id: `ic-paper-cone`,
        cost_sheet_id: sheetId,
        category: 'papel' as const,
        name: 'Papel Cuerpo/Cono (CIF + Despacho + Rendimiento)',
        component_type: 'VARIABLE' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: breakdown.cost_paper_cone_usd,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_paper_cone_percent}% del costo unitario`,
      },
      {
        id: `ic-bottom`,
        cost_sheet_id: sheetId,
        category: 'papel' as const,
        name: 'Fondo del Vaso ("Culito" Bobina Angosta)',
        component_type: 'VARIABLE' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: breakdown.cost_bottom_usd,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_bottom_percent}% del costo unitario`,
      },
      {
        id: `ic-printing`,
        cost_sheet_id: sheetId,
        category: 'impresion' as const,
        name: 'Impresión y Troquelado (Cotización Variable)',
        component_type: 'VARIABLE' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: breakdown.cost_printing_diecut_usd,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_printing_percent}% del costo unitario`,
      },
      {
        id: `ic-operational`,
        cost_sheet_id: sheetId,
        category: 'mano_de_obra' as const,
        name: 'Costos Operativos (Mano de Obra Línea + Energía)',
        component_type: 'VARIABLE' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: breakdown.cost_operational_usd,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_operational_percent}% del costo unitario`,
      },
      {
        id: `ic-depreciation`,
        cost_sheet_id: sheetId,
        category: 'maquina' as const,
        name: 'Depreciación Maquinaria (Formadora y Línea)',
        component_type: 'FIXED' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: breakdown.cost_depreciation_usd,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_depreciation_percent}% del costo unitario`,
      },
      {
        id: `ic-scrap`,
        cost_sheet_id: sheetId,
        category: 'merma' as const,
        name: 'Merma de Proceso Industrial',
        component_type: 'VARIABLE' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: breakdown.cost_scrap_usd,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_scrap_percent}% del costo unitario`,
      },
      {
        id: `ic-packaging`,
        cost_sheet_id: sheetId,
        category: 'empaque' as const,
        name: 'Empaque Secundario (Cajas y Bolsas Polietileno)',
        component_type: 'VARIABLE' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: breakdown.cost_packaging_usd,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_packaging_percent}% del costo unitario`,
      },
    ];
  }
}
