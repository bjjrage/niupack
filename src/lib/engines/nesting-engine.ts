import { YieldNestingConfig, YieldNestingResult } from '@/types';

export class NestingEngine {
  /**
   * Calculate exact yield, nesting efficiency, geometric scrap and resulting paper unit cost
   */
  public static calculateYield(config: YieldNestingConfig): YieldNestingResult {
    const {
      sheet_width_mm,
      sheet_height_mm,
      piece_width_mm,
      piece_height_mm,
      spacing_mm = 3,
      printing_margin_mm = 10,
      registration_margin_mm = 15,
      pieces_per_sheet,
      paper_cif_ton_usd = 1250,
      gsm = 260,
      coating_gsm = 18,
    } = config;

    // Total Sheet Area in m²
    const total_area_m2 = Number(((sheet_width_mm * sheet_height_mm) / 1_000_000).toFixed(6));

    // Usable Area deducting margins
    const usable_width = Math.max(0, sheet_width_mm - 2 * printing_margin_mm);
    const usable_height = Math.max(0, sheet_height_mm - 2 * registration_margin_mm);
    const usable_area_m2 = Number(((usable_width * usable_height) / 1_000_000).toFixed(6));

    // Theoretical piece bounding area
    const piece_area_m2 = Number(((piece_width_mm * piece_height_mm) / 1_000_000).toFixed(6));

    // Automated estimate of pieces if pieces_per_sheet is 0 or not provided
    let pieces = pieces_per_sheet;
    if (!pieces || pieces <= 0) {
      const perRow = Math.floor(usable_width / (piece_width_mm + spacing_mm));
      const perCol = Math.floor(usable_height / (piece_height_mm + spacing_mm));
      pieces = Math.max(1, perRow * perCol);
    }

    // Material utilization (Yield %)
    const usefulAreaM2 = pieces * piece_area_m2;
    const yield_percent = total_area_m2 > 0 ? Number(((usefulAreaM2 / total_area_m2) * 100).toFixed(2)) : 0;
    const geometric_scrap_percent = Number(Math.max(0, 100 - yield_percent).toFixed(2));

    // Area consumed per individual cup piece
    const area_consumed_per_piece_m2 = total_area_m2 > 0 && pieces > 0
      ? Number((total_area_m2 / pieces).toFixed(6))
      : 0;

    // Paper Ton Cost with 13% customs dispatch + 6% financial cost
    const total_paper_ton_usd = Number((paper_cif_ton_usd * 1.19).toFixed(2));

    // Paper weight per sheet
    const totalGsm = gsm + coating_gsm;
    const sheetWeightKg = (total_area_m2 * totalGsm) / 1000;
    const sheets_per_ton = sheetWeightKg > 0 ? Number((1000 / sheetWeightKg).toFixed(1)) : 0;

    // Price per sheet and unit paper cost
    const pricePerSheetUSD = sheets_per_ton > 0 ? total_paper_ton_usd / sheets_per_ton : 0;
    const paper_cost_per_piece_usd = pieces > 0 ? Number((pricePerSheetUSD / pieces).toFixed(5)) : 0;

    return {
      total_area_m2,
      usable_area_m2,
      piece_area_m2,
      pieces_per_sheet: pieces,
      yield_percent,
      geometric_scrap_percent,
      area_consumed_per_piece_m2,
      paper_cost_per_piece_usd,
      sheets_per_ton,
      total_paper_ton_usd,
    };
  }

  /**
   * Compare standard narrow-web format (Paraguay 90x100 cm) vs wide-web format (75x100 cm)
   */
  public static compareFormats(params: {
    paperCifTonUSD?: number;
    gsm?: number;
    coatingGsm?: number;
  }) {
    const cif = params.paperCifTonUSD || 1250;
    const gsm = params.gsm || 260;
    const coating = params.coatingGsm || 18;

    // Standard Paraguay Narrow Web (900 x 1000 mm, 18 pieces)
    const narrow = this.calculateYield({
      sheet_width_mm: 900,
      sheet_height_mm: 1000,
      piece_width_mm: 205,
      piece_height_mm: 135,
      orientation: 'AUTO',
      spacing_mm: 3,
      printing_margin_mm: 10,
      registration_margin_mm: 15,
      pieces_per_sheet: 18,
      paper_cif_ton_usd: cif,
      gsm,
      coating_gsm: coating,
    });

    // Competitive Wide Web (750 x 1000 mm, 18 pieces)
    const wide = this.calculateYield({
      sheet_width_mm: 750,
      sheet_height_mm: 1000,
      piece_width_mm: 205,
      piece_height_mm: 135,
      orientation: 'AUTO',
      spacing_mm: 3,
      printing_margin_mm: 10,
      registration_margin_mm: 15,
      pieces_per_sheet: 18,
      paper_cif_ton_usd: cif,
      gsm,
      coating_gsm: coating,
    });

    const areaSavingPercent = Number(
      (((narrow.area_consumed_per_piece_m2 - wide.area_consumed_per_piece_m2) /
        narrow.area_consumed_per_piece_m2) *
        100).toFixed(2)
    );

    const unitCostSavingUSD = Number(
      (narrow.paper_cost_per_piece_usd - wide.paper_cost_per_piece_usd).toFixed(5)
    );

    const annualSavingUSD20M = Number((unitCostSavingUSD * 20_000_000).toFixed(2));

    return {
      narrowFormat: {
        dimensions: '900 × 1000 mm (Banda Angosta)',
        pieces: 18,
        areaPerPieceM2: narrow.area_consumed_per_piece_m2,
        yieldPercent: narrow.yield_percent,
        paperCostUnitUSD: narrow.paper_cost_per_piece_usd,
      },
      wideFormat: {
        dimensions: '750 × 1000 mm (Banda Ancha Competitiva)',
        pieces: 18,
        areaPerPieceM2: wide.area_consumed_per_piece_m2,
        yieldPercent: wide.yield_percent,
        paperCostUnitUSD: wide.paper_cost_per_piece_usd,
      },
      areaSavingPercent, // ~16.67%
      unitCostSavingUSD,
      annualSavingUSD20M,
    };
  }
}
