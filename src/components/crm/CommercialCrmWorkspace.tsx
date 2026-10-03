'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Columns3,
  Inbox,
  ListTodo,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type View = 'dashboard' | 'pipeline' | 'accounts' | 'inbox' | 'tasks';

interface BotMetrics {
  total_leads: number;
  total_conversations: number;
  total_messages: number;
  leads_last_7_days: number;
  conversations_last_7_days: number;
}

interface BotLead {
  id: string;
  name: string | null;
  phone: string | null;
  source_channel: string | null;
  source_campaign: string | null;
  current_vehicle: string | null;
  current_intent: string | null;
  status: string | null;
  last_message_at: string | null;
  updated_at: string | null;
}

interface BotMessage {
  role?: string;
  content?: string;
  at?: string;
}

interface ConversationDetail {
  conversation?: {
    id: string;
    name: string | null;
    phone: string | null;
    status: string | null;
    controlBot: string | null;
    updated_at: string | null;
  };
  messages: BotMessage[];
}

const views: Array<{ key: View; label: string; icon: typeof Users }> = [
  { key: 'dashboard', label: 'Dashboard', icon: Sparkles },
  { key: 'pipeline', label: 'Pipeline', icon: Columns3 },
  { key: 'accounts', label: 'Empresas & Leads', icon: Building2 },
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'tasks', label: 'Tareas', icon: ListTodo },
];

const stages = ['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN'] as const;
type Stage = (typeof stages)[number];

const bridgeErrors: Record<string, string> = {
  BOT_BRIDGE_NOT_CONFIGURED: 'Falta configurar el bridge con AutoLeadBot en NIUPACK OS.',
  BOT_BRIDGE_UNAVAILABLE: 'AutoLeadBot no está disponible.',
  BOT_BRIDGE_UNAUTHORIZED: 'El token del bridge fue rechazado.',
  BOT_BRIDGE_FORBIDDEN: 'El bridge no tiene permisos para leer AutoLeadBot.',
  BOT_BRIDGE_BAD_RESPONSE: 'AutoLeadBot respondió con un formato inesperado.',
};

