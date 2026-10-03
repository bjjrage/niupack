// NIUPACKBOT Outreach — tipos. Campañas WhatsApp business-initiated (templates aprobados).
// El CRM sigue siendo la verdad comercial; acá vive solo el outbound de campañas.

export type TemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
export type TemplateCategory = 'MARKETING' | 'UTILITY';
export type TemplateLanguage = 'es' | 'es_AR' | 'pt_BR' | 'en';

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type RecipientStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'REPLIED'
  | 'HUMAN'
  | 'NO_INTEREST'
  | 'OPT_OUT'
  | 'FAILED';

export interface OutreachTemplate {
  id: string;
  organization_id: string;
  name: string;
  language: TemplateLanguage;
  category: TemplateCategory;
  body: string;
  variables: Record<string, string>;
  twilio_content_sid?: string | null;
  status: TemplateStatus;
  rejection_reason?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachCampaign {
  id: string;
  organization_id: string;
  name: string;
  template_id: string;
  status: CampaignStatus;
  scheduled_at?: string | null;
  send_rate_per_min: number;
  created_by?: string | null;
  launched_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  id: string;
  organization_id: string;
  campaign_id: string;
  contact_id?: string | null;
  company_id?: string | null;
  conversation_id?: string | null;
  name: string;
  phone_e164: string;
  content_variables: Record<string, string>;
  status: RecipientStatus;
  message_sid?: string | null;
  attempts: number;
  last_error?: string | null;
  claimed_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  replied_at?: string | null;
  failed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OptOut {
  id: string;
  organization_id: string;
  phone_e164: string;
  reason?: string | null;
  source: 'INBOUND_KEYWORD' | 'MANUAL' | 'IMPORT';
  created_at: string;
}

/** Contadores de una campaña para listado y detalle. */
export interface CampaignCounters {
  total: number;
  pending: number;
  sent: number; // enviados (incluye los que avanzaron: delivered/read/replied/human)
  delivered: number; // entregados o más
  read: number;
  replied: number; // respondieron (incluye human)
  human: number; // requieren vendedor
  failed: number;
  optOut: number;
  noInterest: number;
}

/** Fila lista para crear destinatarios (ya normalizada y validada). */
export interface RecipientInput {
  name: string;
  phone_e164: string;
  contact_id?: string | null;
  company_id?: string | null;
  /** Variables extra por fila; {{1}} = nombre si el template lo usa. */
  variables?: Record<string, string>;
}
