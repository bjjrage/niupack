import { describe, it, expect } from 'vitest';
import { NestingEngine } from '@/lib/engines/nesting-engine';

describe('NestingEngine (Yield / Nesting Calculator)', () => {
  it('calculates single sheet yield and scrap correctly', () => {
    const result = NestingEngine.calculateYield({
      sheet_width_mm: 750,
      sheet_height_mm: 1000,
      piece_width_mm: 205,
      piece_height_mm: 135,
      orientation: 'AUTO',
      spacing_mm: 3,
      printing_margin_mm: 10,
      registration_margin_mm: 15,
      pieces_per_sheet: 18,
      paper_cif_ton_usd: 1250,
      gsm: 260,
      coating_gsm: 18,
    });

    expect(result.total_area_m2).toBe(0.75);
    expect(result.pieces_per_sheet).toBe(18);
    expect(result.area_consumed_per_piece_m2).toBeCloseTo(0.04167, 4);
    expect(result.geometric_scrap_percent).toBeGreaterThan(0);
    expect(result.paper_cost_per_piece_usd).toBeGreaterThan(0.015);
    expect(result.paper_cost_per_piece_usd).toBeLessThan(0.035);
  });

  it('correctly compares 900x1000 mm (Paraguay actual) vs 750x1000 mm (Banda Ancha Competitiva)', () => {
    const comparison = NestingEngine.compareFormats({
      paperCifTonUSD: 1250,
      gsm: 260,
      coatingGsm: 18,
    });

    // 0.90m² / 18 = 0.050 m²/piece vs 0.75m² / 18 = 0.04167 m²/piece
    expect(comparison.narrowFormat.areaPerPieceM2).toBe(0.05);
    expect(comparison.wideFormat.areaPerPieceM2).toBeCloseTo(0.04167, 4);

    // Area saving should be approx 16.67%
    expect(comparison.areaSavingPercent).toBeCloseTo(16.67, 1);

    // Unit cost saving should be positive
    expect(comparison.unitCostSavingUSD).toBeGreaterThan(0.003);

    // Annual saving for 20M units should exceed $60,000 USD
    expect(comparison.annualSavingUSD20M).toBeGreaterThan(60000);
  });
});
