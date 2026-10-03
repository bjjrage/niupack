// Señales textuales de un mensaje entrante a una campaña: baja (opt-out) y "no me interesa".
// Deterministas y conservadoras: una baja mal detectada corta el contacto con un cliente real.

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const OPT_OUT_EXACT = new Set([
  'stop', 'stop all', 'baja', 'baja por favor', 'dar de baja', 'darme de baja', 'unsubscribe', 'parar', 'pare', 'sair', 'cancelar suscripcion',
  'descadastrar', 'remover', 'remove me', 'no mas mensajes', 'nao mais mensagens',
]);

const OPT_OUT_PHRASES = [
  /\bno (quiero|deseo) (recibir )?mas (mensajes|informacion|promociones)\b/,
  /\bno me (escriban|escriba|contacten|contacte|manden|envien) mas\b/,
  /\b(nao|n) (quero|desejo) (mais )?(receber|mensagens)\b/,
  /\bnao (me )?(mande|enviem|envie|contate|contatem) mais\b/,
  /\bme (den|dar|dan) de baja\b/,
  /\b(quero|favor) (sair|descadastrar)\b/,
];

/** Baja explícita. Solo mensajes cortos: "cancelar mi pedido" NO es una baja. */
export function detectOptOut(text: string): boolean {
  const t = norm(text);
  if (!t || t.length > 60) return false;
  if (OPT_OUT_EXACT.has(t)) return true;
  return OPT_OUT_PHRASES.some((re) => re.test(t));
}

const NO_INTEREST = [
  /\bno me interesa\b/,
  /\bno estoy interesad[oa]\b/,
  /\bsin interes\b/,
  /\bno (tenemos|tengo) interes\b/,
  /\bno gracias\b/,
  /\bnao (tenho |temos )?interesse\b/,
  /\bnao (obrigad[oa])\b/,
  /\bnao me interessa\b/,
];

/** Rechazo cortés. Si además pide precio o cotización, no es rechazo: se descarta. */
export function detectNoInterest(text: string): boolean {
  const t = norm(text);
  if (!t || t.length > 90) return false;
  if (/\b(precio|preco|cotiz|cotacao|orcamento|presupuesto|muestra|amostra)\b/.test(t)) return false;
  return NO_INTEREST.some((re) => re.test(t));
}
