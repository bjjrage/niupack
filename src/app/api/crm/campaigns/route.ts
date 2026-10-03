import { NextResponse } from 'next/server';
import { requireNiuIdentity, authErrorResponse } from '@/lib/auth/identity';
import { createCampaign, listCampaigns } from '@/lib/niupackbot/outreach/campaigns';
import { outreachError } from '@/lib/niupackbot/outreach/http';
import { createCampaignSchema } from '@/lib/niupackbot/outreach/schemas';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    return NextResponse.json({ campaigns: await listCampaigns(identity.organizationId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Crea la campaña en DRAFT con su audiencia. No envía nada: el lanzamiento es una acción aparte. */
export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = createCampaignSchema.parse(await request.json());
    const result = await createCampaign(identity.organizationId, identity.profileId, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return outreachError(error);
  }
}
