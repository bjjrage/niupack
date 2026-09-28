import { z } from 'zod';

const nullableDate = z.preprocess(
  (value) => value === '' ? null : value,
  z.string().min(8).nullable(),
).optional().transform((value) => value ?? null);

export const logisticsRfqCreateSchema = z.object({
  origin_country: z.string().min(2),
  origin_city: z.string().min(2),
  origin_address: z.string().optional(),
  destination_country: z.string().min(2),
  destination_city: z.string().min(2),
  destination_address: z.string().optional(),
  pickup_date: z.string().min(8),
  delivery_target_date: nullableDate,
  cargo_description: z.string().min(3),
  weight_kg: z.coerce.number().nonnegative(),
  volume_m3: z.coerce.number().nonnegative(),
  pallet_count: z.coerce.number().int().nonnegative(),
  equipment_type: z.enum(['FTL', 'LTL', 'TRUCK', 'SEMI', 'OTHER']),
  commercial_term: z.string().min(2),
  notes: z.string().optional(),
  quote_deadline: z.string().datetime(),
  currency_preferences: z.array(z.string().min(3)).min(1),
});
