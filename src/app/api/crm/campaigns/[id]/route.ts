import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { getCampaignSummary } from '@/lib/niupackbot/outreach/campaigns';
import { outreachError } from '@/lib/niupackbot/outreach/http';
import { outreachRepository } from '@/lib/niupackbot/outreach/repository';

/** Detalle: campaña + contadores + una página de destinatarios (?status=&offset=&limit=). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const campaign = await getCampaignSummary(identity.organizationId, id);
    if (!campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
    const q = new URL(request.url).searchParams;
    const recipients = await outreachRepository.listRecipients(identity.organizationId, id, {
      status: q.get('status') ?? undefined,
      offset: Number(q.get('offset') ?? 0) || 0,
      limit: Number(q.get('limit') ?? 100) || 100,
    });
    return NextResponse.json({ campaign, recipients });
  } catch (error) {
    return outreachError(error);
  }
}
