import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function GET() {
  try {
    const rfqs = await repository.getRFQs();
    return NextResponse.json({ rfqs });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const org = await repository.getOrganization();

    const created = await repository.createRFQ({
      organization_id: org.id,
      code: body.code || `RFQ-${Date.now().toString().slice(-4)}`,
      title: body.title,
      status: 'DRAFT',
      delivery_destination: body.delivery_destination || 'São Paulo, Brasil',
      incoterm: body.incoterm || 'FOB',
      target_lead_time_days: body.target_lead_time_days || 30,
      payment_terms: body.payment_terms || '30 días',
      items: [
        {
          id: crypto.randomUUID(),
          rfq_id: '',
          sku: body.sku || 'CUP-12OZ-SW',
          quantity: parseInt(body.quantity) || 300000,
          alternative_quantities: [100000, 300000, 500000],
          material: body.material || 'Cartulina Cupstock Virgen 260g',
          printing_spec: 'Impresión flexográfica 4 colores',
          color_count: 4,
          packaging_spec: 'Caja corrugada x 1000 unidades con bolsa PE interna',
        },
      ],
    });

    return NextResponse.json({ rfq: created });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
