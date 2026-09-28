import { describe, expect, it } from 'vitest';
import { logisticsRepository } from '@/lib/logistics/repository';
import { logisticsRfqCreateSchema } from '@/lib/logistics/rfq-schema';

const baseInput = {
  origin_country: 'PY',
  origin_city: 'Asunción',
  destination_country: 'BR',
  destination_city: 'São Paulo',
  pickup_date: '2026-09-29',
  cargo_description: 'Vasos',
  weight_kg: 500,
  volume_m3: 50,
  pallet_count: 10,
  equipment_type: 'SEMI' as const,
  commercial_term: 'CPT',
  quote_deadline: '2026-09-30T12:00:00.000Z',
  currency_preferences: ['USD'],
};

function repositoryInput(input: ReturnType<typeof logisticsRfqCreateSchema.parse>) {
  return {
    ...input,
    organization_id: '00000000-0000-0000-0000-0000000000a1',
    code: `TEST-${crypto.randomUUID()}`,
    status: 'DRAFT' as const,
    transport_mode: 'ROAD' as const,
    created_by: 'NIUPACK_OS',
  };
}

describe('road RFQ creation', () => {
  it('creates an RFQ with pickup_date and no delivery target', async () => {
    const parsed = logisticsRfqCreateSchema.parse(baseInput);
    expect(parsed.delivery_target_date).toBeNull();
    const rfq = await logisticsRepository.createRfq(repositoryInput(parsed));
    expect(rfq.pickup_date).toBe(baseInput.pickup_date);
    expect(rfq.delivery_target_date).toBeNull();
  });

  it('accepts both pickup and delivery target dates', () => {
    const parsed = logisticsRfqCreateSchema.parse({ ...baseInput, delivery_target_date: '2026-10-05' });
    expect(parsed.delivery_target_date).toBe('2026-10-05');
  });

  it('rejects an RFQ without pickup_date', () => {
    expect(() => logisticsRfqCreateSchema.parse({ ...baseInput, pickup_date: '' })).toThrow();
  });
});
