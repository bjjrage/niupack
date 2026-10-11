import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { fileResponse } from '@/lib/print-rfq/file-response';
import { readFile } from '@/lib/print-rfq/service';

/** Descarga arte o presupuestos de la organización de la sesión. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const { id } = await context.params;
    const file = await readFile(identity.organizationId, z.string().uuid().parse(id));
    return file ? fileResponse(file) : NextResponse.json({ error: 'FILE_NOT_FOUND' }, { status: 404 });
  } catch (error) { return domainErrorResponse(error); }
}
