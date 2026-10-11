import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { MAX_FILE_BYTES, PrintRfqError, storeFile, submitOffer } from '@/lib/print-rfq/service';
import { supabaseAdmin } from '@/lib/db/supabase';

/** Una persona interna carga una versión del presupuesto recibido por otro canal (mail, WhatsApp, papel). Queda a su nombre. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const rfqId = z.string().uuid().parse(id);
    const form = await request.formData();
    const invitationId = z.string().uuid().parse(form.get('invitation_id'));
    const file = form.get('attachment');
    if (!(file instanceof File) || file.size === 0) throw new PrintRfqError('PRINT_BUDGET_REQUIRED', 400, 'Adjuntá el presupuesto original');
    if (file.size > MAX_FILE_BYTES) throw new PrintRfqError('PRINT_FILE_TOO_LARGE', 413, 'El archivo supera los 4 MB');
    if (!supabaseAdmin) throw new Error('SUPABASE_PERSISTENCE_UNAVAILABLE');
    const { data: invitation } = await supabaseAdmin.from('print_rfq_invitations').select('id, token').eq('id', invitationId).eq('rfq_id', rfqId).eq('organization_id', identity.organizationId).maybeSingle();
    if (!invitation) throw new PrintRfqError('PRINT_INVITATION_NOT_FOUND', 404, 'Invitación no encontrada');
    const parse = (name: string) => { try { return JSON.parse(String(form.get(name) ?? '')); } catch { throw new PrintRfqError('PRINT_OFFER_INVALID', 400, 'La oferta tiene datos inválidos'); } };
    const stored = await storeFile(identity.organizationId, rfqId, { kind: 'BUDGET', fileName: file.name, content: Buffer.from(await file.arrayBuffer()), invitationId, actor: identity.profileId });
    return NextResponse.json(await submitOffer(invitation.token, parse('offer'), parse('lines'), stored.file_id, identity.profileId), { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
