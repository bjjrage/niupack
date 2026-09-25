import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function GET() {
  try {
    const suppliers = await repository.getSuppliers();
    return NextResponse.json({ suppliers });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const org = await repository.getOrganization();

    const created = await repository.addSupplier({
      organization_id: org.id,
      name: body.name,
      country_code: body.country_code,
      city: body.city,
      website: body.website,
      email: body.email,
      phone: body.phone,
      contact_name: body.contact_name,
      status: body.status || 'DISCOVERED',
      discovery_source: body.discovery_source || 'MANUAL',
      discovery_evidence: body.discovery_evidence,
      notes: body.notes,
    });

    return NextResponse.json({ supplier: created });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
