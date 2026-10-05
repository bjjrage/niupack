import type { LogisticsRate } from './domain';

/** Creates a real user-entered maritime rate; no external provider fallback is used. */
export class ManualRateProvider {
  static create(input: Omit<LogisticsRate, 'id' | 'created_at' | 'updated_at' | 'source'>): LogisticsRate {
    const now = new Date().toISOString();
    return { ...input, id: crypto.randomUUID(), source: 'MANUAL_RATE', created_at: now, updated_at: now };
  }
}
