import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { niupackbotRepository } from '@/lib/niupackbot/repository';
import { campaignsForConversations } from '@/lib/niupackbot/outreach/inbound';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const conversation = await crmRepository.getConversation(id, identity.organizationId);
    if (!conversation) return NextResponse.json({ error: 'CONVERSATION_NOT_FOUND' }, { status: 404 });
    const [messages, activities, lead360] = await Promise.all([
      niupackbotRepository.listMessages(id, identity.organizationId, 100),
      crmRepository.listActivities(identity.organizationId, { conversation_id: id }),
      conversation.lead_id ? crmService.getLead360(identity.organizationId, conversation.lead_id) : Promise.resolve(null),
    ]);
    const campaign = (await campaignsForConversations(identity.organizationId, [id]).catch(() => new Map())).get(id) ?? null;
    return NextResponse.json({ conversation, messages, activities, lead360, campaign });
  } catch (error) {
    return authErrorResponse(error);
  }
}
