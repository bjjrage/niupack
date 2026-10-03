import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';

/** Lista tenant-safe de vendedores (perfiles de la organización). Nunca expone otra org. */
export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const owners = await crmService.listOwners(identity.organizationId);
    return NextResponse.json({ owners, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const ownerSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
});

const ERROR_STATUS: Record<string, number> = { ADMIN_REQUIRED: 403, OWNER_EXISTS: 409, EMAIL_IN_USE: 409 };

/** Alta de vendedor en la organización del admin que llama. */
export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = ownerSchema.parse(await request.json());
    const owner = await crmService.createOwner(identity.organizationId, identity.profileId, input);
    return NextResponse.json({ owner }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && ERROR_STATUS[error.message]) return NextResponse.json({ error: error.message }, { status: ERROR_STATUS[error.message] });
    return authErrorResponse(error);
  }
}
