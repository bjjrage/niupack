import { ExternalQuoteInput, ProductAttribute, QuoteMatchResult } from '@/types';
import { repository } from '@/lib/db/repository';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { ExportLogisticsEngine } from '@/lib/engines/export-logistics-engine';
import { FxEngine } from '@/lib/fx/fx-provider';

export class QuoteMatcherEngine {
  /**
   * Parse arbitrary text (email, pasted quote, RFQ reply) into structured ExternalQuoteInput
   */
  public static parseRawTextToQuote(
    rawText: string,
    supplierName: string = 'Competidor Externo',
    country: string = 'BR',
    sourceType: ExternalQuoteInput['source_type'] = 'MANUAL_TEXT'
  ): ExternalQuoteInput {
    const text = rawText.trim();

    // 1. Detect Currency
    let currency = 'USD';
    if (text.includes('BRL') || text.includes('R$') || text.toLowerCase().includes('reais')) {
      currency = 'BRL';
    } else if (text.includes('ARS') || text.toLowerCase().includes('pesos')) {
      currency = 'ARS';
    } else if (text.includes('PYG') || text.includes('Gs.') || text.includes('Guaraníes')) {
      currency = 'PYG';
    }

    // 2. Detect Incoterm
    let incoterm = 'FOB';
    if (text.toUpperCase().includes('CIF')) {
      incoterm = 'CIF';
    } else if (text.toUpperCase().includes('EXW')) {
      incoterm = 'EXW';
    } else if (text.toUpperCase().includes('DDP')) {
      incoterm = 'DDP';
    }

    // 3. Detect size (oz / ml)
    let sizeOz: number | undefined;
    let sizeMl: number | undefined;

    const ozMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:oz|onzas?)\b/i);
    if (ozMatch) {
      sizeOz = parseFloat(ozMatch[1]);
    }

    const mlMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:ml|cc)\b/i);
    if (mlMatch) {
      sizeMl = parseFloat(mlMatch[1]);
      if (!sizeOz) {
        // Approximate standard cup sizes
        if (sizeMl >= 100 && sizeMl <= 140) sizeOz = 4;
        else if (sizeMl >= 220 && sizeMl <= 260) sizeOz = 8;
        else if (sizeMl >= 330 && sizeMl <= 380) sizeOz = 12;
        else if (sizeMl >= 450 && sizeMl <= 520) sizeOz = 16;
      }
    }

    // 4. Detect Price and Quantity
    let quotedUnitPrice = 0.052;
    let quantity = 100000;

    const qtyMatch = text.match(/(?:cantidad|quantidade|tirada|tiragem|volumen|q|qty)[\s:]*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1].replace(/[.,]/g, ''), 10);
    }

    // Price regex
    const priceMatch =
      text.match(/(?:usd|r\$|\$|brl|precio|preço|unitario|unitário)[\s:]*([0-9]+(?:[.,][0-9]+)?)/i) ||
      text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|r\$|\$|brl|\/un|\/u|\/mil)/i);

    if (priceMatch) {
      quotedUnitPrice = parseFloat(priceMatch[1].replace(',', '.'));
      // If price was expressed per 1,000 (e.g. 48.50 per millar or text has 'mil' or '1000')
      if (text.toLowerCase().includes('/mil') || text.toLowerCase().includes('/1000') || quotedUnitPrice > 10) {
        quotedUnitPrice = quotedUnitPrice / 1000;
      }
    }

    // 5. Detect material / wall type
    let material = 'Cartulina Cupstock';
    if (text.toLowerCase().includes('double wall') || text.toLowerCase().includes('doble pared') || text.toLowerCase().includes('parede dupla')) {
      material = 'Cartulina Cupstock Doble Pared';
    }

    return {
      supplier_name: supplierName,
      country,
      quote_date: new Date().toISOString().split('T')[0],
      product_description: text.slice(0, 150),
      size_oz: sizeOz,
      size_ml: sizeMl,
      material,
      quantity,
      quoted_unit_price: quotedUnitPrice,
      currency,
      incoterm,
      source_type: sourceType,
      raw_text: text,
    };
  }

  /**
   * Find the closest matching SKU from NIUPACK's catalog
   */
  public static matchClosestSku(
    quote: ExternalQuoteInput,
    catalog: ProductAttribute[]
  ): { sku: ProductAttribute; score: number; sizeMatch: boolean; materialMatch: boolean } {
    if (catalog.length === 0) {
      throw new Error('Catalog is empty');
    }

    let bestSku = catalog[0];
    let highestScore = -1;
    let sizeMatched = false;
    let materialMatched = false;

    for (const item of catalog) {
      let score = 0;

      // 1. Exact or near size matching
      if (quote.size_oz && item.size_oz) {
        if (quote.size_oz === item.size_oz) {
          score += 60;
          sizeMatched = true;
        } else {
          const diff = Math.abs(quote.size_oz - item.size_oz);
          score += Math.max(0, 40 - diff * 10);
        }
      } else if (quote.size_ml && item.size_ml) {
        const diffMl = Math.abs(quote.size_ml - item.size_ml);
        if (diffMl < 20) {
          score += 55;
          sizeMatched = true;
        } else {
          score += Math.max(0, 35 - diffMl * 0.5);
        }
      }

      // 2. Wall type & material matching
      const desc = (quote.product_description + ' ' + (quote.material || '')).toLowerCase();
      const isQuoteDouble = desc.includes('double') || desc.includes('doble') || desc.includes('dupla') || desc.includes('-dw');
      const isItemDouble = item.wall_type === 'double' || item.sku.includes('-DW');

      if (isQuoteDouble === isItemDouble) {
        score += 30;
        materialMatched = true;
      }

      // 3. Substring check in SKU name
      if (quote.size_oz && item.sku.includes(`${quote.size_oz}OZ`)) {
        score += 10;
      }

      if (score > highestScore) {
        highestScore = score;
        bestSku = item;
      }
    }

    const normalizedScore = Number(Math.min(1, Math.max(0, highestScore / 100)).toFixed(2));
    return {
      sku: bestSku,
      score: normalizedScore,
      sizeMatch: sizeMatched,
      materialMatch: materialMatched,
    };
  }

  /**
   * Compare external quote against NIUPACK true unit cost and landed cost
   */
  public static async compareQuote(
    quote: ExternalQuoteInput,
    overrideSku?: string
  ): Promise<QuoteMatchResult> {
    const catalog = await repository.getSKUs();
    const match = this.matchClosestSku(quote, catalog);
    const skuCode = overrideSku || match.sku.sku;

    // Normalizing foreign currencies to USD
    let externalPriceUSD = quote.quoted_unit_price;
    if (quote.currency === 'BRL') {
      externalPriceUSD = Number((quote.quoted_unit_price * 0.18).toFixed(5));
    } else if (quote.currency === 'ARS') {
      externalPriceUSD = Number((quote.quoted_unit_price * 0.00095).toFixed(5));
    } else if (quote.currency === 'PYG') {
      externalPriceUSD = Number((quote.quoted_unit_price / 7550).toFixed(5));
    }

    // Get NIUPACK Real Industrial Cost
    const industrialInputs = await repository.getIndustrialCostInputs();
    const skuInput = industrialInputs.find((i) => i.sku === skuCode) || industrialInputs[0];
    const breakdown = IndustrialCostEngine.calculateCost(skuInput);
    const factoryUnitCostUSD = breakdown.true_unit_cost_usd;

    // Get current FX rate
    const fxInfo = await FxEngine.getEffectiveQuote();
    const fxRate = fxInfo.costingRate;
    const factoryUnitCostPYG = Math.round(factoryUnitCostUSD * fxRate);

    // Get Landed Cost estimation for comparison
    const packaging = await repository.getPackagingSpec(skuCode);
    const lclFreight = ExportLogisticsEngine.calculateLclCost({
      packaging: packaging!,
      number_of_units: quote.quantity || 100000,
      freight_cost_per_m3_usd: 180,
    });

    const landedInfo = ExportLogisticsEngine.calculateLandedCost({
      sku: skuCode,
      factoryUnitCostUSD,
      freightUnitUSD: lclFreight.freight_cost_per_unit_usd,
      exportPackagingUSD: 0.002,
      originLogisticsUSD: 0.0015,
      documentationUSD: 0.0005,
      insuranceUSD: 0.0005,
      destinationChargesUSD: 0.002,
      dutiesPercent: 10,
      fxRate,
    });

    // Price Gap: Competitor price - NIUPACK cost
    const priceGapUSD = Number((externalPriceUSD - factoryUnitCostUSD).toFixed(5));
    const priceGapPercent =
      factoryUnitCostUSD > 0 ? Number(((priceGapUSD / factoryUnitCostUSD) * 100).toFixed(1)) : 0;

    const marginAtExternal =
      externalPriceUSD > 0
        ? Number((((externalPriceUSD - factoryUnitCostUSD) / externalPriceUSD) * 100).toFixed(1))
        : 0;

    // Determine competitive status
    let competitiveStatus: QuoteMatchResult['competitive_status'] = 'PARITY';
    if (priceGapPercent >= 15) {
      competitiveStatus = 'COMPETITIVE'; // Competitor is much more expensive -> NIUPACK has strong pricing advantage
    } else if (priceGapPercent >= 0) {
      competitiveStatus = 'PARITY'; // Close or slightly higher
    } else if (priceGapPercent >= -12) {
      competitiveStatus = 'DISADVANTAGE'; // Competitor is lower
    } else {
      competitiveStatus = 'CRITICAL'; // Competitor is significantly cheaper
    }

    // Incoterm comparability warning
    let comparableWarning: string | undefined = undefined;
    if (quote.incoterm && quote.incoterm !== 'EXW') {
      comparableWarning = `Atención comercial: La cotización de ${quote.supplier_name} es ${quote.incoterm} (${quote.country}), mientras que el costo base de NIUPACK es EXW Planta Asunción. Para una comparación fidedigna considerar el Landed Cost de USD ${landedInfo.landed_unit_usd.toFixed(4)}.`;
    }

    const matchedSkuObj = catalog.find((s) => s.sku === skuCode);
    const matchedSkuName = matchedSkuObj ? `${matchedSkuObj.size_oz || ''} oz ${matchedSkuObj.material}` : skuCode;

    const result: QuoteMatchResult = {
      id: crypto.randomUUID(),
      external_quote: quote,
      matched_sku: skuCode,
      matched_sku_name: matchedSkuName,
      sku_similarity_score: match.score,
      size_match: match.sizeMatch,
      material_match: match.materialMatch,
      external_unit_price_usd: externalPriceUSD,
      niupack_factory_unit_cost_usd: factoryUnitCostUSD,
      niupack_landed_unit_cost_usd: landedInfo.landed_unit_usd,
      fx_rate_used: fxRate,
      niupack_factory_unit_cost_pyg: factoryUnitCostPYG,
      price_gap_usd: priceGapUSD,
      price_gap_percent: priceGapPercent,
      margin_at_external_price_percent: marginAtExternal,
      competitive_status: competitiveStatus,
      comparable_warning: comparableWarning,
      created_at: new Date().toISOString(),
    };

    // Save in repository for audit & strategy
    await repository.saveQuoteMatch(result);

    return result;
  }
}
