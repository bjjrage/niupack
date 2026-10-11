import { QuoteDetail } from '@/components/sales-quotes/QuoteDetail';

export default async function PresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="mx-auto max-w-6xl"><QuoteDetail id={id} /></div>;
}
