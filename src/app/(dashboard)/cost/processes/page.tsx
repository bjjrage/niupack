'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Factory,
  Zap,
  ShieldCheck,
  Package,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  QrCode,
  Save,
  Check,
  X,
  ExternalLink,
  Sliders,
  Send,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  IndustrialProcessCalculationDetail,
  PackingSession,
  PlantGeneralParameters,
  ProductAttribute,
} from '@/types';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';

export default function ProcessesPage() {
  const [loading, setLoading] = useState(true);
  const [savingParams, setSavingParams] = useState(false);
  const [calculatingOfficial, setCalculatingOfficial] = useState(false);
  const [applyingCostSheet, setApplyingCostSheet] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // FX state
  const [fx, setFx] = useState<{ rate: number; mode: string; source: string } | null>(null);

  // Plant parameters
  const [params, setParams] = useState<PlantGeneralParameters>({
    electricity_rate_pyg_kwh: 450,
    monthly_salary_hours: 200,
    labor_charges_percent: 16.5,
    operator_monthly_salary_pyg: 3500000,
    packer_monthly_salary_pyg: 3100000,
    gen1_machines_count: 4,
    gen1_power_kw: 4.5,
    gen1_operators_count: 2,
    gen1_operating_hours: 160,
    gen2_machines_count: 2,
    gen2_power_kw: 6.0,
    gen2_operators_count: 1,
    gen2_operating_hours: 160,
    quality_inspectors_count: 2,
    quality_monthly_salary_pyg: 3200000,
    quality_polypaper_percent: 70,
    quality_labor_charges_included: true,
    packaging_materials_cost_per_thousand_usd: 3.5,
  });

  // Packing sessions
  const [sessions, setSessions] = useState<PackingSession[]>([]);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrTokenData, setQrTokenData] = useState<{ url: string; token: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // SKU & Period Prorating
  const [skus, setSkus] = useState<ProductAttribute[]>([]);
  const [selectedSku, setSelectedSku] = useState('CUP-12OZ-SW');
  const [selectedPeriod, setSelectedPeriod] = useState('2026-10');
  const [goodUnits, setGoodUnits] = useState(300000);
  const [totalPeriodUnits, setTotalPeriodUnits] = useState(300000);

  // Official calculation result
  const [officialCalculation, setOfficialCalculation] = useState<IndustrialProcessCalculationDetail | null>(null);
  const [officialSnapshotDate, setOfficialSnapshotDate] = useState<string | null>(null);

  // Cost sheet sync toggles
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyOperationalSwitch, setApplyOperationalSwitch] = useState(true);
  const [applyPackagingSwitch, setApplyPackagingSwitch] = useState(true);

  // Schema warning flag
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);

  // Load all initial data
  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      // 1. Parameters & FX
      const paramRes = await fetch('/api/cost/processes/parameters');
      const paramData = await paramRes.json();
      if (paramData.success) {
        if (paramData.parameters) {
          setParams(paramData.parameters);
          if (paramData.parameters._schemaWarning) {
            setSchemaWarning('Base de datos: Migración 20261008000001_industrial_processes_v2.sql pendiente en Supabase. Operando con persistencia local de respaldo.');
          }
        }
        if (paramData.fx) setFx(paramData.fx);
      }

      // 2. Packing sessions
      const sessionRes = await fetch('/api/cost/processes/packing/sessions');
      const sessionData = await sessionRes.json();
      if (sessionData.success && sessionData.sessions) {
        setSessions(sessionData.sessions);
      }

      // 3. SKUs Master: fix contract check (do NOT require skuData.success)
      const skuRes = await fetch('/api/cost/skus');
      const skuData = await skuRes.json();
      const loadedSkus: ProductAttribute[] = Array.isArray(skuData?.skus)
        ? skuData.skus
        : Array.isArray(skuData)
        ? skuData
        : [];
      setSkus(loadedSkus);
      if (loadedSkus.length > 0 && !loadedSkus.some((s) => s.sku === selectedSku)) {
        setSelectedSku(loadedSkus[0].sku);
      }

      // 4. Initial calculation (read-only GET)
      await runProvisionalCalculation(selectedSku || loadedSkus[0]?.sku || 'CUP-12OZ-SW', selectedPeriod, goodUnits, totalPeriodUnits);
    } catch (err: any) {
      console.error('Error loading process data', err);
      setFeedback({ message: 'Error de conexión al cargar datos de planta.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch read-only calculation
  const runProvisionalCalculation = async (sku: string, period: string, units: number, totalUnits: number) => {
    try {
      const res = await fetch(
        `/api/cost/processes/calculate?sku=${encodeURIComponent(sku)}&period=${encodeURIComponent(period)}&good_units_produced=${units}&total_period_units=${totalUnits}`
      );
      const data = await res.json();
      if (data.success && data.calculation) {
        setOfficialCalculation(data.calculation);
      }
    } catch (err) {
      console.error('Failed to run initial calculation', err);
    }
  };

  // Immediate live provisional calculation as inputs change
  const liveCalc = useMemo(() => {
    const fxRate = fx?.rate || 7500;
    return IndustrialProcessCostEngine.calculate({
      parameters: params,
      fxRate,
      fxSource: fx?.source || 'FX_OS',
      production: {
        sku: selectedSku,
        period: selectedPeriod,
        good_units_produced: goodUnits,
        total_period_units: totalPeriodUnits > 0 ? totalPeriodUnits : goodUnits,
      },
      packingSessions: sessions,
    });
  }, [params, fx, selectedSku, selectedPeriod, goodUnits, totalPeriodUnits, sessions]);

  // Save parameters to server
  const handleSaveParameters = async () => {
    setSavingParams(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cost/processes/parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al guardar');
      setParams(data.parameters);
      setFeedback({ message: 'Parámetros industriales guardados exitosamente.', type: 'success' });
    } catch (err: any) {
      setFeedback({ message: `Error al guardar parámetros: ${err.message}`, type: 'error' });
    } finally {
      setSavingParams(false);
    }
  };

  // Official calculate & persist snapshot
  const handleOfficialCalculate = async () => {
    setCalculatingOfficial(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cost/processes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedSku,
          period: selectedPeriod,
          good_units_produced: goodUnits,
          total_period_units: totalPeriodUnits,
          persist_snapshot: true,
          apply_to_cost_sheet: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error en cálculo oficial');
      setOfficialCalculation(data.calculation);
      setOfficialSnapshotDate(new Date().toISOString());
      setFeedback({ message: `Cálculo oficial guardado para ${selectedSku} (${selectedPeriod}).`, type: 'success' });
    } catch (err: any) {
      setFeedback({ message: `Error al calcular: ${err.message}`, type: 'error' });
    } finally {
      setCalculatingOfficial(false);
    }
  };

  // Synchronize to Cost Intelligence sheet
  const handleApplyToCostSheet = async () => {
    setApplyingCostSheet(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cost/processes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedSku,
          period: selectedPeriod,
          good_units_produced: goodUnits,
          total_period_units: totalPeriodUnits,
          persist_snapshot: true,
          apply_to_cost_sheet: true,
          enable_operational: applyOperationalSwitch,
          enable_packaging: applyPackagingSwitch,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al sincronizar');
      setShowApplyModal(false);
      setFeedback({
        message: `Sincronizado con Hoja de Costos de ${selectedSku}: Operativos ${applyOperationalSwitch ? 'ON' : 'OFF'}, Embalaje ${applyPackagingSwitch ? 'ON' : 'OFF'}.`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedback({ message: `Error al aplicar a Hoja de Costos: ${err.message}`, type: 'error' });
    } finally {
      setApplyingCostSheet(false);
    }
  };

  // Generate QR & signed link
  const handleGenerateQr = async () => {
    setShowQrModal(true);
    setQrLoading(true);
    try {
      const res = await fetch('/api/cost/processes/packing/qr-token?line=Polipapel');
      const data = await res.json();
      if (data.success) {
        const fullUrl = `${window.location.origin}${data.relative_url}`;
        setQrTokenData({ url: fullUrl, token: data.token });
      }
    } catch (err) {
      console.error('Error generating QR', err);
    } finally {
      setQrLoading(false);
    }
  };

  // Session actions (Approve, Void)
  const handleSessionAction = async (sessionId: string, action: 'approve' | 'void') => {
    try {
      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, session_id: sessionId }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? data.session : s)));
        setFeedback({ message: `Sesión ${action === 'approve' ? 'aprobada' : 'anulada'} exitosamente.`, type: 'success' });
      } else {
        throw new Error(data.error || 'Error en operación');
      }
    } catch (err: any) {
      setFeedback({ message: `Error: ${err.message}`, type: 'error' });
    }
  };

  const updateParam = (field: keyof PlantGeneralParameters, val: any) => {
    setParams((prev) => ({ ...prev, [field]: val }));
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Factory className="h-5 w-5 text-brand-400" /> PROCESOS INDUSTRIALES
            </h1>
            <Badge variant="brand" size="sm">V2</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Parametrización industrial, cálculo de costos de formado, calidad y empaque por SKU.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {fx && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-[#10141b] text-xs">
              <span className="text-slate-400">FX Costeo:</span>
              <span className="font-mono font-semibold text-emerald-400">
                Gs. {fx.rate.toLocaleString('es-PY')}
              </span>
              <span className="text-[10px] text-slate-500 uppercase">({fx.source})</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Recargar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveParameters}
            disabled={savingParams}
            className="text-xs font-semibold"
          >
            <Save className="h-3.5 w-3.5" /> {savingParams ? 'Guardando…' : 'Guardar Parámetros'}
          </Button>
        </div>
      </div>

      {/* Schema / Warning Banners */}
      {schemaWarning && (
        <div className="rounded-xl border border-amber-800/80 bg-amber-950/30 p-4 text-xs text-amber-200 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">{schemaWarning}</span>
            <span className="text-[11px] text-amber-300/80 block">
              Los datos se guardan y recalculan con el almacén local para garantizar operatividad continua.
            </span>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'border-emerald-800/80 bg-emerald-950/30 text-emerald-200'
              : feedback.type === 'warning'
              ? 'border-amber-800/80 bg-amber-950/30 text-amber-200'
              : 'border-rose-800/80 bg-rose-950/30 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================
          SECCIÓN 1: PARÁMETROS DE COSTEO
      ======================================================== */}
      <section className="rounded-xl border border-slate-800 bg-[#12161f] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200 flex items-center gap-2">
              <Sliders className="h-3.5 w-3.5 text-brand-400" /> PARÁMETROS DE COSTEO
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Valores globales de tarifa eléctrica, horas mensuales y cargas laborales.
            </p>
          </div>
          <Badge variant="neutral" size="sm">GLOBAL</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-300">Tarifa eléctrica global</span>
            <div className="flex min-h-10 items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3">
              <input
                type="number"
                step="any"
                value={params.electricity_rate_pyg_kwh || ''}
                placeholder="Sin configurar"
                onChange={(e) => updateParam('electricity_rate_pyg_kwh', Number(e.target.value))}
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
              />
              <span className="text-[11px] text-slate-500 ml-2 whitespace-nowrap">Gs./kWh</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-300">Horas salariales al mes</span>
            <div className="flex min-h-10 items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3">
              <input
                type="number"
                step="any"
                value={params.monthly_salary_hours || ''}
                placeholder="Sin configurar"
                onChange={(e) => updateParam('monthly_salary_hours', Number(e.target.value))}
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
              />
              <span className="text-[11px] text-slate-500 ml-2 whitespace-nowrap">h/mes</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-300">Cargas laborales</span>
            <div className="flex min-h-10 items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3">
              <input
                type="number"
                step="any"
                value={params.labor_charges_percent || ''}
                placeholder="Sin configurar"
                onChange={(e) => updateParam('labor_charges_percent', Number(e.target.value))}
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
              />
              <span className="text-[11px] text-slate-500 ml-2 whitespace-nowrap">%</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          SECCIÓN 2: FORMADO DE VASOS (Inputs + Inline Cálculos)
      ======================================================== */}
      <section className="rounded-xl border border-slate-800 bg-[#12161f] p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" /> FORMADO DE VASOS
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Máquinas formadoras de 1.ª y 2.ª generación, operadores de máquina y consumo energético.
            </p>
          </div>
          <Badge variant="neutral" size="sm">OPERATIVO</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Inputs Column */}
          <div className="lg:col-span-7 space-y-4">
            {/* Máquinas 1.ª generación */}
            <div className="rounded-lg border border-slate-800 bg-[#0e1219] p-3.5 space-y-2.5">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Máquinas 1.ª generación</span>
                <span className="text-[11px] font-mono text-slate-500">
                  {liveCalc.forming.energy_kwh_gen1.toLocaleString('es-PY')} kWh
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Cantidad</span>
                  <input
                    type="number"
                    value={params.gen1_machines_count ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen1_machines_count', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">kW / máquina</span>
                  <input
                    type="number"
                    step="any"
                    value={params.gen1_power_kw ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen1_power_kw', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Horas</span>
                  <input
                    type="number"
                    value={params.gen1_operating_hours ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen1_operating_hours', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Operadores</span>
                  <input
                    type="number"
                    value={params.gen1_operators_count ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen1_operators_count', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Máquinas 2.ª generación */}
            <div className="rounded-lg border border-slate-800 bg-[#0e1219] p-3.5 space-y-2.5">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Máquinas 2.ª generación</span>
                <span className="text-[11px] font-mono text-slate-500">
                  {liveCalc.forming.energy_kwh_gen2.toLocaleString('es-PY')} kWh
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Cantidad</span>
                  <input
                    type="number"
                    value={params.gen2_machines_count ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen2_machines_count', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">kW / máquina</span>
                  <input
                    type="number"
                    step="any"
                    value={params.gen2_power_kw ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen2_power_kw', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Horas</span>
                  <input
                    type="number"
                    value={params.gen2_operating_hours ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen2_operating_hours', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Operadores</span>
                  <input
                    type="number"
                    value={params.gen2_operators_count ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('gen2_operators_count', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 font-mono text-white text-xs outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Salario operador */}
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-slate-400">Salario mensual operador:</span>
              <div className="flex items-center gap-1 font-mono">
                <span className="text-white font-semibold">
                  Gs. {(params.operator_monthly_salary_pyg || 3500000).toLocaleString('es-PY')}
                </span>
                <span className="text-[10px] text-emerald-400">(CONFIRMADO)</span>
              </div>
            </div>
          </div>

          {/* Inline Costo Calculado Column */}
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0b0e14] p-4 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
                COSTO CALCULADO · FORMADO
              </span>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Electricidad:</span>
                  <span className="font-semibold text-white">
                    Gs. {liveCalc.forming.electricity_cost_pyg.toLocaleString('es-PY')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Operadores:</span>
                  <span className="font-semibold text-white">
                    Gs. {liveCalc.forming.mod_forming_cost_pyg.toLocaleString('es-PY')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Costo de formado:</span>
                  <span className="font-bold text-amber-300">
                    Gs. {liveCalc.forming.total_forming_pyg.toLocaleString('es-PY')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Costo horario:</span>
                  <span className="font-bold text-white">
                    Gs. {liveCalc.forming_hourly_cost_pyg?.toLocaleString('es-PY') || '0'}/h
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Equivalente USD:</span>
              <span className="font-mono font-bold text-white">
                ${liveCalc.forming.total_forming_usd.toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          SECCIÓN 3: CONTROL DE CALIDAD (Inputs + Inline Cálculos)
      ======================================================== */}
      <section className="rounded-xl border border-slate-800 bg-[#12161f] p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200 flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" /> CONTROL DE CALIDAD
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Personal de control de calidad imputado proporcionalmente a la línea de polipapel.
            </p>
          </div>
          <Badge variant="neutral" size="sm">CALIDAD</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Inputs Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 font-medium">Cantidad personas</span>
                  <span className="text-[10px] text-emerald-400">(CONFIRMADO)</span>
                </div>
                <div className="min-h-10 flex items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3 font-mono text-sm text-white">
                  {params.quality_inspectors_count ?? 2} personas
                </div>
              </div>

              <div>
                <span className="text-slate-300 font-medium block mb-1">Salario mensual</span>
                <div className="min-h-10 flex items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3">
                  <input
                    type="number"
                    step="any"
                    value={params.quality_monthly_salary_pyg || ''}
                    placeholder="Sin configurar"
                    onChange={(e) => updateParam('quality_monthly_salary_pyg', Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm text-white outline-none"
                  />
                  <span className="text-[11px] text-slate-500 ml-1">Gs.</span>
                </div>
              </div>

              <div>
                <span className="text-slate-300 font-medium block mb-1">% asignado polipapel</span>
                <div className="min-h-10 flex items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3">
                  <input
                    type="number"
                    step="any"
                    value={params.quality_polypaper_percent ?? ''}
                    placeholder="0"
                    onChange={(e) => updateParam('quality_polypaper_percent', Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm text-white outline-none"
                  />
                  <span className="text-[11px] text-slate-500 ml-1">%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="quality_labor_charges"
                checked={params.quality_labor_charges_included !== false}
                onChange={(e) => updateParam('quality_labor_charges_included', e.target.checked)}
                className="h-3.5 w-3.5 accent-brand-500 rounded"
              />
              <label htmlFor="quality_labor_charges" className="text-xs text-slate-400 cursor-pointer">
                Aplicar cargas laborales ({params.labor_charges_percent || 0}%) al salario de calidad
              </label>
            </div>
          </div>

          {/* Inline Costo Calculado Column */}
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0b0e14] p-4 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
                COSTO CALCULADO · CALIDAD
              </span>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Costo mensual total:</span>
                  <span className="font-semibold text-white">
                    Gs. {((params.quality_inspectors_count || 2) * (params.quality_monthly_salary_pyg || 0) * (params.quality_labor_charges_included !== false ? (1 + (params.labor_charges_percent || 0) / 100) : 1)).toLocaleString('es-PY')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Imputado polipapel:</span>
                  <span className="font-bold text-blue-300">
                    Gs. {liveCalc.quality.assigned_monthly_pyg.toLocaleString('es-PY')}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Equivalente USD:</span>
              <span className="font-mono font-bold text-white">
                ${liveCalc.quality.assigned_usd.toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          SECCIÓN 4: EMPAQUE (Inputs + Inline Cálculos + QR)
      ======================================================== */}
      <section className="rounded-xl border border-slate-800 bg-[#12161f] p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200 flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-emerald-400" /> EMPAQUE
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Mano de obra proveniente de horas aprobadas de cronómetro de empaque y materiales de embalaje.
            </p>
          </div>
          <Badge variant="neutral" size="sm">EMBALAJE</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Inputs Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 font-medium">Salario empacador</span>
                  <span className="text-[10px] text-emerald-400">(CONFIRMADO)</span>
                </div>
                <div className="min-h-10 flex items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3 font-mono text-sm text-white">
                  Gs. 3.100.000 / mes
                </div>
              </div>

              <div>
                <span className="text-slate-300 font-medium block mb-1">Materiales de empaque</span>
                <div className="min-h-10 flex items-center rounded-md border border-slate-700 bg-[#0c0f14] px-3">
                  <input
                    type="number"
                    step="any"
                    value={params.packaging_materials_cost_per_thousand_usd ?? ''}
                    placeholder="Sin configurar"
                    onChange={(e) => updateParam('packaging_materials_cost_per_thousand_usd', Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm text-white outline-none"
                  />
                  <span className="text-[11px] text-slate-500 ml-1">USD/1.000</span>
                </div>
              </div>

              <div>
                <span className="text-slate-300 font-medium block mb-1">Horas-persona aprobadas</span>
                <div className="min-h-10 flex items-center justify-between rounded-md border border-slate-700 bg-[#0c0f14] px-3 font-mono text-sm text-white">
                  <span>{liveCalc.packing_labor.approved_person_hours.toLocaleString('es-PY')} h</span>
                  <span className="text-[10px] text-slate-500 font-sans">({liveCalc.packing_labor.sessions_count} sesiones)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSessionsModal(true)}
                className="text-xs"
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" /> Ver registros ({sessions.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateQr}
                className="text-xs border-brand-800 text-brand-300 hover:bg-brand-950/40"
              >
                <QrCode className="h-3.5 w-3.5 mr-1.5" /> Generar QR Celular
              </Button>
            </div>
          </div>

          {/* Inline Costo Calculado Column */}
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0b0e14] p-4 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
                COSTO CALCULADO · EMPAQUE
              </span>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">MO empaque:</span>
                  <span className="font-semibold text-white">
                    Gs. {liveCalc.packing_labor.packing_labor_pyg.toLocaleString('es-PY')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Materiales (lote):</span>
                  <span className="font-semibold text-white">
                    ${((liveCalc.packaging_materials.cost_per_thousand_usd / 1000) * goodUnits).toFixed(2)} USD
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-sans">Costo total empaque:</span>
                  <span className="font-bold text-emerald-400">
                    ${(liveCalc.packing_labor.packing_labor_usd + (liveCalc.packaging_materials.cost_per_thousand_usd / 1000) * goodUnits).toFixed(2)} USD
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Por 1.000 unidades:</span>
              <span className="font-mono font-bold text-emerald-400">
                ${liveCalc.packaging_total_usd_per_thousand.toFixed(4)} USD / 1.000
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          SECCIÓN 5: COSTO INDUSTRIAL POR SKU (Prorrateo & Cost Intelligence)
      ======================================================== */}
      <section className="rounded-xl border border-brand-900/60 bg-[#10151f] p-5 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-brand-300 flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand-400" /> COSTO INDUSTRIAL POR SKU
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Prorrateo multi-SKU sobre unidades producidas y alimentación directa a Cost Intelligence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                liveCalc.status === 'COMPLETE'
                  ? 'success'
                  : liveCalc.status === 'SIN_BASE_PRORRATEO'
                  ? 'warning'
                  : 'danger'
              }
              size="sm"
            >
              {liveCalc.status === 'COMPLETE'
                ? 'COMPLETO'
                : liveCalc.status === 'SIN_BASE_PRORRATEO'
                ? 'SIN BASE PRORRATEO'
                : 'CONFIGURACIÓN INCOMPLETA'}
            </Badge>
          </div>
        </div>

        {/* SKU Selector & Production Base */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="text-slate-300 font-medium block mb-1.5">SKU a costear</label>
            <select
              value={selectedSku}
              onChange={(e) => {
                setSelectedSku(e.target.value);
                runProvisionalCalculation(e.target.value, selectedPeriod, goodUnits, totalPeriodUnits);
              }}
              className="w-full min-h-10 rounded-md border border-slate-700 bg-[#0c0f14] px-3 font-semibold text-white outline-none focus:border-brand-500"
            >
              {skus.map((s) => (
                <option key={s.sku} value={s.sku}>
                  {s.sku} {s.size_oz ? `(${s.size_oz} oz)` : ''}
                </option>
              ))}
              {skus.length === 0 && <option value="CUP-12OZ-SW">CUP-12OZ-SW</option>}
            </select>
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1.5">Período de producción</label>
            <input
              type="text"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full min-h-10 rounded-md border border-slate-700 bg-[#0c0f14] px-3 font-mono text-white outline-none"
            />
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1.5">Unidades buenas del SKU</label>
            <input
              type="number"
              value={goodUnits || ''}
              onChange={(e) => setGoodUnits(Math.max(0, Number(e.target.value)))}
              className="w-full min-h-10 rounded-md border border-slate-700 bg-[#0c0f14] px-3 font-mono text-white outline-none"
            />
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1.5">
              Total período planta <span className="text-slate-500 font-normal">(prorrateo)</span>
            </label>
            <input
              type="number"
              value={totalPeriodUnits || ''}
              onChange={(e) => setTotalPeriodUnits(Math.max(0, Number(e.target.value)))}
              className="w-full min-h-10 rounded-md border border-slate-700 bg-[#0c0f14] px-3 font-mono text-white outline-none"
            />
          </div>
        </div>

        {/* Missing fields alert */}
        {liveCalc.missing_fields && liveCalc.missing_fields.length > 0 && (
          <div className="rounded-lg border border-amber-800/80 bg-amber-950/20 p-3 text-xs text-amber-200">
            <span className="font-semibold block mb-1">Parámetros faltantes para costeo oficial:</span>
            <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-300/80">
              {liveCalc.missing_fields.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Results Cards: Costos Operativos y Embalaje */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Card A: Costos Operativos */}
          <div className="rounded-xl border border-slate-800 bg-[#0c0f14] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                COSTOS OPERATIVOS
              </span>
              <Badge variant="brand" size="sm">RUBRO 3</Badge>
            </div>
            <div className="font-mono text-2xl font-black text-white">
              ${liveCalc.operational_total_usd_per_thousand.toFixed(4)}{' '}
              <span className="text-xs font-normal text-slate-400">USD / 1.000</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-1 border-t border-slate-800/60">
              <div className="flex justify-between">
                <span>Unitario:</span>
                <span className="text-emerald-400 font-semibold">${liveCalc.true_unit_operational_usd.toFixed(5)} /u</span>
              </div>
              <div className="flex justify-between">
                <span>Guaraníes:</span>
                <span>Gs. {liveCalc.operational_total_pyg_per_thousand.toLocaleString('es-PY')} / 1.000</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Formado prorrateado:</span>
                <span>${(liveCalc.allocated_forming_usd || 0).toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Calidad prorrateada:</span>
                <span>${(liveCalc.allocated_quality_usd || 0).toFixed(2)} USD</span>
              </div>
            </div>
          </div>

          {/* Card B: Embalaje */}
          <div className="rounded-xl border border-slate-800 bg-[#0c0f14] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                EMBALAJE
              </span>
              <Badge variant="brand" size="sm">RUBRO 6</Badge>
            </div>
            <div className="font-mono text-2xl font-black text-white">
              ${liveCalc.packaging_total_usd_per_thousand.toFixed(4)}{' '}
              <span className="text-xs font-normal text-slate-400">USD / 1.000</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-1 border-t border-slate-800/60">
              <div className="flex justify-between">
                <span>Unitario:</span>
                <span className="text-emerald-400 font-semibold">${liveCalc.true_unit_packaging_usd.toFixed(5)} /u</span>
              </div>
              <div className="flex justify-between">
                <span>Guaraníes:</span>
                <span>Gs. {liveCalc.packaging_total_pyg_per_thousand.toLocaleString('es-PY')} / 1.000</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Mano de obra empaque:</span>
                <span>${liveCalc.packing_labor.packing_labor_usd.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Materiales:</span>
                <span>${((liveCalc.packaging_materials.cost_per_thousand_usd / 1000) * goodUnits).toFixed(2)} USD</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="text-[11px] text-slate-500 font-mono">
            {officialSnapshotDate ? (
              <span>Cálculo oficial guardado: {new Date(officialSnapshotDate).toLocaleTimeString('es-PY')}</span>
            ) : (
              <span>Visualizando cálculo provisional en tiempo real</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOfficialCalculate}
              disabled={calculatingOfficial || liveCalc.status !== 'COMPLETE'}
              className="text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              {calculatingOfficial ? 'Guardando…' : 'Guardar Snapshot Oficial'}
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowApplyModal(true)}
              disabled={liveCalc.status !== 'COMPLETE'}
              className="text-xs font-semibold"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Aplicar a Hoja de Costos
            </Button>
          </div>
        </div>
      </section>

      {/* ========================================================
          MODAL A: Sincronizar con Hoja de Costos (Switches Independientes)
      ======================================================== */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#12161f] p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Sincronizar con Hoja de Costos</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Seleccione independientemente qué rubros utilizarán el cálculo de Procesos V2 para el SKU{' '}
                  <strong className="text-white">{selectedSku}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Switch 1: Operativos */}
              <div className="rounded-xl border border-slate-800 bg-[#0e1219] p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Costos Operativos (Formado + Calidad)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Valor a inyectar: ${liveCalc.operational_total_usd_per_thousand.toFixed(4)} USD / 1.000
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-mono font-semibold text-slate-400">
                    {applyOperationalSwitch ? 'ON' : 'OFF'}
                  </span>
                  <input
                    type="checkbox"
                    checked={applyOperationalSwitch}
                    onChange={(e) => setApplyOperationalSwitch(e.target.checked)}
                    className="h-4 w-4 accent-brand-500 rounded"
                  />
                </label>
              </div>

              {/* Switch 2: Embalaje */}
              <div className="rounded-xl border border-slate-800 bg-[#0e1219] p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Embalaje (Mano de obra + Materiales)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Valor a inyectar: ${liveCalc.packaging_total_usd_per_thousand.toFixed(4)} USD / 1.000
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-mono font-semibold text-slate-400">
                    {applyPackagingSwitch ? 'ON' : 'OFF'}
                  </span>
                  <input
                    type="checkbox"
                    checked={applyPackagingSwitch}
                    onChange={(e) => setApplyPackagingSwitch(e.target.checked)}
                    className="h-4 w-4 accent-brand-500 rounded"
                  />
                </label>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Los switches apagados mantendrán su costo manual sin alterarlo. La sincronización recalculará el True
              Cost oficial del SKU.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowApplyModal(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyToCostSheet}
                disabled={applyingCostSheet}
                className="font-semibold"
              >
                {applyingCostSheet ? 'Aplicando…' : 'Confirmar Sincronización'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL B: Registros de Sesiones de Empaque
      ======================================================== */}
      {showSessionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-[#12161f] p-6 space-y-4 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-400" /> Registros de Sesiones de Empaque
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Supervisión y aprobación de horas-persona registradas por la encargada de empaque.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSessionsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {sessions.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">
                  No hay sesiones de empaque registradas en el período.
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-800 bg-[#0e1219] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{s.session_code || s.id.slice(0, 8)}</span>
                        <Badge
                          variant={
                            s.status === 'APPROVED'
                              ? 'success'
                              : s.status === 'RUNNING'
                              ? 'brand'
                              : s.status === 'VOIDED'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {s.status}
                        </Badge>
                        <span className="text-[11px] text-slate-400">{s.line_name || 'Polipapel'}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Inicio: {new Date(s.started_at).toLocaleString('es-PY')}
                        {s.stopped_at && ` · Fin: ${new Date(s.stopped_at).toLocaleTimeString('es-PY')}`}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {s.segments?.length || 1} segmentos · Dotación final: {s.segments?.[s.segments.length - 1]?.headcount || 1} personas
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2">
                      <div className="font-mono font-bold text-sm text-emerald-400">
                        {s.total_person_hours.toFixed(2)} h-persona
                      </div>
                      <div className="flex items-center gap-1.5">
                        {s.status !== 'APPROVED' && s.status !== 'VOIDED' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleSessionAction(s.id, 'approve')}
                            className="text-[11px] px-2.5 py-1"
                          >
                            <Check className="h-3 w-3 mr-1" /> Aprobar
                          </Button>
                        )}
                        {s.status !== 'VOIDED' && s.status !== 'APPROVED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSessionAction(s.id, 'void')}
                            className="text-[11px] px-2 py-1 text-rose-400 hover:text-rose-300 border-rose-900/50"
                          >
                            Anular
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowSessionsModal(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL C: Generar QR & Enlace Móvil
      ======================================================== */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#12161f] p-6 space-y-5 shadow-2xl text-center">
            <div className="flex items-start justify-between">
              <div className="text-left">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-brand-400" /> Acceso Encargada de Empaque
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Token seguro firmado con alcance exclusivo para registrar horas de empaque.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {qrLoading ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <RefreshCw className="h-6 w-6 text-brand-400 animate-spin" />
                <span className="text-xs text-slate-400">Generando token firmado…</span>
              </div>
            ) : qrTokenData ? (
              <div className="space-y-4">
                <div className="p-4 bg-white rounded-2xl inline-block mx-auto shadow-inner">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrTokenData.url)}`}
                    alt="Código QR de Empaque"
                    className="w-44 h-44"
                  />
                </div>

                <div className="text-xs text-slate-300 font-mono break-all bg-[#0a0d12] p-3 rounded-lg border border-slate-800 text-left">
                  <span className="text-slate-500 block text-[10px] mb-1 font-sans">Enlace directo:</span>
                  {qrTokenData.url}
                </div>

                <div className="flex gap-2 justify-center">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(qrTokenData.url);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }}
                    className="text-xs"
                  >
                    {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                    {copiedLink ? '¡Enlace Copiado!' : 'Copiar Enlace'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(qrTokenData.url, '_blank')}
                    className="text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir en Celular
                  </Button>
                </div>

                <p className="text-[11px] text-slate-500">
                  Válido por 7 días. La pantalla de la encargada no muestra salarios ni datos de costos.
                </p>
              </div>
            ) : null}

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowQrModal(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
