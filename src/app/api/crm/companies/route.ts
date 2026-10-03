import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { companySchema, contactSchema } from '@/lib/crm/validation';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const [companies, contacts] = await Promise.all([
      crmRepository.listCompanies(identity.organizationId),
      crmRepository.listContacts(identity.organizationId),
    ]);
    return NextResponse.json({ companies, contacts, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const body = await request.json();
    if (body.kind === 'contact') {
      const input = contactSchema.parse(body);
      const contact = await crmRepository.createContact({
        organization_id: identity.organizationId,
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
      });
      return NextResponse.json({ contact }, { status: 201 });
    }
    const input = companySchema.parse(body);
    const company = await crmRepository.createCompany({
      organization_id: identity.organizationId,
      name: input.name,
      legal_name: input.legal_name ?? null,
      tax_id: input.tax_id ?? null,
      country_code: input.country_code ?? null,
      city: input.city ?? null,
      website: input.website ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source ?? 'MANUAL',
      notes: input.notes ?? null,
      owner_profile_id: input.owner_profile_id ?? identity.profileId,
    });
    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    return authErrorResponse(error);
  }
}
