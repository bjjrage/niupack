import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';
import { taskUpdateSchema } from '@/lib/crm/validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const input = taskUpdateSchema.parse(await request.json());
    const task = await crmService.updateTask(id, identity.organizationId, input as never, identity.profileId);
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'TASK_NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    return authErrorResponse(error);
  }
}
