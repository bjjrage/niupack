// Campañas WhatsApp: creación, destinatarios, ciclo de vida y cola de envío.
// Outbound business-initiated SIEMPRE con template APPROVED (ContentSid). Nunca texto libre.

import { crmRepository } from '@/lib/crm/repository';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import { normalizePhone } from './phone';
import { outreachRepository } from './repository';
import { placeholders } from './templates';
import { sendWhatsappTemplate, twilioOutboundConfig, type SendResult } from '../whatsapp/sender';
import type { CampaignCounters, CampaignRecipient, CampaignStatus, OutreachCampaign, OutreachTemplate, RecipientInput } from './types';

export const MAX_RECIPIENTS_PER_CAMPAIGN = 2000;
export const MAX_SEND_ATTEMPTS = 3;
/** Un destinatario QUEUED sin MessageSid por más de esto pudo haber sido enviado: no se reintenta solo. */
export const STUCK_QUEUE_MS = 10 * 60 * 1000;

const CAN_LAUNCH_FROM: CampaignStatus[] = ['DRAFT', 'SCHEDULED'];

// ---------- Permisos ----------

/** Enviar WhatsApp masivo cuesta dinero y sale al exterior: solo admin u operator. */
export async function assertCanSend(organizationId: string, profileId: string | null | undefined): Promise<void> {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return; // test / dev en memoria
  if (!profileId) throw new Error('FORBIDDEN');
  const { data, error } = await supabaseAdmin.from('profiles').select('role').eq('id', profileId).eq('organization_id', organizationId).maybeSingle();
  if (error) throw new Error(`profiles: ${error.message}`);
  const role = (data as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'operator') throw new Error('FORBIDDEN');
}

// ---------- Contadores ----------

export function emptyCounters(): CampaignCounters {
  return { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, replied: 0, human: 0, failed: 0, optOut: 0, noInterest: 0 };
}

/** "Enviado" incluye todo lo que avanzó después del envío. */
export function countStatuses(statuses: string[]): CampaignCounters {
  const c = emptyCounters();
  for (const s of statuses) {
    c.total += 1;
    if (s === 'PENDING' || s === 'QUEUED') c.pending += 1;
    if (['SENT', 'DELIVERED', 'READ', 'REPLIED', 'HUMAN'].includes(s)) c.sent += 1;
    if (['DELIVERED', 'READ', 'REPLIED', 'HUMAN'].includes(s)) c.delivered += 1;
    if (['READ', 'REPLIED', 'HUMAN'].includes(s)) c.read += 1;
    if (s === 'REPLIED' || s === 'HUMAN') c.replied += 1;
    if (s === 'HUMAN') c.human += 1;
    if (s === 'FAILED') c.failed += 1;
    if (s === 'OPT_OUT') c.optOut += 1;
    if (s === 'NO_INTEREST') c.noInterest += 1;
  }
  return c;
}

export interface CampaignSummary extends OutreachCampaign {
  template_name: string | null;
  template_status: string | null;
  counters: CampaignCounters;
}

export async function listCampaigns(organizationId: string): Promise<CampaignSummary[]> {
  const [campaigns, templates] = await Promise.all([outreachRepository.listCampaigns(organizationId), outreachRepository.listTemplates(organizationId)]);
  const statuses = await outreachRepository.recipientStatuses(organizationId, campaigns.map((c) => c.id));
  const byCampaign = new Map<string, string[]>();
  for (const s of statuses) byCampaign.set(s.campaign_id, [...(byCampaign.get(s.campaign_id) ?? []), s.status]);
  const tpl = new Map(templates.map((t) => [t.id, t]));
  return campaigns.map((c) => ({
    ...c,
    template_name: tpl.get(c.template_id)?.name ?? null,
    template_status: tpl.get(c.template_id)?.status ?? null,
    counters: countStatuses(byCampaign.get(c.id) ?? []),
  }));
}

export async function getCampaignSummary(organizationId: string, id: string): Promise<(CampaignSummary & { template: OutreachTemplate | null }) | undefined> {
  const c = await outreachRepository.getCampaign(id, organizationId);
  if (!c) return undefined;
  const [template, statuses] = await Promise.all([
    outreachRepository.getTemplate(c.template_id, organizationId),
    outreachRepository.recipientStatuses(organizationId, [id]),
  ]);
  return {
    ...c,
    template: template ?? null,
    template_name: template?.name ?? null,
    template_status: template?.status ?? null,
    counters: countStatuses(statuses.map((s) => s.status)),
  };
}

// ---------- Destinatarios ----------

