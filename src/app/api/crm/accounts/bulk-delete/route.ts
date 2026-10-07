import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';
import { accountDeleteBodySchema } from '@/lib/crm/account-deletion';
import { deletionErrorResponse } from '../deletion-response';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const body = accountDeleteBodySchema.parse(await request.json());
    return NextResponse.json(await crmService.bulkDeleteCompanies(identity.organizationId, body.company_ids));
  } catch (error) { return deletionErrorResponse(error); }
}
