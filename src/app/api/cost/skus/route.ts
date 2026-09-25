import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function GET() {
  try {
    const skus = await repository.getSKUs();
    const products = await repository.getProducts();
    return NextResponse.json({ skus, products });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      product_id,
      sku,
      size_oz,
      size_ml,
      height_mm,
      top_diameter_mm,
      bottom_diameter_mm,
      material,
      paper_weight_gsm,
      coating,
      wall_type = 'single',
      max_colors = 4,
      pack_quantity = 50,
      carton_quantity = 1000,
      compatible_lids,
      moq = 10000,
      notes,
    } = body;

    const created = await repository.addSKU({
      product_id,
      sku,
      size_oz: size_oz ? parseFloat(size_oz) : undefined,
      size_ml: size_ml ? parseFloat(size_ml) : undefined,
      height_mm: height_mm ? parseFloat(height_mm) : undefined,
      top_diameter_mm: top_diameter_mm ? parseFloat(top_diameter_mm) : undefined,
      bottom_diameter_mm: bottom_diameter_mm ? parseFloat(bottom_diameter_mm) : undefined,
      material: material || 'Cartulina Cupstock',
      paper_weight_gsm: paper_weight_gsm ? parseFloat(paper_weight_gsm) : undefined,
      coating: coating || '1 PE',
      wall_type,
      max_colors: parseInt(max_colors),
      pack_quantity: parseInt(pack_quantity),
      carton_quantity: parseInt(carton_quantity),
      compatible_lids,
      moq: parseInt(moq),
      notes,
    });

    return NextResponse.json({ sku: created });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
