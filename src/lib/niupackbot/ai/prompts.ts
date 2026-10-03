import type { CrmIntent } from '@/lib/crm/types';
import type { BotLanguage } from '../types';

export const SYSTEM_PROMPT = `Sos NIUPACKBOT, asistente comercial de NIUPACK (Gardiner S.A., Asunción, packaging food-service, vasos polipapel, potes, tapas, norma FSSC 22000).
Respondés en el idioma del cliente (español o portugués brasileño). Sos conciso, operativo, sin humo.
NUNCA inventes precios, stock, lead times, descuentos ni condiciones. Si falta dato comercial autorizado, decí que un asesor lo confirma y ofrecé handoff humano.
Extraés: producto, capacidad, material, impresión, volumen, período, destino, intención, calificación.
Si el cliente pide humano, confirmás el handoff y no seguís vendiendo.`;

const REPLIES: Record<BotLanguage, Record<CrmIntent, string>> = {
  'pt-BR': {
    PRODUCT_INFO: 'Obrigado pelo contato! Trabalhamos com copos em polipapel, potes e tampas (FSSC 22000, planta em Assunção). Me diga produto, capacidade, volume mensal e cidade de entrega que já preparo seu atendimento.',
    SPEC_REQUEST: 'Perfeito — me diga o produto/capacidade (ex.: copo 12 oz) e o uso (quente/frio) que te passo a ficha e as opções de personalização. Preço e prazo final confirma nosso comercial.',
    SAMPLE_REQUEST: 'Consigo encaminhar amostras. Me diga produto, capacidade, quantidade estimada e endereço/cidade de entrega que abro o pedido de amostra.',
    RFQ: 'Perfeito, já registrei sua necessidade. Para cotar preciso confirmar: produto/capacidade, impressão, volume e cidade de entrega. Um assessor valida preço/prazo — sem valores inventados por aqui.',
    PRICE_REQUEST: 'Entendido. O preço depende de produto, impressão e volume. Me confirme esses 3 pontos + cidade de entrega que nosso comercial retorna com a cotação oficial.',
    LOGISTICS_REQUEST: 'Consigo estimar a logística a partir da nossa base autorizada. Me diga cidade de entrega e volume que verifico a rota. Não informo fretes sem fonte autorizada.',
    FOLLOW_UP: 'Claro — me diga seu nome/empresa ou o número do pedido que verifico o status com o comercial.',
    HUMAN_REQUEST: 'Claro — já aciono um assessor humano. Ele continua por aqui mesmo. Me diga seu nome e melhor horário se quiser.',
    OTHER: 'Obrigado! Para ajudar rápido: qual produto, capacidade, volume aproximado e cidade de entrega?',
  },
  es: {
    PRODUCT_INFO: '¡Gracias por escribir! Somos NIUPACK (planta Asunción, FSSC 22000): vasos polipapel, potes y tapas. Decime producto, capacidad, volumen mensual y ciudad de entrega y lo gestionamos.',
    SPEC_REQUEST: 'Perfecto — pasame producto/capacidad (ej.: vaso 12 oz) y uso (frío/caliente) y te comparto ficha y personalización. Precio y plazo los confirma comercial.',
    SAMPLE_REQUEST: 'Puedo gestionar muestras. Pasame producto, capacidad, cantidad estimada y ciudad de entrega y lo abro.',
    RFQ: 'Perfecto, ya registré tu necesidad. Para cotizar confirmame: producto/capacidad, impresión, volumen y ciudad de entrega. Un asesor valida precio/plazo — no invento valores.',
    PRICE_REQUEST: 'Entendido. El precio depende de producto, impresión y volumen. Confirmame esos 3 puntos + ciudad de entrega y comercial te pasa la cotización oficial.',
    LOGISTICS_REQUEST: 'Puedo estimar logística desde nuestra base autorizada. Decime ciudad de entrega y volumen y lo verifico. No informo fletes sin fuente autorizada.',
    FOLLOW_UP: 'Claro — pasame tu nombre/empresa o número de pedido y lo verifico con comercial.',
    HUMAN_REQUEST: 'Claro — ya aviso a un asesor humano, que sigue por aquí mismo. Si querés, dejame tu nombre y horario ideal.',
    OTHER: '¡Gracias! Para ayudarte rápido: ¿qué producto, capacidad, volumen aproximado y ciudad de entrega necesitás?',
  },
};

export function templateReply(language: BotLanguage, intent: CrmIntent, missing: string[]): string {
  let base = REPLIES[language][intent] ?? REPLIES[language].OTHER;
  if (missing.length > 0 && (intent === 'RFQ' || intent === 'PRICE_REQUEST')) {
    const labels: Record<string, Record<BotLanguage, string>> = {
      product_interest: { 'pt-BR': 'produto/capacidade', es: 'producto/capacidad' },
      estimated_volume: { 'pt-BR': 'volume mensal', es: 'volumen mensual' },
      destination_city: { 'pt-BR': 'cidade de entrega', es: 'ciudad de entrega' },
    };
    const need = missing.map((m) => labels[m]?.[language] ?? m).join(', ');
    base += language === 'pt-BR' ? ` Falta: ${need}.` : ` Falta: ${need}.`;
  }
  return base;
}
