import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { taskCreateSchema } from '@/lib/crm/validation';

export async function GET(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const tasks = await crmService.listTasks(identity.organizationId, status ?? undefined);
    return NextResponse.json({ tasks, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = taskCreateSchema.parse(await request.json());
    const task = await crmService.createTask(
      identity.organizationId,
      {
        title: input.title,
        description: input.description ?? null,
        lead_id: input.lead_id ?? null,
        opportunity_id: input.opportunity_id ?? null,
        company_id: input.company_id ?? null,
        assigned_to: input.assigned_to ?? identity.profileId,
        due_at: input.due_at ?? null,
        priority: input.priority ?? 'MEDIUM',
        source: input.source ?? 'CRM_UI',
        external_key: input.external_key ?? null,
      },
      identity.profileId,
    );
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    return authErrorResponse(error);
  }
}
