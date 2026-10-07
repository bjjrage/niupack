import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';
import { deletionErrorResponse } from '../deletion-response';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const id = z.string().uuid().parse((await params).id);
    const result = await crmService.deleteCompany(identity.organizationId, id);
    if (result.status === 'NOT_FOUND') return NextResponse.json({ error: 'COMPANY_NOT_FOUND' }, { status: 404 });
    if (!result.deleted) {
      return NextResponse.json({ error: 'ACCOUNT_HAS_BUSINESS_DATA', ...result }, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (error) { return deletionErrorResponse(error); }
}