export interface AudienceInput {
  /** Contactos del CRM (se resuelve teléfono, nombre y cuenta en servidor). */
  contactIds?: string[];
  /** Filas importadas por CSV / pegado: el teléfono se vuelve a normalizar en servidor. */
  rows?: Array<{ name: string; phone: string }>;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/** Variables del destinatario según el template (V1: {{1}} = nombre de pila). */
function variablesFor(template: OutreachTemplate, name: string): Record<string, string> {
  return placeholders(template.body).includes(1) ? { '1': firstName(name) || name } : {};
}

async function resolveAudience(organizationId: string, template: OutreachTemplate, audience: AudienceInput): Promise<RecipientInput[]> {
  const out = new Map<string, RecipientInput>();
  const contacts = await crmRepository.listContacts(organizationId);
  const byPhone = new Map<string, (typeof contacts)[number]>();
  for (const c of contacts) {
    for (const raw of [c.whatsapp_phone, c.phone]) {
      const p = normalizePhone(raw);
      if (p.ok && !byPhone.has(p.e164)) byPhone.set(p.e164, c);
    }
  }
  const byId = new Map(contacts.map((c) => [c.id, c]));

  for (const id of audience.contactIds ?? []) {
    const c = byId.get(id);
    if (!c) throw new Error('CROSS_TENANT_REFERENCE'); // contacto inexistente o de otra organización
    const p = normalizePhone(c.whatsapp_phone || c.phone);
    if (!p.ok || out.has(p.e164)) continue;
    out.set(p.e164, { name: c.full_name, phone_e164: p.e164, contact_id: c.id, company_id: c.company_id ?? null, variables: variablesFor(template, c.full_name) });
  }
  for (const r of audience.rows ?? []) {
    const p = normalizePhone(r.phone);
    if (!p.ok || out.has(p.e164)) continue;
    const known = byPhone.get(p.e164); // si ya es contacto del CRM, se vincula
    const name = (r.name || known?.full_name || '').trim() || 'Contacto';
    out.set(p.e164, { name, phone_e164: p.e164, contact_id: known?.id ?? null, company_id: known?.company_id ?? null, variables: variablesFor(template, name) });
  }
  return [...out.values()];
}

export async function addRecipients(organizationId: string, campaignId: string, audience: AudienceInput): Promise<{ added: number; skipped: number; optOut: number }> {
  const campaign = await outreachRepository.getCampaign(campaignId, organizationId);
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
  if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) throw new Error('CAMPAIGN_NOT_EDITABLE');
  const template = await outreachRepository.getTemplate(campaign.template_id, organizationId);
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  const rows = await resolveAudience(organizationId, template, audience);
  const existing = (await outreachRepository.recipientStatuses(organizationId, [campaignId])).length;
  if (existing + rows.length > MAX_RECIPIENTS_PER_CAMPAIGN) throw new Error('RECIPIENT_LIMIT_EXCEEDED');
  // Los que ya dieron de baja entran como OPT_OUT: quedan visibles pero jamás se envían.
  const blocked = await outreachRepository.listOptedOut(organizationId, rows.map((r) => r.phone_e164));
  const res = await outreachRepository.insertRecipients(
    organizationId,
    campaignId,
    rows.map((r) => (blocked.has(r.phone_e164) ? { ...r, status: 'OPT_OUT' as const } : r)),
  );
  return { added: res.inserted, skipped: res.skipped, optOut: rows.filter((r) => blocked.has(r.phone_e164)).length };
}

// ---------- Ciclo de vida ----------

export interface CampaignInput {
  name: string;
  templateId: string;
  sendRatePerMin?: number;
  scheduledAt?: string | null;
  audience?: AudienceInput;
}

export async function createCampaign(organizationId: string, actorProfileId: string | null, input: CampaignInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 140) throw new Error('CAMPAIGN_NAME_INVALID');
  const template = await outreachRepository.getTemplate(input.templateId, organizationId);
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  const rate = Math.min(60, Math.max(1, Math.round(input.sendRatePerMin ?? 20)));
  let scheduledAt: string | null = null;
  if (input.scheduledAt) {
    const d = new Date(input.scheduledAt);
    if (Number.isNaN(d.getTime())) throw new Error('SCHEDULE_INVALID');
    scheduledAt = d.toISOString();
  }
  const campaign = await outreachRepository.insertCampaign({
    organization_id: organizationId,
    name,
    template_id: template.id,
    status: 'DRAFT',
    scheduled_at: scheduledAt,
    send_rate_per_min: rate,
    created_by: actorProfileId,
    launched_at: null,
    completed_at: null,
  });
  const recipients = input.audience ? await addRecipients(organizationId, campaign.id, input.audience) : { added: 0, skipped: 0, optOut: 0 };
  return { campaign, recipients };
}

