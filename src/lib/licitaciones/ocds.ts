import { createHash } from 'node:crypto';
import { detectInjectable, isOpaqueValue } from './injectables';
import type { ParsedDocument, ParsedItem, ParsedParty, ParsedTender, PartyRole, TenderSource } from './types';

type Json = Record<string, any>;

export const DNCP_API_BASE = 'https://www.contrataciones.gov.py/datos/api/v3/doc';

export function dncpReleaseUrl(ocid: string): string {
  return `${DNCP_API_BASE}/ocds/releases/ocid/${encodeURIComponent(ocid)}`;
}

/** Acepta un OCID, un número de llamado, una URL de convocatoria o una URL de la API OCDS. */
export function resolveDncpOcid(input: string): string | null {
  const text = (input ?? '').trim();
  if (!text) return null;
  const ocid = /ocds-03ad3f-\d+(?:-\d+)?/.exec(text);
  if (ocid) return ocid[0].includes('-', 'ocds-03ad3f-'.length) ? ocid[0] : `${ocid[0]}-1`;
  const fromUrl = /contrataciones\.gov\.py\/.*?(?:convocatorias|releases\/id)\/(\d{4,8})(?:-|\b)/.exec(text);
  if (fromUrl) return `ocds-03ad3f-${fromUrl[1]}-1`;
  if (/^\d{4,8}$/.test(text)) return `ocds-03ad3f-${text}-1`;
  return null;
}

function rucOf(party: Json | undefined): string | undefined {
  const id = party?.identifier?.id ?? (typeof party?.id === 'string' && party.id.startsWith('PY-RUC-') ? party.id.slice(7) : undefined);
  return id ? String(id) : undefined;
}

function toIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function attr(item: Json, name: string): string | undefined {
  const found = (item.attributes ?? []).find((a: Json) => String(a.name).toLowerCase() === name.toLowerCase());
  return found?.value === undefined ? undefined : String(found.value);
}

const BID_ROLE_ATTRS: Array<{ name: string; role: PartyRole }> = [
  { name: 'Fabricante', role: 'FABRICANTE' },
  { name: 'Laboratorio', role: 'LABORATORIO' },
  { name: 'Importador', role: 'IMPORTADOR' },
  { name: 'Representante', role: 'REPRESENTANTE' },
];

/**
 * Convierte una release OCDS de DNCP en una licitación normalizada.
 * Reglas: invitado ≠ oferente ≠ adjudicatario; el fabricante solo se confirma si el atributo del oferta es legible.
 */
