import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ExportCostAdjustmentEngine } from '@/lib/engines/export-cost-adjustment-engine';
import { logisticsRepository } from '@/lib/logistics/repository';
import { repository } from '@/lib/db/repository';
import { supabaseAdmin } from '@/lib/db/supabase';

const schema = z.object({
  sku: z.string(), quantity: z.number().positive(), export_specific_costs: z.number().nonnegative(), units_per_box: z.number().positive(),
  boxes_per_pallet: z.number().positive().optional(), total_m3: z.number().nonnegative(), total_weight_kg: z.number().nonnegative(),
  fx_source: z.string(), fx_rate: z.number().positive(), fx_timestamp: z.string(),
  manufacturing_components: z.array(z.object({ id: z.string(), label: z.string(), amount: z.number().nonnegative(),
    tax_treatment: z.enum(['RECOVERABLE','NON_RECOVERABLE','PARTIALLY_RECOVERABLE','EXEMPT','NOT_APPLICABLE','UNCLASSIFIED']), recoverable_percent: z.number().min(0).max(100).optional() })),
  logistics_rate_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const logisticsRate = input.logistics_rate_id ? await logisticsRepository.getRate(input.logistics_rate_id) : undefined;
    if (input.logistics_rate_id && !logisticsRate) throw new Error('LOGISTICS_RATE_NOT_FOUND');
    if (logisticsRate && !['SELECTED', 'BOOKING_REQUESTED', 'BOOKED'].includes(logisticsRate.status)) throw new Error('LOGISTICS_RATE_NOT_SELECTED');
    const result = ExportCostAdjustmentEngine.calculate({ ...input, logistics_rate: logisticsRate });
    const organization = await repository.getOrganization();
    if (logisticsRepository.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { error } = await supabaseAdmin.from('export_cost_adjustments').insert({
        organization_id: organization.id, sku: input.sku, quantity: input.quantity,
        logistics_rate_id: logisticsRate?.id, cash_cost: result.cash_cost, recoverable_tax: result.recoverable_tax,
        export_specific_cost: result.export_specific_cost, logistics_cost: result.logistics_cost,
        economic_export_cost: result.economic_export_cost, components: input.manufacturing_components,
        fx_source: input.fx_source, fx_rate: input.fx_rate, fx_timestamp: input.fx_timestamp,
      });
      if (error) throw new Error(error.message);
    }
    await repository.logAuditEvent({ event_type: 'EXPORT_COST_CALCULATED', target_entity: 'export_cost_adjustment', entity_id: input.sku, metadata: { logistics_rate_id: logisticsRate?.id, persistence: logisticsRepository.persistenceMode() } });
    return NextResponse.json({ result, persistence: logisticsRepository.persistenceMode() });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, { status: 400 }); }
}
