// Materia prima de la hoja de costo: UN solo costo de papel puesto en planta (FOB + flete = CIF, más despacho
// y costo del dinero sobre el CIF) del que se desprenden el papel cuerpo y el fondo.
//
// El motor (IndustrialCostEngine) sigue leyendo cif_price_ton_usd / customs_dispatch_percent /
// financial_cost_percent de paper_formula y de bottom_formula. Este módulo solo mantiene esos campos
// sincronizados desde un único origen y guarda FOB y flete como dato de detalle. No cambia ningún cálculo.

import type { IndustrialBottomFormula, IndustrialPaperFormula, IndustrialProductCostInput } from '@/types';

/** Estándar NIUPACK cuando la hoja todavía no definió el porcentaje (mismo default que el motor). */
export const DEFAULT_CUSTOMS_PERCENT = 13;
export const DEFAULT_FINANCIAL_PERCENT = 6;

const round2 = (n: number) => Number(n.toFixed(2));

export interface RawMaterialView {
  fob: number;
  freight: number;
  /** FOB + flete. */
  cif: number;
  customsPercent: number;
  financialPercent: number;
  customsUsd: number;
  financialUsd: number;
  /** CIF + despacho + costo del dinero, por tonelada. */
  landedUsd: number;
  /** Moneda original cargada por el usuario */
  originalCurrency?: 'USD' | 'PYG';
  originalFob?: number;
  originalFreight?: number;
}

export function readRawMaterial(input: IndustrialProductCostInput): RawMaterialView {
  const pf = input.paper_formula;
  // Hojas guardadas antes de separar FOB/flete solo tienen CIF: se muestra como FOB con flete 0.
  const split = pf.fob_price_ton_usd !== undefined || pf.freight_ton_usd !== undefined;
  const fob = split ? Number(pf.fob_price_ton_usd ?? 0) : Number(pf.cif_price_ton_usd || 0);
  const freight = split ? Number(pf.freight_ton_usd ?? 0) : 0;
  const cif = round2(fob + freight);
  const customsPercent = pf.customs_dispatch_percent ?? DEFAULT_CUSTOMS_PERCENT;
  const financialPercent = pf.financial_cost_percent ?? DEFAULT_FINANCIAL_PERCENT;
  const customsUsd = round2((cif * customsPercent) / 100);
  const financialUsd = round2((cif * financialPercent) / 100);
  return {
    fob,
    freight,
    cif,
    customsPercent,
    financialPercent,
    customsUsd,
    financialUsd,
    landedUsd: round2(cif + customsUsd + financialUsd),
    originalCurrency: input.currency_meta?.currency || input.input_currency,
    originalFob: input.currency_meta?.fob_price_ton_original,
    originalFreight: input.currency_meta?.freight_ton_original,
  };
}

export type RawMaterialPatch = Partial<Pick<RawMaterialView, 'fob' | 'freight' | 'customsPercent' | 'financialPercent'>> & {
  originalFob?: number;
  originalFreight?: number;
  originalCurrency?: 'USD' | 'PYG';
  fxRate?: number;
};

function emptyBottom(): IndustrialBottomFormula {
  return { cif_price_ton_usd: 0, gsm: 0, coating_gsm: 0, units_per_m2: 0 };
}

/** Aplica un cambio del costo de materia prima y lo propaga al cuerpo y al fondo. */
export function applyRawMaterial(input: IndustrialProductCostInput, patch: RawMaterialPatch): IndustrialProductCostInput {
  const next = { ...readRawMaterial(input), ...patch };
  const cif = round2(next.fob + next.freight);
  const paper_formula: IndustrialPaperFormula = {
    ...input.paper_formula,
    fob_price_ton_usd: next.fob,
    freight_ton_usd: next.freight,
    cif_price_ton_usd: cif,
    customs_dispatch_percent: next.customsPercent,
    financial_cost_percent: next.financialPercent,
  };
  const bottom_formula: IndustrialBottomFormula = {
    ...(input.bottom_formula ?? emptyBottom()),
    cif_price_ton_usd: cif,
    customs_dispatch_percent: next.customsPercent,
    financial_cost_percent: next.financialPercent,
  };

  const currency_meta = {
    currency: patch.originalCurrency || input.currency_meta?.currency || input.input_currency || 'USD',
    fx_rate: patch.fxRate ?? input.currency_meta?.fx_rate ?? input.fx_rate_applied ?? 1,
    fob_price_ton_original: patch.originalFob !== undefined ? patch.originalFob : input.currency_meta?.fob_price_ton_original,
    freight_ton_original: patch.originalFreight !== undefined ? patch.originalFreight : input.currency_meta?.freight_ton_original,
  };

  return {
    ...input,
    paper_formula,
    bottom_formula,
    bottom_paper_cost_ton_usd: cif,
    currency_meta,
  };
}

/**
 * Hojas viejas pudieron guardar un CIF o porcentajes distintos para el fondo. La UI lo avisa y NO lo cambia
 * hasta que alguien edita el costo de materia prima (ahí se unifica).
 */
export function bottomDiverges(input: IndustrialProductCostInput): boolean {
  const bf = input.bottom_formula;
  if (!bf || !(bf.cif_price_ton_usd > 0)) return false;
  const rm = readRawMaterial(input);
  return (
    Math.abs(bf.cif_price_ton_usd - rm.cif) > 0.005 ||
    (bf.customs_dispatch_percent ?? DEFAULT_CUSTOMS_PERCENT) !== rm.customsPercent ||
    (bf.financial_cost_percent ?? DEFAULT_FINANCIAL_PERCENT) !== rm.financialPercent
  );
}
