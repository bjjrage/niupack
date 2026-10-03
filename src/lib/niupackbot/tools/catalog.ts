import type { ToolResult } from '../types';

// Catálogo: reutiliza master NIUPACK si existe; si no, deshabilitado sin inventar.
export async function searchProducts(query: string, organizationId?: string): Promise<ToolResult<Array<{ sku: string; name: string }>>> {
  try {
    if (!organizationId) return { status: 'UNAVAILABLE', message: 'Sin organización' };
    const { repository } = await import('@/lib/db/repository');
    const skus = await repository.getSKUs(organizationId);
    if (!skus || skus.length === 0) return { status: 'UNAVAILABLE', message: 'Catálogo no configurado' };
    const q = query.toLowerCase();
    const hits = skus
      .filter((s) => `${s.sku} ${s.material} ${s.coating}`.toLowerCase().includes(q.slice(0, 24).toLowerCase()) || q.length < 3)
      .slice(0, 5)
      .map((s) => ({ sku: s.sku, name: s.sku }));
    return { status: 'OK', data: hits };
  } catch {
    return { status: 'UNAVAILABLE', message: 'Catálogo no disponible' };
  }
}

export async function getProductSpec(_sku: string): Promise<ToolResult> {
  return { status: 'NOT_CONFIGURED', message: 'Ficha técnica pendiente de fuente autorizada' };
}
