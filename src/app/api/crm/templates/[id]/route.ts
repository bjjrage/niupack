import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { assertCanSend } from '@/lib/niupackbot/outreach/campaigns';
import { outreachError } from '@/lib/niupackbot/outreach/http';
import { submitTemplate, syncTemplate } from '@/lib/niupackbot/outreach/templates';

/** submit = pedir aprobación a WhatsApp · sync = consultar el estado real. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    await assertCanSend(identity.organizationId, identity.profileId);
    const { id } = await params;
    const { action } = z.object({ action: z.enum(['submit', 'sync']) }).parse(await request.json());
    const template = action === 'submit' ? await submitTemplate(identity.organizationId, id) : await syncTemplate(identity.organizationId, id);
    return NextResponse.json({ template });
  } catch (error) {
    return outreachError(error);
  }
}
