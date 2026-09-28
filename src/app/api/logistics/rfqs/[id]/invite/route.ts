import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createMagicToken } from '@/lib/logistics/security';
import { logisticsRepository } from '@/lib/logistics/repository';
import { SMTPService } from '@/lib/email/smtp-service';
import { logisticsAuthErrorResponse, requireLogisticsIdentity } from '@/lib/auth/logistics-auth';

const schema = z.object({ supplierIds: z.array(z.string().uuid()).min(1) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const identity = await requireLogisticsIdentity();
    const { supplierIds } = schema.parse(await request.json());
    const rfq = await logisticsRepository.getRfq(id, identity.organizationId);
    if (!rfq) return NextResponse.json({ error: 'RFQ_NOT_FOUND' }, { status: 404 });
    if (new Date(rfq.quote_deadline).getTime() <= Date.now()) return NextResponse.json({ error: 'RFQ_DEADLINE_EXPIRED' }, { status: 409 });
    const suppliers = await logisticsRepository.listProviders(identity.organizationId);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const emailConfigured = await SMTPService.isConfigured();
    const invitations = [];

    for (const supplierId of supplierIds) {
      const supplier = suppliers.find((item) => item.id === supplierId);
      if (!supplier) continue;
      const { token, hash } = createMagicToken();
      const invitation = await logisticsRepository.createInvitation({
        organization_id: rfq.organization_id, rfq_id: rfq.id, supplier_id: supplier.id, token_hash: hash,
        status: 'PENDING', expires_at: rfq.quote_deadline, email_status: emailConfigured ? 'SEND_FAILED' : 'EMAIL_NOT_CONFIGURED',
      });
      const magicLink = `${baseUrl}/logistics/quote/${token}`;
      let emailStatus = invitation.email_status;
      if (emailConfigured && supplier.email) {
        const sent = await SMTPService.sendMail({
          to: supplier.email,
          subject: `NIUPACK solicita cotización de transporte — ${rfq.code}`,
          text: `Origen: ${rfq.origin_city}, ${rfq.origin_country}\nDestino: ${rfq.destination_city}, ${rfq.destination_country}\nCarga: ${rfq.cargo_description}\nFecha: ${rfq.pickup_date}\nDeadline: ${rfq.quote_deadline}\n\nCotizar: ${magicLink}`,
        });
        emailStatus = sent.success ? 'SENT' : 'SEND_FAILED';
        await logisticsRepository.updateInvitation(invitation.id, { email_status: emailStatus });
      }
      invitations.push({ ...invitation, email_status: emailStatus, supplier_name: supplier.name, magic_link: magicLink });
      await logisticsRepository.logAuditEvent({ organization_id: identity.organizationId, actor_id: identity.profileId, event_type: emailStatus === 'SENT' ? 'INVITATION_SENT' : 'INVITATION_CREATED', target_entity: 'logistics_rfq_invitations', entity_id: invitation.id, metadata: { rfq_id: rfq.id, supplier_id: supplier.id, email_status: emailStatus } });
    }
    await logisticsRepository.updateRfq(rfq.id, { status: 'OPEN' }, identity.organizationId);
    return NextResponse.json({ invitations, email: emailConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED' });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return logisticsAuthErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, { status: 400 });
  }
}
