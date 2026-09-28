import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import { repository } from '@/lib/db/repository';
import type { Supplier } from '@/types';
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
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin.from(table).select('*').order(order, { ascending: false });
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export const logisticsRepository = {
  persistenceMode(nodeEnv = process.env.NODE_ENV, allowMemory = process.env.NIU_LOGISTICS_ALLOW_MEMORY === 'true'): 'SUPABASE' | 'MEMORY_FALLBACK' | 'NOT_CONFIGURED' {
    if (isSupabaseAdminConfigured && Boolean(supabaseAdmin)) return 'SUPABASE';
    if (nodeEnv === 'test' || (nodeEnv === 'development' && allowMemory)) return 'MEMORY_FALLBACK';
    return 'NOT_CONFIGURED';
  },

  assertPersistence(nodeEnv = process.env.NODE_ENV, allowMemory = process.env.NIU_LOGISTICS_ALLOW_MEMORY === 'true') {
    if (this.persistenceMode(nodeEnv, allowMemory) === 'NOT_CONFIGURED') throw new Error('LOGISTICS_PERSISTENCE_NOT_CONFIGURED');
  },

  async logAuditEvent(input: { organization_id: string; actor_id?: string; event_type: string; target_entity: string; entity_id: string; metadata: Record<string, unknown> }) {
    this.assertPersistence();
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { error } = await supabaseAdmin.from('audit_events').insert({
        organization_id: input.organization_id,
        actor_id: input.actor_id,
        event_type: input.event_type,
        target_entity: input.target_entity,
        entity_id: input.entity_id,
        metadata_json: input.metadata,
      });
      if (error) throw new Error(error.message);
      return;
    }
    await repository.logAuditEvent({ event_type: input.event_type as never, target_entity: input.target_entity, entity_id: input.entity_id, metadata: input.metadata });
  },

  async listProviders(organizationId: string): Promise<Supplier[]> {
    this.assertPersistence();
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('suppliers').select('*').eq('organization_id', organizationId).order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Supplier[];
    }
    return (await repository.getSuppliers()).filter((supplier) => supplier.organization_id === organizationId);
  },

  async listRfqs(organizationId?: string): Promise<LogisticsRfq[]> {
    this.assertPersistence();
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_rfqs').select('*').order('created_at', { ascending: false });
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as LogisticsRfq[];
    }
    return memory.rfqs.filter((rfq) => !organizationId || rfq.organization_id === organizationId);
  },

  async getRfq(id: string, organizationId?: string): Promise<LogisticsRfq | undefined> {
    this.assertPersistence();
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_rfqs').select('*').eq('id', id);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      return data as LogisticsRfq | undefined;
    }
    return memory.rfqs.find((rfq) => rfq.id === id && (!organizationId || rfq.organization_id === organizationId));
  },

  async createRfq(input: Omit<LogisticsRfq, 'id' | 'created_at' | 'updated_at'>): Promise<LogisticsRfq> {
    this.assertPersistence();
    const record: LogisticsRfq = { ...input, id: crypto.randomUUID(), created_at: now(), updated_at: now() };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfqs').insert(record).select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsRfq;
    }
    memory.rfqs.unshift(record);
    return record;
  },

  async updateRfq(id: string, updates: Partial<LogisticsRfq>, organizationId?: string): Promise<LogisticsRfq> {
    this.assertPersistence();
    const payload = { ...updates, updated_at: now() };
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_rfqs').update(payload).eq('id', id);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query.select().single();
      if (error) throw new Error(error.message);
      return data as LogisticsRfq;
    }
    const index = memory.rfqs.findIndex((item) => item.id === id);
    if (index < 0 || (organizationId && memory.rfqs[index].organization_id !== organizationId)) throw new Error('RFQ_NOT_FOUND');
    memory.rfqs[index] = { ...memory.rfqs[index], ...payload };
    return memory.rfqs[index];
  },

  async createInvitation(input: Omit<LogisticsInvitation, 'id' | 'created_at'>): Promise<LogisticsInvitation> {
    this.assertPersistence();
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

  async listInvitations(rfqId?: string, organizationId?: string): Promise<LogisticsInvitation[]> {
    this.assertPersistence();
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_rfq_invitations').select('*').order('created_at', { ascending: false });
      if (rfqId) query = query.eq('rfq_id', rfqId);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as LogisticsInvitation[];
    }
    return memory.invitations.filter((item) => (!rfqId || item.rfq_id === rfqId) && (!organizationId || item.organization_id === organizationId));
  },

  async findInvitationByHash(hash: string): Promise<LogisticsInvitation | undefined> {
    this.assertPersistence();
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('logistics_rfq_invitations').select('*').eq('token_hash', hash).maybeSingle();
      if (error) throw new Error(error.message);
      return data as LogisticsInvitation | undefined;
    }
    return memory.invitations.find((item) => item.token_hash === hash);
  },

  async updateInvitation(id: string, updates: Partial<LogisticsInvitation>): Promise<LogisticsInvitation> {
    this.assertPersistence();
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
    this.assertPersistence();
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

  async listQuotes(rfqId?: string, organizationId?: string): Promise<LogisticsQuote[]> {
    this.assertPersistence();
    let quotes: LogisticsQuote[];
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_rfq_quotes').select('*').order('submitted_at', { ascending: false });
      if (rfqId) query = query.eq('rfq_id', rfqId);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      quotes = (data ?? []) as LogisticsQuote[];
    } else quotes = [...memory.quotes];
    const suppliers = organizationId ? await this.listProviders(organizationId) : await repository.getSuppliers();
    return quotes.filter((quote) => (!rfqId || quote.rfq_id === rfqId) && (!organizationId || quote.organization_id === organizationId)).map((quote) => ({
      ...quote,
      supplier_name: suppliers.find((supplier) => supplier.id === quote.supplier_id)?.name ?? 'Transportista',
    }));
  },

  async createRate(input: Omit<LogisticsRate, 'id' | 'created_at' | 'updated_at'>): Promise<LogisticsRate> {
    this.assertPersistence();
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

  async listRates(organizationId?: string): Promise<LogisticsRate[]> {
    this.assertPersistence();
    let rates: LogisticsRate[];
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_rates').select('*').order('created_at', { ascending: false });
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      rates = (data ?? []) as LogisticsRate[];
    } else rates = [...memory.rates];
    const stamp = Date.now();
    return rates.filter((rate) => !organizationId || rate.organization_id === organizationId).map((rate) => rate.valid_until && new Date(rate.valid_until).getTime() < stamp && !['BOOKED','EXPIRED'].includes(rate.status)
      ? { ...rate, status: 'EXPIRED' as LogisticsRateStatus }
      : rate);
  },

  async getRate(id: string, organizationId?: string): Promise<LogisticsRate | undefined> {
    const rates = await this.listRates(organizationId);
    return rates.find((rate) => rate.id === id);
  },

  async listBookings(organizationId?: string): Promise<LogisticsBooking[]> {
    this.assertPersistence();
    let bookings: LogisticsBooking[];
    if (this.persistenceMode() === 'SUPABASE' && supabaseAdmin) {
      let query = supabaseAdmin.from('logistics_bookings').select('*').order('created_at', { ascending: false });
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      bookings = (data ?? []) as LogisticsBooking[];
    } else bookings = [...memory.bookings];
    return bookings.filter((booking) => !organizationId || booking.organization_id === organizationId);
  },

  async createBooking(rateId: string, organizationId?: string): Promise<LogisticsBooking> {
    this.assertPersistence();
    const rate = await this.getRate(rateId, organizationId);
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

  async selectQuote(quoteId: string, organizationId?: string): Promise<LogisticsRate> {
    this.assertPersistence();
    const quotes = await this.listQuotes(undefined, organizationId);
    const quote = quotes.find((item) => item.id === quoteId);
    if (!quote) throw new Error('QUOTE_NOT_FOUND');
    if (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now()) throw new Error('QUOTE_EXPIRED');
    const rfq = await this.getRfq(quote.rfq_id, organizationId);
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
    await this.updateRfq(rfq.id, { status: 'CLOSED' }, organizationId);
    return rate;
  },
};
