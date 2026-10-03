import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';

/** Cambia el control BOT/HUMAN/PAUSED de una conversación (vendedor toma / devuelve). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const input = z.object({ control: z.enum(['BOT', 'HUMAN', 'PAUSED']) }).parse(await request.json());
    const conversation = await crmService.setConversationControl(identity.organizationId, id, input.control, identity.profileId);
    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'CONVERSATION_NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    return authErrorResponse(error);
  }
}
