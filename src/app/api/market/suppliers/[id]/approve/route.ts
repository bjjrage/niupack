import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const updated = await repository.updateSupplier(id, {
      status: 'APPROVED_FOR_CONTACT',
    });

    await repository.logAuditEvent({
      event_type: 'rfq_approval',
      target_entity: 'suppliers',
      entity_id: id,
      metadata: { action: 'APPROVED_FOR_CONTACT', supplier: updated.name },
    });

    return NextResponse.json({ supplier: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
