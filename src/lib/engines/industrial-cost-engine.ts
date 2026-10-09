import {
  CostInputSource,
  CostV1RubricKey,
  CostV1RubricResult,
  IndustrialCostBreakdown,
  IndustrialPaperFormula,
  IndustrialProductCostInput,
} from '@/types';

const RUBRIC_LABELS: Record<CostV1RubricKey, string> = {
  raw_material: 'Materia prima',
  printing_die_cut: 'Impresión + troquelado',
  operational: 'Costos operativos',
  scrap: 'Merma',
  depreciation: 'Depreciación',
  packaging: 'Embalaje',
};

const DEFAULT_RUBRICS: Record<CostV1RubricKey, { enabled: boolean; source: CostInputSource; unit: 'PER_UNIT' | 'PER_1000' | 'TOTAL_BATCH' | 'PERCENT' }> = {
  raw_material: { enabled: true, source: 'FORMULA', unit: 'PER_UNIT' },
  printing_die_cut: { enabled: true, source: 'QUOTE', unit: 'PER_1000' },
  operational: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
  scrap: { enabled: true, source: 'MANUAL', unit: 'PERCENT' },
  depreciation: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
  packaging: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
};

function rubricEnabled(input: IndustrialProductCostInput, key: CostV1RubricKey): boolean {
  return input.rubrics?.[key]?.enabled ?? DEFAULT_RUBRICS[key].enabled;
}

function rubricResults(
  input: IndustrialProductCostInput,
  values: Record<CostV1RubricKey, number>
): CostV1RubricResult[] {
  return (Object.keys(RUBRIC_LABELS) as CostV1RubricKey[]).map((key) => {
    const config = { ...DEFAULT_RUBRICS[key], ...(input.rubrics?.[key] ?? {}) };
    return {
      key,
      label: RUBRIC_LABELS[key],
      enabled: config.enabled,
      source: config.source,
      unit: config.unit,
      notes: config.notes,
      impact_usd_per_unit: config.enabled ? Number(values[key].toFixed(5)) : 0,
      impact_usd_batch: config.enabled ? Number((values[key] * Math.max(input.batch_size, 0)).toFixed(2)) : 0,
    };
  });
}

export class IndustrialCostEngine {
  public static getMissingConfiguration(input: IndustrialProductCostInput): string[] {
    const missing: string[] = [];
    const rawEnabled = rubricEnabled(input, 'raw_material');
    const printingEnabled = rubricEnabled(input, 'printing_die_cut');
    const operationalEnabled = rubricEnabled(input, 'operational');
    const depreciationEnabled = rubricEnabled(input, 'depreciation');
    const packagingEnabled = rubricEnabled(input, 'packaging');

    if (rawEnabled) {
      const paper = input.paper_formula;
      const paperHasYield = paper.paper_yield_units_per_ton > 0;
      const paperHasGeometry = paper.printing_method === 'OFFSET'
        ? Boolean(paper.sheet_width_mm && paper.sheet_height_mm && paper.units_per_sheet)
        : Boolean(paper.web_width_mm && paper.units_per_linear_meter);
      if (!(paper.cif_price_ton_usd > 0 && (paperHasYield || paperHasGeometry))) missing.push('Materia prima: cuerpo/cone');

      const bottomFormulaReady = Boolean(
        input.bottom_formula &&
        input.bottom_formula.cif_price_ton_usd > 0 &&
        input.bottom_formula.gsm > 0 &&
        input.bottom_formula.units_per_m2 > 0
      );
      const bottomLegacyReady = input.bottom_paper_cost_ton_usd > 0 && input.bottom_yield_units_per_ton > 0;
      if (!bottomFormulaReady && !bottomLegacyReady) missing.push('Materia prima: fondo');
    }

    if (printingEnabled && input.quoted_printing_rate_usd <= 0) missing.push('Impresión + troquelado');
    if (operationalEnabled && input.operational_cost_per_thousand_usd <= 0) missing.push('Costos operativos');
    if (depreciationEnabled && input.machine_depreciation_per_thousand_usd <= 0) missing.push('Depreciación');
    if (packagingEnabled && input.packaging_cost_per_thousand_usd <= 0) missing.push('Embalaje');
    if (input.batch_size <= 0) missing.push('Tamaño de lote');
    return missing;
  }

  public static isConfigured(input: IndustrialProductCostInput): boolean {
    return this.getMissingConfiguration(input).length === 0;
  }

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

    const rawMaterialEnabled = rubricEnabled(input, 'raw_material');
    const printingEnabled = rubricEnabled(input, 'printing_die_cut');
    const operationalEnabled = rubricEnabled(input, 'operational');
    const scrapEnabled = rubricEnabled(input, 'scrap');
    const depreciationEnabled = rubricEnabled(input, 'depreciation');
    const packagingEnabled = rubricEnabled(input, 'packaging');

    let cost_paper_cone_usd = 0;
    let price_per_sheet_usd: number | undefined = undefined;
    let price_per_linear_meter_usd: number | undefined = undefined;

