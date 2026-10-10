import { NextResponse } from 'next/server';
import { domainErrorResponse } from '@/lib/auth/role-guard';
import { getPublicView, publicQuoteSchema, submitPublicQuote } from '@/lib/rfq/service';

// Ruta pública: la identidad es el token personal del proveedor (hash en base, vencimiento, revocación y tope de envíos).
// Nunca devuelve costos, otras ofertas, otros proveedores ni datos de la organización.
const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    return NextResponse.json(await getPublicView(token), { headers: NO_STORE });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = publicQuoteSchema.parse(await request.json());
    const result = await submitPublicQuote(token, body);
    return NextResponse.json({ received: true, version: result.version }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
