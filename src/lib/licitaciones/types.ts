export type TenderSource = 'DNCP_OCDS' | 'MANUAL_DOCUMENT' | 'MANUAL_URL' | 'TEST_FIXTURE';

export type PartyRole =
  | 'CONVOCANTE'
  | 'INVITADO'
  | 'OFERENTE'
  | 'ADJUDICATARIO'
  | 'FABRICANTE'
  | 'LABORATORIO'
  | 'IMPORTADOR'
  | 'REPRESENTANTE';

export interface ParsedItem {
  line_no: number;
  /** Identificador del ítem en la fuente; solo se usa para asociar ofertas al ítem. */
  source_item_id?: string;
  description: string;
  classification?: string;
  quantity?: number;
  unit?: string;
  presentation?: string;
  is_injectable: boolean;
  injectable_evidence?: string;
}

export interface ParsedParty {
  role: PartyRole;
  name: string;
  ruc?: string;
  /** true solo cuando el documento afirma el rol de forma legible (no inferido). */
  role_confirmed: boolean;
  evidence: string;
  evidence_url?: string;
  item_line_no?: number;
}

export interface ParsedDocument {
  title: string;
  url?: string;
  type?: string;
}

export interface ParsedTender {
  source: TenderSource;
  external_id: string;
  source_url?: string;
  title: string;
  convening_entity?: string;
  procurement_object?: string;
  status?: string;
  published_at?: string;
  closing_at?: string;
  awarded_at?: string;
  /** Fecha de última modificación publicada por la fuente (release.date). */
  source_updated_at?: string;
  is_test_data: boolean;
  items: ParsedItem[];
  parties: ParsedParty[];
  documents: ParsedDocument[];
  /** Hechos que el documento no permite confirmar (se muestran como "no confirmado"). */
  unconfirmed: string[];
  raw_document?: unknown;
}

export interface ScoreReason {
  code: string;
  points: number;
  text: string;
}

export type Potential = 'ALTO' | 'MEDIO' | 'BAJO' | 'NO_EVALUADO';

export interface CandidateScore {
  score: number;
  potential: Potential;
  reasons: ScoreReason[];
}
