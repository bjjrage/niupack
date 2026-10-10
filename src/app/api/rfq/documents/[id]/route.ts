import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { getDocumentContent } from '@/lib/rfq/service';

/** Descarga el documento original de la oferta (solo su organización). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const documentId = z.string().uuid().parse((await context.params).id);
    const doc = await getDocumentContent(identity.organizationId, documentId);
    return new NextResponse(new Uint8Array(doc.bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${doc.file_name.replace(/[^\w.\-]+/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
