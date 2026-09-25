import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '@/lib/copilot/context-builder';
import { CopilotScreenContext } from '@/types';

describe('ContextBuilder & NIU Copilot Engine', () => {
  it('builds concise context without token bloat for Cost Intelligence screen', () => {
    const context: CopilotScreenContext = {
      route: '/cost/cost-sheets',
      module: 'cost',
      sku: 'CUP-12OZ-SW',
      volume: 300000,
      unitCostUSD: 0.04609,
      breakdownSnapshot: {
        cost_paper_cone_usd: 0.02545,
        cost_scrap_usd: 0.00186,
      },
    };

    const pkg = ContextBuilder.buildPrompt('¿Qué variable pesa más?', context);

    expect(pkg.systemPrompt).toContain('NIU Copilot');
    expect(pkg.userMessage).toContain('/cost/cost-sheets');
    expect(pkg.condensedContext.sku).toBe('CUP-12OZ-SW');
    expect(pkg.condensedContext.true_unit_cost_usd).toBe(0.04609);
    // Should NOT contain unrelated fields like visibility query batteries
    expect(pkg.condensedContext.visibility).toBeUndefined();
  });

  it('generates accurate deterministic numerical analysis for scrap reduction', () => {
    const context: CopilotScreenContext = {
      route: '/cost/pricing',
      module: 'cost',
      sku: 'CUP-12OZ-SW',
      volume: 300000,
      unitCostUSD: 0.04609,
      breakdownSnapshot: {
        cost_scrap_usd: 0.00186,
      },
    };

    const result = ContextBuilder.generateLocalAnalysis('¿Qué pasa si bajo la merma de 6,5% a 4%?', context);

    expect(result.text).toContain('Merma base registrada: 6.5%');
    expect(result.text).toContain('Merma simulada: 4.0%');
    expect(result.text).toContain('USD');
    expect(result.proposedActions).toHaveLength(1);
    expect(result.proposedActions[0].action_type).toBe('SIMULATE_WASTE');
    expect(result.proposedActions[0].payload.scrapRatePercent).toBe(4.0);
  });

  it('generates price calculation for target margin accurately', () => {
    const context: CopilotScreenContext = {
      route: '/pricing/strategy',
      module: 'pricing',
      sku: 'CUP-12OZ-SW',
      volume: 300000,
      unitCostUSD: 0.04609,
      benchmarkUSD: 0.0490,
    };

    const result = ContextBuilder.generateLocalAnalysis('¿Qué precio puedo ofrecer con 12% de margen?', context);

    // 0.04609 / 0.88 = ~0.05238
    expect(result.text).toContain('12%');
    expect(result.text).toContain('0.0524');
    expect(result.proposedActions[0].action_type).toBe('APPLY_PRICE_TARGET');
  });
});
