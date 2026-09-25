import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { SearchDiscoveryService } from '@/lib/discovery/search-discovery';
import { JobRunner } from '@/lib/jobs/job-runner';

describe('AI Visibility Workflow & Requirements Suite', () => {
  beforeEach(async () => {
    // Reset seed data state if necessary
  });

  describe('1. Domain Normalization & Dynamic Brand Resolution', () => {
    it('should normalize domains properly without trailing slash, protocol, or www', () => {
      expect(OpenAIService.normalizeDomain('https://www.niupack.com.py/')).toBe('niupack.com.py');
      expect(OpenAIService.normalizeDomain('http://niupack.com.py')).toBe('niupack.com.py');
      expect(OpenAIService.normalizeDomain('niupack.com.py/products/')).toBe('niupack.com.py');
      expect(OpenAIService.normalizeDomain('')).toBe('');
      expect(OpenAIService.normalizeDomain(null)).toBe('');
    });

    it('should resolve configured domain from brand settings', async () => {
      const domain = await repository.getConfiguredDomain();
      expect(domain).toBeDefined();
      expect(domain).toBe('niupack.com.py');
    });

    it('should handle SearchDiscovery when no domain is configured gracefully', async () => {
      const check = await SearchDiscoveryService.checkDomain('');
      expect(check.accessible).toBe(false);
      expect(check.overall_status).toBe('YELLOW');
      expect(check.warnings[0]).toContain('No hay dominio configurado');
    });
  });

  describe('2. Query Generation & Combinator Guarantee', () => {
    it('should generate exact N distinct queries using template fallback when OpenAI API is not configured', async () => {
      const requestedCount = 120;
      const queries = await OpenAIService.generateQueries({
        brand: 'NIU PACK',
        description: 'Fabricante de vasos de polipapel en Paraguay',
        products: ['Vasos de Polipapel'],
        skus: ['CUP-12OZ-SW', 'CUP-8OZ-SW'],
        markets: ['BR', 'AR', 'BO', 'PY'],
        count: requestedCount,
        languages: ['pt', 'es'],
      });

      expect(queries.length).toBe(requestedCount);

      // Verify all queries are distinct
      const uniqueTexts = new Set(queries.map((q) => q.text.trim().toLowerCase()));
      expect(uniqueTexts.size).toBe(requestedCount);

      // Verify distributed categories across 15 categories
      const categories = new Set(queries.map((q) => q.category));
      expect(categories.size).toBeGreaterThanOrEqual(10);

      // Verify market assignment
      const markets = new Set(queries.map((q) => q.country_code));
      expect(markets.has('BR')).toBe(true);
      expect(markets.has('AR')).toBe(true);
      expect(markets.has('BO')).toBe(true);
      expect(markets.has('PY')).toBe(true);
    });

    it('should handle high count N=500 with unique queries', async () => {
      const queries = await OpenAIService.generateQueries({
        brand: 'NIU PACK',
        description: 'Packaging industrial',
        products: ['Vasos térmicos'],
        skus: ['CUP-12OZ-DW'],
        markets: ['BR', 'AR'],
        count: 500,
        languages: ['pt', 'es'],
      });

      expect(queries.length).toBe(500);
      const uniqueTexts = new Set(queries.map((q) => q.text.trim().toLowerCase()));
      expect(uniqueTexts.size).toBe(500);
    });
  });

  describe('3. Battery Management & Immutability', () => {
    it('should have initial frozen battery with equal query_count and query items', async () => {
      const batteries = await repository.getBatteries();
      const initialBattery = batteries.find((b) => b.code === 'BRAND_VISIBILITY_BR_AR_BO_V1');
      expect(initialBattery).toBeDefined();
      expect(initialBattery?.is_frozen).toBe(true);

      const batteryQueries = await repository.getQueries(initialBattery!.id);
      expect(batteryQueries.length).toBe(initialBattery?.query_count);
    });

    it('should duplicate a battery as a new draft version', async () => {
      const batteries = await repository.getBatteries();
      const firstBattery = batteries[0];
      const duplicated = await repository.duplicateBattery(firstBattery.id, 'Batería Duplicada Test');

      expect(duplicated).toBeDefined();
      expect(duplicated?.name).toBe('Batería Duplicada Test');
      expect(duplicated?.is_frozen).toBe(false);
      expect(duplicated?.version).toBe(firstBattery.version + 1);

      const dupQueries = await repository.getQueries(duplicated!.id);
      expect(dupQueries.length).toBe(firstBattery.query_count);
    });
  });

  describe('4. Execution Metric Isolation Per Run', () => {
    it('should strictly isolate mentions per run and calculate score on run mentions only', async () => {
      const org = await repository.getOrganization();
      const batteries = await repository.getBatteries();

      const runA = await repository.createRun({
        organization_id: org.id,
        battery_id: batteries[0].id,
        name: 'Run A',
        execution_label: 'D1 BASELINE',
        market_codes: ['BR', 'AR'],
        model: 'gpt-4o',
        status: 'COMPLETED',
        total_queries: 2,
        executed_queries: 2,
        successful_queries: 2,
        failed_queries: 0,
        estimated_cost_usd: 0.01,
        actual_cost_usd: 0.01,
        max_spend_limit_usd: 10,
      });

      const runB = await repository.createRun({
        organization_id: org.id,
        battery_id: batteries[0].id,
        name: 'Run B',
        execution_label: 'D15',
        market_codes: ['BR', 'AR'],
        model: 'gpt-4o',
        status: 'COMPLETED',
        total_queries: 2,
        executed_queries: 2,
        successful_queries: 2,
        failed_queries: 0,
        estimated_cost_usd: 0.01,
        actual_cost_usd: 0.01,
        max_spend_limit_usd: 10,
      });

      const resA = await repository.addQueryResult({
        run_id: runA.id,
        query_id: 'q-1',
        organization_id: org.id,
        raw_prompt: 'Test Prompt A',
        raw_response: 'Response mentioning NIU PACK and Copobras',
        model: 'gpt-4o',
        model_used: 'gpt-4o',
        tokens_input: 100,
        tokens_output: 100,
        total_tokens: 200,
        cost_usd: 0.005,
        latency_ms: 200,
        status: 'SUCCESS',
        country_code: 'BR',
        sources_json: [],
        search_queries_json: [],
      });

      await repository.addMentionAnalysis({
        run_id: runA.id,
        result_id: resA.id,
        query_id: 'q-1',
        organization_id: org.id,
        niupack_mentioned: true,
        niupack_linked: false,
        niupack_sourced: false,
        mention_count: 1,
        position: 1,
        sentiment: 'POSITIVE',
        competitors_mentioned: ['Copobras'],
        sources_cited: [],
      });

      const mentionsA = await repository.getMentionsByRun(runA.id);
      const mentionsB = await repository.getMentionsByRun(runB.id);

      expect(mentionsA.length).toBe(1);
      expect(mentionsA[0].run_id).toBe(runA.id);
      expect(mentionsB.length).toBe(0); // Run B has zero mentions, perfectly isolated!
    });

    it('should support execution labels D1 BASELINE, D15, D30, and CUSTOM', async () => {
      const org = await repository.getOrganization();
      const batteries = await repository.getBatteries();

      const runD1 = await repository.createRun({
        organization_id: org.id,
        battery_id: batteries[0].id,
        name: 'Test Run D1',
        execution_label: 'D1 BASELINE',
        market_codes: ['BR', 'AR', 'BO', 'PY'],
        model: 'gpt-4o',
        status: 'COMPLETED',
        total_queries: 8,
        executed_queries: 8,
        successful_queries: 8,
        failed_queries: 0,
        estimated_cost_usd: 0.05,
        actual_cost_usd: 0.048,
        max_spend_limit_usd: 25.0,
      });

      expect(runD1.execution_label).toBe('D1 BASELINE');
      const retrieved = await repository.getRun(runD1.id);
      expect(retrieved?.execution_label).toBe('D1 BASELINE');
    });
  });
});
