// NIUPACK Commercial CRM V1 — domain types (tenant-aware, packaging).
// CRM es dueño de la verdad comercial. NIUPACKBOT solo sugiere vía CRM Service.

export type PipelineStage =
  | 'NUEVO'
  | 'CONTACTADO'
  | 'CALIFICADO'
  | 'COTIZACIÓN'
  | 'NEGOCIACIÓN'
  | 'GANADO'
  | 'PERDIDO';

export type LeadStatus = PipelineStage;

export type CrmIntent =
  | 'PRODUCT_INFO'
  | 'SPEC_REQUEST'
  | 'SAMPLE_REQUEST'
  | 'RFQ'
  | 'PRICE_REQUEST'
  | 'LOGISTICS_REQUEST'
  | 'FOLLOW_UP'
  | 'HUMAN_REQUEST'
  | 'OTHER';

export type Qualification = 'LOW' | 'MEDIUM' | 'HIGH';

export type VolumePeriod = 'ONE_OFF' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ActivityType =
  | 'LEAD_CREATED'
  | 'LEAD_UPDATED'
  | 'STAGE_CHANGED'
  | 'NOTE'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'BOT_MESSAGE'
  | 'HUMAN_MESSAGE'
  | 'HUMAN_HANDOFF'
  | 'QUOTE_REQUESTED'
  | 'QUOTE_CREATED'
  | 'WON'
  | 'LOST';

export type ConversationStatus = 'OPEN' | 'CLOSED' | 'ARCHIVED';
export type ConversationControl = 'BOT' | 'HUMAN' | 'PAUSED';
export type ConversationChannel = 'WHATSAPP' | 'WEB' | 'EMAIL' | 'OTHER';
export type ConversationProvider = 'TWILIO' | 'MANUAL' | 'OTHER';

export interface CrmCompany {
  id: string;
  organization_id: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  country_code?: string | null;
  city?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  notes?: string | null;
  owner_profile_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmContact {
  id: string;
  organization_id: string;
  company_id?: string | null;
  full_name: string;
  job_title?: string | null;
  phone?: string | null;
  whatsapp_phone?: string | null;
  email?: string | null;
  language?: string | null;
  country_code?: string | null;
  source?: string | null;
  owner_profile_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmLead {
  id: string;
  organization_id: string;
  company_id?: string | null;
  contact_id?: string | null;
  source?: string | null;
  source_channel?: string | null;
  external_source?: string | null;
  external_id?: string | null;
  country_code?: string | null;
  product_interest?: string | null;
  capacity?: string | null;
  material?: string | null;
  printing?: string | null;
  estimated_volume?: number | null;
  volume_period?: VolumePeriod | null;
  destination_city?: string | null;
  destination_state?: string | null;
  destination_country?: string | null;
  intent?: CrmIntent | null;
  qualification?: Qualification | null;
  status: LeadStatus;
  owner_profile_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmOpportunity {
  id: string;
  organization_id: string;
  company_id?: string | null;
  contact_id?: string | null;
  lead_id?: string | null;
  title: string;
  stage: PipelineStage;
  product_interest?: string | null;
  sku?: string | null;
  capacity?: string | null;
  material?: string | null;
  printing?: string | null;
  estimated_volume?: number | null;
  volume_period?: VolumePeriod | null;
  estimated_value?: number | null;
  currency: string;
  destination_city?: string | null;
  destination_state?: string | null;
  destination_country?: string | null;
  owner_profile_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmTask {
  id: string;
  organization_id: string;
  lead_id?: string | null;
  opportunity_id?: string | null;
  company_id?: string | null;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at?: string | null;
  completed_at?: string | null;
  source?: string | null;
  external_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmActivity {
  id: string;
  organization_id: string;
  lead_id?: string | null;
  opportunity_id?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  conversation_id?: string | null;
  type: ActivityType;
  source?: string | null;
  actor_profile_id?: string | null;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  external_key?: string | null;
  occurred_at: string;
  created_at: string;
}

export interface CrmConversation {
  id: string;
  organization_id: string;
  lead_id?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
  channel: ConversationChannel;
  provider: ConversationProvider;
  external_conversation_id: string;
  status: ConversationStatus;
  control_mode: ConversationControl;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead360 {
  lead: CrmLead;
  company?: CrmCompany | null;
  contact?: CrmContact | null;
  opportunities: CrmOpportunity[];
  tasks: CrmTask[];
  activities: CrmActivity[];
  conversation?: CrmConversation | null;
}

export interface CrmDashboard {
  leads_total: number;
  opportunities_open: number;
  in_quote: number;
  in_negotiation: number;
  won_total: number;
  tasks_overdue: number;
  conversations_active: number;
  persistence: 'SUPABASE' | 'MEMORY_FALLBACK' | 'NOT_CONFIGURED';
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'NUEVO',
  'CONTACTADO',
  'CALIFICADO',
  'COTIZACIÓN',
  'NEGOCIACIÓN',
  'GANADO',
  'PERDIDO',
];

const ORDER: Record<PipelineStage, number> = {
  NUEVO: 0,
  CONTACTADO: 1,
  CALIFICADO: 2,
  'COTIZACIÓN': 3,
  'NEGOCIACIÓN': 4,
  GANADO: 5,
  PERDIDO: 6,
};

export function stageOrder(stage: PipelineStage): number {
  return ORDER[stage] ?? 0;
}

/** BOT no puede cerrar ni retroceder; HUMAN tiene autoridad final. */
export function isBotStageTransitionAllowed(from: PipelineStage, to: PipelineStage): boolean {
  if (from === to) return true;
  if (from === 'GANADO' || from === 'PERDIDO') return false;
  if (to === 'GANADO' || to === 'PERDIDO') return false;
  return stageOrder(to) >= stageOrder(from);
}
