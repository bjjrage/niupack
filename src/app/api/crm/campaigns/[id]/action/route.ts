import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { cancelCampaign, launchCampaign, pauseCampaign, processQueue, resumeCampaign, retryFailed } from '@/lib/niupackbot/outreach/campaigns';
import { outreachError } from '@/lib/niupackbot/outreach/http';

const schema = z.object({ action: z.enum(['launch', 'pause', 'resume', 'cancel', 'retry_failed']) });

/** Ciclo de vida de la campaña. launch/resume disparan de inmediato el primer lote. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const { action } = schema.parse(await request.json());
    const org = identity.organizationId;
    const actor = identity.profileId;
    if (action === 'retry_failed') {
      const r = await retryFailed(org, actor, id);
      const tick = await processQueue(org, { campaignId: id });
      return NextResponse.json({ ...r, tick });
    }
    const campaign =
      action === 'launch'
        ? await launchCampaign(org, actor, id)
        : action === 'pause'
          ? await pauseCampaign(org, actor, id)
          : action === 'resume'
            ? await resumeCampaign(org, actor, id)
            : await cancelCampaign(org, actor, id);
    const tick = campaign.status === 'RUNNING' ? await processQueue(org, { campaignId: id }) : null;
    return NextResponse.json({ campaign, tick });
  } catch (error) {
    return outreachError(error);
  }
}
