export type GmailIntegrationStatus = 'CONNECTED' | 'BLOCKED_EXTERNAL_CREDENTIAL';

/**
 * Estado de la integración con Gmail corporativo.
 * La lectura automática de la bandeja todavía no está implementada: nunca se inventan correos ni respuestas.
 * Las ofertas llegan por enlace seguro del proveedor, carga manual o PDF.
 */
export class GmailClient {
  public static getStatus(): { status: GmailIntegrationStatus; message: string; userEmail: string } {
    const clientId = process.env.GMAIL_CLIENT_ID || '';
    const clientSecret = process.env.GMAIL_CLIENT_SECRET || '';
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || '';
    const userEmail = process.env.GMAIL_USER_EMAIL || '';
    const hasCredentials = Boolean(clientId && clientSecret && refreshToken && !clientId.includes('your-google-oauth'));

    if (hasCredentials) {
      return {
        status: 'CONNECTED',
        message: 'Hay credenciales de Gmail configuradas, pero la sincronización automática de la bandeja aún no está habilitada. Registrá las ofertas por enlace, PDF o carga manual.',
        userEmail,
      };
    }
    return {
      status: 'BLOCKED_EXTERNAL_CREDENTIAL',
      message: 'Gmail no está conectado (faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN). Las ofertas se registran por enlace del proveedor, PDF o carga manual.',
      userEmail,
    };
  }
}