    const totalGSM = Number(pf.gsm || 0) + Number(pf.coating_gsm || 0);

    if (rawMaterialEnabled && pf.printing_method === 'OFFSET') {
      if (pf.sheet_width_mm && pf.sheet_height_mm && totalGSM > 0) {
        // Peso en kg por pliego = (ancho_mm * largo_mm * gsm) / 1,000,000,000
        const sheetWeightKg = (pf.sheet_width_mm * pf.sheet_height_mm * totalGSM) / 1_000_000_000;
        const sheetsPerTon = sheetWeightKg > 0 ? 1000 / sheetWeightKg : 0;
        price_per_sheet_usd = sheetsPerTon > 0 ? total_paper_ton_cost_usd / sheetsPerTon : 0;

        if (pf.units_per_sheet && pf.units_per_sheet > 0) {
          cost_paper_cone_usd = price_per_sheet_usd / pf.units_per_sheet;
        }
      }
    } else if (rawMaterialEnabled && pf.printing_method === 'FLEXO') {
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
    if (rawMaterialEnabled && cost_paper_cone_usd <= 0 && pf.paper_yield_units_per_ton > 0) {
      cost_paper_cone_usd = total_paper_ton_cost_usd / pf.paper_yield_units_per_ton;
    }

    const coneMissing: string[] = [];
    if (rawMaterialEnabled) {
      if (total_paper_ton_cost_usd <= 0) coneMissing.push('Costo CIF/FOB papel');
      if (pf.printing_method === 'OFFSET') {
        if (!pf.sheet_width_mm || pf.sheet_width_mm <= 0) coneMissing.push('Ancho pliego (mm)');
        if (!pf.sheet_height_mm || pf.sheet_height_mm <= 0) coneMissing.push('Largo pliego (mm)');
        if (!pf.units_per_sheet || pf.units_per_sheet <= 0) coneMissing.push('Unidades por pliego');
        if (totalGSM <= 0) coneMissing.push('Gramaje del papel (gsm)');
      } else if (pf.printing_method === 'FLEXO') {
        if (!pf.web_width_mm || pf.web_width_mm <= 0) coneMissing.push('Ancho bobina (mm)');
        if (!pf.units_per_linear_meter || pf.units_per_linear_meter <= 0) coneMissing.push('Unidades por metro');
        if (totalGSM <= 0) coneMissing.push('Gramaje del papel (gsm)');
      }
      if (coneMissing.length > 0 && pf.paper_yield_units_per_ton > 0 && total_paper_ton_cost_usd > 0) {
        coneMissing.length = 0;
      }
    }
    const cost_paper_cone_status: 'COMPLETE' | 'INCOMPLETE' =
      !rawMaterialEnabled || (coneMissing.length === 0 && cost_paper_cone_usd > 0) ? 'COMPLETE' : 'INCOMPLETE';

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

    if (rawMaterialEnabled && bf) {
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
    if (rawMaterialEnabled && cost_bottom_usd <= 0) {
      if (bottom_yield_units_per_ton > 0) {
        cost_bottom_usd = Number((bottom_paper_cost_ton_usd / bottom_yield_units_per_ton).toFixed(5));
      }
    }

    const bottomMissing: string[] = [];
    if (rawMaterialEnabled) {
      if (total_bottom_ton_cost_usd <= 0 && (!bottom_paper_cost_ton_usd || bottom_paper_cost_ton_usd <= 0)) {
        bottomMissing.push('Costo CIF/FOB fondo');
      }
      const totalBottomGSM = Number(bf?.gsm || 0) + Number(bf?.coating_gsm || 0);
      if (totalBottomGSM <= 0 && bottom_yield_units_per_ton <= 0) {
        bottomMissing.push('Gramaje fondo (gsm)');
      }
      const hasYieldM2 = Boolean(bf?.units_per_m2 && bf.units_per_m2 > 0);
      const hasYieldSheet = Boolean(bf?.sheet_width_mm && bf?.sheet_height_mm && bf?.units_per_sheet);
      const hasDirectYield = Boolean(bottom_yield_units_per_ton && bottom_yield_units_per_ton > 0);
      if (!hasYieldM2 && !hasYieldSheet && !hasDirectYield) {
        bottomMissing.push('Rendimiento fondo (u/m² o u/pliego)');
      }
    }
    const cost_bottom_status: 'COMPLETE' | 'INCOMPLETE' =
      !rawMaterialEnabled || (bottomMissing.length === 0 && cost_bottom_usd > 0) ? 'COMPLETE' : 'INCOMPLETE';

    const cost_raw_material_status: 'COMPLETE' | 'INCOMPLETE' =
      !rawMaterialEnabled || (cost_paper_cone_status === 'COMPLETE' && cost_bottom_status === 'COMPLETE')
        ? 'COMPLETE'
        : 'INCOMPLETE';

    // 3. Impresión y Troquelado (Cotización variable cargada al cotizar)
    let cost_printing_diecut_usd = 0;
    if (printingEnabled && printing_cost_mode === 'PER_THOUSAND') {
      cost_printing_diecut_usd = Number((quoted_printing_rate_usd / 1000).toFixed(5));
    } else if (printingEnabled && printing_cost_mode === 'PER_UNIT') {
      cost_printing_diecut_usd = Number(quoted_printing_rate_usd.toFixed(5));
    } else if (printingEnabled && printing_cost_mode === 'TOTAL_BATCH') {
      cost_printing_diecut_usd =
        batch_size > 0 ? Number((quoted_printing_rate_usd / batch_size).toFixed(5)) : 0;
    }

    // 4. Costos Operativos (Mano de obra directa, energía, planta)
    const cost_operational_usd = operationalEnabled
      ? Number((operational_cost_per_thousand_usd / 1000).toFixed(5))
      : 0;

    // 5. Depreciación de Maquinaria
    const cost_depreciation_usd = depreciationEnabled
      ? Number((machine_depreciation_per_thousand_usd / 1000).toFixed(5))
      : 0;

    // 6. Merma (% calculada sobre la materia prima directa cono + culito)
    const rawMaterialDirectCost = cost_paper_cone_usd + cost_bottom_usd;
    const scrapRatio = Math.min(Math.max(scrap_rate_percent / 100, 0), 0.99);
    const cost_scrap_usd = scrapEnabled
      ? Number((rawMaterialDirectCost * (scrapRatio / Math.max(1 - scrapRatio, 0.01))).toFixed(5))
      : 0;

    // 7. Empaque (Cajas corrugadas, bolsas polietileno, pallet)
    const cost_packaging_usd = packagingEnabled
      ? Number((packaging_cost_per_thousand_usd / 1000).toFixed(5))
      : 0;

    // Exact unrounded figures
    const exact_cost_paper_cone_usd = cost_paper_cone_usd;
    const exact_cost_bottom_usd = cost_bottom_usd;
    const exact_true_unit_cost_usd =
      cost_paper_cone_usd +
      cost_bottom_usd +
      cost_printing_diecut_usd +
      cost_operational_usd +
      cost_depreciation_usd +
      cost_scrap_usd +
      cost_packaging_usd;

    // Total Costo Unitario Industrial (True Cost) - rounded to 5 decimals for standard display/storage
    const true_unit_cost_usd = Number(exact_true_unit_cost_usd.toFixed(5));
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

    const rubricValues: Record<CostV1RubricKey, number> = {
      raw_material: cost_paper_cone_usd + cost_bottom_usd,
      printing_die_cut: cost_printing_diecut_usd,
      operational: cost_operational_usd,
      scrap: cost_scrap_usd,
      depreciation: cost_depreciation_usd,
      packaging: cost_packaging_usd,
    };

    const missingConfiguration = this.getMissingConfiguration(input);

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
      cost_paper_cone_status,
      cost_bottom_status,
      cost_raw_material_status,
      cost_paper_cone_missing: coneMissing,
      cost_bottom_missing: bottomMissing,
      exact_cost_paper_cone_usd,
      exact_cost_bottom_usd,
      exact_true_unit_cost_usd,
      currency_mode: input.currency_mode || 'BOTH',
      fx_rate: input.fx_rate_applied,
      share_packaging_percent: calcShare(cost_packaging_usd),
      share_raw_material_percent: calcShare(rubricValues.raw_material),
      rubrics: rubricResults(input, rubricValues),
      configured: missingConfiguration.length === 0,
      missing_configuration: missingConfiguration,
    };
  }

