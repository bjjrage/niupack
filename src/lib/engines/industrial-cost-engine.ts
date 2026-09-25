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

    // 1. Total Costo por Tonelada de Papel = CIF + Despacho (13% del CIF) + Costo del Dinero (6% del CIF)
    const cifPrice = Number(pf.cif_price_ton_usd || 0);
    const customsPercent = pf.customs_dispatch_percent !== undefined ? pf.customs_dispatch_percent : 13;
    const financialPercent = pf.financial_cost_percent !== undefined ? pf.financial_cost_percent : 6;

    const customs_dispatch_ton_usd = Number((cifPrice * (customsPercent / 100)).toFixed(2));
    const financial_cost_ton_usd = Number((cifPrice * (financialPercent / 100)).toFixed(2));

    const total_paper_ton_cost_usd = Number(
      (cifPrice + customs_dispatch_ton_usd + financial_cost_ton_usd).toFixed(2)
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
    // Formulación: CIF ton + Despacho (13%) + Costo del Dinero (6%) -> Costo por Tonelada
    // Costo por m2 = Tonelada * (GSM + PE) / 1,000,000
    // Costo por Pliego = Costo por m2 * (Ancho * Largo / 1,000,000)
    // Costo Unitario = Costo por m2 / units_per_m2 (o Costo por Pliego / units_per_sheet)
    const bf = input.bottom_formula;
    let cost_bottom_usd = 0;
    let bottom_cif_price_ton_usd = 0;
    let total_bottom_ton_cost_usd = 0;
    let bottom_customs_dispatch_ton_usd = 0;
    let bottom_financial_cost_ton_usd = 0;
    let cost_bottom_m2_usd = 0;
    let cost_bottom_sheet_usd = 0;
    let bottom_units_per_m2 = 0;
    let bottom_units_per_sheet = 0;

    if (bf) {
      bottom_cif_price_ton_usd = Number(bf.cif_price_ton_usd || 0);
      const bCustomsPercent = bf.customs_dispatch_percent !== undefined ? bf.customs_dispatch_percent : 13;
      const bFinancialPercent = bf.financial_cost_percent !== undefined ? bf.financial_cost_percent : 6;

      bottom_customs_dispatch_ton_usd = Number((bottom_cif_price_ton_usd * (bCustomsPercent / 100)).toFixed(2));
      bottom_financial_cost_ton_usd = Number((bottom_cif_price_ton_usd * (bFinancialPercent / 100)).toFixed(2));
      total_bottom_ton_cost_usd = Number(
        (bottom_cif_price_ton_usd + bottom_customs_dispatch_ton_usd + bottom_financial_cost_ton_usd).toFixed(2)
      );

      const totalBottomGSM = Number(bf.gsm || 0) + Number(bf.coating_gsm || 0);
      if (totalBottomGSM > 0) {
        cost_bottom_m2_usd = Number((total_bottom_ton_cost_usd * (totalBottomGSM / 1_000_000)).toFixed(6));

        // Pliego dimensions (default 1000x1000 mm = 1 m2)
        const sheetWidth = bf.sheet_width_mm || 1000;
        const sheetHeight = bf.sheet_height_mm || 1000;
        const sheetAreaM2 = (sheetWidth * sheetHeight) / 1_000_000;
        cost_bottom_sheet_usd = Number((cost_bottom_m2_usd * sheetAreaM2).toFixed(6));

        bottom_units_per_m2 = Number(bf.units_per_m2 || 0);
        bottom_units_per_sheet = bf.units_per_sheet || Math.round(bottom_units_per_m2 * sheetAreaM2);

        if (bottom_units_per_m2 > 0) {
          cost_bottom_usd = Number((cost_bottom_m2_usd / bottom_units_per_m2).toFixed(5));
        } else if (bottom_units_per_sheet > 0) {
          cost_bottom_usd = Number((cost_bottom_sheet_usd / bottom_units_per_sheet).toFixed(5));
        }
      }
    }

    // Direct / legacy fallback if bottom_formula was omitted
    if (cost_bottom_usd <= 0) {
      if (bottom_yield_units_per_ton > 0) {
        cost_bottom_usd = Number((bottom_paper_cost_ton_usd / bottom_yield_units_per_ton).toFixed(5));
      }
    }

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

    const cost_dispatch_usd = total_paper_ton_cost_usd > 0
      ? Number(((customs_dispatch_ton_usd / total_paper_ton_cost_usd) * cost_paper_cone_usd).toFixed(5))
      : 0;

    const cost_financial_usd = total_paper_ton_cost_usd > 0
      ? Number(((financial_cost_ton_usd / total_paper_ton_cost_usd) * cost_paper_cone_usd).toFixed(5))
      : 0;

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
      customs_dispatch_ton_usd,
      financial_cost_ton_usd,
      cost_dispatch_usd,
      cost_financial_usd,
      price_per_sheet_usd: price_per_sheet_usd ? Number(price_per_sheet_usd.toFixed(4)) : undefined,
      price_per_linear_meter_usd: price_per_linear_meter_usd
        ? Number(price_per_linear_meter_usd.toFixed(4))
        : undefined,
      // Bottom detail calculations
      bottom_cif_price_ton_usd,
      total_bottom_ton_cost_usd,
      bottom_customs_dispatch_ton_usd,
      bottom_financial_cost_ton_usd,
      cost_bottom_m2_usd,
      cost_bottom_sheet_usd,
      bottom_units_per_m2,
      bottom_units_per_sheet,
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
        name: 'Papel Cuerpo/Cono (CIF + Despacho 13% + Costo Dinero 6%)',
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
