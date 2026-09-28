import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actionId, status } = body;

    if (!actionId || !status) {
      return NextResponse.json(
        { success: false, error: 'actionId y status requeridos' },
        { status: 400 }
      );
    }

    const updated = await repository.updateCopilotActionStatus(actionId, status);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Acción no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, action: updated });
  } catch {
    return NextResponse.json(
      { success: false, error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
