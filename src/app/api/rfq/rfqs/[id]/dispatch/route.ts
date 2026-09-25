import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { SMTPService } from '@/lib/email/smtp-service';
import { GmailClient } from '@/lib/gmail/gmail-client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const supplierIds: string[] = body.supplierIds || [];

    const rfq = await repository.getRFQ(id);
    if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });

    const allSuppliers = await repository.getSuppliers();
    const targetedSuppliers = allSuppliers.filter((s) => supplierIds.includes(s.id));

    const isSmtpReady = await SMTPService.isConfigured();
    const results: Array<{ supplierId: string; email?: string; status: string; messageId?: string }> = [];

    for (const supplier of targetedSuppliers) {
      if (supplier.email && isSmtpReady) {
        const emailContent = `Estimado equipo comercial de ${supplier.name},

Nos dirigimos a ustedes con el propósito de solicitar una cotización formal para el suministro de las siguientes especificaciones técnicas:

- Código RFQ: ${rfq.code}
- Término de Entrega Requerido: ${rfq.incoterm || 'FOB / CIF'}
- Fecha límite para cotizar: ${rfq.validity_date || '15 días corridos'}

Por favor detallar en su cotización:
1. Precio unitario en USD según escalones de volumen.
2. Pedido Mínimo (MOQ).
3. Costo de clichés, matrices o herramental de impresión (si aplica).
4. Plazo estimado de entrega y condiciones de pago.

Quedamos a la espera de su propuesta formal.

Atentamente,
Departamento de Compras y Abastecimiento
NIUPACK / Gardiner S.A.
contacto@niupack.com.py`;

        const sendResult = await SMTPService.sendMail({
          to: supplier.email,
          subject: `[RFQ ${rfq.code}] Solicitud de Cotización Formal - Suministro de Packaging`,
          text: emailContent,
        });

        results.push({
          supplierId: supplier.id,
          email: supplier.email,
          status: sendResult.success ? 'REAL_EMAIL_SENT' : 'FAILED',
          messageId: sendResult.messageId,
        });
      } else {
        results.push({
          supplierId: supplier.id,
          email: supplier.email,
          status: 'SIMULATED_DISPATCH_NO_SMTP',
        });
      }
    }

    // Update status to SENT
    await repository.updateRFQ(id, {
      status: 'SENT',
    });

    // Record audit event
    await repository.logAuditEvent({
      event_type: 'email_sent',
      target_entity: 'rfqs',
      entity_id: id,
      metadata: {
        action: 'DISPATCH_BROADCAST',
        supplierCount: targetedSuppliers.length,
        dispatches: results,
      },
    });

    return NextResponse.json({
      success: true,
      status: 'SENT',
      dispatches: results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error dispatching RFQ' }, { status: 500 });
  }
}
