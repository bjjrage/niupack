import { z } from 'zod';
import { detectInjectable } from './injectables';
import { manualDocumentId, parseOcdsRelease } from './ocds';
import type { ParsedItem, ParsedTender, PartyRole } from './types';

const ROLES = ['INVITADO', 'OFERENTE', 'ADJUDICATARIO', 'FABRICANTE', 'LABORATORIO', 'IMPORTADOR', 'REPRESENTANTE'] as const;

export const manualTenderSchema = z.object({
  title: z.string().trim().min(3),
  external_id: z.string().trim().min(3).max(120).optional(),
  source_url: z.string().trim().url().optional(),
  convening_entity: z.string().trim().optional(),
  status: z.string().trim().optional(),
  is_test_data: z.boolean().default(false),
  items: z.array(z.object({
    description: z.string().trim().min(2),
    quantity: z.number().positive().optional(),
    unit: z.string().trim().optional(),
    presentation: z.string().trim().optional(),
  })).min(1),
  parties: z.array(z.object({
    role: z.enum(ROLES),
    name: z.string().trim().min(2),
    ruc: z.string().trim().optional(),
    // Sin evidencia el rol queda "no confirmado": una carga manual no puede afirmar hechos que no documenta.
    evidence: z.string().trim().optional(),
  })).default([]),
});

export type ManualTenderInput = z.infer<typeof manualTenderSchema>;

export function buildManualTender(input: ManualTenderInput): ParsedTender {
  const items: ParsedItem[] = input.items.map((raw, index) => {
    const injectable = detectInjectable([
      { field: 'descripción', text: raw.description },
      { field: 'presentación', text: raw.presentation },
    ]);
    return {
      line_no: index + 1, description: raw.description, quantity: raw.quantity, unit: raw.unit, presentation: raw.presentation,
      is_injectable: Boolean(injectable), injectable_evidence: injectable ? `${injectable.kind} — ${injectable.evidence}` : undefined,
    };
  });
  const unconfirmed: string[] = [];
  const parties = input.parties.map((p) => {
    const confirmed = Boolean(p.evidence);
    if (!confirmed) unconfirmed.push(`${p.role} ${p.name}: sin evidencia documental, rol no confirmado`);
    return {
      role: p.role as PartyRole, name: p.name, ruc: p.ruc || undefined, role_confirmed: confirmed,
      evidence: p.evidence || 'Carga manual sin evidencia documental (no confirmado)', evidence_url: input.source_url,
    };
  });
  const externalId = input.external_id ?? manualDocumentId(`${input.title}|${input.source_url ?? ''}`);
  return {
    source: input.source_url ? 'MANUAL_URL' : 'MANUAL_DOCUMENT',
    external_id: externalId,
    source_url: input.source_url,
    title: input.title,
    convening_entity: input.convening_entity,
    status: input.status,
    is_test_data: input.is_test_data,
    items, parties, awards: [], phase: 'DESCONOCIDA',
    documents: input.source_url ? [{ title: 'Fuente indicada por el usuario', url: input.source_url }] : [],
    unconfirmed,
  };
}

/** Documento OCDS pegado/subido por el usuario (por ejemplo descargado de DNCP cuando la API no responde). */
export function parseOcdsDocumentText(text: string, isTestData: boolean): { tender: ParsedTender; rawRelease: unknown } {
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error('OCDS_DOCUMENT_NOT_JSON'); }
  const release = Array.isArray(json?.releases) ? json.releases[0] : json?.ocid ? json : json?.compiledRelease;
  if (!release) throw new Error('OCDS_RELEASE_INVALID');
  return { tender: parseOcdsRelease(release, { source: 'MANUAL_DOCUMENT', isTestData }), rawRelease: release };
}
