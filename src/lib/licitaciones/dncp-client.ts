import { DNCP_API_BASE, dncpReleaseUrl, parseOcdsRelease, resolveDncpOcid } from './ocds';
import type { ParsedTender } from './types';

export class DncpError extends Error {
  constructor(
    public code: 'DNCP_INVALID_IDENTIFIER' | 'DNCP_NOT_FOUND' | 'DNCP_UNREACHABLE' | 'DNCP_BAD_RESPONSE' | 'DNCP_RATE_LIMITED',
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'DncpError';
  }
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface DncpHttpOptions {
  fetchImpl?: FetchLike;
  /** Pausa entre reintentos (inyectable para que los tests no esperen). */
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * GET con reintentos ante 429/5xx/red (DNCP limita la tasa). Un 404 se informa como DNCP_NOT_FOUND;
 * quien consulta un buscador lo interpreta como "sin resultados". Nunca devuelve datos inventados.
 */
async function getJson(url: string, options: DncpHttpOptions = {}): Promise<any> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const sleep = options.sleep ?? realSleep;
  const retries = options.retries ?? 3;
  let lastError: DncpError | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (response.status === 404) throw new DncpError('DNCP_NOT_FOUND', 'DNCP no tiene ese recurso.', 404);
      if (response.status === 429) lastError = new DncpError('DNCP_RATE_LIMITED', 'DNCP limitó la frecuencia de consultas (429).', 429);
      else if (!response.ok) lastError = new DncpError('DNCP_UNREACHABLE', `DNCP respondió HTTP ${response.status}.`, 502);
      else return await response.json();
    } catch (error) {
      if (error instanceof DncpError && error.code === 'DNCP_NOT_FOUND') throw error;
      lastError = error instanceof DncpError ? error : new DncpError('DNCP_UNREACHABLE', 'No se pudo consultar DNCP.', 502);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(1_500 * 2 ** attempt);
  }
  throw lastError ?? new DncpError('DNCP_UNREACHABLE', 'No se pudo consultar DNCP.', 502);
}

/** Trae una licitación real desde la API OCDS pública de DNCP. Nunca fabrica datos si la fuente no responde. */
export async function fetchDncpTender(identifier: string, options: DncpHttpOptions | FetchLike = {}): Promise<{ tender: ParsedTender; rawRelease: unknown }> {
  const http: DncpHttpOptions = typeof options === 'function' ? { fetchImpl: options, retries: 0 } : options;
  const ocid = resolveDncpOcid(identifier);
  if (!ocid) throw new DncpError('DNCP_INVALID_IDENTIFIER', 'Ingresá un número de llamado, un OCID (ocds-03ad3f-…) o una URL de contrataciones.gov.py.', 400);
  const body = await getJson(dncpReleaseUrl(ocid), http).catch((error) => {
    if (error instanceof DncpError && error.code === 'DNCP_NOT_FOUND') throw new DncpError('DNCP_NOT_FOUND', 'DNCP no tiene ese llamado.', 404);
    throw error;
  });
  const release = body?.releases?.[0];
  if (!release) throw new DncpError('DNCP_BAD_RESPONSE', 'La respuesta de DNCP no contiene la release OCDS esperada.', 502);
  return { tender: parseOcdsRelease(release), rawRelease: release };
}

export interface DncpSearchHit {
  ocid: string;
  title: string;
  status?: string;
  entity?: string;
  /** Fecha de última modificación publicada por DNCP (ISO). Sirve como marca de agua del escaneo. */
  date?: string;
  suppliers: Array<{ name: string; ruc?: string }>;
}

export interface DncpSearchResult { hits: DncpSearchHit[]; totalItems: number; totalPages: number }

function mapRecords(body: any): DncpSearchResult {
  if (!Array.isArray(body?.records)) throw new DncpError('DNCP_BAD_RESPONSE', 'Respuesta de búsqueda inesperada.', 502);
  const hits: DncpSearchHit[] = body.records.map((record: any) => {
    const release = record.compiledRelease ?? {};
    return {
      ocid: String(record.ocid ?? release.ocid),
      title: String(release.tender?.title ?? ''),
      status: release.tender?.statusDetails,
      entity: release.buyer?.name,
      date: typeof release.date === 'string' ? new Date(release.date).toISOString() : undefined,
      suppliers: (release.awards ?? []).flatMap((a: any) => (a.suppliers ?? []).map((s: any) => ({ name: s.name, ruc: typeof s.id === 'string' ? s.id.replace(/^PY-RUC-/, '') : undefined }))),
    };
  });
  return { hits, totalItems: body.pagination?.total_items ?? hits.length, totalPages: body.pagination?.total_pages ?? 1 };
}

const EMPTY: DncpSearchResult = { hits: [], totalItems: 0, totalPages: 0 };

async function search(query: string, page: number, http: DncpHttpOptions): Promise<DncpSearchResult> {
  try {
    return mapRecords(await getJson(`${DNCP_API_BASE}/search/processes?${query}&page=${Math.max(1, Math.floor(page))}`, http));
  } catch (error) {
    if (error instanceof DncpError && error.code === 'DNCP_NOT_FOUND') return EMPTY; // el buscador responde 404 cuando no hay coincidencias
    throw error;
  }
}

/** Búsqueda por título (ya no se expone en la pantalla; la usan las pruebas de conectividad). */
export async function searchDncp(keyword: string, page = 1, options: DncpHttpOptions | FetchLike = {}): Promise<DncpSearchResult> {
  const http: DncpHttpOptions = typeof options === 'function' ? { fetchImpl: options, retries: 0 } : options;
  const term = keyword.trim();
  if (term.length < 3) throw new DncpError('DNCP_INVALID_IDENTIFIER', 'La búsqueda necesita al menos 3 caracteres.', 400);
  return search(`tender.title=${encodeURIComponent(term)}`, page, http);
}

/**
 * Licitaciones cuyos ítems mencionan una palabra (por ejemplo "inyectable"), de la más nueva a la más vieja por última modificación.
 * DNCP filtra del lado del servidor; después se confirma cada ficha completa.
 */
export async function searchDncpByKeyword(itemKeyword: string, page = 1, http: DncpHttpOptions = {}): Promise<DncpSearchResult> {
  const term = itemKeyword.trim();
  if (term.length < 3) throw new DncpError('DNCP_INVALID_IDENTIFIER', 'La palabra clave necesita al menos 3 caracteres.', 400);
  return search(`tender.items.description=${encodeURIComponent(term)}`, page, http);
}
