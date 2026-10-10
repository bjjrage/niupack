import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { publicBaseUrl, smtpMailer } from '@/lib/rfq/mailer';
import { prepareInvitations, prepareInvitationsSchema, sendInvitations } from '@/lib/rfq/service';

const bodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('prepare') }).merge(prepareInvitationsSchema),
  z.object({ mode: z.literal('send'), dispatch_ids: z.array(z.string().uuid()).min(1).max(30), confirm: z.boolean() }),
]);

/**
 * Invitaciones por proveedor en dos pasos:
 *  - prepare: genera el enlace seguro y el correo; no envía nada.
 *  - send: requiere confirm=true; solo marca ENVIADO lo que el servidor de correo aceptó de verdad.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const rfqId = z.string().uuid().parse((await context.params).id);
    const body = bodySchema.parse(await request.json());
    if (body.mode === 'prepare') {
      const results = await prepareInvitations(identity.organizationId, identity.profileId, rfqId, body, publicBaseUrl(request));
      return NextResponse.json({ invitations: results });
    }
    const outcomes = await sendInvitations(identity.organizationId, identity.profileId, rfqId, body.dispatch_ids, body.confirm, smtpMailer);
    const failed = outcomes.filter((o) => o.status === 'FAILED').length;
    return NextResponse.json({ outcomes, sent: outcomes.filter((o) => o.status === 'SENT').length, failed }, { status: failed > 0 ? 207 : 200 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
