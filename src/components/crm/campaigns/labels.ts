// Etiquetas en español y tonos para los estados de campañas, templates y destinatarios.
// La UI nunca muestra enums crudos.

import type { Tone } from '../commercial-ui';
import type { CampaignStatus, RecipientStatus, TemplateStatus } from '@/lib/niupackbot/outreach/types';

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  SCHEDULED: { label: 'Programada', tone: 'info' },
  RUNNING: { label: 'Enviando', tone: 'brand' },
  PAUSED: { label: 'Pausada', tone: 'warning' },
  COMPLETED: { label: 'Completada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

export const TEMPLATE_STATUS: Record<TemplateStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PENDING: { label: 'En revisión de WhatsApp', tone: 'warning' },
  APPROVED: { label: 'Aprobado', tone: 'success' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
  PAUSED: { label: 'Pausado por WhatsApp', tone: 'warning' },
  DISABLED: { label: 'Deshabilitado', tone: 'danger' },
};

export const RECIPIENT_STATUS: Record<RecipientStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pendiente', tone: 'neutral' },
  QUEUED: { label: 'En cola', tone: 'info' },
  SENT: { label: 'Enviado', tone: 'neutral' },
  DELIVERED: { label: 'Entregado', tone: 'info' },
  READ: { label: 'Leído', tone: 'info' },
  REPLIED: { label: 'Respondió', tone: 'success' },
  HUMAN: { label: 'Requiere vendedor', tone: 'warning' },
  NO_INTEREST: { label: 'No le interesa', tone: 'neutral' },
  OPT_OUT: { label: 'Baja', tone: 'danger' },
  FAILED: { label: 'Falló', tone: 'danger' },
};

export const LANGUAGE_LABEL: Record<string, string> = { es: 'Español', es_AR: 'Español (AR)', pt_BR: 'Portugués (BR)', en: 'Inglés' };
export const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidad' };

const ERRORS: Record<string, string> = {
  FORBIDDEN: 'Solo un administrador u operador puede hacer esto.',
  TWILIO_NOT_CONFIGURED: 'Twilio no está configurado en el servidor (faltan claves o el número de WhatsApp).',
  TWILIO_CONTENT_API_ERROR: 'WhatsApp/Twilio rechazó el pedido. Probá de nuevo en unos minutos.',
  TEMPLATE_NOT_APPROVED: 'El template todavía no está aprobado por WhatsApp. No se puede lanzar.',
  TEMPLATE_DUPLICATE: 'Ya existe un template con ese nombre.',
  TEMPLATE_NAME_INVALID: 'El nombre usa solo minúsculas, números y guion bajo (3 a 64 caracteres).',
  TEMPLATE_BODY_INVALID: 'El mensaje no puede estar vacío ni superar los 1.024 caracteres.',
  TEMPLATE_ONLY_VARIABLE_1: 'Por ahora el template solo admite la variable {{1}} (nombre del contacto).',
  TEMPLATE_EXAMPLE_REQUIRED: 'Si usás {{1}}, cargá un ejemplo de nombre para que WhatsApp pueda aprobarlo.',
  TEMPLATE_NOT_SUBMITTABLE: 'Este template ya fue enviado a aprobación.',
  TEMPLATE_NOT_FOUND: 'El template no existe.',
  CAMPAIGN_WITHOUT_RECIPIENTS: 'La campaña no tiene destinatarios pendientes.',
  CAMPAIGN_NOT_LAUNCHABLE: 'La campaña no se puede lanzar en su estado actual.',
  CAMPAIGN_NOT_EDITABLE: 'La campaña ya no admite cambios de audiencia.',
  CAMPAIGN_NOT_RESUMABLE: 'La campaña no se puede reanudar.',
  CAMPAIGN_NAME_INVALID: 'Poné un nombre de campaña (2 a 140 caracteres).',
  RECIPIENT_LIMIT_EXCEEDED: 'Máximo 2.000 destinatarios por campaña.',
  CROSS_TENANT_REFERENCE: 'Uno de los contactos no existe en tu organización.',
  NOT_HUMAN_CONTROL: 'Tomá la conversación antes de responder.',
  OPTED_OUT: 'Este contacto pidió no recibir mensajes.',
  OUTSIDE_24H_WINDOW: 'Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo permite enviar un template aprobado.',
  SEND_FAILED: 'WhatsApp no aceptó el mensaje. No se envió.',
  REPLY_BODY_INVALID: 'Escribí un mensaje (hasta 1.000 caracteres).',
  INVALID_REQUEST: 'Revisá los datos del formulario.',
};

export function errorMessage(code: string | undefined): string {
  return (code && ERRORS[code]) || 'No se pudo completar la acción. Probá de nuevo.';
}

const RECIPIENT_ERRORS: Record<string, string> = {
  INVALID_PHONE: 'Teléfono inválido',
  MISSING_VARIABLES: 'Falta el nombre para el template',
  DELIVERY_UNKNOWN: 'Envío incierto: verificá en WhatsApp antes de reenviar',
  HTTP_429: 'WhatsApp pidió bajar el ritmo',
  NETWORK_ERROR: 'Sin conexión con Twilio',
  '21211': 'Número inválido',
  TWILIO_63016: 'Fuera de la ventana de 24 h',
  TWILIO_63024: 'Número sin WhatsApp',
  TWILIO_63032: 'El usuario no aceptó mensajes de marketing',
  TWILIO_63049: 'WhatsApp bloqueó el envío (marketing)',
  TWILIO_132015: 'Template pausado por WhatsApp',
};

export function recipientError(code?: string | null): string {
  if (!code) return '';
  return RECIPIENT_ERRORS[code] ?? `Error de envío (${code})`;
}
