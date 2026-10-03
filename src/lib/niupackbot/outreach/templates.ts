// Templates WhatsApp: crear en Twilio Content API → pedir aprobación → sincronizar estado.
// Un template solo se puede usar en una campaña si está APPROVED y tiene ContentSid.

import { outreachRepository } from './repository';
import { createContent, fetchApproval, requestApproval } from './twilio-content';
import type { OutreachTemplate, TemplateCategory, TemplateLanguage } from './types';

export const TEMPLATE_NAME_RE = /^[a-z0-9_]{3,64}$/;
export const TEMPLATE_LANGUAGES: TemplateLanguage[] = ['es', 'es_AR', 'pt_BR', 'en'];
export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['MARKETING', 'UTILITY'];
export const TEMPLATE_BODY_MAX = 1024;

/** Números de variable usados en el cuerpo: "Hola {{1}}" → [1]. */
export function placeholders(body: string): number[] {
  return [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** Reemplaza {{1}} por su valor. Variables faltantes quedan vacías (el caller valida antes de enviar). */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => variables[n] ?? '');
}

export interface TemplateInput {
  name: string;
  language: TemplateLanguage;
  category: TemplateCategory;
  body: string;
  /** Ejemplo de la variable 1 (nombre del contacto). Obligatorio si el cuerpo usa {{1}}. */
  example1?: string;
}

/** Devuelve el código de error o null si es válido. */
export function validateTemplateInput(input: TemplateInput): string | null {
  if (!TEMPLATE_NAME_RE.test(input.name)) return 'TEMPLATE_NAME_INVALID';
  if (!TEMPLATE_LANGUAGES.includes(input.language)) return 'TEMPLATE_LANGUAGE_INVALID';
  if (!TEMPLATE_CATEGORIES.includes(input.category)) return 'TEMPLATE_CATEGORY_INVALID';
  const body = input.body.trim();
  if (!body || body.length > TEMPLATE_BODY_MAX) return 'TEMPLATE_BODY_INVALID';
  const vars = placeholders(body);
  // V1: una sola variable, {{1}} = nombre del contacto. Evita enviar valores de ejemplo como si fueran reales.
  if (vars.some((v) => v !== 1)) return 'TEMPLATE_ONLY_VARIABLE_1';
  if (vars.length === 1 && !(input.example1 ?? '').trim()) return 'TEMPLATE_EXAMPLE_REQUIRED';
  return null;
}

export async function createTemplate(
  organizationId: string,
  actorProfileId: string | null,
  input: TemplateInput,
  opts: { submit?: boolean } = {},
): Promise<OutreachTemplate> {
  const error = validateTemplateInput(input);
  if (error) throw new Error(error);
  if (await outreachRepository.findTemplateByName(organizationId, input.name)) throw new Error('TEMPLATE_DUPLICATE');
  const body = input.body.trim();
  const variables: Record<string, string> = placeholders(body).length ? { '1': (input.example1 ?? '').trim() } : {};
  // Primero Twilio: así nunca queda una fila local sin ContentSid.
  const contentSid = await createContent({ name: input.name, language: input.language, body, variables });
  let template = await outreachRepository.insertTemplate({
    organization_id: organizationId,
    name: input.name,
    language: input.language,
    category: input.category,
    body,
    variables,
    twilio_content_sid: contentSid,
    status: 'DRAFT',
    rejection_reason: null,
    created_by: actorProfileId,
  });
  if (opts.submit) template = await submitTemplate(organizationId, template.id);
  return template;
}

export async function submitTemplate(organizationId: string, id: string): Promise<OutreachTemplate> {
  const t = await outreachRepository.getTemplate(id, organizationId);
  if (!t) throw new Error('TEMPLATE_NOT_FOUND');
  if (!t.twilio_content_sid) throw new Error('TEMPLATE_WITHOUT_CONTENT_SID');
  if (t.status !== 'DRAFT' && t.status !== 'REJECTED') throw new Error('TEMPLATE_NOT_SUBMITTABLE');
  await requestApproval(t.twilio_content_sid, { name: t.name, category: t.category });
  return outreachRepository.updateTemplate(id, organizationId, { status: 'PENDING', rejection_reason: null });
}

/** Consulta a Twilio/WhatsApp el estado real (APPROVED / PENDING / REJECTED / PAUSED / DISABLED). */
export async function syncTemplate(organizationId: string, id: string): Promise<OutreachTemplate> {
  const t = await outreachRepository.getTemplate(id, organizationId);
  if (!t) throw new Error('TEMPLATE_NOT_FOUND');
  if (!t.twilio_content_sid) throw new Error('TEMPLATE_WITHOUT_CONTENT_SID');
  const { status, rejectionReason } = await fetchApproval(t.twilio_content_sid);
  // Un DRAFT sin pedido de aprobación sigue DRAFT; no lo pasamos a otro estado por error.
  const next = t.status === 'DRAFT' && status === 'DRAFT' ? 'DRAFT' : status;
  return outreachRepository.updateTemplate(id, organizationId, { status: next, rejection_reason: next === 'REJECTED' ? rejectionReason : null });
}

export async function listTemplates(organizationId: string): Promise<OutreachTemplate[]> {
  return outreachRepository.listTemplates(organizationId);
}
