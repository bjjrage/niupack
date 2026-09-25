import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function GET() {
  try {
    const actions = await repository.getActions();
    return NextResponse.json({ actions });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const org = await repository.getOrganization();

    const created = await repository.addAction({
      organization_id: org.id,
      action_type: body.action_type || 'visibility_check',
      title: body.title,
      priority: body.priority || 'MEDIUM',
      evidence: body.evidence || '',
      recommended_action: body.recommended_action || '',
      owner: body.owner || 'Comercial NIUPACK',
      due_date: body.due_date,
      status: 'PENDING',
      market_code: body.market_code,
      sku: body.sku,
      related_object_id: body.related_object_id,
    });

    return NextResponse.json({ action: created });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
