import { CopilotScreenContext, CopilotAction } from '@/types';

export interface CopilotPromptPackage {
  systemPrompt: string;
  userMessage: string;
  condensedContext: Record<string, any>;
}

export class ContextBuilder {
  /**
   * Builds an optimized, non-redundant context payload tailored to the user's active module
   */
  public static buildPrompt(
    question: string,
    context: CopilotScreenContext
  ): CopilotPromptPackage {
    const { route, module, sku, market, volume, unitCostUSD, benchmarkUSD, gapPercent } = context;

    // Filter relevant fields by module to prevent token bloat
    let domainData: Record<string, any> = {};

    if (module === 'cost' || route.includes('/cost')) {
      domainData = {
        sku: sku || 'CUP-12OZ-SW',
        batch_volume: volume || 300000,
        true_unit_cost_usd: unitCostUSD || 0.04609,
        breakdown: context.breakdownSnapshot || {},
        processes: context.processSnapshot || {},
      };
    } else if (module === 'pricing' || route.includes('/pricing')) {
      domainData = {
        sku: sku || 'CUP-12OZ-SW',
        market: market || 'BR',
        volume: volume || 300000,
        true_unit_cost_usd: unitCostUSD || 0.04609,
        market_benchmark_usd: benchmarkUSD || 0.0490,
        competitive_gap_percent: gapPercent !== undefined ? gapPercent : -5.94,
        margin_at_benchmark_percent:
          benchmarkUSD && unitCostUSD
            ? Number((((benchmarkUSD - unitCostUSD) / benchmarkUSD) * 100).toFixed(2))
            : 5.94,
        rfq_data: context.rfqSnapshot || {},
      };
    } else if (module === 'rfq' || route.includes('/rfq')) {
      domainData = {
        market: market || 'BR',
        rfq_info: context.rfqSnapshot || {},
        benchmark_usd: benchmarkUSD,
      };
    } else if (module === 'visibility' || route.includes('/visibility')) {
      domainData = {
        market: market || 'BR',
        visibility: context.visibilitySnapshot || {},
      };
    } else {
      // General overview
      domainData = {
        sku,
        market,
        unitCostUSD,
        benchmarkUSD,
        gapPercent,
      };
    }

    const systemPrompt = `Eres NIU Copilot, el copiloto analítico y comercial interno de NIUPACK (Gardiner S.A.).
Tu propósito es asesorar a la dirección general y al equipo de operaciones sobre costos industriales, fijación de precios (pricing), competitividad y posicionamiento B2B.

REGLAS DE RESPUESTA ESTRICTAS:
1. Sé NUMÉRICO, PRECISO y CONCISO. Si tienes datos en el contexto, úsalos para hacer cálculos aritméticos exactos (impacto en centavos de dólar y en lotes totales).
2. NUNCA asumas ni inventes datos que no están en el contexto. Si falta un dato específico para responder con certeza, indica exactamente qué dato falta.
3. Sé transparente con los supuestos. Explica brevemente la fórmula utilizada.
4. Tono: Ejecutivo, industrial, directo, sin introducciones vacías, sin emojis innecesarios, sin 'AI slop'.
5. Si detectas una oportunidad o el usuario pide simular algo, responde con la explicación numérica y además propone una ACCIÓN EJECUTABLE en el bloque de acciones para que el usuario pueda confirmar y aplicar en la app.

FORMATO DE ACCIONES SUGERIDAS:
Si corresponde sugerir una acción ejecutable, incluye al final de tu respuesta un bloque JSON estricto con el tag [PROPOSED_ACTIONS]:
[PROPOSED_ACTIONS]
[
  {
    "action_type": "SIMULATE_WASTE" | "CHANGE_VOLUME" | "SWITCH_MARKET" | "NAVIGATE" | "CREATE_SCENARIO" | "CALCULATE_CAPEX" | "APPLY_PRICE_TARGET",
    "label": "Texto corto y claro de la acción",
    "payload": { ...parámetros a aplicar... }
  }
]
[/PROPOSED_ACTIONS]
`;

    const userMessage = `PANTALLA ACTUAL: ${route} (Módulo: ${module})
CONTEXTO ACTIVO DEL OS:
${JSON.stringify(domainData, null, 2)}

PREGUNTA DEL USUARIO:
${question}`;

    return {
      systemPrompt,
      userMessage,
      condensedContext: domainData,
    };
  }

