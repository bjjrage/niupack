import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { getScanSettings, listScanRuns, scanOrganization, setScanEnabled } from '@/lib/licitaciones/scanner';

export const maxDuration = 60;

/** Estado del escaneo diario: activación y últimas corridas. */
export async function GET() {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const [settings, runs] = await Promise.all([getScanSettings(identity.organizationId), listScanRuns(identity.organizationId)]);
    return NextResponse.json({ settings, runs, role: identity.role });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

/** "Escanear ahora": misma corrida que la diaria, a pedido de una persona de la organización. */
export async function POST() {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    return NextResponse.json(await scanOrganization(identity.organizationId, 'MANUAL', { budgetMs: 45_000 }));
  } catch (error) {
    return domainErrorResponse(error);
  }
}

/** Solo un administrador enciende o apaga el escaneo diario. */
export async function PUT(request: Request) {
  try {
    const identity = await requireIdentityWithRole(['admin']);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await request.json());
    return NextResponse.json(await setScanEnabled(identity.organizationId, identity.profileId, enabled));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
