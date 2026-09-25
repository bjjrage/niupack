import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { JobRunner } from '@/lib/jobs/job-runner';

export async function GET() {
  try {
    const runs = await repository.getRuns();
    return NextResponse.json({ runs });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { batteryId, markets = ['BR', 'AR', 'BO'], model = 'gpt-4o', maxSpendLimitUSD = 25.0 } = body;

    const org = await repository.getOrganization();
    const battery = await repository.getBattery(batteryId);
    const queries = await repository.getQueries(batteryId);

    const run = await repository.createRun({
      organization_id: org.id,
      battery_id: batteryId,
      name: `Run ${battery?.name || 'Visibilidad'} (${new Date().toLocaleDateString('es')})`,
      market_codes: markets,
      model,
      status: 'PENDING',
      total_queries: queries.length,
      executed_queries: 0,
      successful_queries: 0,
      failed_queries: 0,
      estimated_cost_usd: Number((queries.length * 0.007).toFixed(4)),
      actual_cost_usd: 0,
      max_spend_limit_usd: maxSpendLimitUSD,
    });

    // Enqueue background persistent execution job
    await JobRunner.executeJob(
      'execute_visibility_run',
      {
        runId: run.id,
        batteryId,
        concurrencyLimit: 4,
      },
      `run_${run.id}`
    );

    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
