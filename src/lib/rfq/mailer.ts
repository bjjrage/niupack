import { appendFileSync } from 'node:fs';
import { SMTPService } from '@/lib/email/smtp-service';
import type { Mailer } from './service';

/**
 * Transporte real (SMTP corporativo). Las pruebas inyectan su propio transporte: ningún test envía correos.
 *
 * Solo QA local: si QA_MAIL_CAPTURE_FILE está definido (y no es producción) los correos se escriben en ese archivo
 * en lugar de salir por SMTP, para validar el flujo completo sin enviar nada a terceros.
 */
function captureFile(): string | null {
  return process.env.NODE_ENV !== 'production' && process.env.QA_MAIL_CAPTURE_FILE ? process.env.QA_MAIL_CAPTURE_FILE : null;
}

export const smtpMailer: Mailer = {
  isConfigured: async () => (captureFile() ? true : SMTPService.isConfigured()),
  send: async ({ to, subject, text }) => {
    const file = captureFile();
    if (file) {
      appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), to, subject, text })}\n`);
      return { success: true, messageId: `<captured-${Date.now()}@qa.local>` };
    }
    return SMTPService.sendMail({ to, subject, text });
  },
};

/** Base del enlace público: variable de entorno si existe; si no, el origen de la solicitud autenticada. */
export function publicBaseUrl(request: Request): string {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  return (configured || new URL(request.url).origin).replace(/\/+$/, '');
}
