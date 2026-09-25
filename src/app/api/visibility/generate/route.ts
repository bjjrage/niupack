import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { MarketCode } from '@/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { count = 100, markets = ['BR', 'AR', 'BO'], skus = ['CUP-12OZ-SW'] } = body;

    const brand = await repository.getBrand();
    const org = await repository.getOrganization();
    const batteries = await repository.getBatteries();
    const activeBattery = batteries[0] || (await repository.createBattery({
      organization_id: org.id,
      name: 'Batería Dinámica',
      code: 'DYNAMIC_BATTERY',
      version: 1,
      is_frozen: false,
      query_count: 0,
      market_codes: markets,
      status: 'DRAFT',
    }));

    const generated = await OpenAIService.generateQueries({
      brand: brand.name,
      description: brand.description || '',
      products: ['Vasos de Polipapel'],
      skus,
      markets: markets as MarketCode[],
      count,
      languages: ['pt', 'es'],
    });

    const savedQueries = await repository.addQueries(
      generated.map((q) => ({
        battery_id: activeBattery.id,
        organization_id: org.id,
        text: q.text,
        language: q.language,
        country_code: q.country_code,
        city_context: q.city_context,
        intent: q.intent,
        category: q.category,
        sku: q.sku,
        buyer_persona: q.buyer_persona,
        commercial_priority: q.commercial_priority,
        generated_by: 'AI',
        is_fixed: false,
        version: 1,
        status: 'PROPOSED',
      }))
    );

    return NextResponse.json({ generated: savedQueries });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
