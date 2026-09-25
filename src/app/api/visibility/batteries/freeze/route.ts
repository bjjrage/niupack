import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function GET() {
  try {
    const batteries = await repository.getBatteries();
    return NextResponse.json({ batteries });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, code, queryIds } = await req.json();
    const org = await repository.getOrganization();

    const created = await repository.createBattery({
      organization_id: org.id,
      name: name || 'Batería Congelada',
      code: code || `BATTERY_V_${Date.now()}`,
      version: 1,
      is_frozen: true,
      frozen_at: new Date().toISOString(),
      query_count: queryIds?.length || 0,
      market_codes: ['BR', 'AR', 'BO', 'PY'],
      status: 'FROZEN',
    });

    if (queryIds && Array.isArray(queryIds)) {
      for (const qid of queryIds) {
        await repository.updateQuery(qid, {
          battery_id: created.id,
          is_fixed: true,
          status: 'ACTIVE',
        });
      }
    }

    return NextResponse.json({ battery: created });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
