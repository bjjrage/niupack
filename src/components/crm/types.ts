import type { OwnerRef } from './commercial-ui';

export interface Opp {
  id: string;
  title: string;
  stage: string;
  product_interest?: string | null;
  capacity?: string | null;
  material?: string | null;
  printing?: string | null;
  estimated_volume?: number | null;
  volume_period?: string | null;
  estimated_value?: number | null;
  currency?: string | null;
  destination_city?: string | null;
  destination_country?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  lead_id?: string | null;
  owner_profile_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  expected_close_at?: string | null;
  probability?: number | null;
  qualification?: string | null;
  intent?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LeadRow {
  id: string;
  company_id?: string | null;
  contact_id?: string | null;
  product_interest?: string | null;
  capacity?: string | null;
  estimated_volume?: number | null;
  volume_period?: string | null;
  destination_city?: string | null;
  destination_country?: string | null;
  intent?: string | null;
  qualification?: string | null;
  status?: string | null;
  owner_profile_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  updated_at?: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  task_type?: string | null;
  due_at?: string | null;
  lead_id?: string | null;
  opportunity_id?: string | null;
  company_id?: string | null;
  assigned_to?: string | null;
  external_key?: string | null;
}

export interface ConvRow {
  id: string;
  external_conversation_id: string;
  control_mode: string;
  status: string;
  lead_id?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
  last_message_at?: string | null;
}

/** Campaña de la que nació una conversación (si vino de outreach). */
export interface ConversationCampaign {
  campaign_id: string;
  campaign_name: string;
  recipient_status: string;
}

export interface InboxItem {
  conversation: ConvRow;
  lead?: { product_interest?: string; qualification?: string } | null;
  campaign?: ConversationCampaign | null;
  last_message?: { direction: 'INBOUND' | 'OUTBOUND'; author_role: string; preview: string; at: string } | null;
}

export interface CompanyRow {
  id: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  country_code?: string | null;
  city?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  lifecycle_stage?: string | null;
  owner_profile_id?: string | null;
  updated_at?: string;
}

export interface ContactRow {
  id: string;
  full_name: string;
  whatsapp_phone?: string | null;
  phone?: string | null;
  email?: string | null;
  company_id?: string | null;
}

export interface CompanyHealth {
  company_id: string;
  company_name: string;
  last_purchase_date: string | null;
  active_skus: number;
  soon_count: number;
  overdue_count: number;
  worst_status: string | null;
  next_repurchase_at: string | null;
  next_repurchase_sku: string | null;
  owner_profile_id?: string | null;
}

export interface RepurchaseAlert {
  company_id: string;
  company_name: string;
  sku: string;
  product_name: string;
  last_purchase_date: string;
  median_days_between_orders: number | null;
  expected_next_purchase_at: string | null;
  days_until_expected_purchase: number | null;
  average_order_quantity: number;
  average_order_value: number | null;
  repurchase_status: string;
  owner_profile_id?: string | null;
}

export interface SalesDash {
  pipeline_open_count: number;
  pipeline_open_value: number;
  won_month_count: number;
  won_month_value: number;
  weighted_forecast: number;
  won_count: number;
  lost_count: number;
  stage_breakdown: Array<{ stage: string; count: number; value: number }>;
}

/** Un SKU del maestro de productos (products + product_attributes). */
export interface CatalogSku {
  sku: string;
  product_id: string;
  product_name: string;
  product_code: string;
  category: string;
  size: string | null;
  material: string | null;
  moq: number | null;
  /** "Vaso de papel · 12 oz · VP12-SW" — lo que ve el vendedor. */
  label: string;
}

/** Todo lo que el workspace carga una vez y comparten las vistas. */
export interface CrmData {
  catalog: CatalogSku[];
  catalogBySku: Map<string, CatalogSku>;
  owners: OwnerRef[];
  opps: Opp[];
  leads: LeadRow[];
  tasks: TaskRow[];
  companies: CompanyRow[];
  contacts: ContactRow[];
  inbox: InboxItem[];
  alerts: RepurchaseAlert[];
  health: CompanyHealth[];
  dash: SalesDash | null;
  companyById: Map<string, CompanyRow>;
  contactById: Map<string, ContactRow>;
  leadById: Map<string, LeadRow>;
  oppById: Map<string, Opp>;
  loading: boolean;
}

export interface CrmActions {
  reload: () => void;
  notify: (msg: string, tone?: 'ok' | 'error') => void;
  openOpp: (id: string) => void;
  openAccount: (id: string) => void;
  /** Salta a Conversaciones con ese chat abierto. */
  openConversation: (id: string) => void;
  newTask: (prefill?: Partial<TaskRow>) => void;
}

/** Clave idempotente compartida con el motor de recompra (purchase-service.generateTasks). */
export function repurchaseKeyPrefix(companyId: string, sku: string): string {
  return `repurchase:${companyId}:${sku}:`;
}
