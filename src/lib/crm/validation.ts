import { z } from 'zod';

const nullableText = (max = 500) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().max(max).nullable().optional().transform((v) => v ?? null));

const volumePeriod = z.enum(['ONE_OFF', 'WEEKLY', 'MONTHLY', 'ANNUAL']).nullable().optional();
const lifecycleStage = z.enum(['PROSPECT', 'CUSTOMER', 'INACTIVE']).nullable().optional();
const taskType = z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'QUOTE', 'OTHER']).nullable().optional();
const probability = z.coerce.number().min(0).max(100).nullable().optional();

export const companySchema = z.object({
  name: z.string().min(2).max(200),
  legal_name: nullableText(200),
  tax_id: nullableText(60),
  country_code: nullableText(4),
  city: nullableText(120),
  website: nullableText(300),
  phone: nullableText(60),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().email().nullable().optional().transform((v) => v ?? null)),
  source: nullableText(80),
  notes: nullableText(2000),
  owner_profile_id: nullableText(60),
  lifecycle_stage: lifecycleStage,
});

export const contactSchema = z.object({
  company_id: nullableText(60),
  full_name: z.string().min(2).max(200),
  job_title: nullableText(120),
  phone: nullableText(60),
  whatsapp_phone: nullableText(60),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().email().nullable().optional().transform((v) => v ?? null)),
  language: nullableText(12),
  country_code: nullableText(4),
  source: nullableText(80),
  owner_profile_id: nullableText(60),
});

const intent = z
  .enum(['PRODUCT_INFO', 'SPEC_REQUEST', 'SAMPLE_REQUEST', 'RFQ', 'PRICE_REQUEST', 'LOGISTICS_REQUEST', 'FOLLOW_UP', 'HUMAN_REQUEST', 'OTHER'])
  .nullable()
  .optional();
const qualification = z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional();
const leadStatus = z.enum(['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN', 'GANADO', 'PERDIDO']);

export const leadCreateSchema = z.object({
  company_id: nullableText(60),
  contact_id: nullableText(60),
  source: nullableText(80),
  source_channel: nullableText(80),
  external_source: nullableText(80),
  external_id: nullableText(160),
  country_code: nullableText(4),
  product_interest: nullableText(200),
  capacity: nullableText(60),
  material: nullableText(120),
  printing: nullableText(120),
  estimated_volume: z.coerce.number().positive().nullable().optional(),
  volume_period: volumePeriod,
  destination_city: nullableText(120),
  destination_state: nullableText(120),
  destination_country: nullableText(4),
  intent,
  qualification,
  status: leadStatus.optional(),
  owner_profile_id: nullableText(60),
  next_action: nullableText(500),
  next_action_at: nullableText(40),
});

export const leadUpdateSchema = leadCreateSchema.partial();

export const opportunityCreateSchema = z.object({
  company_id: nullableText(60),
  contact_id: nullableText(60),
  lead_id: nullableText(60),
  title: z.string().min(2).max(240),
  stage: z.enum(['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN', 'GANADO', 'PERDIDO']).optional(),
  product_interest: nullableText(200),
  sku: nullableText(80),
  capacity: nullableText(60),
  material: nullableText(120),
  printing: nullableText(120),
  estimated_volume: z.coerce.number().positive().nullable().optional(),
  volume_period: volumePeriod,
  estimated_value: z.coerce.number().nonnegative().nullable().optional(),
  currency: z.string().min(3).max(4).optional(),
  destination_city: nullableText(120),
  destination_state: nullableText(120),
  destination_country: nullableText(4),
  owner_profile_id: nullableText(60),
  next_action: nullableText(500),
  next_action_at: nullableText(40),
  expected_close_at: nullableText(40),
  probability,
  lost_reason: nullableText(500),
});

export const opportunityUpdateSchema = opportunityCreateSchema.partial();

export const stageChangeSchema = z.object({
  stage: z.enum(['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN', 'GANADO', 'PERDIDO']),
  lost_reason: z.string().max(500).optional().nullable(),
});

export const taskCreateSchema = z.object({
  lead_id: nullableText(60),
  opportunity_id: nullableText(60),
  company_id: nullableText(60),
  title: z.string().min(2).max(240),
  description: nullableText(2000),
  assigned_to: nullableText(60),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  task_type: taskType,
  due_at: nullableText(40),
  source: nullableText(80),
  external_key: nullableText(160),
});

export const taskUpdateSchema = taskCreateSchema.partial();

export const activityCreateSchema = z.object({
  lead_id: nullableText(60),
  opportunity_id: nullableText(60),
  company_id: nullableText(60),
  contact_id: nullableText(60),
  conversation_id: nullableText(60),
  type: z.enum([
    'LEAD_CREATED', 'LEAD_UPDATED', 'STAGE_CHANGED', 'NOTE', 'TASK_CREATED', 'TASK_COMPLETED',
    'BOT_MESSAGE', 'HUMAN_MESSAGE', 'HUMAN_HANDOFF', 'QUOTE_REQUESTED', 'QUOTE_CREATED', 'WON', 'LOST',
  ]),
  source: nullableText(80),
  title: nullableText(240),
  body: nullableText(4000),
  metadata: z.record(z.unknown()).optional(),
  external_key: nullableText(160),
});

export const inboundLeadSchema = z.object({
  external_source: z.string().min(2).max(40),
  external_id: z.string().min(1).max(160),
  source_channel: z.string().min(2).max(40).optional().default('WHATSAPP'),
  contact_name: z.string().min(1).max(200).optional(),
  whatsapp_phone: z.string().min(5).max(40).optional(),
  country_code: z.string().min(2).max(4).optional().nullable(),
  language: z.string().min(2).max(12).optional().nullable(),
  product_interest: z.string().max(200).optional().nullable(),
  capacity: z.string().max(60).optional().nullable(),
  material: z.string().max(120).optional().nullable(),
  printing: z.string().max(120).optional().nullable(),
  estimated_volume: z.coerce.number().positive().optional().nullable(),
  volume_period: volumePeriod,
  destination_city: z.string().max(120).optional().nullable(),
  destination_state: z.string().max(120).optional().nullable(),
  destination_country: z.string().max(4).optional().nullable(),
  intent,
  qualification,
});
