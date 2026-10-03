import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { campaignsForConversations } from '@/lib/niupackbot/outreach/inbound';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const [conversations, leads] = await Promise.all([
      crmRepository.listConversations(identity.organizationId),
      crmRepository.listLeads(identity.organizationId),
    ]);
    const leadById = new Map(leads.map((l) => [l.id, l]));
    // Conversaciones que nacieron de una campaña: se marcan para que el vendedor lo vea.
    const campaigns = await campaignsForConversations(identity.organizationId, conversations.map((c) => c.id)).catch(() => new Map());
    const inbox = conversations.map((c) => ({ conversation: c, lead: c.lead_id ? (leadById.get(c.lead_id) ?? null) : null, campaign: campaigns.get(c.id) ?? null }));
    return NextResponse.json({ inbox, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}
