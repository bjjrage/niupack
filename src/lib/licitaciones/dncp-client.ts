import { DNCP_API_BASE, dncpReleaseUrl, parseOcdsRelease, resolveDncpOcid } from './ocds';
import type { ParsedTender } from './types';

export class DncpError extends Error {
  constructor(public code: 'DNCP_INVALID_IDENTIFIER' | 'DNCP_NOT_FOUND' | 'DNCP_UNREACHABLE' | 'DNCP_BAD_RESPONSE', message: string, public status: number) {
    super(message);
    this.name = 'DncpError';
  }
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

async function getJson(url: string, fetchImpl: FetchLike, timeoutMs = 25_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (response.status === 404) throw new DncpError('DNCP_NOT_FOUND', 'DNCP no tiene ese llamado.', 404);
    if (!response.ok) throw new DncpError('DNCP_UNREACHABLE', `DNCP respondió HTTP ${response.status}.`, 502);
    return await response.json();
  } catch (error) {
    if (error instanceof DncpError) throw error;
    throw new DncpError('DNCP_UNREACHABLE', 'No se pudo consultar DNCP. Podés cargar el documento manualmente.', 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Trae una licitación real desde la API OCDS pública de DNCP. Nunca fabrica datos si la fuente no responde. */
export async function fetchDncpTender(identifier: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<{ tender: ParsedTender; rawRelease: unknown }> {
  const ocid = resolveDncpOcid(identifier);
  if (!ocid) throw new DncpError('DNCP_INVALID_IDENTIFIER', 'Ingresá un número de llamado, un OCID (ocds-03ad3f-…) o una URL de contrataciones.gov.py.', 400);
  const body = await getJson(dncpReleaseUrl(ocid), fetchImpl);
  const release = body?.releases?.[0];
  if (!release) throw new DncpError('DNCP_BAD_RESPONSE', 'La respuesta de DNCP no contiene la release OCDS esperada.', 502);
  return { tender: parseOcdsRelease(release), rawRelease: release };
}

export interface DncpSearchHit {
  ocid: string;
  title: string;
  status?: string;
  entity?: string;
  suppliers: Array<{ name: string; ruc?: string }>;
}

/** Búsqueda por título en el buscador oficial. Devuelve solo lo que DNCP respondió; importar es un paso aparte. */
export async function searchDncp(keyword: string, page = 1, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<{ hits: DncpSearchHit[]; totalItems: number; totalPages: number }> {
  const term = keyword.trim();
  if (term.length < 3) throw new DncpError('DNCP_INVALID_IDENTIFIER', 'La búsqueda necesita al menos 3 caracteres.', 400);
  const url = `${DNCP_API_BASE}/search/processes?tender.title=${encodeURIComponent(term)}&page=${Math.max(1, Math.floor(page))}`;
  const body = await getJson(url, fetchImpl);
  if (!Array.isArray(body?.records)) throw new DncpError('DNCP_BAD_RESPONSE', 'Respuesta de búsqueda inesperada.', 502);
  const hits: DncpSearchHit[] = body.records.map((record: any) => {
    const release = record.compiledRelease ?? {};
    return {
      ocid: String(record.ocid ?? release.ocid),
      title: String(release.tender?.title ?? ''),
      status: release.tender?.statusDetails,
      entity: release.buyer?.name,
      suppliers: (release.awards ?? []).flatMap((a: any) => (a.suppliers ?? []).map((s: any) => ({ name: s.name, ruc: typeof s.id === 'string' ? s.id.replace(/^PY-RUC-/, '') : undefined }))),
    };
  });
  return { hits, totalItems: body.pagination?.total_items ?? hits.length, totalPages: body.pagination?.total_pages ?? 1 };
}
