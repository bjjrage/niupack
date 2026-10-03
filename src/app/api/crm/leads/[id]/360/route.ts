import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const view = await crmService.getLead360(identity.organizationId, id);
    if (!view) return NextResponse.json({ error: 'LEAD_NOT_FOUND' }, { status: 404 });
    return NextResponse.json(view);
  } catch (error) {
    return authErrorResponse(error);
  }
}
