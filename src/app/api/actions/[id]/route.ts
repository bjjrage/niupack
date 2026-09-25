import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await repository.updateAction(id, body);
    return NextResponse.json({ action: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
