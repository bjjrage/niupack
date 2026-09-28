import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const newName = body.name;

    const duplicated = await repository.duplicateBattery(id, newName);
    if (!duplicated) {
      return NextResponse.json({ error: 'Batería no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ battery: duplicated });
  } catch {
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
