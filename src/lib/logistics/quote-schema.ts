import { z } from 'zod';

/**
 * Fields a provider may submit through a magic link.
 * Linkage fields are deliberately absent: the server derives those from the
 * invitation instead of trusting values supplied by the browser.
 */
export const logisticsQuoteSchema = z.object({
  quoted_total: z.coerce.number().nonnegative(),
  currency: z.string().length(3),
  transit_days: z.coerce.number().int().nonnegative(),
  valid_from: z.string().optional(),
  valid_until: z.string().optional(),
  pickup: z.coerce.number().nonnegative().optional(),
  origin_charges: z.coerce.number().nonnegative().optional(),
  main_freight: z.coerce.number().nonnegative().optional(),
  border_charges: z.coerce.number().nonnegative().optional(),
  destination_delivery: z.coerce.number().nonnegative().optional(),
  insurance: z.coerce.number().nonnegative().optional(),
  other_charges: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
  contact_name: z.string().min(2),
  contact_email: z.string().email().optional(),
}).strict();

export type LogisticsQuotePayload = z.infer<typeof logisticsQuoteSchema>;
