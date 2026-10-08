'use client';

import React, { useEffect, useState } from 'react';
import {
  Factory,
  Zap,
  ShieldCheck,
  Package,
  Clock,
  Play,
  Square,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  QrCode,
  ArrowRight,
  Save,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  IndustrialProcessCalculationDetail,
  PackingSession,
  PlantGeneralParameters,
  ProductAttribute,
} from '@/types';

export default function ProcessesPage() {
  const [loading, setLoading] = useState(true);
  const [savingParams, setSavingParams] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // FX state
  const [fx, setFx] = useState<{ rate: number; mode: string; source: string } | null>(null);

  // Parameters
  const [params, setParams] = useState<PlantGeneralParameters>({
    electricity_rate_pyg_kwh: 450,
    monthly_salary_hours: 200,
    labor_charges_percent: 16.5,
    operator_monthly_salary_pyg: 3500000,
    packer_monthly_salary_pyg: 2800000,
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
  const [newSessionLine, setNewSessionLine] = useState('Polipapel');
  const [newSessionHeadcount, setNewSessionHeadcount] = useState(2);
  const [newSessionSku, setNewSessionSku] = useState('CUP-12OZ-SW');
  const [newSessionOp, setNewSessionOp] = useState('OP-2026-84');

  // SKU & Period Prorating
  const [skus, setSkus] = useState<ProductAttribute[]>([]);
  const [selectedSku, setSelectedSku] = useState('CUP-12OZ-SW');
  const [selectedPeriod, setSelectedPeriod] = useState('2026-10');
  const [goodUnits, setGoodUnits] = useState(300000);

  // Live calculation results
  const [calculation, setCalculation] = useState<IndustrialProcessCalculationDetail | null>(null);

  // Active section tab
  const [activeTab, setActiveTab] = useState<'parameters' | 'forming' | 'quality' | 'packing' | 'summary'>('summary');

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load parameters & FX
      const paramRes = await fetch('/api/cost/processes/parameters');
      const paramData = await paramRes.json();
      if (paramData.success) {
        if (paramData.parameters) setParams(paramData.parameters);
        if (paramData.fx) setFx(paramData.fx);
      }

      // 2. Load sessions
      const sessionRes = await fetch('/api/cost/processes/packing/sessions');
      const sessionData = await sessionRes.json();
      if (sessionData.success && sessionData.sessions) {
        setSessions(sessionData.sessions);
      }

      // 3. Load SKUs
      const skuRes = await fetch('/api/cost/skus');
      const skuData = await skuRes.json();
      if (skuData.success && skuData.skus) {
        setSkus(skuData.skus);
        if (skuData.skus.length > 0 && !skuData.skus.some((s: any) => s.sku === selectedSku)) {
          setSelectedSku(skuData.skus[0].sku);
        }
      }

      // 4. Load production periods & initial calculation
      await runCalculation(selectedSku, selectedPeriod, goodUnits);
    } catch (err: any) {
      console.error('Failed to load process data', err);
      setFeedback('Error al cargar datos de planta.');
    } finally {
      setLoading(false);
    }
  };

  const runCalculation = async (skuToCalc: string, periodToCalc: string, unitsToCalc: number) => {
    setCalculating(true);
    try {
      const res = await fetch('/api/cost/processes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: skuToCalc,
          period: periodToCalc,
          good_units_produced: unitsToCalc,
        }),
      });
      const data = await res.json();
      if (data.success && data.calculation) {
        setCalculation(data.calculation);
      }
    } catch (err) {
      console.error('Calculation error', err);
    } finally {
      setCalculating(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveParameters = async () => {
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
      setFeedback('Parámetros de planta guardados exitosamente.');
      await runCalculation(selectedSku, selectedPeriod, goodUnits);
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setSavingParams(false);
    }
  };

  const applyToCostSheet = async () => {
    setCalculating(true);
    setFeedback(null);
    try {
      // Save production period record first
      await fetch('/api/cost/processes/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedSku,
          period: selectedPeriod,
          good_units_produced: goodUnits,
        }),
      });

      // Calculate and apply
      const res = await fetch('/api/cost/processes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedSku,
          period: selectedPeriod,
          good_units_produced: goodUnits,
          apply_to_cost_sheet: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al aplicar');
      setCalculation(data.calculation);
      setFeedback(`¡Sincronizado! El costo de Procesos V2 ahora alimenta la Hoja de Costos de ${selectedSku}.`);
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setCalculating(false);
    }
  };

  const handleStartSession = async () => {
    try {
      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          line_name: newSessionLine,
          sku: newSessionSku,
          production_order: newSessionOp,
          initial_headcount: newSessionHeadcount,
          reason: 'Inicio de turno',
        }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setFeedback('Nueva sesión de empaque iniciada.');
      }
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    }
  };

  const handleSessionAction = async (action: string, sessionId: string, extra?: any) => {
    try {
      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          session_id: sessionId,
          ...extra,
        }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? data.session : s)));
        setFeedback(`Sesión actualizada: ${action}`);
        await runCalculation(selectedSku, selectedPeriod, goodUnits);
      }
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    }
  };

  // Approved person hours total
  const approvedPersonHours = sessions
    .filter((s) => s.status === 'APPROVED')
    .reduce((sum, s) => sum + (s.total_person_hours || 0), 0);

  return (
    <div style={{ zoom: 0.8 }} className="mx-auto max-w-7xl space-y-6 text-slate-100">
      {/* Top Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Módulo 3 Industrial</span>
            <span className="text-xs text-slate-600">/</span>
            <span className="text-xs text-slate-400">Parametrización &amp; Procesos</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Procesos Industriales &amp; Cronómetro de Planta
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Formado de vasos, control de calidad, cronómetro de empaque y prorrateo oficial para Cost Intelligence V1.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {fx && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#10141b] px-3 py-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-slate-400">FX OS ({fx.source}):</span>
              <span className="font-mono font-bold text-white">Gs. {fx.rate.toLocaleString('es-PY')} / USD</span>
            </div>
          )}

          <Link
            href="/cost/processes/packing-mobile"
            className="flex items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-950/40 px-3 py-2 text-xs font-semibold text-brand-300 hover:bg-brand-900/60 transition-colors"
          >
            <QrCode className="h-4 w-4" />
            <span>Vista QR Móvil</span>
          </Link>

          <Button
            onClick={saveParameters}
            disabled={savingParams}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-4 py-2"
          >
            <Save className="h-4 w-4" />
            <span>{savingParams ? 'Guardando…' : 'Guardar Planta'}</span>
          </Button>
        </div>
      </header>

      {feedback && (
        <div className="rounded-lg border border-brand-800/60 bg-brand-950/30 px-4 py-3 text-xs text-brand-200">
          {feedback}
        </div>
      )}

      {/* Tabs navigation */}
      <nav className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { key: 'summary', label: 'Resumen & Prorrateo SKU', icon: Package },
          { key: 'parameters', label: 'Parámetros Generales', icon: Factory },
          { key: 'forming', label: 'Formado de Vasos', icon: Zap },
          { key: 'quality', label: 'Control de Calidad', icon: ShieldCheck },
          { key: 'packing', label: 'Cronómetro de Empaque', icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === key
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* SECTION: SUMMARY & PRORRATING */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-[#141820] p-5">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <h2 className="text-base font-bold text-white">Prorrateo por Lote y SKU</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Seleccioná el producto y el volumen de producción mensual para calcular los costos unitarios de Procesos.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span className="font-semibold text-[11px] text-slate-400">SKU</span>
                  <select
                    value={selectedSku}
                    onChange={(e) => {
                      setSelectedSku(e.target.value);
                      void runCalculation(e.target.value, selectedPeriod, goodUnits);
                    }}
                    className="min-h-9 rounded-md border border-slate-700 bg-[#0c0f14] px-2.5 py-1 text-xs font-mono text-white"
                  >
                    {skus.map((s) => (
                      <option key={s.sku} value={s.sku}>
                        {s.sku}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span className="font-semibold text-[11px] text-slate-400">PERÍODO</span>
                  <input
                    type="text"
                    value={selectedPeriod}
                    onChange={(e) => {
                      setSelectedPeriod(e.target.value);
                      void runCalculation(selectedSku, e.target.value, goodUnits);
                    }}
                    className="min-h-9 w-24 rounded-md border border-slate-700 bg-[#0c0f14] px-2.5 py-1 text-xs font-mono text-white"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span className="font-semibold text-[11px] text-slate-400">UNIDADES BUENAS</span>
                  <input
                    type="number"
                    value={goodUnits}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setGoodUnits(val);
                      void runCalculation(selectedSku, selectedPeriod, val);
                    }}
                    className="min-h-9 w-32 rounded-md border border-slate-700 bg-[#0c0f14] px-2.5 py-1 text-xs font-mono text-white"
                  />
                </label>

                <Button
                  onClick={applyToCostSheet}
                  disabled={calculating || !calculation || calculation.status !== 'COMPLETE'}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 self-end min-h-9"
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  <span>Sincronizar a Hoja de Costos</span>
                </Button>
              </div>
            </div>

            {/* Status indicator */}
            {calculation && (
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Estado de cálculo:</span>
                  <Badge
                    variant={
                      calculation.status === 'COMPLETE'
                        ? 'success'
                        : calculation.status === 'SIN_BASE_PRORRATEO'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {calculation.status}
                  </Badge>
                </div>
                {calculation.missing_fields && calculation.missing_fields.length > 0 && (
                  <span className="text-[11px] text-amber-300">
                    Faltan: {calculation.missing_fields.join(', ')}
                  </span>
                )}
              </div>
            )}

            {/* Consolidated Cards */}
            {calculation && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {/* Costos Operativos */}
                <div className="rounded-xl border border-brand-500/30 bg-[#161c26] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-brand-300">
                        RUBRO 3 OFICIAL
                      </div>
                      <h3 className="text-lg font-bold text-white">Costos Operativos</h3>
                    </div>
                    <Badge variant="brand">Formado + Calidad</Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="font-mono text-3xl font-extrabold text-white">
                      ${calculation.operational_total_usd_per_thousand.toFixed(4)}{' '}
                      <span className="text-sm font-normal text-slate-400">USD / 1.000</span>
                    </div>
                    <div className="font-mono text-sm text-emerald-400">
                      ${calculation.true_unit_operational_usd.toFixed(5)} USD / unidad
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Gs. {calculation.operational_total_pyg_per_thousand.toLocaleString('es-PY')} / 1.000
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-3 text-xs space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Formado (Energía + MOD):</span>
                      <span className="font-mono">${calculation.forming.total_forming_usd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Control de calidad polipapel:</span>
                      <span className="font-mono">${calculation.quality.assigned_usd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between font-semibold text-white pt-1 border-t border-slate-800/60">
                      <span>Total operativo mensual:</span>
                      <span className="font-mono">
                        ${(calculation.forming.total_forming_usd + calculation.quality.assigned_usd).toFixed(2)} USD
                      </span>
                    </div>
                  </div>
                </div>

                {/* Embalaje */}
                <div className="rounded-xl border border-brand-500/30 bg-[#161c26] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-brand-300">
                        RUBRO 6 OFICIAL
                      </div>
                      <h3 className="text-lg font-bold text-white">Embalaje</h3>
                    </div>
                    <Badge variant="brand">MO Empaque + Materiales</Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="font-mono text-3xl font-extrabold text-white">
                      ${calculation.packaging_total_usd_per_thousand.toFixed(4)}{' '}
                      <span className="text-sm font-normal text-slate-400">USD / 1.000</span>
                    </div>
                    <div className="font-mono text-sm text-emerald-400">
                      ${calculation.true_unit_packaging_usd.toFixed(5)} USD / unidad
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Gs. {calculation.packaging_total_pyg_per_thousand.toLocaleString('es-PY')} / 1.000
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-3 text-xs space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        MO Empaque ({calculation.packing_labor.approved_person_hours} h-p aprobadas):
                      </span>
                      <span className="font-mono">${calculation.packing_labor.packing_labor_usd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Materiales parametrizados:</span>
                      <span className="font-mono">
                        ${calculation.packaging_materials.cost_per_thousand_usd.toFixed(4)} USD / 1.000
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION: GENERAL PARAMETERS */}
      {activeTab === 'parameters' && (
        <div className="rounded-xl border border-slate-800 bg-[#141820] p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white">Parámetros Globales de Planta</h2>
            <p className="mt-1 text-xs text-slate-400">
              Tarifa eléctrica compartida, horas de jornada mensual, cargas sociales y salarios de referencia.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span className="font-semibold">Tarifa Eléctrica Compartida (Gs./kWh)</span>
              <input
                type="number"
                value={params.electricity_rate_pyg_kwh}
                onChange={(e) => setParams({ ...params, electricity_rate_pyg_kwh: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
              <span className="text-[11px] text-slate-500">Tarifa ANDE contratada para toda la planta</span>
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span className="font-semibold">Horas Salariales Mensuales (h/mes)</span>
              <input
                type="number"
                value={params.monthly_salary_hours}
                onChange={(e) => setParams({ ...params, monthly_salary_hours: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
              <span className="text-[11px] text-slate-500">Base estándar mensual de cálculo (ej. 200 h)</span>
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span className="font-semibold">Cargas Sociales Laborales (%)</span>
              <input
                type="number"
                step="0.1"
                value={params.labor_charges_percent}
                onChange={(e) => setParams({ ...params, labor_charges_percent: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
              <span className="text-[11px] text-slate-500">IPS patronal + provisiones (ej. 16.5%)</span>
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span className="font-semibold">Salario Operador Formado (Gs./mes)</span>
              <input
                type="number"
                value={params.operator_monthly_salary_pyg}
                onChange={(e) => setParams({ ...params, operator_monthly_salary_pyg: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span className="font-semibold">Salario Empacador (Gs./mes)</span>
              <input
                type="number"
                value={params.packer_monthly_salary_pyg}
                onChange={(e) => setParams({ ...params, packer_monthly_salary_pyg: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span className="font-semibold">Costo Materiales Empaque (USD/1.000)</span>
              <input
                type="number"
                step="0.01"
                value={params.packaging_materials_cost_per_thousand_usd}
                onChange={(e) =>
                  setParams({ ...params, packaging_materials_cost_per_thousand_usd: Number(e.target.value) })
                }
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
              <span className="text-[11px] text-slate-500">Cajas corrugadas, bolsas, cinta, pallet</span>
            </label>
          </div>
        </div>
      )}

      {/* SECTION: FORMING MACHINES */}
      {activeTab === 'forming' && (
        <div className="rounded-xl border border-slate-800 bg-[#141820] p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white">Formado de Vasos (Máquinas Automáticas)</h2>
            <p className="mt-1 text-xs text-slate-400">
              Grupos de máquinas de 1.ª y 2.ª generación. Los operadores de máquina se calculan directamente acá.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gen 1 */}
            <div className="rounded-lg border border-slate-800 bg-[#10141b] p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300">
                Máquinas Formadoras 1.ª Generación
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1">
                  <span>Cantidad de máquinas</span>
                  <input
                    type="number"
                    value={params.gen1_machines_count}
                    onChange={(e) => setParams({ ...params, gen1_machines_count: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Potencia por máquina (kW)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={params.gen1_power_kw}
                    onChange={(e) => setParams({ ...params, gen1_power_kw: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Operadores de formado</span>
                  <input
                    type="number"
                    value={params.gen1_operators_count}
                    onChange={(e) => setParams({ ...params, gen1_operators_count: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Horas operativas mensuales</span>
                  <input
                    type="number"
                    value={params.gen1_operating_hours}
                    onChange={(e) => setParams({ ...params, gen1_operating_hours: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
              </div>
            </div>

            {/* Gen 2 */}
            <div className="rounded-lg border border-slate-800 bg-[#10141b] p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300">
                Máquinas Formadoras 2.ª Generación (Alta Velocidad)
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1">
                  <span>Cantidad de máquinas</span>
                  <input
                    type="number"
                    value={params.gen2_machines_count}
                    onChange={(e) => setParams({ ...params, gen2_machines_count: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Potencia por máquina (kW)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={params.gen2_power_kw}
                    onChange={(e) => setParams({ ...params, gen2_power_kw: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Operadores de formado</span>
                  <input
                    type="number"
                    value={params.gen2_operators_count}
                    onChange={(e) => setParams({ ...params, gen2_operators_count: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Horas operativas mensuales</span>
                  <input
                    type="number"
                    value={params.gen2_operating_hours}
                    onChange={(e) => setParams({ ...params, gen2_operating_hours: Number(e.target.value) })}
                    className="rounded bg-[#0c0f14] border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: QUALITY CONTROL */}
      {activeTab === 'quality' && (
        <div className="rounded-xl border border-slate-800 bg-[#141820] p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white">Control de Calidad (Laboratorio &amp; Hermeticidad)</h2>
            <p className="mt-1 text-xs text-slate-400">
              Inspectores dedicados a la planta. Se imputa únicamente el porcentaje dedicado a la línea de polipapel.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span>Inspectores de Calidad</span>
              <input
                type="number"
                value={params.quality_inspectors_count}
                onChange={(e) => setParams({ ...params, quality_inspectors_count: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span>Salario Mensual por Inspector (Gs.)</span>
              <input
                type="number"
                value={params.quality_monthly_salary_pyg}
                onChange={(e) => setParams({ ...params, quality_monthly_salary_pyg: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span>% Imputado a Polipapel (0 - 100%)</span>
              <input
                type="number"
                value={params.quality_polypaper_percent}
                onChange={(e) => setParams({ ...params, quality_polypaper_percent: Number(e.target.value) })}
                className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2 font-mono text-white"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-300 self-center mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={params.quality_labor_charges_included !== false}
                onChange={(e) => setParams({ ...params, quality_labor_charges_included: e.target.checked })}
                className="h-4 w-4 accent-brand-500 rounded"
              />
              <span>Incluir cargas laborales en calidad</span>
            </label>
          </div>
        </div>
      )}

      {/* SECTION: PACKING STOPWATCH SESSIONS */}
      {activeTab === 'packing' && (
        <div className="rounded-xl border border-slate-800 bg-[#141820] p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">Cronómetro de Empaque (Mano de Obra Medida)</h2>
              <p className="mt-1 text-xs text-slate-400">
                Sesiones reales con timestamps del servidor y cambios de dotación dinámicos. Solo las sesiones{' '}
                <strong className="text-emerald-400 font-semibold">APPROVED</strong> generan costo oficial.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-slate-800 bg-[#10141b] px-3 py-1.5 text-xs">
                <span className="text-slate-400">Total h-p aprobadas: </span>
                <span className="font-mono font-bold text-emerald-400">{approvedPersonHours.toFixed(2)} h-p</span>
              </div>
            </div>
          </div>

          {/* Quick session start bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-[#10141b] p-3.5 text-xs">
            <span className="font-semibold text-slate-300">Nueva sesión:</span>
            <input
              type="text"
              placeholder="Línea"
              value={newSessionLine}
              onChange={(e) => setNewSessionLine(e.target.value)}
              className="w-24 rounded bg-[#0c0f14] border border-slate-700 px-2 py-1 text-white"
            />
            <input
              type="text"
              placeholder="SKU"
              value={newSessionSku}
              onChange={(e) => setNewSessionSku(e.target.value)}
              className="w-28 rounded bg-[#0c0f14] border border-slate-700 px-2 py-1 font-mono text-white"
            />
            <input
              type="text"
              placeholder="OP"
              value={newSessionOp}
              onChange={(e) => setNewSessionOp(e.target.value)}
              className="w-24 rounded bg-[#0c0f14] border border-slate-700 px-2 py-1 font-mono text-white"
            />
            <label className="flex items-center gap-1.5 text-slate-400">
              <span>Dotación:</span>
              <input
                type="number"
                min="1"
                value={newSessionHeadcount}
                onChange={(e) => setNewSessionHeadcount(Number(e.target.value) || 1)}
                className="w-14 rounded bg-[#0c0f14] border border-slate-700 px-2 py-1 font-mono text-white"
              />
            </label>
            <Button
              onClick={handleStartSession}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1 ml-auto"
            >
              <Play className="h-3.5 w-3.5 mr-1 fill-current" />
              <span>Iniciar</span>
            </Button>
          </div>

          {/* Sessions table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3">Línea &amp; SKU</th>
                  <th className="py-2.5 px-3">OP</th>
                  <th className="py-2.5 px-3">Inicio</th>
                  <th className="py-2.5 px-3">Duración</th>
                  <th className="py-2.5 px-3">Horas-Persona</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/20">
                    <td className="py-2.5 px-3 font-bold text-white">{s.session_code || s.id.slice(0, 8)}</td>
                    <td className="py-2.5 px-3">
                      <div>{s.line_name || s.line_id}</div>
                      <div className="text-[10px] text-slate-500">{s.sku || 'Sin SKU'}</div>
                    </td>
                    <td className="py-2.5 px-3">{s.production_order || '—'}</td>
                    <td className="py-2.5 px-3 font-sans text-[11px] text-slate-400">
                      {new Date(s.started_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3">{s.total_duration_minutes || 0} min</td>
                    <td className="py-2.5 px-3 font-bold text-brand-300">
                      {(s.total_person_hours || 0).toFixed(2)} h-p
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <Badge
                        variant={
                          s.status === 'APPROVED'
                            ? 'success'
                            : s.status === 'RUNNING'
                            ? 'brand'
                            : s.status === 'STOPPED'
                            ? 'warning'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5 font-sans">
                      {s.status === 'RUNNING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const newHc = prompt('Nueva dotación de personal:', '3');
                              if (newHc) {
                                handleSessionAction('change_headcount', s.id, {
                                  new_headcount: Number(newHc),
                                  reason: 'Ajuste operativo',
                                });
                              }
                            }}
                            className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                          >
                            Dotación
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSessionAction('stop', s.id)}
                            className="rounded bg-red-950/80 border border-red-800/80 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900"
                          >
                            Detener
                          </button>
                        </>
                      )}
                      {s.status === 'STOPPED' && (
                        <button
                          type="button"
                          onClick={() => handleSessionAction('approve', s.id)}
                          className="rounded bg-emerald-950/80 border border-emerald-800/80 px-2 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-900"
                        >
                          Aprobar
                        </button>
                      )}
                      {(s.status === 'STOPPED' || s.status === 'APPROVED') && (
                        <button
                          type="button"
                          onClick={() => {
                            const newHours = prompt('Corregir horas-persona:', String(s.total_person_hours || 0));
                            if (newHours) {
                              handleSessionAction('correct', s.id, {
                                total_person_hours: Number(newHours),
                                notes: 'Ajuste manual administrativo',
                              });
                            }
                          }}
                          className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                        >
                          Corregir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500 font-sans">
                      No hay sesiones de empaque registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
