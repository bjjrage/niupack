import { JobRun, JobType } from '@/types';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { VisibilityEngine } from '@/lib/engines/visibility-engine';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { TrueCostEngine } from '@/lib/engines/true-cost-engine';

export class JobRunner {
  private static activeJobs = new Map<string, boolean>();

  /**
   * Enqueue or execute a persistent job
   */
  public static async executeJob(
    jobType: JobType,
    payload: Record<string, any>,
    idempotencyKey?: string
  ): Promise<JobRun> {
    const org = await repository.getOrganization();

    // Check existing job with idempotency key
    if (idempotencyKey) {
      const existing = await repository.getJobByIdempotencyKey(idempotencyKey);
      if (existing && existing.status === 'COMPLETED') {
        return existing;
      }
    }

    const job = await repository.createJob({
      organization_id: org.id,
      job_type: jobType,
      status: 'PENDING',
      progress_percent: 0,
      retries: 0,
      max_retries: 3,
      idempotency_key: idempotencyKey,
      payload,
    });

    // Execute asynchronously or synchronously depending on context
    this.runJobProcess(job.id).catch((err) => {
      console.error(`Error in job ${job.id}:`, err);
    });

    return job;
  }

  /**
   * Internal job processor handling bounded concurrency and checkpointing
   */
  private static async runJobProcess(jobId: string): Promise<void> {
    const job = await repository.getJob(jobId);
    if (!job) return;

    this.activeJobs.set(jobId, true);
    await repository.updateJob(jobId, {
      status: 'RUNNING',
      started_at: new Date().toISOString(),
    });

    try {
      let result: Record<string, any> = {};

      switch (job.job_type) {
        case 'generate_query_battery': {
          const { count, markets, batteryId, skus } = job.payload;
          const brand = await repository.getBrand();

          const generated = await OpenAIService.generateQueries({
            brand: brand.name,
            description: brand.description || '',
            products: ['Vasos de Polipapel'],
            skus: skus || ['CUP-12OZ-SW'],
            markets: markets || ['BR', 'AR', 'BO'],
            count: count || 100,
            languages: ['pt', 'es'],
          });

          // Save queries to repository
          const createdQueries = await repository.addQueries(
            generated.map((q) => ({
              battery_id: batteryId,
              organization_id: job.organization_id,
              text: q.text,
              language: q.language,
              country_code: q.country_code,
              city_context: q.city_context,
              intent: q.intent,
              category: q.category,
              sku: q.sku,
              buyer_persona: q.buyer_persona,
              commercial_priority: q.commercial_priority,
              generated_by: 'AI',
              is_fixed: false,
              version: 1,
              status: 'PROPOSED',
            }))
          );

          result = { generated_count: createdQueries.length };
          break;
        }

        case 'execute_visibility_run': {
          const { runId, batteryId, queryIds, concurrencyLimit = 5 } = job.payload;
          const queries = await repository.getQueries(batteryId);
          const targetQueries = queryIds ? queries.filter((q) => queryIds.includes(q.id)) : queries;

          const total = targetQueries.length;
          let executed = 0;
          let successful = 0;
          let failed = 0;
          let totalCost = 0;

          // Check budget before proceeding
          const costEst = OpenAIService.estimateVisibilityRunCost(total);
          const budgetCheck = await OpenAIService.checkBudget(costEst.estimatedCostUSD);
          if (!budgetCheck.allowed) {
            throw new Error(`Budget constraint violated: ${budgetCheck.reason}`);
          }

          // Process in bounded concurrency batches with checkpoints
          for (let i = 0; i < total; i += concurrencyLimit) {
            // Check if paused or cancelled
            if (!this.activeJobs.get(jobId)) {
              await repository.updateJob(jobId, { status: 'PAUSED' });
              return;
            }

            const batch = targetQueries.slice(i, i + concurrencyLimit);
            const batchPromises = batch.map(async (query) => {
              try {
                const execResult = await OpenAIService.executeVisibilityQuery({
                  query: query.text,
                  country_code: query.country_code,
                  city: query.city_context,
                });

                // Analyze result
                const analysis = await OpenAIService.analyzeVisibility({
                  query: query.text,
                  country_code: query.country_code,
                  raw_response: execResult.raw_response,
                  sources: execResult.sources,
                });

                // Save result
                const savedResult = await repository.addQueryResult({
                  run_id: runId,
                  query_id: query.id,
                  organization_id: job.organization_id,
                  country_code: query.country_code,
                  model: 'gpt-4o',
                  raw_prompt: query.text,
                  raw_response: execResult.raw_response,
                  sources_json: execResult.sources,
                  search_queries_json: execResult.search_queries,
                  tokens_input: execResult.tokens_input,
                  tokens_output: execResult.tokens_output,
                  total_tokens: execResult.total_tokens,
                  cost_usd: execResult.cost_usd,
                  latency_ms: execResult.latency_ms,
                });

                // Save mention analysis
                await repository.addMentionAnalysis({
                  result_id: savedResult.id,
                  query_id: query.id,
                  organization_id: job.organization_id,
                  niupack_mentioned: analysis.niupack_mentioned,
                  niupack_linked: analysis.niupack_linked,
                  niupack_as_source: analysis.niupack_as_source,
                  mention_count: analysis.mention_count,
                  position: analysis.position,
                  sentiment_accuracy: analysis.sentiment_accuracy,
                  confidence_score: analysis.confidence_score,
                  analysis_notes: analysis.analysis_notes,
                  competitors: analysis.competitors,
                  sources: analysis.sources,
                });

                return { success: true, cost: execResult.cost_usd };
              } catch (err) {
                return { success: false, cost: 0, error: (err as Error).message };
              }
            });

            const batchResults = await Promise.all(batchPromises);
            for (const res of batchResults) {
              executed++;
              if (res.success) {
                successful++;
                totalCost += res.cost;
              } else {
                failed++;
              }
            }

            // Checkpoint update
            const progress = Math.round((executed / total) * 100);
            await repository.updateJob(jobId, {
              progress_percent: progress,
            });

            await repository.updateRun(runId, {
              executed_queries: executed,
              successful_queries: successful,
              failed_queries: failed,
              actual_cost_usd: Number(totalCost.toFixed(4)),
            });
          }

          // Complete Run
          await repository.updateRun(runId, {
            status: 'COMPLETED',
            completed_at: new Date().toISOString(),
          });

          // Create visibility snapshot
          const mentions = await repository.getMentions();
          const metrics = VisibilityEngine.calculateScore(mentions);
          await repository.addSnapshot({
            organization_id: job.organization_id,
            battery_id: batteryId,
            run_id: runId,
            snapshot_day: 'DAY_1',
            market_code: 'TOTAL',
            overall_score: metrics.overallScore,
            mention_rate: metrics.mentionRate,
            link_rate: metrics.linkRate,
            source_rate: metrics.sourceRate,
            won_queries_count: metrics.wonCount,
            lost_queries_count: metrics.lostCount,
            total_queries: metrics.totalQueries,
            competitor_share_json: metrics.competitorShare,
            top_sources_json: metrics.topSources,
            captured_at: new Date().toISOString(),
          });

          result = { executed, successful, failed, totalCost };
          break;
        }

        case 'recalculate_market_benchmark': {
          const prices = await repository.getMarketPrices();
          const skus = (await repository.getSKUs()).map((s) => s.sku);
          const benchmarks = MarketBenchmarkEngine.calculateAllBenchmarks(prices, skus, ['BR', 'AR', 'BO', 'PY']);
          result = { benchmarks_count: benchmarks.length, benchmarks };
          break;
        }

        case 'recalculate_cost_sheet': {
          const { costSheetId } = job.payload;
          const sheet = await repository.getCostSheet(costSheetId);
          if (sheet && sheet.components) {
            const breakdown = TrueCostEngine.calculateCostSheet(sheet.components, sheet.batch_size);
            sheet.true_unit_cost_usd = breakdown.trueUnitCostUSD;
            sheet.minimum_sustainable_price_usd = breakdown.minimumSustainablePriceUSD;
            sheet.break_even_units = breakdown.breakEvenUnits;
            await repository.saveCostSheet(sheet);
            result = { true_unit_cost_usd: breakdown.trueUnitCostUSD };
          }
          break;
        }

        case 'discover_suppliers': {
          const { country_code = 'BR', category = 'cups' } = job.payload;
          const discovered = await OpenAIService.discoverSuppliers({
            country_code,
            product_category: category,
          });

          for (const s of discovered) {
            await repository.addSupplier({
              organization_id: job.organization_id,
              name: s.name,
              country_code: s.country_code,
              city: s.city,
              website: s.website,
              email: s.email,
              status: 'DISCOVERED',
              discovery_source: 'OPENAI_SEARCH',
              discovery_evidence: s.evidence,
            });
          }

          result = { discovered_count: discovered.length };
          break;
        }

        default:
          result = { message: `Job ${job.job_type} executed successfully` };
      }

      await repository.updateJob(jobId, {
        status: 'COMPLETED',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        result: result,
      });
    } catch (err) {
      await repository.updateJob(jobId, {
        status: 'FAILED',
        last_error: (err as Error).message,
        retries: job.retries + 1,
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  public static pauseJob(jobId: string): void {
    this.activeJobs.set(jobId, false);
  }
}
