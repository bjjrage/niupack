export const money = (amount: number | null | undefined, currency?: string | null) =>
  amount == null ? '—' : `${!currency || currency === 'PYG' ? 'Gs.' : currency} ${Number(amount).toLocaleString('es-PY', { maximumFractionDigits: 2 })}`;

export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('es-PY', { timeZone: 'America/Asuncion' }) : '—';

export const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('es-PY', { timeZone: 'America/Asuncion', dateStyle: 'short', timeStyle: 'short' }) : '—';

export const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'brand' }> = {
  BORRADOR: { label: 'Borrador', variant: 'neutral' },
  COTIZANDO: { label: 'Cotizando', variant: 'warning' },
  OFERTAS_RECIBIDAS: { label: 'Ofertas recibidas', variant: 'brand' },
  AUTORIZADO: { label: 'Orden emitida', variant: 'success' },
  CANCELADO: { label: 'Cancelada', variant: 'neutral' },
  CERRADO: { label: 'Cerrada', variant: 'neutral' },
};

export const INVITATION_STATUS: Record<string, string> = { INVITADO: 'Sin abrir', ABIERTO: 'Abrió el enlace', RESPONDIDO: 'Respondió' };
export const PURPOSE_LABEL: Record<string, string> = { COST_DISCOVERY: 'Descubrir costos', PROCUREMENT: 'Compra' };

export const FIELD_LABEL: Record<string, string> = {
  unit_price: 'Precio unitario', currency: 'Moneda', tax_rate: 'Impuesto %', available_quantity: 'Disponible', lead_time_days: 'Plazo (días)',
  freight: 'Flete', payment_terms: 'Condiciones de pago', valid_until: 'Vigencia', document: 'Documento',
};

export const inputClass = 'w-full rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none';
export const buttonClass = 'inline-flex items-center gap-1 rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50';
export const ghostButtonClass = 'inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50';

/** fetch con errores legibles: el servidor devuelve { error, message } y se muestra el mensaje. */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issues = Array.isArray(data.issues) ? data.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join(' · ') : '';
    throw new Error(data.message || issues || data.error || `Error ${response.status}`);
  }
  return data as T;
}

export const postJson = <T = unknown>(url: string, body: unknown) =>
  api<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
