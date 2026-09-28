import { FreightRateProvider, FreightSearchInput, LogisticsRate, RateSearchResult } from './domain';

export class SeaRatesProvider implements FreightRateProvider {
  readonly code = 'SEARATES_API' as const;

  async searchRates(_input: FreightSearchInput, _organizationId: string): Promise<RateSearchResult> {
    if (!process.env.SEARATES_API_KEY) {
      return {
        provider: 'SeaRates',
        status: 'NOT_CONFIGURED',
        rates: [],
        message: 'SEARATES_API_KEY no está configurada. No se generaron tarifas simuladas.',
      };
    }
    return {
      provider: 'SeaRates',
      status: 'ERROR',
      rates: [],
      message: 'Credencial detectada, pero el contrato de endpoint SeaRates debe configurarse antes de consultar producción.',
    };
  }
}

export class ManualRateProvider {
  static create(input: Omit<LogisticsRate, 'id' | 'created_at' | 'updated_at' | 'source'>): LogisticsRate {
    const now = new Date().toISOString();
    return { ...input, id: crypto.randomUUID(), source: 'MANUAL_RATE', created_at: now, updated_at: now };
  }
}
