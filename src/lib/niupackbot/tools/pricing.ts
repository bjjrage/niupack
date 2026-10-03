import type { ToolResult } from '../types';

// Precio comercial: NUNCA true cost. Industrial Cost está PREVIEW/INACTIVE.
// Sin fuente comercial autorizada => NOT_CONFIGURED, el bot deriva a humano.
export async function getCommercialPrice(_input: { sku?: string | null; volume?: number | null }): Promise<ToolResult> {
  return {
    status: 'NOT_CONFIGURED',
    message: 'Precio comercial pendiente de fuente autorizada; derivar a asesor humano.',
  };
}
