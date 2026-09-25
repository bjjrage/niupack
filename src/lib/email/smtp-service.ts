import nodemailer from 'nodemailer';
import { repository } from '@/lib/db/repository';

export class SMTPService {
  /**
   * Get configured nodemailer transport from database settings or .env
   */
  public static async getTransport() {
    const settings = await repository.getSettings();
    const host = settings.smtp_host || process.env.SMTP_HOST || '';
    const port = settings.smtp_port || parseInt(process.env.SMTP_PORT || '587', 10);
    const user = settings.smtp_user || process.env.SMTP_USER || '';
    const pass = settings.smtp_pass || process.env.SMTP_PASS || '';
    const secure =
      settings.smtp_secure !== undefined
        ? settings.smtp_secure
        : port === 465 || process.env.SMTP_SECURE === 'true';

    if (!host || !user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false, // Prevents self-signed cert blocks on custom corporate mail servers
      },
    });
  }

  public static async isConfigured(): Promise<boolean> {
    const settings = await repository.getSettings();
    const host = settings.smtp_host || process.env.SMTP_HOST || '';
    const user = settings.smtp_user || process.env.SMTP_USER || '';
    const pass = settings.smtp_pass || process.env.SMTP_PASS || '';
    return Boolean(host && user && pass);
  }

  public static async verifyConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const transporter = await this.getTransport();
      if (!transporter) {
        return {
          success: false,
          message: 'Faltan credenciales SMTP (servidor, usuario o contraseña). Configúralas en Ajustes o en .env.local.',
        };
      }
      await transporter.verify();
      return {
        success: true,
        message: 'Conexión SMTP exitosa con el servidor de correo de la empresa.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Error de conexión con el servidor SMTP.',
      };
    }
  }

  public static async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    bcc?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const transporter = await this.getTransport();
      if (!transporter) {
        return {
          success: false,
          error: 'Servidor SMTP no configurado.',
        };
      }

      const settings = await repository.getSettings();
      const fromName =
        settings.smtp_from_name ||
        process.env.MAIL_FROM_NAME ||
        'NIUPACK Packaging - Departamento de Compras';
      const fromEmail =
        settings.smtp_from_email ||
        settings.smtp_user ||
        process.env.MAIL_FROM ||
        'compras@niupack.com.py';

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        bcc: options.bcc,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Fallo en envío de correo SMTP',
      };
    }
  }
}
