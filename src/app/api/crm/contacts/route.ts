import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { contactSchema } from '@/lib/crm/validation';

export async function GET(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id') ?? undefined;
    const contacts = await crmRepository.listContacts(identity.organizationId, companyId ?? undefined);
    return NextResponse.json({ contacts, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = contactSchema.parse(await request.json());
    const contact = await crmService.createContact(
      identity.organizationId,
      {
        company_id: input.company_id ?? null,
        full_name: input.full_name,
        job_title: input.job_title ?? null,
        phone: input.phone ?? null,
        whatsapp_phone: input.whatsapp_phone ?? null,
        email: input.email ?? null,
        language: input.language ?? null,
        country_code: input.country_code ?? null,
        source: input.source ?? 'MANUAL',
        owner_profile_id: input.owner_profile_id ?? identity.profileId,
      },
      identity.profileId,
    );
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    return authErrorResponse(error);
  }
}
