import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse } from '@/lib/auth/role-guard';
import { fileResponse } from '@/lib/print-rfq/file-response';
import { readFile, resolveInvitation } from '@/lib/print-rfq/service';

/** La imprenta descarga el arte de su solicitud con su propio enlace. */
export async function GET(_request: Request, context: { params: Promise<{ token: string; fileId: string }> }) {
  try {
    const { token, fileId } = await context.params;
    const invitation = await resolveInvitation(token);
    const file = await readFile(invitation.organization_id, z.string().uuid().parse(fileId), { rfqId: invitation.rfq_id, invitationId: invitation.id });
    if (!file || file.meta.kind !== 'ART') return NextResponse.json({ error: 'FILE_NOT_FOUND' }, { status: 404 });
    return fileResponse(file);
  } catch (error) { return domainErrorResponse(error); }
}