  /**
   * Convert industrial breakdown into CostComponents format to sync with CostSheetVersion
   */
  public static toV1CostComponents(breakdown: IndustrialCostBreakdown, sheetId: string) {
    const today = new Date().toISOString().split('T')[0];
    const rawMaterial = breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd;
    const newId = () => crypto.randomUUID();
    return [
      {
        id: newId(),
        cost_sheet_id: sheetId,
        category: 'materia_prima' as const,
        name: 'Materia prima (cuerpo + fondo)',
        component_type: 'VARIABLE' as const,
        basis: 'PER_UNIT' as const,
        rate_usd: rawMaterial,
        quantity: 1,
        unit_of_measure: 'unit',
        effective_date: today,
        notes: `${breakdown.share_raw_material_percent ?? 0}% del costo unitario`,
      },
      {
        id: newId(),
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
        id: newId(),
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
        id: newId(),
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
        id: newId(),
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
        id: newId(),
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

  /** Legacy seven-line adapter retained for existing reports/tests. V1 uses toV1CostComponents. */
  public static toCostComponents(breakdown: IndustrialCostBreakdown, sheetId: string) {
    const components = this.toV1CostComponents(breakdown, sheetId);
    const raw = components[0];
    return [
      {
        ...raw,
        id: crypto.randomUUID(),
        name: 'Papel cuerpo / cono',
        rate_usd: breakdown.cost_paper_cone_usd,
      },
      {
        ...raw,
        id: crypto.randomUUID(),
        name: 'Papel fondo',
        rate_usd: breakdown.cost_bottom_usd,
      },
      ...components.slice(1),
    ];
  }
}