async function loadLaunchable(organizationId: string, id: string): Promise<{ campaign: OutreachCampaign; template: OutreachTemplate }> {
  const campaign = await outreachRepository.getCampaign(id, organizationId);
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
  const template = await outreachRepository.getTemplate(campaign.template_id, organizationId);
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  // Regla dura: fuera de la ventana de 24h solo se puede enviar un template aprobado.
  if (template.status !== 'APPROVED' || !template.twilio_content_sid) throw new Error('TEMPLATE_NOT_APPROVED');
  if (!twilioOutboundConfig()) throw new Error('TWILIO_NOT_CONFIGURED');
  return { campaign, template };
}

export async function launchCampaign(organizationId: string, actorProfileId: string | null, id: string, now = new Date()): Promise<OutreachCampaign> {
  await assertCanSend(organizationId, actorProfileId);
  const { campaign } = await loadLaunchable(organizationId, id);
  if (!CAN_LAUNCH_FROM.includes(campaign.status)) throw new Error('CAMPAIGN_NOT_LAUNCHABLE');
  const pending = await outreachRepository.listByStatus(organizationId, id, 'PENDING', 1);
  if (pending.length === 0) throw new Error('CAMPAIGN_WITHOUT_RECIPIENTS');
  const future = campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > now.getTime();
  const updated = await outreachRepository.updateCampaign(
    id,
    organizationId,
    future ? { status: 'SCHEDULED' } : { status: 'RUNNING', launched_at: campaign.launched_at ?? now.toISOString() },
    CAN_LAUNCH_FROM, // CAS: dos clics / dos requests no lanzan dos veces
  );
  if (!updated) throw new Error('CAMPAIGN_NOT_LAUNCHABLE');
  return updated;
}

export async function pauseCampaign(organizationId: string, actorProfileId: string | null, id: string): Promise<OutreachCampaign> {
  await assertCanSend(organizationId, actorProfileId);
  const u = await outreachRepository.updateCampaign(id, organizationId, { status: 'PAUSED' }, ['RUNNING', 'SCHEDULED']);
  if (!u) throw new Error('CAMPAIGN_NOT_PAUSABLE');
  return u;
}

export async function resumeCampaign(organizationId: string, actorProfileId: string | null, id: string): Promise<OutreachCampaign> {
  await assertCanSend(organizationId, actorProfileId);
  await loadLaunchable(organizationId, id);
  const u = await outreachRepository.updateCampaign(id, organizationId, { status: 'RUNNING' }, ['PAUSED']);
  if (!u) throw new Error('CAMPAIGN_NOT_RESUMABLE');
  return u;
}

