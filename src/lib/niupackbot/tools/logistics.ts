import type { ToolResult } from '../types';

// Logística: adapter al contrato autorizado NIUPACK, no a tablas arbitrarias.
// V1: si no hay input suficiente o provider no configurado => UNAVAILABLE/NOT_CONFIGURED.
export async function estimateLogistics(input: { destination_city?: string | null; volume?: number | null }): Promise<ToolResult> {
  if (!input.destination_city) return { status: 'UNAVAILABLE', message: 'Falta ciudad de entrega' };
  return { status: 'NOT_CONFIGURED', message: 'Estimador logístico pendiente de contrato autorizado' };
}
