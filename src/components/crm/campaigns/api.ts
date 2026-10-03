// Cliente de las APIs de campañas. A diferencia de sendJson, conserva el código de error del servidor
// para poder explicárselo al vendedor en español.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callApi<T = Record<string, unknown>>(url: string, method: 'GET' | 'POST', body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP_${res.status}` };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'NETWORK' };
  }
}
