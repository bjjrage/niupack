import { describe, expect, it } from 'vitest';
import { cmToMm, mmToCm, sheetAreaPerUnitCm2, sheetMeasuresLookWrong } from '@/lib/cost/paper-sheet';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { INITIAL_INDUSTRIAL_COST_INPUTS } from '@/lib/db/seed-data';

describe('paper sheet units', () => {
  it('converts between centimetres (screen) and millimetres (storage) without drift', () => {
    expect(cmToMm(70)).toBe(700);
    expect(cmToMm(76.2)).toBe(762);
    expect(mmToCm(700)).toBe(70);
    expect(mmToCm(cmToMm(100))).toBe(100);
  });

  it('a 70 x 100 cm sheet with 18 units gives a plausible body cost, not Gs. 1', () => {
    const base = INITIAL_INDUSTRIAL_COST_INPUTS[0];
    const cost = (width: number, height: number) =>
      IndustrialCostEngine.calculateCost({
        ...base,
        paper_formula: {
          ...base.paper_formula,
          printing_method: 'OFFSET',
          sheet_width_mm: width,
          sheet_height_mm: height,
          units_per_sheet: 18,
          gsm: 260,
          coating_gsm: 32,
          cif_price_ton_usd: 810.05,
          customs_dispatch_percent: 13,
          financial_cost_percent: 6,
        },
      }).cost_paper_cone_usd;

    const asCm = cost(cmToMm(70), cmToMm(100)); // what the user means
    const asMm = cost(70, 100);                  // the same digits read as millimetres
    expect(asMm).toBeLessThan(0.0002);           // ≈ Gs. 1: the symptom reported from production
    expect(asCm).toBeGreaterThan(0.009);         // ≈ Gs. 60-70 per unit
    expect(asCm / asMm).toBeCloseTo(100, 0);     // exactly the 10x10 unit error
  });

  it('flags measures that are almost certainly in the wrong unit', () => {
    expect(sheetAreaPerUnitCm2(700, 1000, 18)).toBeCloseTo(388.9, 1);
    expect(sheetMeasuresLookWrong(700, 1000, 18)).toBeNull();
    expect(sheetMeasuresLookWrong(70, 100, 18)).toMatch(/Verifique las medidas/);   // cm typed as mm
    expect(sheetMeasuresLookWrong(7000, 10000, 18)).toMatch(/Verifique las medidas/); // mm typed as cm
    expect(sheetMeasuresLookWrong(0, 0, 0)).toBeNull();
  });
});
