import { NextResponse } from 'next/server';
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
