import type { BotLanguage } from '../types';

/**
 * Rol de NIUPACKBOT: NO es un bot que cotiza. Presenta NIUPACK, entiende qué necesita el
 * prospecto, detecta interés y deriva a un vendedor. Nunca precio, cotización, descuento,
 * negociación, true cost, logística, lead time ni stock.
 */
export const SYSTEM_PROMPT = `Sos NIUPACKBOT, el asistente de presentación de NIUPACK (Gardiner S.A., Asunción, packaging food-service: vasos de polipapel, potes y tapas, planta con norma FSSC 22000).
Respondés en el idioma del cliente (español o portugués brasileño). Sos breve y claro.
Tu trabajo: presentar NIUPACK, entender qué necesita el prospecto y derivarlo a un vendedor.
NUNCA des ni insinúes precios, cotizaciones, descuentos, condiciones comerciales, plazos, stock ni costos de logística. No negocies.
Si piden precio, cotización, pedido, descuento, hablar con una persona, o si no tenés una respuesta confiable, derivás a un asesor y dejás de responder.
Extraés: producto, capacidad, material, impresión, volumen, período, destino e intención.`;

export type ReplyKind =
  | 'PRESENT' // presentación + qué necesita
  | 'HANDOFF_COMMERCIAL' // precio / cotización / pedido / muestra
  | 'HANDOFF_HUMAN' // pidió una persona
  | 'HANDOFF_INFO' // dato que el bot no puede confirmar (ficha, logística, estado de pedido, reclamo)
  | 'OPT_OUT'
  | 'NO_INTEREST';

const REPLIES: Record<BotLanguage, Record<ReplyKind, string>> = {
  es: {
    PRESENT:
      '¡Hola! Soy NIUPACKBOT, de NIUPACK (planta en Asunción, norma FSSC 22000). Trabajamos packaging food-service: vasos de polipapel, potes y tapas. ¿Qué producto te interesa y para qué uso lo necesitás?',
    HANDOFF_COMMERCIAL:
      'Gracias, ya registré tu consulta. Un asesor comercial te contacta por este mismo chat para ver precio y condiciones. Si querés, adelantame producto, medida y cantidad aproximada.',
    HANDOFF_HUMAN: 'Claro, ya aviso a un asesor. Te va a responder por este mismo chat.',
    HANDOFF_INFO: 'Eso lo tiene que confirmar un asesor de NIUPACK. Ya le pasé tu consulta y te responde por este mismo chat.',
    OPT_OUT: 'Listo, no te vamos a enviar más mensajes. Si más adelante querés retomar el contacto, escribinos cuando quieras.',
    NO_INTEREST: 'Gracias por avisarnos, no hay problema. Si más adelante necesitás packaging, acá estamos.',
  },
  'pt-BR': {
    PRESENT:
      'Olá! Sou o NIUPACKBOT, da NIUPACK (planta em Assunção, norma FSSC 22000). Trabalhamos com embalagens food-service: copos de polipapel, potes e tampas. Qual produto te interessa e para qual uso?',
    HANDOFF_COMMERCIAL:
      'Obrigado, já registrei sua consulta. Um assessor comercial entra em contato por este mesmo chat para tratar de preço e condições. Se quiser, adiante produto, medida e quantidade aproximada.',
    HANDOFF_HUMAN: 'Claro, já aviso um assessor. Ele responde por este mesmo chat.',
    HANDOFF_INFO: 'Isso precisa ser confirmado por um assessor da NIUPACK. Já passei sua consulta e ele responde por este mesmo chat.',
    OPT_OUT: 'Pronto, não vamos mais enviar mensagens. Se quiser retomar o contato, é só nos escrever.',
    NO_INTEREST: 'Obrigado por avisar, sem problema. Se precisar de embalagens no futuro, estamos à disposição.',
  },
};

export function templateReply(language: BotLanguage, kind: ReplyKind): string {
  return REPLIES[language][kind];
}
