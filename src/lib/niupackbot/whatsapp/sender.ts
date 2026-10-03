// Proactive WhatsApp sender (REST Twilio) — RESERVADO para uso futuro.
// NO se usa en el flujo inbound V1. Inbound V1 responde ÚNICAMENTE vía TwiML
// (`POST /api/niupackbot/whatsapp` retorna `<Response><Message>`).
// Mantener separado para no generar doble respuesta al cliente.

export async function sendWhatsappRest(to: string, body: string): Promise<{ sent: boolean; mode: 'TWILIO' | 'STUB' }> {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.TWILIO_WHATSAPP_FROM || '';
  if (!sid || !token || !from) return { sent: false, mode: 'STUB' };
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams({ From: from, To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`, Body: body });
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    return { sent: res.ok, mode: 'TWILIO' };
  } catch {
    return { sent: false, mode: 'STUB' };
  }
}