export function parseOcdsRelease(release: Json, opts: { source?: TenderSource; isTestData?: boolean } = {}): ParsedTender {
  const tender: Json = release.tender ?? {};
  const ocid: string = release.ocid ?? '';
  if (!ocid || !tender.title) throw new Error('OCDS_RELEASE_INVALID');
  const source = opts.source ?? 'DNCP_OCDS';
  const sourceUrl = source === 'DNCP_OCDS' ? dncpReleaseUrl(ocid) : undefined;
  const unconfirmed: string[] = [];

  const items: ParsedItem[] = [];
  const lineByItemId = new Map<string, number>();
  (tender.items ?? []).forEach((raw: Json, index: number) => {
    const description = String(raw.description ?? raw.classification?.description ?? '').trim();
    const presentation = attr(raw, 'Presentacion') ?? attr(raw, 'Presentación');
    const injectable = detectInjectable([
      { field: 'descripción', text: description },
      { field: 'clasificación', text: raw.classification?.description },
      { field: 'presentación', text: presentation },
    ]);
    const lineNo = index + 1;
    if (raw.id) lineByItemId.set(String(raw.id), lineNo);
    items.push({
      line_no: lineNo,
      source_item_id: raw.id ? String(raw.id) : undefined,
      description: description || '(sin descripción)',
      classification: raw.classification?.description,
      quantity: typeof raw.quantity === 'number' ? raw.quantity : undefined,
      unit: raw.unit?.name,
      presentation,
      is_injectable: Boolean(injectable),
      injectable_evidence: injectable ? `${injectable.kind} — ${injectable.evidence}` : undefined,
    });
  });

  const partiesById = new Map<string, Json>();
  for (const p of release.parties ?? []) if (p.id) partiesById.set(String(p.id), p);
  const parties: ParsedParty[] = [];
  const seen = new Set<string>();
  const push = (party: ParsedParty) => {
    const key = `${party.role}|${party.name.toLowerCase()}|${party.item_line_no ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    parties.push(party);
  };

  const buyer = release.buyer ?? tender.procuringEntity;
  const convening = buyer?.name as string | undefined;
  if (convening) {
    push({ role: 'CONVOCANTE', name: convening, role_confirmed: true, evidence: 'OCDS buyer/procuringEntity', evidence_url: sourceUrl });
  }

  for (const p of release.parties ?? []) {
    const roles: string[] = p.roles ?? [];
    const name: string | undefined = p.name ?? p.identifier?.legalName;
    if (!name) continue;
    const ruc = rucOf(p);
    if (roles.includes('notifiedSupplier') && !roles.includes('tenderer') && !roles.includes('supplier')) {
      push({ role: 'INVITADO', name, ruc, role_confirmed: true, evidence: 'OCDS parties.roles = notifiedSupplier (invitado, no implica oferta)', evidence_url: sourceUrl });
    }
    if (roles.includes('tenderer')) {
      push({ role: 'OFERENTE', name, ruc, role_confirmed: true, evidence: 'OCDS parties.roles = tenderer (presentó oferta)', evidence_url: sourceUrl });
    }
    if (roles.includes('supplier')) {
      push({ role: 'ADJUDICATARIO', name, ruc, role_confirmed: true, evidence: 'OCDS parties.roles = supplier (adjudicado)', evidence_url: sourceUrl });
    }
  }

  // Adjudicaciones: aseguran el rol aunque la lista de partes no lo traiga.
  for (const award of release.awards ?? []) {
    for (const s of award.suppliers ?? []) {
      const party = partiesById.get(String(s.id));
      push({ role: 'ADJUDICATARIO', name: s.name ?? party?.name ?? '', ruc: rucOf(party) ?? rucOf(s), role_confirmed: true, evidence: `OCDS awards[${award.id}].suppliers`, evidence_url: sourceUrl });
    }
  }

  // Atributos de las ofertas: fabricante/laboratorio/importador solo se confirman si son legibles.
  let opaqueManufacturer = false;
  for (const bid of release.bids?.details ?? []) {
    for (const bidItem of bid.items ?? []) {
      const line = lineByItemId.get(String(bidItem.id));
      for (const { name, role } of BID_ROLE_ATTRS) {
        const value = attr(bidItem, name);
        if (value === undefined) continue;
        if (isOpaqueValue(value)) { opaqueManufacturer = true; continue; }
        push({ role, name: value, role_confirmed: true, evidence: `OCDS bids.details[${bid.id}].items.attributes.${name}`, evidence_url: sourceUrl, item_line_no: line });
      }
    }
  }
  if (opaqueManufacturer) {
    unconfirmed.push('Fabricante/marca/procedencia: DNCP publica estos atributos de la oferta cifrados u ocultos; no se pueden confirmar desde la fuente.');
  }
  if (!parties.some((p) => p.role === 'FABRICANTE' || p.role === 'LABORATORIO')) {
    unconfirmed.push('Fabricante o laboratorio: no confirmado. El adjudicatario no se asume fabricante.');
  }

  const documents: ParsedDocument[] = [
    ...(tender.documents ?? []).map((d: Json) => ({ title: String(d.title ?? d.documentTypeDetails ?? 'documento'), url: d.url, type: d.documentTypeDetails })),
    ...(release.awards ?? []).flatMap((a: Json) => (a.documents ?? []).map((d: Json) => ({ title: String(d.title ?? d.documentTypeDetails ?? 'documento'), url: d.url, type: d.documentTypeDetails }))),
  ];

  const awardDates = (release.awards ?? []).map((a: Json) => toIso(a.date)).filter(Boolean) as string[];
  return {
    source,
    external_id: ocid,
    source_url: sourceUrl,
    title: String(tender.title).trim(),
    convening_entity: convening,
    procurement_object: tender.mainProcurementCategoryDetails ?? tender.mainProcurementCategory,
    status: tender.statusDetails ?? tender.status,
    published_at: toIso(tender.datePublished) ?? toIso(tender.tenderPeriod?.startDate),
    closing_at: toIso(tender.tenderPeriod?.endDate),
    awarded_at: awardDates.sort()[0],
    is_test_data: opts.isTestData ?? false,
    items,
    parties,
    documents,
    unconfirmed,
    raw_document: undefined,
  };
}

/** Identificador estable para documentos manuales sin número de llamado. */
export function manualDocumentId(text: string): string {
  return `doc:${createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 24)}`;
}
