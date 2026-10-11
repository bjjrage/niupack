import { z } from 'zod';

/** Reglas puras del presupuesto a clientes. Los importes llevan IVA incluido, como en el formato de NIUPACK. */
export const lineSchema = z.object({
  item_no: z.number().int().min(1).max(999),
  sku: z.string().trim().max(100).optional().or(z.literal('')),
  product_attribute_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(1000),
  /** null = precio informado sin cantidad (por ejemplo, una tapa opcional). */
  quantity: z.number().finite().positive().max(9_999_999_999).nullable(),
  unit_price: z.number().finite().min(0).max(9_999_999_999),
});
export type QuoteLineInput = z.infer<typeof lineSchema>;

export const headerSchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  client_name: z.string().trim().min(1).max(200),
  attention: z.string().trim().max(200).optional().or(z.literal('')),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  intro: z.string().trim().max(2000).optional().or(z.literal('')),
  payment_terms: z.string().trim().max(500).optional().or(z.literal('')),
  delivery_terms: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  quote_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  currency: z.enum(['PYG', 'USD']).default('PYG'),
  signer_name: z.string().trim().max(200).optional().or(z.literal('')),
  signer_title: z.string().trim().max(200).optional().or(z.literal('')),
  signer_company: z.string().trim().max(200).optional().or(z.literal('')),
});
export const saveQuoteSchema = z.object({ header: headerSchema, lines: z.array(lineSchema).min(1).max(200) });

export const lineTotal = (quantity: number | null, unitPrice: number) => (quantity == null ? null : Math.round(quantity * unitPrice * 100) / 100);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "Asunción, 8 de octubre de 2026". Recibe YYYY-MM-DD para no depender de la zona horaria. */
export function longDate(isoDay: string, city = 'Asunción') {
  const [y, m, d] = isoDay.slice(0, 10).split('-').map(Number);
  return `${city}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Miles con punto, sin decimales salvo que existan: 1.100.000 y 790. */
export const formatAmount = (value: number | null | undefined, currency = 'PYG') =>
  value == null ? '-' : value.toLocaleString('es-PY', { maximumFractionDigits: currency === 'PYG' ? 0 : 2, minimumFractionDigits: currency === 'PYG' ? 0 : 2 });

export const formatQuantity = (value: number | null | undefined) => (value == null ? '-' : value.toLocaleString('es-PY', { maximumFractionDigits: 4 }));

export const defaultIntro = (subject: string | undefined) =>
  `Me dirijo a usted a fin de remitir el presupuesto solicitado${subject?.trim() ? ` para ${subject.trim()}` : ''}.`;

export const QUOTE_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'brand' }> = {
  BORRADOR: { label: 'Borrador', variant: 'neutral' },
  ENVIADO: { label: 'Enviado', variant: 'warning' },
  ACEPTADO: { label: 'Aceptado', variant: 'success' },
  RECHAZADO: { label: 'Rechazado', variant: 'danger' },
  ANULADO: { label: 'Anulado', variant: 'neutral' },
};
export const WORK_ORDER_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'brand' }> = {
  PENDIENTE: { label: 'Pendiente', variant: 'warning' },
  EN_CURSO: { label: 'En curso', variant: 'brand' },
  COMPLETADA: { label: 'Completada', variant: 'success' },
  CANCELADA: { label: 'Cancelada', variant: 'neutral' },
};

export const isQuoteExpired = (quote: { valid_until: string | null; status: string }, today = new Date().toISOString().slice(0, 10)) =>
  quote.status === 'ENVIADO' && !!quote.valid_until && quote.valid_until < today;
