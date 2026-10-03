import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireNiuIdentity, authErrorResponse } from '@/lib/auth/identity';
import { assertCanSend } from '@/lib/niupackbot/outreach/campaigns';
import { outreachError } from '@/lib/niupackbot/outreach/http';
import { createTemplate, listTemplates } from '@/lib/niupackbot/outreach/templates';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    return NextResponse.json({ templates: await listTemplates(identity.organizationId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().max(64),
  language: z.enum(['es', 'es_AR', 'pt_BR', 'en']),
  category: z.enum(['MARKETING', 'UTILITY']),
  body: z.string().max(2000),
  example1: z.string().max(60).optional(),
  submit: z.boolean().optional(),
});

/** Crea el template en Twilio Content API (y opcionalmente lo manda a aprobación de WhatsApp). */
export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    await assertCanSend(identity.organizationId, identity.profileId);
    const { submit, ...input } = createSchema.parse(await request.json());
    const template = await createTemplate(identity.organizationId, identity.profileId, input, { submit });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return outreachError(error);
  }
}
