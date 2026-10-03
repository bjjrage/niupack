import { z } from 'zod';

export const botExtractSchema = z.object({
  country: z.string().max(4).nullable().optional(),
  language: z.enum(['es', 'pt-BR']).nullable().optional(),
  product_interest: z.string().max(200).nullable().optional(),
  capacity: z.string().max(60).nullable().optional(),
  material: z.string().max(120).nullable().optional(),
  printing: z.string().max(120).nullable().optional(),
  estimated_volume: z.number().positive().nullable().optional(),
  volume_period: z.enum(['ONE_OFF', 'WEEKLY', 'MONTHLY', 'ANNUAL']).nullable().optional(),
  destination_city: z.string().max(120).nullable().optional(),
  destination_state: z.string().max(120).nullable().optional(),
  destination_country: z.string().max(4).nullable().optional(),
  intent: z
    .enum(['PRODUCT_INFO', 'SPEC_REQUEST', 'SAMPLE_REQUEST', 'RFQ', 'PRICE_REQUEST', 'LOGISTICS_REQUEST', 'FOLLOW_UP', 'HUMAN_REQUEST', 'OTHER'])
    .nullable()
    .optional(),
  qualification: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
});