export async function cancelCampaign(organizationId: string, actorProfileId: string | null, id: string): Promise<OutreachCampaign> {
  await assertCanSend(organizationId, actorProfileId);
  const u = await outreachRepository.updateCampaign(id, organizationId, { status: 'CANCELLED', completed_at: new Date().toISOString() }, ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED']);
  if (!u) throw new Error('CAMPAIGN_NOT_CANCELLABLE');
  return u;
}

/** Vuelve a poner en cola los FAILED (acción manual). Reabre la campaña si ya estaba COMPLETED. */
export async function retryFailed(organizationId: string, actorProfileId: string | null, id: string): Promise<{ requeued: number }> {
  await assertCanSend(organizationId, actorProfileId);
  const { campaign } = await loadLaunchable(organizationId, id);
  if (campaign.status === 'CANCELLED') throw new Error('CAMPAIGN_NOT_RESUMABLE');
  const failed = await outreachRepository.listByStatus(organizationId, id, 'FAILED', 2000);
  for (const r of failed) {
    await outreachRepository.updateRecipient(r.id, organizationId, { status: 'PENDING', attempts: 0, last_error: null, claimed_at: null, failed_at: null, message_sid: null });
  }
  if (failed.length > 0 && campaign.status === 'COMPLETED') {
    await outreachRepository.updateCampaign(id, organizationId, { status: 'RUNNING', completed_at: null }, ['COMPLETED']);
  }
  return { requeued: failed.length };
}

// ---------- Cola de envío ----------

export interface QueueResult {
  campaigns: number;
  sent: number;
  failed: number;
  retried: number;
  optOut: number;
  skipped: number;
  blocked?: 'TWILIO_NOT_CONFIGURED';
}

type Sender = (input: { to: string; contentSid: string; variables?: Record<string, string> }) => Promise<SendResult>;

/**
 * Un tick del scheduler. Toma como máximo `send_rate_per_min` destinatarios por campaña RUNNING.
 * Idempotente: el claim PENDING→QUEUED es atómico, así que ticks concurrentes, retries de Vercel
 * o refrescos de la UI no pueden enviar dos veces al mismo destinatario.
 */
export async function processQueue(
  organizationId: string,
  opts: { campaignId?: string; now?: Date; send?: Sender; maxMs?: number } = {},
): Promise<QueueResult> {
  const now = opts.now ?? new Date();
  const send = opts.send ?? sendWhatsappTemplate;
  const deadline = Date.now() + (opts.maxMs ?? 20_000);
  const result: QueueResult = { campaigns: 0, sent: 0, failed: 0, retried: 0, optOut: 0, skipped: 0 };

  if (!twilioOutboundConfig()) return { ...result, blocked: 'TWILIO_NOT_CONFIGURED' };

  // SCHEDULED vencidas pasan a RUNNING.
  const scheduled = await outreachRepository.listCampaigns(organizationId, ['SCHEDULED']);
  for (const c of scheduled) {
    if (opts.campaignId && c.id !== opts.campaignId) continue;
    if (c.scheduled_at && new Date(c.scheduled_at).getTime() <= now.getTime()) {
      await outreachRepository.updateCampaign(c.id, organizationId, { status: 'RUNNING', launched_at: c.launched_at ?? now.toISOString() }, ['SCHEDULED']);
    }
  }

  const running = (await outreachRepository.listCampaigns(organizationId, ['RUNNING'])).filter((c) => !opts.campaignId || c.id === opts.campaignId);
  for (const campaign of running) {
    if (Date.now() >= deadline) break;
    result.campaigns += 1;
    const template = await outreachRepository.getTemplate(campaign.template_id, organizationId);
    // Template dejó de estar aprobado (pausado/deshabilitado por WhatsApp): se frena la campaña, no se envía nada.
    if (!template || template.status !== 'APPROVED' || !template.twilio_content_sid) {
      await outreachRepository.updateCampaign(campaign.id, organizationId, { status: 'PAUSED' }, ['RUNNING']);
      continue;
    }

    // QUEUED viejos sin MessageSid: pudieron salir antes de caerse el worker. Nunca se reenvían solos.
    const stuck = await outreachRepository.listByStatus(organizationId, campaign.id, 'QUEUED', 100, new Date(now.getTime() - STUCK_QUEUE_MS).toISOString());
    for (const r of stuck) {
      if (r.message_sid) continue;
      await outreachRepository.updateRecipient(r.id, organizationId, { status: 'FAILED', last_error: 'DELIVERY_UNKNOWN', failed_at: now.toISOString() });
      result.failed += 1;
    }

    const batch = await outreachRepository.listByStatus(organizationId, campaign.id, 'PENDING', campaign.send_rate_per_min);
    let rateLimited = false;
    for (const candidate of batch) {
      if (Date.now() >= deadline || rateLimited) break;
      const phone = normalizePhone(candidate.phone_e164);
      if (!phone.ok) {
        await outreachRepository.updateRecipient(candidate.id, organizationId, { status: 'FAILED', last_error: 'INVALID_PHONE', failed_at: now.toISOString() });
        result.failed += 1;
        continue;
      }
      // Opt-out se re-verifica justo antes de enviar (pudo darse de baja después de importar).
      if (await outreachRepository.isOptedOut(organizationId, phone.e164)) {
        await outreachRepository.updateRecipient(candidate.id, organizationId, { status: 'OPT_OUT' });
        result.optOut += 1;
        continue;
      }
      const needsName = placeholders(template.body).includes(1);
      if (needsName && !candidate.content_variables['1']) {
        await outreachRepository.updateRecipient(candidate.id, organizationId, { status: 'FAILED', last_error: 'MISSING_VARIABLES', failed_at: now.toISOString() });
        result.failed += 1;
        continue;
      }
      const claimed = await outreachRepository.claimRecipient(organizationId, candidate.id);
      if (!claimed) {
        result.skipped += 1; // otro worker lo tomó
        continue;
      }
      const res = await send({ to: phone.e164, contentSid: template.twilio_content_sid, variables: claimed.content_variables });
      if (res.ok) {
        await outreachRepository.updateRecipient(claimed.id, organizationId, { status: 'SENT', message_sid: res.sid, sent_at: new Date().toISOString(), last_error: null });
        result.sent += 1;
      } else if (res.transient && claimed.attempts < MAX_SEND_ATTEMPTS) {
        await outreachRepository.updateRecipient(claimed.id, organizationId, { status: 'PENDING', claimed_at: null, last_error: res.code });
        result.retried += 1;
        if (res.httpStatus === 429) rateLimited = true; // Twilio pide bajar el ritmo: cortamos este tick
      } else {
        await outreachRepository.updateRecipient(claimed.id, organizationId, { status: 'FAILED', last_error: res.code, failed_at: new Date().toISOString() });
        result.failed += 1;
      }
    }

    // Sin pendientes ni en cola → campaña completa.
    const open = (await outreachRepository.recipientStatuses(organizationId, [campaign.id])).filter((s) => s.status === 'PENDING' || s.status === 'QUEUED');
    if (open.length === 0) {
      await outreachRepository.updateCampaign(campaign.id, organizationId, { status: 'COMPLETED', completed_at: new Date().toISOString() }, ['RUNNING']);
    }
  }
  return result;
}

export type { CampaignRecipient };
