import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { hashMagicToken } from '@/lib/logistics/security';
import { logisticsRepository } from '@/lib/logistics/repository';
import { logisticsQuoteSchema } from '@/lib/logistics/quote-schema';

async function resolve(token: string) {
  const invitation = await logisticsRepository.findInvitationByHash(hashMagicToken(token));
  if (!invitation) return { error: 'INVALID_TOKEN', status: 404 } as const;
  if (invitation.revoked_at || invitation.status === 'REVOKED') return { error: 'TOKEN_REVOKED', status: 410 } as const;
  if (invitation.status === 'RESPONDED') return { error: 'TOKEN_ALREADY_USED', status: 409 } as const;
  if (invitation.status === 'EXPIRED') return { error: 'TOKEN_EXPIRED', status: 410 } as const;
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    await logisticsRepository.updateInvitation(invitation.id, { status: 'EXPIRED' });
    return { error: 'TOKEN_EXPIRED', status: 410 } as const;
  }
  const rfq = await logisticsRepository.getRfq(invitation.rfq_id, invitation.organization_id);
  if (!rfq || rfq.organization_id !== invitation.organization_id) return { error: 'RFQ_NOT_FOUND', status: 404 } as const;
  return { invitation, rfq };
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const resolved = await resolve(token);
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    if (resolved.invitation.status === 'PENDING') {
      await logisticsRepository.updateInvitation(resolved.invitation.id, { status: 'OPENED', opened_at: new Date().toISOString() });
      await logisticsRepository.logAuditEvent({ organization_id: resolved.invitation.organization_id, event_type: 'INVITATION_OPENED', target_entity: 'logistics_rfq_invitations', entity_id: resolved.invitation.id, metadata: { rfq_id: resolved.rfq.id } });
    }
    return NextResponse.json({ rfq: resolved.rfq, expires_at: resolved.invitation.expires_at });
  } catch (error) {
    console.error('[logistics/public] invitation lookup failed', error);
    return NextResponse.json({ error: 'PUBLIC_QUOTE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const resolved = await resolve(token);
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const body = logisticsQuoteSchema.parse(await request.json());
    const componentKeys = ['pickup','origin_charges','main_freight','border_charges','destination_delivery','insurance','other_charges'] as const;
    const partial = componentKeys.some((key) => body[key] === undefined);
    const quote = await logisticsRepository.submitQuote({
      ...body, organization_id: resolved.invitation.organization_id, rfq_id: resolved.rfq.id,
      invitation_id: resolved.invitation.id, supplier_id: resolved.invitation.supplier_id,
      status: partial ? 'PARTIAL' : 'RECEIVED', normalized_total: body.currency === 'USD' ? body.quoted_total : undefined,
    });
    await logisticsRepository.updateInvitation(resolved.invitation.id, { status: 'RESPONDED', responded_at: new Date().toISOString() });
    const quotes = await logisticsRepository.listQuotes(resolved.rfq.id, resolved.invitation.organization_id);
    const invitations = await logisticsRepository.listInvitations(resolved.rfq.id, resolved.invitation.organization_id);
    await logisticsRepository.updateRfq(resolved.rfq.id, { status: quotes.length >= invitations.length ? 'CLOSED' : 'PARTIALLY_RESPONDED' }, resolved.invitation.organization_id);
    await logisticsRepository.logAuditEvent({ organization_id: resolved.invitation.organization_id, event_type: 'QUOTE_SUBMITTED', target_entity: 'logistics_rfq_quotes', entity_id: quote.id, metadata: { rfq_id: resolved.rfq.id, status: quote.status } });
    return NextResponse.json({ success: true, quote_id: quote.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'INVITATION_ALREADY_RESPONDED') {
      return NextResponse.json({ error: 'TOKEN_ALREADY_USED' }, { status: 409 });
    }
    console.error('[logistics/public] quote submission failed', error);
    return NextResponse.json({ error: 'PUBLIC_QUOTE_UNAVAILABLE' }, { status: 503 });
  }
}
