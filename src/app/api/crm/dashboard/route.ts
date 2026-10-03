import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const org = identity.organizationId;
    const [leads, opportunities, tasks, conversations] = await Promise.all([
      crmRepository.listLeads(org),
      crmRepository.listOpportunities(org),
      crmRepository.listTasks(org),
      crmRepository.listConversations(org),
    ]);
    const openOpps = opportunities.filter((o) => o.stage !== 'GANADO' && o.stage !== 'PERDIDO');
    const nowTs = Date.now();
    return NextResponse.json({
      leads_total: leads.length,
      opportunities_open: openOpps.length,
      in_quote: opportunities.filter((o) => o.stage === 'COTIZACIÓN').length,
      in_negotiation: opportunities.filter((o) => o.stage === 'NEGOCIACIÓN').length,
      won_total: opportunities.filter((o) => o.stage === 'GANADO').length,
      tasks_overdue: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < nowTs && t.status !== 'DONE' && t.status !== 'CANCELLED').length,
      conversations_active: conversations.filter((c) => c.status === 'OPEN').length,
      persistence: crmRepository.persistenceMode(),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
