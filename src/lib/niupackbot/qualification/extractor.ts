import type { CrmIntent, Qualification, VolumePeriod } from '@/lib/crm/types';
import type { BotLanguage, ExtractedCommercial } from '../types';

const PT_HINTS = ['preciso', 'obrigado', 'mês', 'mes', 'entrega em', 'copos', 'personalizados', 'orçamento', 'cotação', 'você', 'entrega', 'mil ', 'unidades'];
const ES_HINTS = ['necesito', 'quiero', 'cotización', 'entrega en', 'vasos', 'personalizados', 'gracias', 'usted', 'precio', 'unidades'];

export function detectLanguage(text: string): BotLanguage {
  const t = ` ${text.toLowerCase()} `;
  let pt = 0;
  let es = 0;
  for (const h of PT_HINTS) if (t.includes(h)) pt += 1;
  for (const h of ES_HINTS) if (t.includes(h)) es += 1;
  // Heurística adicional: ã/õ/ç/ê es PT.
  if (/[ãõçâêô]/.test(t)) pt += 2;
  if (/\b(quiero|necesito|usted|gracias|vasos)\b/.test(t)) es += 2;
  return pt >= es ? 'pt-BR' : 'es';
}

/** Idioma solo si hay señal clara; null en empate (mensajes cortos como "Hola"). El caller decide el default. */
export function detectLanguageStrict(text: string): BotLanguage | null {
  const t = ` ${text.toLowerCase()} `;
  let pt = 0;
  let es = 0;
  for (const h of PT_HINTS) if (t.includes(h)) pt += 1;
  for (const h of ES_HINTS) if (t.includes(h)) es += 1;
  if (/[ãõçâêô]/.test(t)) pt += 2;
  if (/(quiero|necesito|usted|gracias|vasos|tienen|productos|hola|buenas)/.test(t)) es += 2;
  if (/(ola|olá|bom dia|boa tarde|voces|vocês|tem)/.test(t)) pt += 2;
  if (pt === es) return null;
  return pt > es ? 'pt-BR' : 'es';
}

function norm(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractCapacity(text: string): string | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s?oz/i);
  if (m) return `${m[1].replace(',', '.')} oz`;
  const ml = text.match(/(\d+)\s?ml/i);
  if (ml) return `${ml[1]} ml`;
  return null;
}

function extractPrinting(text: string): string | null {
  const t = norm(text);
  if (/personalizad|con logo|con diseno|impres/.test(t)) return 'personalizado';
  if (/sin impresion|sin personalizar|liso|blanco/.test(t)) return 'liso';
  return null;
}

function extractProduct(text: string): string | null {
  const t = norm(text);
  if (/copo|vaso|polipapel|papel/.test(t) && /copo|vaso/.test(t)) return 'vaso polipapel';
  if (/tapa/.test(t)) return 'tapa';
  if (/pote|bowl/.test(t)) return 'pote';
  if (/bandeja|tray/.test(t)) return 'bandeja';
  if (/packaging|embalaje|embalagem|descartable|descartavel/.test(t)) return 'packaging descartable';
  return null;
}

function extractMaterial(text: string): string | null {
  const t = norm(text);
  if (/polipapel|papel/.test(t)) return 'polipapel';
  if (/plastico/.test(t)) return 'plástico';
  return null;
}

function extractVolume(text: string): { volume: number | null; period: VolumePeriod | null } {
  const t = norm(text);
  // 500 mil, 500k, 500.000, 1 millón, 1 milhao
  let volume: number | null = null;
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*(milhao|millon|mi\b)/);
  if (m) {
    volume = Math.round(parseFloat(m[1].replace(',', '.')) * 1_000_000);
  } else {
    m = t.match(/(\d+(?:[.,]\d+)?)\s*(mil|k\b)/);
    if (m) {
      volume = Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
    } else {
      m = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})/);
      if (m) {
        const digits = m[1].replace(/[.,]/g, '');
        const n = parseInt(digits, 10);
        if (!Number.isNaN(n) && n >= 100) volume = n;
      }
    }
  }
  let period: VolumePeriod | null = null;
  if (/por mes|por mes|mensal|al mes|mensual|por mes\b/.test(t) || /mes\b/.test(t)) period = 'MONTHLY';
  else if (/por semana|semanal/.test(t)) period = 'WEEKLY';
  else if (/por ano|anual|al ano/.test(t)) period = 'ANNUAL';
  else if (/unica|unico|once|pedido unico/.test(t)) period = 'ONE_OFF';
  else if (volume) period = 'MONTHLY';
  return { volume, period };
}

