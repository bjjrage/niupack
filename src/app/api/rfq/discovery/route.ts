import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { MarketCode } from '@/types';

export async function POST(req: Request) {
  try {
    const { country_code = 'BR', category = 'cups' } = await req.json();
    const org = await repository.getOrganization();

    const discovered = await OpenAIService.discoverSuppliers({
      country_code: country_code as MarketCode,
      product_category: category,
    });

    const savedSuppliers = [];
    for (const s of discovered) {
      const created = await repository.addSupplier({
        organization_id: org.id,
        name: s.name,
        country_code: s.country_code,
        city: s.city,
        website: s.website,
        email: s.email,
        status: 'DISCOVERED',
        discovery_source: 'OPENAI_SEARCH',
        discovery_evidence: s.evidence,
      });
      savedSuppliers.push(created);
    }

    return NextResponse.json({ suppliers: savedSuppliers });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
