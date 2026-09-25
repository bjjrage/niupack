import { PricingStrategyResult, PricingStrategyType } from '@/types';

export class PricingEngine {
  /**
   * Generate 7 distinct commercial pricing strategies for a SKU
   */
  public static calculateStrategies(params: {
    unitCostUSD: number;
    marketBenchmarkUSD: number;
    variableCostUSD?: number;
    targetMarginPercent?: number; // default 15
  }): PricingStrategyResult[] {
    const cost = params.unitCostUSD;
    const benchmark = params.marketBenchmarkUSD > 0 ? params.marketBenchmarkUSD : cost * 1.2;
    const variableCost = params.variableCostUSD || cost * 0.85;
    const targetMargin = (params.targetMarginPercent || 15) / 100;

    const buildResult = (
      strategy: PricingStrategyType,
      title: string,
      price: number,
      assumptions: string
    ): PricingStrategyResult => {
      const roundedPrice = Number(price.toFixed(4));
      const marginUSD = Number((roundedPrice - cost).toFixed(4));
      const marginPercent = roundedPrice > 0 ? Number(((marginUSD / roundedPrice) * 100).toFixed(2)) : 0;
      const gapUSD = Number((roundedPrice - benchmark).toFixed(4));
      const gapPercent = benchmark > 0 ? Number(((gapUSD / benchmark) * 100).toFixed(2)) : 0;

      return {
        strategy,
        title,
        unit_cost_usd: cost,
        suggested_price_usd: roundedPrice,
        margin_percent: marginPercent,
        margin_usd: marginUSD,
        market_benchmark_usd: benchmark,
        price_gap_usd: gapUSD,
        price_gap_percent: gapPercent,
        assumptions,
      };
    };

    const strategies: PricingStrategyResult[] = [];

    // 1. TARGET MARGIN (Cost-plus target margin)
    const targetMarginPrice = cost / (1 - targetMargin);
    strategies.push(
      buildResult(
        'TARGET_MARGIN',
        'Margen Objetivo (Cost-Plus 15%)',
        targetMarginPrice,
        `Cálculo sobre costo industrial con margen estándar del ${(targetMargin * 100).toFixed(0)}%. Asegura rentabilidad corporativa sostenida.`
      )
    );

    // 2. MARKET MATCH (Match weighted market benchmark)
    strategies.push(
      buildResult(
        'MARKET_MATCH',
        'Alineación al Mercado (Benchmark)',
        benchmark,
        'Iguala exactamente el precio medio ponderado del mercado regional. Posición neutral competitiva.'
      )
    );

    // 3. PENETRATION PRICE (Aggressive discount to win market share)
    const penetrationPrice = benchmark * 0.95; // 5% below market benchmark
    strategies.push(
      buildResult(
        'PENETRATION_PRICE',
        'Precio de Penetración (-5% vs Benchmark)',
        penetrationPrice,
        'Descuento del 5% bajo el precio de mercado para desplazar a competidores locales en primeras órdenes de compra.'
      )
    );

    // 4. VOLUME PRICE (Tiers for scale)
    const volumePrice = cost + (benchmark - cost) * 0.4;
    strategies.push(
      buildResult(
        'VOLUME_PRICE',
        'Precio Escala por Volumen (> 500k)',
        volumePrice,
        'Tarifa preferencial para pedidos superiores a 500.000 unidades aprovechando economías de escala en formadora.'
      )
    );

    // 5. CONTRACT PRICE (Long-term agreement)
    const contractPrice = cost / (1 - 0.12); // 12% margin with indexation
    strategies.push(
      buildResult(
        'CONTRACT_PRICE',
        'Contrato Anual Indexado (12% Margen)',
        contractPrice,
        'Acuerdo anual de suministro con cláusula de ajuste por precio de celulosa y entregas programadas mensuales.'
      )
    );

    // 6. MINIMUM DEFENSIBLE PRICE (Absolute walk-away floor)
    const minDefensiblePrice = variableCost * 1.05; // variable cost + 5% contribution
    strategies.push(
      buildResult(
        'MINIMUM_DEFENSIBLE_PRICE',
        'Piso Mínimo Defendible (Walk-Away)',
        minDefensiblePrice,
        'Límite inferior absoluto. Cubre costos variables directos y aporta margen de contribución mínimo. No vender por debajo.'
      )
    );

    // 7. PREMIUM (Certified Quality positioning)
    const premiumPrice = benchmark * 1.08; // 8% premium
    strategies.push(
      buildResult(
        'PREMIUM',
        'Posicionamiento Prémium (FSSC 22000 SGS)',
        premiumPrice,
        'Sobreprecio justificado en certificación internacional SGS FSSC 22000, inocuidad alimentaria y soporte técnico dedicado.'
      )
    );

    return strategies;
  }
}
