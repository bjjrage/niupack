import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { setTendersDismissed } from '@/lib/licitaciones/scanner';

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(300), dismissed: z.boolean().default(true) });

/** Descarta del tablero (o restaura) licitaciones. El dato se conserva y el escaneo diario no las vuelve a mostrar. */
export async function POST(request: Request) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { ids, dismissed } = bodySchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ changed: await setTendersDismissed(identity.organizationId, [...new Set(ids)], dismissed) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
