import { describe, expect, it } from 'vitest';
import { INITIAL_PLANT_PARAMETERS } from '@/lib/db/seed-data';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';

describe('initial industrial parameters', () => {
  it('use the defined reference power: Gen 1 = 6 kW, Gen 2 = 15 kW', () => {
    expect(INITIAL_PLANT_PARAMETERS.gen1_power_kw).toBe(6);
    expect(INITIAL_PLANT_PARAMETERS.gen2_power_kw).toBe(15);
  });

  it('do not assume an electricity tariff or a packaging materials cost', () => {
    expect(INITIAL_PLANT_PARAMETERS.electricity_rate_pyg_kwh).toBe(0);
    expect(INITIAL_PLANT_PARAMETERS.packaging_materials_cost_per_thousand_usd).toBe(0);
  });

  it('keep the official calculation incomplete until both are configured', () => {
    const missing = IndustrialProcessCostEngine.getMissingConfiguration(INITIAL_PLANT_PARAMETERS, 6010);
    expect(missing).toContain('Tarifa eléctrica global (Gs./kWh)');
    expect(missing).toContain('Costo de materiales de empaque (USD/1.000)');

    const configured = IndustrialProcessCostEngine.getMissingConfiguration(
      { ...INITIAL_PLANT_PARAMETERS, electricity_rate_pyg_kwh: 500, packaging_materials_cost_per_thousand_usd: 2 },
      6010
    );
    expect(configured).not.toContain('Tarifa eléctrica global (Gs./kWh)');
    expect(configured).not.toContain('Costo de materiales de empaque (USD/1.000)');
  });
});