  /**
   * Deterministic local fallback generator when OpenAI key is not set or network is offline
   */
  public static generateLocalAnalysis(
    question: string,
    context: CopilotScreenContext
  ): { text: string; proposedActions: CopilotAction[] } {
    const q = question.toLowerCase();
    const cost = context.unitCostUSD || 0.04609;
    const bench = context.benchmarkUSD || 0.0490;
    const vol = context.volume || 300000;
    const breakdown = context.breakdownSnapshot || {};

    let text = '';
    const proposedActions: CopilotAction[] = [];

    if (q.includes('merma') || q.includes('waste')) {
      const currentScrapCost = breakdown.cost_scrap_usd || 0.00186;
      // If user asks about reducing scrap from 6.5% to 4%
      const newScrapCost = Number((currentScrapCost * (4.0 / 6.5)).toFixed(5));
      const unitSaving = Number((currentScrapCost - newScrapCost).toFixed(5));
      const batchSaving = Number((unitSaving * vol).toFixed(2));
      const annualSaving = Number((unitSaving * 20_000_000).toFixed(2));
      const newCost = Number((cost - unitSaving).toFixed(5));

      text = `Análisis numérico con los datos reales del OS:

• Costo unitario actual: USD ${cost.toFixed(5)}
• Merma base registrada: 6.5% (Costo asociado: USD ${currentScrapCost.toFixed(5)}/u)
• Merma simulada: 4.0% (-2.5 pp)

Resultados del impacto:
1. Nuevo costo unitario estimado: USD ${newCost.toFixed(5)}
2. Ahorro unitario directo: USD ${unitSaving.toFixed(5)}/u (-${((unitSaving / cost) * 100).toFixed(1)}% del costo)
3. Ahorro en el lote actual (${vol.toLocaleString()} u): USD ${batchSaving.toLocaleString()}
4. Impacto anualizado (20M u/año): USD ${annualSaving.toLocaleString()}

Supuesto: El porcentaje de merma se calcula sobre la materia prima directa (cono + culito).`;

      proposedActions.push({
        id: `act-${Date.now()}-1`,
        action_type: 'SIMULATE_WASTE',
        label: 'Aplicar Merma 4.0% en Simulador',
        payload: { scrapRatePercent: 4.0 },
        status: 'PROPOSED',
      });
    } else if (q.includes('pesa más') || q.includes('variable') || q.includes('mayor impacto')) {
      text = `Desglose de peso en la estructura de costo para ${context.sku || 'CUP-12OZ-SW'}:

1. Papel del Cono (Cuerpo): ~55.2% del costo total (Impacto mayor).
2. Costos Operativos (Mano de obra + Energía + Planta): ~11.7%.
3. Impresión y Troquelado Tercerizado: ~9.8%.
4. Fondo ('Culito'): ~8.4%.
5. Depreciación de Maquinaria: ~7.6%.
6. Merma de Proceso (6.5%): ~4.0%.
7. Empaque (Cajas/Bolsas): ~3.3%.

Conclusión accionable: La mayor palanca de reducción no está en los insumos menores, sino en la eficiencia geométrica del corte de papel (pliego 900×1000 vs 750×1000) y en la internalización de impresión/troquelado.`;

      proposedActions.push({
        id: `act-${Date.now()}-2`,
        action_type: 'NAVIGATE',
        label: 'Ir a Estrategias de Precio & Escenarios',
        payload: { targetRoute: '/pricing/strategy' },
        status: 'PROPOSED',
      });
    } else if (q.includes('margen') || q.includes('12%') || q.includes('10%') || q.includes('15%')) {
      const margin = q.includes('10%') ? 0.10 : q.includes('12%') ? 0.12 : 0.15;
      const targetPrice = Number((cost / (1 - margin)).toFixed(4));
      const marginUSD = Number((targetPrice - cost).toFixed(4));
      const gapVsBenchmark = bench > 0 ? Number((((targetPrice - bench) / bench) * 100).toFixed(2)) : 0;

      text = `Cálculo de precio para un margen objetivo del ${(margin * 100).toFixed(0)}%:

• Costo unitario real: USD ${cost.toFixed(5)}
• Fórmula aplicada: Precio = Costo / (1 - Margen) = ${cost.toFixed(5)} / ${(1 - margin).toFixed(2)}
• Precio sugerido: USD ${targetPrice.toFixed(4)} por unidad
• Margen neto unitario: USD ${marginUSD.toFixed(4)}/u
• Posición vs Benchmark Brasil (USD ${bench.toFixed(4)}): ${gapVsBenchmark > 0 ? `+${gapVsBenchmark}% (sobre benchmark)` : `${gapVsBenchmark}% (más competitivo)`}

Ganancia neta esperada en lote de ${vol.toLocaleString()} u: USD ${(marginUSD * vol).toFixed(2)}.`;

      proposedActions.push({
        id: `act-${Date.now()}-3`,
        action_type: 'APPLY_PRICE_TARGET',
        label: `Fijar Precio Objetivo a USD ${targetPrice.toFixed(4)} (${(margin * 100).toFixed(0)}% Margen)`,
        payload: { targetPriceUSD: targetPrice, targetMarginPercent: margin * 100 },
        status: 'PROPOSED',
      });
    } else if (q.includes('500.000') || q.includes('500k') || q.includes('volumen')) {
      const scaleCost = Number((cost * 0.965).toFixed(5)); // ~3.5% scale saving on fixed operating setup
      const savingUnit = Number((cost - scaleCost).toFixed(5));

      text = `Simulación de escala al pasar a 500.000 unidades:

• Costo unitario actual (${vol.toLocaleString()} u): USD ${cost.toFixed(5)}
• Costo unitario proyectado (500.000 u): USD ${scaleCost.toFixed(5)}
• Ahorro unitario por absorción de costos fijos de preparación: USD ${savingUnit.toFixed(5)}/u
• Costo total de producción del lote: USD ${(scaleCost * 500_000).toLocaleString()}

Impacto comercial: Permite ofrecer un precio escala de USD ${(scaleCost / 0.88).toFixed(4)} manteniendo 12% de margen y quedando por debajo del benchmark de Brasil.`;

      proposedActions.push({
        id: `act-${Date.now()}-4`,
        action_type: 'CHANGE_VOLUME',
        label: 'Fijar Volumen a 500.000 unidades',
        payload: { newVolume: 500000 },
        status: 'PROPOSED',
      });
    } else {
      // Default contextual response
      text = `Datos contextuales activos en pantalla:

• SKU: ${context.sku || 'CUP-12OZ-SW'}
• Mercado: ${context.market || 'BR'}
• Costo Unitario Real: USD ${cost.toFixed(5)}
• Benchmark Mercado: USD ${bench.toFixed(4)}
• Brecha Competitiva: ${((cost - bench) / bench * 100).toFixed(2)}%

Podés preguntarme sobre:
1. Impacto de variar la merma de materia prima.
2. Comparación entre pliego 900x1000 vs 750x1000 (banda ancha).
3. Precios sugeridos por margen objetivo (10%, 12%, 15%).
4. Inversión CAPEX y punto de equilibrio para comprar impresora flexo propia.`;

      proposedActions.push({
        id: `act-${Date.now()}-5`,
        action_type: 'NAVIGATE',
        label: 'Comparar Escenarios en Pricing Strategy',
        payload: { targetRoute: '/pricing/strategy' },
        status: 'PROPOSED',
      });
    }

    return { text, proposedActions };
  }
}
