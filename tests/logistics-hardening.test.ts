import { describe, expect, it } from 'vitest';
import { logisticsRepository } from '@/lib/logistics/repository';

const orgA = '00000000-0000-0000-0000-0000000000a1';
const orgB = '00000000-0000-0000-0000-0000000000b1';

function rfq(organization_id: string) {
  return {
    organization_id, code: `TEST-${crypto.randomUUID()}`, status: 'DRAFT' as const,
    origin_country: 'PY', origin_city: 'Asuncion', destination_country: 'BR', destination_city: 'Sao Paulo',
    pickup_date: '2026-11-01', cargo_description: 'Test cargo', weight_kg: 10, volume_m3: 1, pallet_count: 1,
    equipment_type: 'FTL' as const, transport_mode: 'ROAD' as const, commercial_term: 'FCA', quote_deadline: '2026-12-01T00:00:00.000Z', currency_preferences: ['USD'],
  };
}

describe('Logistics production hardening', () => {
  it('filters reads and rejects cross-tenant updates in the repository boundary', async () => {
    const a = await logisticsRepository.createRfq(rfq(orgA));
    const b = await logisticsRepository.createRfq(rfq(orgB));
    expect((await logisticsRepository.listRfqs(orgA)).some((item) => item.id === b.id)).toBe(false);
    expect(await logisticsRepository.getRfq(b.id, orgA)).toBeUndefined();
    await expect(logisticsRepository.updateRfq(b.id, { status: 'CANCELLED' }, orgA)).rejects.toThrow('RFQ_NOT_FOUND');
    expect((await logisticsRepository.listRfqs(orgB)).some((item) => item.id === b.id)).toBe(true);
    expect(a.organization_id).toBe(orgA);
  });

  it('does not permit cross-tenant rate access or booking', async () => {
    const rate = await logisticsRepository.createRate({
      organization_id: orgB, origin: { country: 'PY' }, destination: { country: 'BR' }, mode: 'ROAD', amount: 100, currency: 'USD', status: 'CONFIRMED', source: 'MANUAL_RATE', components: {},
    });
    expect(await logisticsRepository.getRate(rate.id, orgA)).toBeUndefined();
    await expect(logisticsRepository.createBooking(rate.id, orgA)).rejects.toThrow('RATE_NOT_FOUND');
  });

  it('fails closed instead of activating memory persistence in production', () => {
    expect(logisticsRepository.persistenceMode('production', true)).toBe('NOT_CONFIGURED');
    expect(() => logisticsRepository.assertPersistence('production', true)).toThrow('LOGISTICS_PERSISTENCE_NOT_CONFIGURED');
  });
});
