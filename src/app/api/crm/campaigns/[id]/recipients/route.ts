import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { addRecipients } from '@/lib/niupackbot/outreach/campaigns';
import { outreachError } from '@/lib/niupackbot/outreach/http';
import { audienceSchema } from '@/lib/niupackbot/outreach/schemas';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const audience = audienceSchema.parse(await request.json());
    return NextResponse.json(await addRecipients(identity.organizationId, id, audience), { status: 201 });
  } catch (error) {
    return outreachError(error);
  }
}
