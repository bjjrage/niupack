import { NextRequest, NextResponse } from 'next/server';
import { SMTPService } from '@/lib/email/smtp-service';
import { repository } from '@/lib/db/repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      to,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
      smtp_secure,
      smtp_from_email,
      smtp_from_name,
    } = body;

    // If new SMTP settings are sent, update them first
    if (smtp_host && smtp_user && smtp_pass) {
      await repository.updateSettings({
        smtp_host,
        smtp_port: smtp_port ? Number(smtp_port) : 465,
        smtp_user,
        smtp_pass,
        smtp_secure: smtp_secure !== undefined ? Boolean(smtp_secure) : true,
        smtp_from_email: smtp_from_email || smtp_user,
        smtp_from_name: smtp_from_name || 'NIUPACK Packaging Industrial',
      });
    }

    // 1. Verify SMTP connection
    const verifyResult = await SMTPService.verifyConnection();
    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: verifyResult.message,
        },
        { status: 400 }
      );
    }

    // 2. If a destination email is specified, send a test email
    const recipient = to || smtp_user || (await repository.getSettings()).smtp_user;
    if (recipient) {
      const sendResult = await SMTPService.sendMail({
        to: recipient,
        subject: '✓ Verificación Exitosa: NIU Intelligence OS - Envío de Correo Corporativo',
        text: `Hola,\n\nEste es un correo de prueba enviado exitosamente desde NIU Intelligence OS utilizando el servidor SMTP corporativo.\n\nEl sistema está listo para enviar solicitudes formales de cotización (RFQs) a proveedores y competidores en Brasil, Argentina y Bolivia desde el correo oficial de la empresa.\n\nFecha: ${new Date().toLocaleString()}\nNIUPACK / Gardiner S.A.`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
            <h2 style="color: #0284c7; margin-top: 0;">✓ Verificación Exitosa: NIU Intelligence OS</h2>
            <p>Este es un correo de prueba enviado exitosamente desde <strong>NIU Intelligence OS</strong> utilizando el servidor SMTP corporativo de la empresa.</p>
            <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <p style="margin: 0; font-size: 14px; color: #334155;">
                <strong>Estado:</strong> Conexión SMTP Activa y Operativa<br>
                <strong>Servidor:</strong> ${(await repository.getSettings()).smtp_host}<br>
                <strong>Remitente:</strong> ${(await repository.getSettings()).smtp_from_email || recipient}<br>
                <strong>Fecha:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
            <p style="font-size: 13px; color: #64748b;">El sistema está listo para despachar solicitudes formales de cotización (RFQs) a fabricantes y competidores de packaging regional.</p>
          </div>
        `,
      });

      if (!sendResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: sendResult.error,
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Conexión SMTP exitosa y correo de prueba enviado a ${recipient}.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error al probar configuración SMTP',
      },
      { status: 500 }
    );
  }
}
