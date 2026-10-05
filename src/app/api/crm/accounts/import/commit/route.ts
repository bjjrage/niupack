import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { commitAccountList } from '@/lib/crm/account-import';

const rowSchema = z.object({
  index: z.number().int().nonnegative(),
  company_name: z.string().min(1).max(200),
  contact_name: z.string().max(160).nullable(),
  phone: z.string().max(80).nullable(),
  email: z.string().max(200).nullable(),
  country_code: z.string().max(2).nullable(),
  city: z.string().max(120).nullable(),
  tax_id: z.string().max(80).nullable(),
  website: z.string().max(240).nullable(),
  errors: z.array(z.string()).max(10),
});

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const body = z.object({
      lifecycleStage: z.enum(['CUSTOMER', 'PROSPECT']),
      rows: z.array(rowSchema).max(2000),
    }).parse(await request.json());

    const result = await commitAccountList(identity.organizationId, {
      lifecycleStage: body.lifecycleStage,
      rows: body.rows,
      actorProfileId: identity.profileId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    return authErrorResponse(error);
  }
}