function extractDestination(text: string): { city?: string | null; country?: string | null } {
  // Entrega em Curitiba / Entrega en Asunción / Curitiba, São Paulo, Buenos Aires, Santa Cruz...
  const known: Array<{ names: string[]; city: string; country: string }> = [
    { names: ['curitiba'], city: 'Curitiba', country: 'BR' },
    { names: ['sao paulo', 'são paulo', 'sp'], city: 'São Paulo', country: 'BR' },
    { names: ['rio de janeiro', 'rio'], city: 'Rio de Janeiro', country: 'BR' },
    { names: ['asuncion', 'asunción'], city: 'Asunción', country: 'PY' },
    { names: ['buenos aires', 'caba'], city: 'Buenos Aires', country: 'AR' },
    { names: ['santa cruz'], city: 'Santa Cruz', country: 'BO' },
    { names: ['la paz'], city: 'La Paz', country: 'BO' },
    { names: ['montevideo'], city: 'Montevideo', country: 'UY' },
    { names: ['santiago'], city: 'Santiago', country: 'CL' },
  ];
  const t = norm(text);
  for (const k of known) {
    for (const n of k.names) {
      if (t.includes(n)) return { city: k.city, country: k.country };
    }
  }
  const m = text.match(/entrega\s+em\s+([A-ZÁÉÍÓÚÃÕÇ][\wÁÉÍÓÚÃÕÇãõç.\- ]{2,40})/i) || text.match(/entrega\s+en\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.\- ]{2,40})/i);
  if (m) {
    const city = m[1].trim().split(/[.,\n]/)[0].trim();
    return { city: city.slice(0, 80) || null, country: null };
  }
  return { city: null, country: null };
}

function extractIntent(text: string, extracted: { volume?: number | null; product?: string | null }): CrmIntent {
  const t = norm(text);
  if (/hablar con|humano|atendente|asesor|vendedor|whatsapp humano|quiero hablar/.test(t) || /falar com humano|atendente humano/.test(t)) return 'HUMAN_REQUEST';
  if (/muestra|amostra|cata|prueba/.test(t)) return 'SAMPLE_REQUEST';
  if (/precio|preco|valor|cotizacion|cotacao|orcamento|cuanto cuesta|quanto custa/.test(t)) {
    if (extracted.volume || extracted.product) return 'RFQ';
    return 'PRICE_REQUEST';
  }
  if (/flete|frete|envio|logistica|entrega|transporte/.test(t) && /cuanto|quanto|costo|custo|plazo|prazo/.test(t)) return 'LOGISTICS_REQUEST';
  if (/ficha|especificacion|especificacao|medida|gramaje|material/.test(t)) return 'SPEC_REQUEST';
  if (/(preciso|necesito|quiero|busco|procuro).{0,60}(copo|vaso|embalaje|packaging)/.test(t)) return 'RFQ';
  if (/seguimiento|follow|donde esta mi pedido|status/.test(t)) return 'FOLLOW_UP';
  if (/hola|buenas|bom dia|boa tarde|info/.test(t) && t.length < 60) return 'PRODUCT_INFO';
  if (extracted.volume && extracted.product) return 'RFQ';
  return 'OTHER';
}

function scoreQualification(input: { product?: string | null; volume?: number | null; destination?: string | null; country?: string | null; intent?: CrmIntent }): Qualification {
  let score = 0;
  if (input.product) score += 1;
  if (input.volume && input.volume >= 10_000) score += 1;
  if (input.volume && input.volume >= 100_000) score += 1;
  if (input.destination || input.country) score += 1;
  if (input.intent === 'RFQ' || input.intent === 'PRICE_REQUEST' || input.intent === 'SAMPLE_REQUEST') score += 1;
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

/** Extractor determinista packaging (sin OpenAI). Rápido, testeable, sin inventar datos. */
export function extractCommercial(text: string): ExtractedCommercial {
  const language = detectLanguage(text);
  const product = extractProduct(text);
  const capacity = extractCapacity(text);
  const printing = extractPrinting(text);
  const material = extractMaterial(text);
  const { volume, period } = extractVolume(text);
  const dest = extractDestination(text);
  const intent = extractIntent(text, { volume, product });
  // País: destino conocido o por idioma (PT=>BR por defecto, ES=>PY por defecto planta).
  let country: string | null = dest.country ?? null;
  if (!country) country = language === 'pt-BR' ? 'BR' : 'PY';
  const qualification = scoreQualification({ product, volume, destination: dest.city, country, intent });
  return {
    country,
    language,
    product_interest: product,
    capacity,
    material,
    printing,
    estimated_volume: volume,
    volume_period: period,
    destination_city: dest.city ?? null,
    destination_state: null,
    destination_country: country,
    intent,
    qualification,
  };
}
