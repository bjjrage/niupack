import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { campaignsForConversations } from '@/lib/niupackbot/outreach/inbound';
import { niupackbotRepository } from '@/lib/niupackbot/repository';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const [conversations, leads] = await Promise.all([
      crmRepository.listConversations(identity.organizationId),
      crmRepository.listLeads(identity.organizationId),
    ]);
    const leadById = new Map(leads.map((l) => [l.id, l]));
    // Conversaciones que nacieron de una campaña: se marcan para que el vendedor lo vea.
    const ids = conversations.map((c) => c.id);
    const [campaigns, last] = await Promise.all([
      campaignsForConversations(identity.organizationId, ids).catch(() => new Map()),
      niupackbotRepository.lastMessages(identity.organizationId, ids).catch(() => new Map()),
    ]);
    const inbox = conversations.map((c) => {
      const m = last.get(c.id);
      return {
        conversation: c,
        lead: c.lead_id ? (leadById.get(c.lead_id) ?? null) : null,
        campaign: campaigns.get(c.id) ?? null,
        // Vista previa del último mensaje: sin cuerpo completo para no inflar el listado.
        last_message: m ? { direction: m.direction, author_role: m.author_role, preview: m.body.slice(0, 140), at: m.occurred_at } : null,
      };
    });
    return NextResponse.json({ inbox, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}