function normalize(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function stageFor(lead: BotLead): Stage {
  const status = normalize(lead.status);
  const intent = normalize(lead.current_intent);
  const combined = `${status} ${intent}`;

  if (/negocia|humano|asesor|vendedor/.test(combined)) return 'NEGOCIACIÓN';
  if (/cotiza|presupuesto|precio|quote/.test(combined)) return 'COTIZACIÓN';
  if (/calific|comprar|compra|volumen|pedido/.test(combined)) return 'CALIFICADO';
  if (/contact|curso|respond/.test(combined)) return 'CONTACTADO';
  return 'NUEVO';
}

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function LeadCard({ lead, onOpen }: { lead: BotLead; onOpen: (lead: BotLead) => void }) {
  return (
    <button
      onClick={() => onOpen(lead)}
      className="w-full rounded-md border border-slate-800 bg-[#11161d] p-3 text-left transition hover:border-slate-700 hover:bg-slate-800/30"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-white">{lead.name || 'Cliente WhatsApp'}</span>
        <Badge size="sm" variant="neutral">BOT</Badge>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{lead.phone || 'Sin teléfono'}</p>
      <p className="mt-2 line-clamp-2 text-[11px] text-slate-300">
        {lead.current_intent || lead.current_vehicle || 'Consulta comercial pendiente de calificación'}
      </p>
      <p className="mt-2 text-[10px] font-mono text-slate-500">{dateLabel(lead.last_message_at || lead.updated_at)}</p>
    </button>
  );
}

export function CommercialCrmWorkspace() {
  const [view, setView] = useState<View>('dashboard');
  const [metrics, setMetrics] = useState<BotMetrics | null>(null);
  const [leads, setLeads] = useState<BotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<BotLead | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErrorCode(null);
    try {
      const [metricsResponse, leadsResponse] = await Promise.all([
        fetch('/api/crm/bot/metrics', { cache: 'no-store' }),
        fetch('/api/crm/bot/leads?limit=100', { cache: 'no-store' }),
      ]);
      const metricsJson = await metricsResponse.json();
      const leadsJson = await leadsResponse.json();
      if (!metricsResponse.ok || metricsJson.ok !== true) throw new Error(metricsJson.error || 'BOT_BRIDGE_UNAVAILABLE');
      if (!leadsResponse.ok || leadsJson.ok !== true) throw new Error(leadsJson.error || 'BOT_BRIDGE_UNAVAILABLE');
      setMetrics(metricsJson.metrics);
      setLeads(Array.isArray(leadsJson.items) ? leadsJson.items : []);
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : 'BOT_BRIDGE_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }

  async function openLead(lead: BotLead) {
    setSelected(lead);
    setView('inbox');
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/crm/bot/conversations/${encodeURIComponent(lead.id)}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || json.ok !== true) throw new Error(json.error || 'BOT_BRIDGE_UNAVAILABLE');
      setDetail({ conversation: json.conversation, messages: Array.isArray(json.messages) ? json.messages : [] });
    } catch {
      setDetail({ messages: [] });
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const pipeline = useMemo(
    () => Object.fromEntries(stages.map((stage) => [stage, leads.filter((lead) => stageFor(lead) === stage)])) as Record<Stage, BotLead[]>,
    [leads],
  );

  const accountCount = useMemo(
    () => new Set(leads.map((lead) => normalize(lead.name) || lead.phone || lead.id)).size,
    [leads],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Commercial CRM</span>
            <Badge variant="brand" size="sm">V1</Badge>
            <Badge variant="neutral" size="sm">AUTOLEAD BRIDGE · READ ONLY</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Ventas & Conversaciones NIUPACK</h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Pipeline comercial liviano conectado al AutoLeadBot existente. El bot sigue siendo el motor conversacional; NIUPACK OS será la fuente de verdad comercial.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-[#11161d] p-2">
        {views.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-medium transition ${view === key ? 'bg-brand-500/15 text-white ring-1 ring-brand-800/70' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {errorCode && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 text-xs text-amber-200">
          <strong>Bridge no operativo:</strong> {bridgeErrors[errorCode] || 'No se pudieron leer datos de AutoLeadBot.'}
          <span className="ml-2 text-amber-300/70">La UI CRM está intacta; falta configuración de servicio.</span>
        </div>
      )}

      {view === 'dashboard' && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Leads capturados', metrics?.total_leads ?? leads.length, 'AutoLeadBot'],
              ['Conversaciones', metrics?.total_conversations ?? leads.length, 'WhatsApp / Twilio'],
              ['Leads 7 días', metrics?.leads_last_7_days ?? 0, 'Actividad reciente'],
              ['Empresas / contactos', accountCount, 'Base comercial detectada'],
            ].map(([label, value, note]) => (
              <div key={String(label)} className="rounded-lg border border-slate-800 bg-[#141820] p-4">
                <p className="text-xs font-medium text-slate-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
                <p className="mt-2 text-[11px] text-slate-500">{note}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">Pipeline actual</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Clasificación inicial derivada del estado e intención del bot.</p>
                </div>
                <button onClick={() => setView('pipeline')} className="text-xs font-medium text-brand-400 hover:text-brand-300">Abrir pipeline</button>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {stages.map((stage) => (
                  <div key={stage} className="rounded border border-slate-800 bg-[#0c0f14] p-3">
                    <p className="text-[10px] font-mono text-slate-500">{stage}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{pipeline[stage].length}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <MessageSquareText className="h-4 w-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-white">Últimas conversaciones</h2>
              </div>
              <div className="mt-3 space-y-2">
                {leads.slice(0, 5).map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={openLead} />)}
                {!loading && leads.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Sin conversaciones disponibles.</p>}
              </div>
            </section>
          </div>
        </div>
      )}

      {view === 'pipeline' && (
        <div className="overflow-x-auto pb-3">
          <div className="grid min-w-[1250px] grid-cols-5 gap-3">
            {stages.map((stage) => (
              <section key={stage} className="rounded-lg border border-slate-800 bg-[#0f1319]">
                <header className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
                  <span className="text-[11px] font-semibold text-slate-300">{stage}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">{pipeline[stage].length}</span>
                </header>
                <div className="space-y-2 p-2">
                  {pipeline[stage].map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={openLead} />)}
                  {pipeline[stage].length === 0 && <p className="py-8 text-center text-[11px] text-slate-600">Sin oportunidades</p>}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === 'accounts' && (
        <section className="rounded-lg border border-slate-800 bg-[#141820]">
          <header className="border-b border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-white">Empresas & Leads detectados</h2>
            <p className="mt-1 text-[11px] text-slate-500">Vista transitoria del bridge. La identidad empresa/contacto se normalizará en las tablas CRM V1.</p>
          </header>
          <div className="divide-y divide-slate-800/70">
            {leads.map((lead) => (
              <button key={lead.id} onClick={() => void openLead(lead)} className="grid w-full grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] items-center gap-4 px-4 py-3 text-left hover:bg-slate-800/30">
                <div><p className="text-xs font-medium text-white">{lead.name || 'Cliente WhatsApp'}</p><p className="text-[11px] text-slate-500">{lead.phone || '—'}</p></div>
                <span className="text-xs text-slate-400">{lead.source_channel || 'WhatsApp'}</span>
                <span className="text-xs text-slate-400">{stageFor(lead)}</span>
                <span className="truncate text-xs text-slate-300">{lead.current_intent || lead.current_vehicle || 'Sin calificar'}</span>
                <span className="text-[10px] font-mono text-slate-500">{dateLabel(lead.updated_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {view === 'inbox' && (
        <div className="grid min-h-[620px] gap-4 lg:grid-cols-[340px_1fr_320px]">
          <section className="overflow-hidden rounded-lg border border-slate-800 bg-[#141820]">
            <header className="border-b border-slate-800 p-3"><h2 className="text-xs font-semibold text-white">Conversaciones</h2></header>
            <div className="max-h-[570px] overflow-y-auto p-2">
              {leads.map((lead) => (
                <button key={lead.id} onClick={() => void openLead(lead)} className={`mb-1 w-full rounded p-3 text-left transition ${selected?.id === lead.id ? 'bg-brand-500/10 ring-1 ring-brand-800/60' : 'hover:bg-slate-800/50'}`}>
                  <p className="text-xs font-medium text-white">{lead.name || 'Cliente WhatsApp'}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-400">{lead.current_intent || lead.current_vehicle || 'Consulta comercial'}</p>
                  <p className="mt-1 text-[10px] font-mono text-slate-600">{dateLabel(lead.last_message_at || lead.updated_at)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col rounded-lg border border-slate-800 bg-[#141820]">
            <header className="border-b border-slate-800 p-4">
              <p className="text-sm font-semibold text-white">{selected?.name || 'Seleccioná una conversación'}</p>
              {selected && <p className="mt-1 text-[11px] text-slate-500">{selected.phone} · {selected.source_channel || 'WhatsApp'}</p>}
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {detailLoading && <p className="text-xs text-slate-500">Cargando conversación…</p>}
              {!detailLoading && !selected && <div className="grid h-full place-items-center text-xs text-slate-600">Abrí un lead para revisar la conversación completa.</div>}
              {!detailLoading && detail?.messages.map((message, index) => {
                const customer = normalize(message.role).includes('user') || normalize(message.role).includes('cliente');
                return (
                  <div key={index} className={`max-w-[78%] rounded-lg border px-3 py-2 text-xs leading-relaxed ${customer ? 'border-slate-700 bg-[#0c0f14] text-slate-200' : 'ml-auto border-brand-900/60 bg-brand-950/20 text-slate-100'}`}>
                    {message.content || 'Mensaje sin contenido'}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="rounded-lg border border-slate-800 bg-[#141820] p-4">
            <h2 className="text-xs font-semibold text-white">Lead 360°</h2>
            <div className="mt-4 space-y-4">
              {[
                ['Contacto', selected?.name || '—'],
                ['Teléfono', selected?.phone || '—'],
                ['Etapa', selected ? stageFor(selected) : '—'],
                ['Estado bot', detail?.conversation?.controlBot || selected?.status || '—'],
                ['Interés actual', selected?.current_intent || selected?.current_vehicle || '—'],
                ['Campaña origen', selected?.source_campaign || 'Orgánico / sin campaña'],
                ['Última actividad', dateLabel(selected?.last_message_at || selected?.updated_at)],
              ].map(([label, value]) => (
                <div key={String(label)} className="border-b border-slate-800/70 pb-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
                  <p className="mt-1 text-xs text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {view === 'tasks' && (
        <section className="rounded-lg border border-slate-800 bg-[#141820] p-6">
          <div className="flex items-center gap-3">
            <ListTodo className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">Tareas comerciales</h2>
              <p className="mt-1 text-xs text-slate-500">La superficie está preparada. La escritura y asignación quedan bloqueadas hasta activar persistencia CRM con RLS.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {leads.slice(0, 3).map((lead) => (
              <button key={lead.id} onClick={() => void openLead(lead)} className="rounded-lg border border-slate-800 bg-[#0c0f14] p-4 text-left hover:border-slate-700">
                <Badge variant="warning" size="sm">SUGERIDA</Badge>
                <p className="mt-3 text-xs font-semibold text-white">Revisar oportunidad: {lead.name || 'Cliente WhatsApp'}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{lead.current_intent || 'Completar calificación comercial y definir siguiente acción.'}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
