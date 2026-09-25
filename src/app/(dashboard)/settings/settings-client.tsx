'use client';

import React, { useState } from 'react';
import {
  Sliders,
  DollarSign,
  Cpu,
  Layers,
  Shield,
  Activity,
  CheckCircle2,
  AlertCircle,
  Save,
  Key,
  Database,
  Mail,
  Clock,
  Filter,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { SystemSettings, AuditEvent } from '@/types';
import { OpenAICallLog } from '@/lib/openai/openai-service';

interface Props {
  initialSettings: SystemSettings;
  initialAuditEvents: AuditEvent[];
  initialCallLogs: OpenAICallLog[];
  telemetry: {
    totalSpendUSD: number;
    isOpenAIConfigured: boolean;
    gmailStatus: { status: string; message: string; userEmail: string };
  };
}

export default function SettingsClient({
  initialSettings,
  initialAuditEvents,
  initialCallLogs,
  telemetry,
}: Props) {
  const [settings, setSettings] = useState<SystemSettings>(initialSettings);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(initialAuditEvents);
  const [callLogs, setCallLogs] = useState<OpenAICallLog[]>(initialCallLogs);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('ALL');
  const [searchActor, setSearchActor] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'budget' | 'audit' | 'logs'>('budget');

  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState(initialSettings.smtp_user || '');
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestOpenAI = async () => {
    setTestingOpenAI(true);
    setOpenaiTestResult(null);
    try {
      const res = await fetch('/api/settings/test-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: settings.openai_api_key }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOpenaiTestResult({ success: true, message: data.message });
      } else {
        setOpenaiTestResult({ success: false, message: data.error || 'Fallo de autenticación con OpenAI.' });
      }
    } catch (err: any) {
      setOpenaiTestResult({ success: false, message: err.message || 'Error de red al contactar OpenAI.' });
    } finally {
      setTestingOpenAI(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmailRecipient || settings.smtp_user,
          smtp_host: settings.smtp_host,
          smtp_port: settings.smtp_port,
          smtp_user: settings.smtp_user,
          smtp_pass: settings.smtp_pass,
          smtp_secure: settings.smtp_secure,
          smtp_from_name: settings.smtp_from_name,
          smtp_from_email: settings.smtp_from_email,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailTestResult({ success: true, message: data.message });
      } else {
        setEmailTestResult({ success: false, message: data.error || 'Error al conectar con servidor SMTP.' });
      }
    } catch (err: any) {
      setEmailTestResult({ success: false, message: err.message || 'Error de red al probar SMTP.' });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const spendPercent = Math.min(
    100,
    Number(((settings.current_month_spend_usd / (settings.max_monthly_spend_usd || 1)) * 100).toFixed(1))
  );

  const filteredEvents = auditEvents.filter((ev) => {
    const matchesType = eventFilter === 'ALL' || ev.event_type === eventFilter;
    const matchesSearch =
      !searchActor ||
      ev.actor_id?.toLowerCase().includes(searchActor.toLowerCase()) ||
      ev.target_entity.toLowerCase().includes(searchActor.toLowerCase()) ||
      JSON.stringify(ev.metadata).toLowerCase().includes(searchActor.toLowerCase());
    return matchesType && matchesSearch;
  });

  const auditColumns: Column<AuditEvent>[] = [
    {
      key: 'created_at',
      header: 'Fecha / Hora',
      render: (e) => (
        <span className="font-mono text-[11px] text-slate-300">
          {new Date(e.created_at).toLocaleString('es-PY', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      ),
      className: 'w-44',
    },
    {
      key: 'event_type',
      header: 'Tipo de Evento',
      render: (e) => {
        const variantMap: Record<string, 'brand' | 'warning' | 'success' | 'danger' | 'neutral'> = {
          battery_freeze: 'brand',
          cost_edit: 'warning',
          rfq_approval: 'success',
          email_sent: 'neutral',
          strategy_changes: 'danger',
          budget_exceeded: 'danger',
        };
        return (
          <Badge variant={variantMap[e.event_type] || 'neutral'}>
            {e.event_type.replace('_', ' ').toUpperCase()}
          </Badge>
        );
      },
      className: 'w-36',
    },
    {
      key: 'actor_id',
      header: 'Operador / Actor',
      render: (e) => (
        <span className="font-mono text-xs text-slate-200">{e.actor_id || 'system_service'}</span>
      ),
      className: 'w-48',
    },
    {
      key: 'target_entity',
      header: 'Entidad / Ref',
      render: (e) => (
        <div>
          <span className="text-xs text-white font-medium block">{e.target_entity}</span>
          <span className="text-[10px] font-mono text-slate-500">{e.entity_id}</span>
        </div>
      ),
      className: 'w-44',
    },
    {
      key: 'metadata',
      header: 'Detalle de Auditoría & Metadatos',
      render: (e) => (
        <div className="font-mono text-[11px] text-slate-400 bg-[#090b0e] p-1.5 rounded border border-[#1f2633] overflow-x-auto max-w-xl">
          {Object.entries(e.metadata || {}).map(([k, v]) => (
            <span key={k} className="inline-block mr-3">
              <strong className="text-slate-300">{k}:</strong>{' '}
              <span className="text-red-400/90">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'ip_address',
      header: 'IP',
      render: (e) => (
        <span className="font-mono text-[10px] text-slate-500">{e.ip_address || 'internal'}</span>
      ),
      className: 'w-24',
      align: 'right',
    },
  ];

  const logColumns: Column<OpenAICallLog>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (l) => (
        <span className="font-mono text-[11px] text-slate-300">
          {new Date(l.timestamp).toLocaleTimeString('es-PY', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      ),
      className: 'w-24',
    },
    {
      key: 'purpose',
      header: 'Propósito Operacional',
      render: (l) => <span className="text-xs text-white font-medium">{l.purpose}</span>,
    },
    {
      key: 'model',
      header: 'Modelo',
      render: (l) => <Badge variant="neutral">{l.model}</Badge>,
      className: 'w-28',
    },
    {
      key: 'tokens_input',
      header: 'In / Out Tok',
      render: (l) => (
        <span className="font-mono text-xs text-slate-400 font-tabular">
          {l.tokens_input} / {l.tokens_output}
        </span>
      ),
      align: 'right',
      className: 'w-28',
    },
    {
      key: 'total_tokens',
      header: 'Total Tok',
      render: (l) => (
        <span className="font-mono text-xs text-white font-tabular font-semibold">
          {l.total_tokens.toLocaleString()}
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'estimated_cost_usd',
      header: 'Costo Est.',
      render: (l) => (
        <span className="font-mono text-xs text-emerald-400 font-tabular font-bold">
          ${Number(l.estimated_cost_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'latency_ms',
      header: 'Latencia',
      render: (l) => (
        <span className="font-mono text-xs text-slate-400 font-tabular">{l.latency_ms} ms</span>
      ),
      align: 'right',
      className: 'w-20',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (l) => (
        <Badge variant={l.status === 'SUCCESS' ? 'success' : 'danger'}>{l.status}</Badge>
      ),
      align: 'right',
      className: 'w-24',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            <span className="text-[11px] font-mono tracking-wider text-red-500 uppercase font-bold">
              Control Operativo & Compliance
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Configuración del Sistema & Auditoría
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Límites presupuestarios, routing de modelos IA, credenciales externas y bitácora inmutable de eventos.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-[#12161f] p-1 rounded-lg border border-[#202738]">
          <button
            onClick={() => setActiveTab('budget')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTab === 'budget'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Límites & Modelos
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTab === 'audit'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Bitácora de Auditoría ({auditEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTab === 'logs'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Llamadas OpenAI ({callLogs.length})
          </button>
        </div>
      </div>

      {/* TAB 1: BUDGET & MODELS & CONNECTORS */}
      {activeTab === 'budget' && (
        <div className="space-y-6">
          {/* External Connectors Health Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#12161f] border border-[#202738] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">OpenAI Engine</span>
                </div>
                <Badge variant={telemetry.isOpenAIConfigured ? 'success' : 'warning'}>
                  {telemetry.isOpenAIConfigured ? 'API ACTIVA' : 'MODO SIMULADO'}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                {telemetry.isOpenAIConfigured
                  ? 'Grounded Search con OAI-SearchBot disponible.'
                  : 'Falta OPENAI_API_KEY. Motor en simulación hiperrealista con seed local.'}
              </p>
              <div className="mt-3 pt-2 border-t border-[#1f2633] flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Gasto Acumulado:</span>
                <span className="text-white font-bold">${telemetry.totalSpendUSD.toFixed(4)} USD</span>
              </div>
            </div>

            <div className="bg-[#12161f] border border-[#202738] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-white">Persistencia de Datos</span>
                </div>
                <Badge variant="brand">ACTIVE REPO</Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                Almacén operacional con persistencia en memoria y esquema Supabase PostgreSQL listo.
              </p>
              <div className="mt-3 pt-2 border-t border-[#1f2633] flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Esquema SQL:</span>
                <span className="text-white font-bold">37 Tablas RLS</span>
              </div>
            </div>

            <div className="bg-[#12161f] border border-[#202738] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-white">Gmail RFQ Dispatch</span>
                </div>
                <Badge variant={telemetry.gmailStatus.status === 'CONNECTED' ? 'success' : 'warning'}>
                  {telemetry.gmailStatus.status === 'CONNECTED' ? 'CONECTADO' : 'FALLBACK LOCAL'}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                {telemetry.gmailStatus.message}
              </p>
              <div className="mt-3 pt-2 border-t border-[#1f2633] flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Human-in-the-loop:</span>
                <span className="text-emerald-400 font-bold">REQUERIDO SIEMPRE</span>
              </div>
            </div>
          </div>

          {/* Form and Budget Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-2 bg-[#12161f] border border-[#202738] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <Sliders className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-bold text-white">Parámetros de Ejecución y Cuotas</h2>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Máx. Consultas por Batería (N)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      value={settings.max_queries_per_run}
                      onChange={(e) =>
                        setSettings({ ...settings, max_queries_per_run: Number(e.target.value) })
                      }
                      className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-red-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Límite superior por corrida (soporta 100, 500, 1000, 2000).
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Concurrencia Máxima (Workers)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={settings.max_concurrency}
                      onChange={(e) =>
                        setSettings({ ...settings, max_concurrency: Number(e.target.value) })
                      }
                      className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-red-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Workers paralelos para respetar rate-limits (default 5, máx 10).
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Presupuesto Máximo por Corrida (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-mono text-slate-500">$</span>
                      <input
                        type="number"
                        step={0.5}
                        min={1}
                        max={100}
                        value={settings.max_spend_per_run_usd}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            max_spend_per_run_usd: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg pl-7 pr-3 py-2 text-xs text-white font-mono focus:border-red-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Bloquea ejecuciones cuya estimación pre-flight exceda este umbral.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Presupuesto Mensual Total (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-mono text-slate-500">$</span>
                      <input
                        type="number"
                        step={5}
                        min={10}
                        max={1000}
                        value={settings.max_monthly_spend_usd}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            max_monthly_spend_usd: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg pl-7 pr-3 py-2 text-xs text-white font-mono focus:border-red-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Límite duro de seguridad para todo el tenant NIUPACK.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Modelo para Corridas de Visibilidad
                    </label>
                    <select
                      value={settings.openai_model_visibility}
                      onChange={(e) =>
                        setSettings({ ...settings, openai_model_visibility: e.target.value })
                      }
                      className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                    >
                      <option value="gpt-4o">gpt-4o (Recomendado - Búsqueda grounded de alta fidelidad)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (Económico)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Modelo para Análisis & Parsing
                    </label>
                    <select
                      value={settings.openai_model_analysis}
                      onChange={(e) =>
                        setSettings({ ...settings, openai_model_analysis: e.target.value })
                      }
                      className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Alta velocidad y costo mínimo)</option>
                      <option value="gpt-4o">gpt-4o (Máxima capacidad de síntesis)</option>
                    </select>
                  </div>
                </div>

                {/* BOT 1: OPENAI API KEY CONFIGURATION */}
                <div className="pt-5 border-t border-[#202738] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Bot 1: Activación de IA ChatGPT (OpenAI API Key)
                      </h3>
                    </div>
                    <Badge variant={settings.openai_api_key || telemetry.isOpenAIConfigured ? 'success' : 'warning'}>
                      {settings.openai_api_key || telemetry.isOpenAIConfigured ? 'CLAVE REGISTRADA' : 'MODO SIMULADO'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Ingresa tu clave de OpenAI (<code className="text-emerald-400">sk-...</code>). Permite al Bot ejecutar consultas reales en vivo contra ChatGPT y OpenAI Search con citas y menciones verificadas.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      placeholder="sk-proj-..."
                      value={settings.openai_api_key || ''}
                      onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                      className="flex-1 bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleTestOpenAI}
                      disabled={testingOpenAI}
                    >
                      {testingOpenAI ? 'Verificando...' : 'Probar Conexión OpenAI'}
                    </Button>
                  </div>

                  {openaiTestResult && (
                    <div
                      className={`p-2.5 rounded text-xs flex items-center gap-2 ${
                        openaiTestResult.success
                          ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                      }`}
                    >
                      {openaiTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                      <span>{openaiTestResult.message}</span>
                    </div>
                  )}
                </div>

                {/* BOT 2: CORPORATE SMTP EMAIL CONFIGURATION */}
                <div className="pt-5 border-t border-[#202738] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-sky-400" />
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Bot 2: Correo Corporativo de Flexibles (SMTP)
                      </h3>
                    </div>
                    <Badge variant={settings.smtp_host && settings.smtp_user ? 'success' : 'neutral'}>
                      {settings.smtp_host && settings.smtp_user ? 'SMTP ACTIVO' : 'NO CONFIGURADO'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Configura los datos del correo de tu página de flexibles (cPanel, Hostinger, Google Workspace o tu servidor de correo) para que el Bot despache cotizaciones formales (RFQs) desde tu dirección oficial.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Servidor SMTP (Host)</label>
                      <input
                        type="text"
                        placeholder="ej: mail.tudominio.com o smtp.hostinger.com"
                        value={settings.smtp_host || ''}
                        onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                        className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Puerto</label>
                        <input
                          type="number"
                          placeholder="465"
                          value={settings.smtp_port || 465}
                          onChange={(e) => setSettings({ ...settings, smtp_port: Number(e.target.value) })}
                          className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Seguridad SSL/TLS</label>
                        <select
                          value={settings.smtp_secure !== false ? 'true' : 'false'}
                          onChange={(e) => setSettings({ ...settings, smtp_secure: e.target.value === 'true' })}
                          className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-2 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                        >
                          <option value="true">SSL (Puerto 465)</option>
                          <option value="false">STARTTLS (587)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Usuario / Email Corporativo</label>
                      <input
                        type="text"
                        placeholder="ej: compras@niupack.com o info@flexibles..."
                        value={settings.smtp_user || ''}
                        onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                        className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Contraseña de Correo</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={settings.smtp_pass || ''}
                        onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
                        className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Nombre Visible del Remitente</label>
                      <input
                        type="text"
                        placeholder="NIUPACK - Abastecimiento Industrial"
                        value={settings.smtp_from_name || ''}
                        onChange={(e) => setSettings({ ...settings, smtp_from_name: e.target.value })}
                        className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Email de Respuesta / Reply-To</label>
                      <input
                        type="email"
                        placeholder="compras@niupack.com.py"
                        value={settings.smtp_from_email || ''}
                        onChange={(e) => setSettings({ ...settings, smtp_from_email: e.target.value })}
                        className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Test email dispatch */}
                  <div className="p-3 bg-[#0a0d13] rounded-lg border border-[#262d3d] space-y-2">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Probar Envío de Correo
                    </span>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="email"
                        placeholder="tu-correo-personal@gmail.com para recibir prueba"
                        value={testEmailRecipient}
                        onChange={(e) => setTestEmailRecipient(e.target.value)}
                        className="flex-1 bg-[#141820] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleTestEmail}
                        disabled={testingEmail}
                      >
                        {testingEmail ? 'Enviando...' : 'Enviar Correo de Prueba'}
                      </Button>
                    </div>

                    {emailTestResult && (
                      <div
                        className={`p-2 rounded text-xs flex items-center gap-2 ${
                          emailTestResult.success
                            ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                            : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                        }`}
                      >
                        {emailTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{emailTestResult.message}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-[#202738] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {saveSuccess && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Configuración guardada y registrada en auditoría.
                      </span>
                    )}
                  </div>
                  <Button type="submit" disabled={saving}>
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {saving ? 'Guardando...' : 'Guardar Parámetros'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Budget Gauge & Limits Card */}
            <div className="bg-[#12161f] border border-[#202738] rounded-xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Consumo Presupuestario</h3>
                </div>

                <div className="bg-[#0a0d13] p-4 rounded-lg border border-[#1f2633] mb-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs text-slate-400 font-medium">Gasto Mes Actual:</span>
                    <span className="text-xl font-bold font-mono text-white font-tabular">
                      ${settings.current_month_spend_usd.toFixed(2)}{' '}
                      <span className="text-xs text-slate-500 font-normal">
                        / ${settings.max_monthly_spend_usd.toFixed(2)}
                      </span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-[#1b212d] h-2.5 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        spendPercent > 85 ? 'bg-red-500' : spendPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${spendPercent}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>{spendPercent}% consumido</span>
                    <span>
                      Disponible: ${(settings.max_monthly_spend_usd - settings.current_month_spend_usd).toFixed(2)} USD
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex justify-between py-1.5 border-b border-[#1b212d]">
                    <span className="text-slate-400">Tope por Corrida:</span>
                    <span className="font-mono text-white font-bold">
                      ${settings.max_spend_per_run_usd.toFixed(2)} USD
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#1b212d]">
                    <span className="text-slate-400">Queries equivalentes aprox.:</span>
                    <span className="font-mono text-white font-bold">
                      ~{Math.floor(settings.max_spend_per_run_usd / 0.0088)} consultas
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#1b212d]">
                    <span className="text-slate-400">Regla de Freno Automático:</span>
                    <span className="font-mono text-red-400 font-bold">PRE-FLIGHT STRICT</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-3 bg-red-950/20 border border-red-900/30 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>
                  Cualquier intento de ejecutar una batería que supere el saldo mensual o el tope por corrida es
                  rechazado con error <strong className="text-white">BUDGET_EXCEEDED</strong>.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-[#12161f] border border-[#202738] p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="bg-[#0a0d13] border border-[#262d3d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
              >
                <option value="ALL">Todos los Eventos ({auditEvents.length})</option>
                <option value="battery_freeze">Congelamiento de Batería (battery_freeze)</option>
                <option value="cost_edit">Edición de Costo (cost_edit)</option>
                <option value="rfq_approval">Aprobación de RFQ (rfq_approval)</option>
                <option value="email_sent">Despacho de Correo (email_sent)</option>
                <option value="strategy_changes">Cambio Estratégico (strategy_changes)</option>
                <option value="budget_exceeded">Alerta Presupuestaria (budget_exceeded)</option>
              </select>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por actor, entidad o detalle..."
                value={searchActor}
                onChange={(e) => setSearchActor(e.target.value)}
                className="w-full bg-[#0a0d13] border border-[#262d3d] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Audit Events Table */}
          <div className="bg-[#12161f] border border-[#202738] rounded-xl overflow-hidden">
            <DataTable
              columns={auditColumns}
              data={filteredEvents}
              emptyMessage="No se encontraron eventos de auditoría para el filtro seleccionado."
            />
          </div>
        </div>
      )}

      {/* TAB 3: OPENAI CALL LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Telemetry KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#12161f] border border-[#202738] p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 font-medium block">Total Llamadas IA</span>
              <span className="text-xl font-bold font-mono text-white mt-1 block">
                {callLogs.length}
              </span>
            </div>
            <div className="bg-[#12161f] border border-[#202738] p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 font-medium block">Total Tokens Procesados</span>
              <span className="text-xl font-bold font-mono text-white mt-1 block">
                {callLogs.reduce((s, l) => s + l.total_tokens, 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-[#12161f] border border-[#202738] p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 font-medium block">Costo Acumulado Total</span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                ${telemetry.totalSpendUSD.toFixed(4)} USD
              </span>
            </div>
            <div className="bg-[#12161f] border border-[#202738] p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 font-medium block">Latencia Media</span>
              <span className="text-xl font-bold font-mono text-slate-300 mt-1 block">
                {callLogs.length > 0
                  ? Math.round(callLogs.reduce((s, l) => s + l.latency_ms, 0) / callLogs.length)
                  : 0}{' '}
                ms
              </span>
            </div>
          </div>

          {/* Calls Table */}
          <div className="bg-[#12161f] border border-[#202738] rounded-xl overflow-hidden">
            <DataTable
              columns={logColumns}
              data={callLogs}
              emptyMessage="No hay registros de llamadas a OpenAI todavía."
            />
          </div>
        </div>
      )}
    </div>
  );
}
