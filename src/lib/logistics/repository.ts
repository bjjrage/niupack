import { supabaseAdmin, isSupabaseConfigured } from '@/lib/db/supabase';
import { repository } from '@/lib/db/repository';
import {
  LogisticsInvitation,
  LogisticsQuote,
  LogisticsRate,
  LogisticsRfq,
  LogisticsRateStatus,
  LogisticsBooking,
} from './domain';

interface LogisticsStore {
  rfqs: LogisticsRfq[];
  invitations: LogisticsInvitation[];
  quotes: LogisticsQuote[];
  rates: LogisticsRate[];
  bookings: LogisticsBooking[];
}

declare global { var __niu_logistics_store: LogisticsStore | undefined }
const memory: LogisticsStore = global.__niu_logistics_store ?? { rfqs: [], invitations: [], quotes: [], rates: [], bookings: [] };
if (process.env.NODE_ENV !== 'production') global.__niu_logistics_store = memory;

const now = () => new Date().toISOString();

async function selectAll<T>(table: string, order = 'created_at'): Promise<T[]> {
  if (!isSupabaseConfigured || !supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin.from(table).select('*').order(order, { ascending: false });
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export const logisticsRepository = {
  persistenceMode(): 'SUPABASE' | 'MEMORY_FALLBACK' {
    return isSupabaseConfigured && Boolean(supabaseAdmin) ? 'SUPABASE' : 'MEMORY_FALLBACK';
  },

  async listRfqs(): Promise<LogisticsRfq[]> {
    return this.persistenceMode() === 'SUPABASE' ? selectAll<LogisticsRfq>('logistics_rfqs') : [...memory.rfqs];
  },

  async getRfq(id: string): Promise<LogisticsRfq | undefined> {
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfqs').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as LogisticsRfq | undefined;
    }
    return memory.rfqs.find((rfq) => rfq.id === id);
  },

  async createRfq(input: Omit<LogisticsRfq, 'id' | 'created_at' | 'updated_at'>): Promise<LogisticsRfq> {
    const record: LogisticsRfq = { ...input, id: crypto.randomUUID(), created_at: now(), updated_at: now() };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfqs').insert(record).select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsRfq;
    }
    memory.rfqs.unshift(record);
    return record;
  },

  async updateRfq(id: string, updates: Partial<LogisticsRfq>): Promise<LogisticsRfq> {
    const payload = { ...updates, updated_at: now() };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfqs').update(payload).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsRfq;
    }
    const index = memory.rfqs.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('RFQ_NOT_FOUND');
    memory.rfqs[index] = { ...memory.rfqs[index], ...payload };
    return memory.rfqs[index];
  },

  async createInvitation(input: Omit<LogisticsInvitation, 'id' | 'created_at'>): Promise<LogisticsInvitation> {
    const record: LogisticsInvitation = { ...input, id: crypto.randomUUID(), created_at: now() };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfq_invitations').upsert(record, { onConflict: 'rfq_id,supplier_id' }).select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsInvitation;
    }
    const existing = memory.invitations.findIndex((item) => item.rfq_id === input.rfq_id && item.supplier_id === input.supplier_id);
    if (existing >= 0) memory.invitations[existing] = record; else memory.invitations.push(record);
    return record;
  },

  async listInvitations(rfqId?: string): Promise<LogisticsInvitation[]> {
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_rfq_invitations').select('*').order('created_at', { ascending: false });
      if (rfqId) query = query.eq('rfq_id', rfqId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as LogisticsInvitation[];
    }
    return memory.invitations.filter((item) => !rfqId || item.rfq_id === rfqId);
  },

  async findInvitationByHash(hash: string): Promise<LogisticsInvitation | undefined> {
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfq_invitations').select('*').eq('token_hash', hash).maybeSingle();
      if (error) throw new Error(error.message);
      return data as LogisticsInvitation | undefined;
    }
    return memory.invitations.find((item) => item.token_hash === hash);
  },

  async updateInvitation(id: string, updates: Partial<LogisticsInvitation>): Promise<LogisticsInvitation> {
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfq_invitations').update(updates).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsInvitation;
    }
    const index = memory.invitations.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('INVITATION_NOT_FOUND');
    memory.invitations[index] = { ...memory.invitations[index], ...updates };
    return memory.invitations[index];
  },

  async submitQuote(input: Omit<LogisticsQuote, 'id' | 'created_at' | 'updated_at' | 'submitted_at'>): Promise<LogisticsQuote> {
    const stamp = now();
    const record: LogisticsQuote = { ...input, id: crypto.randomUUID(), submitted_at: stamp, created_at: stamp, updated_at: stamp };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfq_quotes').insert(record).select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsQuote;
    }
    if (memory.quotes.some((quote) => quote.invitation_id === input.invitation_id)) throw new Error('INVITATION_ALREADY_RESPONDED');
    memory.quotes.push(record);
    return record;
  },

  async listQuotes(rfqId?: string): Promise<LogisticsQuote[]> {
    let quotes: LogisticsQuote[];
    if (this.persistenceMode() === 'SUPABASE') quotes = await selectAll<LogisticsQuote>('logistics_rfq_quotes', 'submitted_at');
    else quotes = [...memory.quotes];
    const suppliers = await repository.getSuppliers();
    return quotes.filter((quote) => !rfqId || quote.rfq_id === rfqId).map((quote) => ({
      ...quote,
      supplier_name: suppliers.find((supplier) => supplier.id === quote.supplier_id)?.name ?? 'Transportista',
    }));
  },

  async createRate(input: Omit<LogisticsRate, 'id' | 'created_at' | 'updated_at'>): Promise<LogisticsRate> {
    const stamp = now();
    const record: LogisticsRate = { ...input, id: crypto.randomUUID(), created_at: stamp, updated_at: stamp };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rates').insert(record).select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsRate;
    }
    memory.rates.unshift(record);
    return record;
  },

  async listRates(): Promise<LogisticsRate[]> {
    const rates = this.persistenceMode() === 'SUPABASE' ? await selectAll<LogisticsRate>('logistics_rates') : [...memory.rates];
    const stamp = Date.now();
    return rates.map((rate) => rate.valid_until && new Date(rate.valid_until).getTime() < stamp && !['BOOKED','EXPIRED'].includes(rate.status)
      ? { ...rate, status: 'EXPIRED' as LogisticsRateStatus }
      : rate);
  },

  async getRate(id: string): Promise<LogisticsRate | undefined> {
    const rates = await this.listRates();
    return rates.find((rate) => rate.id === id);
  },

  async listBookings(): Promise<LogisticsBooking[]> {
    return this.persistenceMode() === 'SUPABASE' ? selectAll<LogisticsBooking>('logistics_bookings') : [...memory.bookings];
  },

  async createBooking(rateId: string): Promise<LogisticsBooking> {
    const rate = await this.getRate(rateId);
    if (!rate) throw new Error('RATE_NOT_FOUND');
    if (!['SELECTED', 'CONFIRMED'].includes(rate.status)) throw new Error('RATE_NOT_BOOKABLE');
    if (rate.valid_until && new Date(rate.valid_until).getTime() < Date.now()) throw new Error('RATE_EXPIRED');
    const stamp = now();
    const record: LogisticsBooking = { id: crypto.randomUUID(), organization_id: rate.organization_id, rate_id: rate.id, status: 'BOOKING_REQUESTED', created_at: stamp, updated_at: stamp };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_bookings').insert(record).select().single();
      if (error) throw new Error(error.message);
      await supabaseAdmin.from('logistics_rates').update({ status: 'BOOKING_REQUESTED', updated_at: stamp }).eq('id', rate.id);
      return data as LogisticsBooking;
    }
    memory.bookings.unshift(record);
    const index = memory.rates.findIndex((item) => item.id === rate.id);
    memory.rates[index] = { ...memory.rates[index], status: 'BOOKING_REQUESTED', updated_at: stamp };
    return record;
  },

  async selectQuote(quoteId: string): Promise<LogisticsRate> {
    const quotes = await this.listQuotes();
    const quote = quotes.find((item) => item.id === quoteId);
    if (!quote) throw new Error('QUOTE_NOT_FOUND');
    if (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now()) throw new Error('QUOTE_EXPIRED');
    const rfq = await this.getRfq(quote.rfq_id);
    if (!rfq) throw new Error('RFQ_NOT_FOUND');
    const rate = await this.createRate({
      organization_id: quote.organization_id,
      origin: { country: rfq.origin_country, city: rfq.origin_city, address: rfq.origin_address },
      destination: { country: rfq.destination_country, city: rfq.destination_city, address: rfq.destination_address },
      mode: 'ROAD', supplier_id: quote.supplier_id, amount: quote.normalized_total ?? quote.quoted_total,
      currency: quote.currency, valid_from: quote.valid_from, valid_until: quote.valid_until,
      transit_days: quote.transit_days, weight_kg: rfq.weight_kg, volume_m3: rfq.volume_m3,
      equipment: rfq.equipment_type, source: 'PROVIDER_RFQ', status: 'SELECTED', source_reference: quote.id,
      components: { pickup: quote.pickup, origin_charges: quote.origin_charges, main_freight: quote.main_freight,
        border_charges: quote.border_charges, destination_delivery: quote.destination_delivery,
        insurance: quote.insurance, other_charges: quote.other_charges },
    });
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      await supabaseAdmin.from('logistics_rfq_quotes').update({ status: 'SELECTED' }).eq('id', quote.id);
    } else {
      const index = memory.quotes.findIndex((item) => item.id === quote.id);
      memory.quotes[index] = { ...memory.quotes[index], status: 'SELECTED', updated_at: now() };
    }
    await this.updateRfq(rfq.id, { status: 'CLOSED' });
    return rate;
  },
};
