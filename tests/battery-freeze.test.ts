import { describe, it, expect } from 'vitest';
import { repository } from '@/lib/db/repository';

describe('Battery Freeze & Immutability Engine', () => {
  it('should have the initial reference battery frozen and immutable', async () => {
    const batteries = await repository.getBatteries();
    const reference = batteries.find((b) => b.code === 'BRAND_VISIBILITY_BR_AR_BO_V1');

    expect(reference).toBeDefined();
    expect(reference?.is_frozen).toBe(true);
    expect(reference?.status).toBe('FROZEN');
    expect(reference?.frozen_at).toBeDefined();
  });

  it('should reject modification of queries that belong to a frozen battery', async () => {
    const batteries = await repository.getBatteries();
    const reference = batteries.find((b) => b.is_frozen);
    expect(reference).toBeDefined();

    const queries = await repository.getQueries(reference!.id);
    expect(queries.length).toBeGreaterThan(0);
    const targetQuery = queries[0];

    await expect(
      repository.updateQuery(targetQuery.id, { text: 'Modificación no permitida' })
    ).rejects.toThrow('No se pueden modificar consultas de una batería congelada (inmutable)');
  });

  it('should reject deletion of queries that belong to a frozen battery', async () => {
    const batteries = await repository.getBatteries();
    const reference = batteries.find((b) => b.is_frozen);
    const queries = await repository.getQueries(reference!.id);
    const targetQuery = queries[0];

    await expect(repository.deleteQuery(targetQuery.id)).rejects.toThrow(
      'No se pueden eliminar consultas de una batería congelada (inmutable)'
    );
  });

  it('should allow modifying queries in a draft battery and lock them upon freeze', async () => {
    const org = await repository.getOrganization();

    // 1. Create a draft battery
    const draftBattery = await repository.createBattery({
      organization_id: org.id,
      name: 'Batería de Prueba Dinámica',
      code: 'TEST_DYNAMIC_BATTERY',
      version: 1,
      is_frozen: false,
      query_count: 0,
      market_codes: ['BR', 'AR'],
      status: 'DRAFT',
    });
    expect(draftBattery.is_frozen).toBe(false);

    // 2. Add queries to draft
    const [newQuery] = await repository.addQueries([
      {
        battery_id: draftBattery.id,
        organization_id: org.id,
        text: 'Consulta de prueba modificable',
        language: 'es',
        country_code: 'AR',
        city_context: 'Buenos Aires',
        intent: 'test',
        category: 'producto',
        sku: 'CUP-12OZ-SW',
        buyer_persona: 'Analista',
        commercial_priority: 'MEDIUM',
        generated_by: 'MANUAL',
        is_fixed: false,
        version: 1,
        status: 'PROPOSED',
      },
    ]);

    // 3. Update query before freeze (should succeed)
    const updated = await repository.updateQuery(newQuery.id, {
      text: 'Consulta de prueba modificada antes de congelar',
    });
    expect(updated.text).toBe('Consulta de prueba modificada antes de congelar');

    // 4. Freeze the battery
    const frozen = await repository.freezeBattery(draftBattery.id, 'auditor@niupack.com.py');
    expect(frozen.is_frozen).toBe(true);
    expect(frozen.status).toBe('FROZEN');
    expect(frozen.frozen_by).toBe('auditor@niupack.com.py');

    // 5. Attempt update after freeze (should fail)
    await expect(
      repository.updateQuery(newQuery.id, { text: 'Intento post freeze' })
    ).rejects.toThrow('No se pueden modificar consultas de una batería congelada (inmutable)');

    // 6. Verify audit log was recorded
    const auditEvents = await repository.getAuditEvents();
    const freezeEvent = auditEvents.find(
      (ev) => ev.event_type === 'battery_freeze' && ev.entity_id === draftBattery.id
    );
    expect(freezeEvent).toBeDefined();
    expect(freezeEvent?.metadata.code).toBe('TEST_DYNAMIC_BATTERY');
  });
});
