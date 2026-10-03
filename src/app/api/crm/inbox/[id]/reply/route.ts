import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { outreachError } from '@/lib/niupackbot/outreach/http';
import { sendManualReply } from '@/lib/niupackbot/outreach/manual-reply';

/** El vendedor responde por WhatsApp desde el CRM (conversación en HUMAN, ventana de 24h). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const { body } = z.object({ body: z.string().max(2000) }).parse(await request.json());
    const message = await sendManualReply(identity.organizationId, identity.profileId, id, body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return outreachError(error);
  }
}
