import { z } from 'zod';

/** Audiencia de una campaña: contactos del CRM y/o filas importadas (se re-normalizan en servidor). */
export const audienceSchema = z.object({
  contactIds: z.array(z.string().max(60)).max(2000).optional(),
  rows: z.array(z.object({ name: z.string().max(200), phone: z.string().max(40) })).max(2000).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(140),
  templateId: z.string().max(60),
  sendRatePerMin: z.number().int().min(1).max(60).optional(),
  scheduledAt: z.string().max(40).nullable().optional(),
  audience: audienceSchema.optional(),
});
