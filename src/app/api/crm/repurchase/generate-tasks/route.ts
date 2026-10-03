import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

/** Genera tareas de recompra idempotentes (manual; cron-ready). */
export async function POST() {
  try {
    const identity = await requireNiuIdentity();
    const result = await purchaseService.generateTasks(identity.organizationId, identity.profileId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
