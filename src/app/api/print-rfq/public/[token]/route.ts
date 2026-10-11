import { NextResponse } from 'next/server';
import { domainErrorResponse } from '@/lib/auth/role-guard';
import { getPortalView, MAX_FILE_BYTES, PrintRfqError, resolveInvitation, storeFile, submitOffer } from '@/lib/print-rfq/service';

// Portal de la imprenta: se autentica solo con el token del enlace (256 bits). No hay sesión de usuario.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    return NextResponse.json(await getPortalView(token), { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch (error) { return domainErrorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const invitation = await resolveInvitation(token);
    const form = await request.formData();
    const file = form.get('attachment');
    if (!(file instanceof File) || file.size === 0) throw new PrintRfqError('PRINT_BUDGET_REQUIRED', 400, 'Adjuntá el presupuesto original');
    if (file.size > MAX_FILE_BYTES) throw new PrintRfqError('PRINT_FILE_TOO_LARGE', 413, 'El archivo supera los 4 MB');
    const parse = (name: string) => { try { return JSON.parse(String(form.get(name) ?? '')); } catch { throw new PrintRfqError('PRINT_OFFER_INVALID', 400, 'La oferta tiene datos inválidos'); } };
    const offer = parse('offer');
    const lines = parse('lines');
    const stored = await storeFile(invitation.organization_id, invitation.rfq_id, { kind: 'BUDGET', fileName: file.name, content: Buffer.from(await file.arrayBuffer()), invitationId: invitation.id });
    return NextResponse.json(await submitOffer(token, offer, lines, stored.file_id), { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
