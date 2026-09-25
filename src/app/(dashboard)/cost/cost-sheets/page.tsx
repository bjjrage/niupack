'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calculator,
  Plus,
  DollarSign,
  TrendingDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { CostSheetVersion, CostComponent, CostCategory } from '@/types';
import { TrueCostEngine } from '@/lib/engines/true-cost-engine';

export default function CostSheetsPage() {
  const [sheet, setSheet] = useState<CostSheetVersion | null>(null);
  const [selectedSKU, setSelectedSKU] = useState('CUP-12OZ-SW');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form fields
  const [category, setCategory] = useState<CostCategory>('papel');
  const [name, setName] = useState('');
  const [rateUSD, setRateUSD] = useState('');
  const [componentType, setComponentType] = useState<'VARIABLE' | 'FIXED'>('VARIABLE');
  const [basis, setBasis] = useState<'PER_UNIT' | 'PER_BATCH'>('PER_UNIT');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchSheet(selectedSKU);
  }, [selectedSKU]);

  const fetchSheet = async (sku: string) => {
    try {
      const res = await fetch(`/api/cost/sheets?sku=${sku}`);
      if (res.ok) {
        const data = await res.json();
        setSheet(data.sheet || null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddComponent = async () => {
    if (!name || !rateUSD) return;

    try {
      const res = await fetch('/api/cost/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedSKU,
          category,
          name,
          component_type: componentType,
          basis,
          rate_usd: rateUSD,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFeedback(`Componente ${name} agregado y costo unitario recalculado.`);
        fetchSheet(selectedSKU);
        setName('');
        setRateUSD('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const breakdown = sheet && sheet.components
    ? TrueCostEngine.calculateCostSheet(sheet.components, sheet.batch_size)
    : null;

  const categoriesList: CostCategory[] = [
    'materia_prima', 'papel', 'coating', 'tintas', 'impresion', 'formado',
    'mano_de_obra', 'maquina', 'energia', 'merma', 'empaque', 'almacenamiento',
    'flete_inbound', 'flete_outbound', 'aduana', 'impuestos', 'financiero',
    'comercial', 'overhead', 'setup', 'herramental', 'otros'
  ];

  const columns: Column<CostComponent>[] = [
    {
      key: 'category',
      header: 'Categoría (22+)',
      render: (c) => (
        <Badge variant="neutral" size="sm">
          {c.category}
        </Badge>
      ),
      className: 'w-36',
    },
    {
      key: 'name',
      header: 'Descripción del Componente',
      render: (c) => (
        <div>
          <span className="font-semibold text-white text-xs">{c.name}</span>
          <span className="text-[11px] text-slate-500 block">{c.notes || `${c.component_type} · ${c.basis}`}</span>
        </div>
      ),
    },
    {
      key: 'component_type',
      header: 'Tipo',
      render: (c) => (
        <span className="font-mono text-xs text-slate-400">
          {c.component_type}
        </span>
      ),
      className: 'w-24 text-center',
    },
    {
      key: 'rate_usd',
      header: 'Tasa USD',
      render: (c) => (
        <span className="font-mono text-xs font-semibold text-slate-200 font-tabular">
          ${Number(c.rate_usd).toFixed(5)}
        </span>
      ),
      align: 'right',
      className: 'w-28',
    },
    {
      key: 'share',
      header: '% del Costo',
      render: (c) => {
        const total = sheet?.true_unit_cost_usd || 0.0468;
        const pct = total > 0 ? Number(((c.rate_usd / total) * 100).toFixed(1)) : 0;
        return (
          <span className="font-mono text-xs text-slate-400 font-tabular">
            {pct}%
          </span>
        );
      },
      align: 'right',
      className: 'w-24',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 3</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Cost & Pricing</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Hojas de Costo Industrial Real (True Cost)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Estructura industrial completa con soporte para 22+ componentes de costo, costos fijos/variables y punto de equilibrio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/cost/scenarios">
            <Button variant="secondary" size="sm">
              Simulador de Escenarios
            </Button>
          </Link>
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar Componente
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* SKU Selector & Header Card */}
      <div className="bg-[#141820] border border-slate-800 rounded p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-400">SKU Seleccionado:</span>
          <select
            value={selectedSKU}
            onChange={(e) => setSelectedSKU(e.target.value)}
            className="bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono font-semibold"
          >
            <option value="CUP-12OZ-SW">CUP-12OZ-SW (Vaso 12 oz Pared Simple)</option>
            <option value="CUP-8OZ-SW">CUP-8OZ-SW (Vaso 8 oz Pared Simple)</option>
            <option value="CUP-16OZ-SW">CUP-16OZ-SW (Vaso 16 oz Pared Simple)</option>
            <option value="CUP-12OZ-DW">CUP-12OZ-DW (Vaso 12 oz Doble Pared)</option>
          </select>
          <Badge variant="brand">Versión {sheet?.version || 1} Activa</Badge>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Tamaño de Lote Base: <strong className="text-white">{sheet?.batch_size?.toLocaleString()} unidades</strong>
        </div>
      </div>

      {/* True Cost KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Costo Unitario Real (True Cost)</span>
          <span className="text-2xl font-bold text-white font-mono font-tabular mt-1 block">
            ${sheet?.true_unit_cost_usd?.toFixed(5) || '0.04680'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">USD / unidad en planta</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Precio Mínimo Sostenible</span>
          <span className="text-2xl font-bold text-amber-400 font-mono font-tabular mt-1 block">
            ${sheet?.minimum_sustainable_price_usd?.toFixed(5) || '0.05148'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">+10% margen de seguridad</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Punto de Equilibrio (Break-Even)</span>
          <span className="text-2xl font-bold text-slate-200 font-mono font-tabular mt-1 block">
            {sheet?.break_even_units?.toLocaleString() || '82,000'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">unidades / lote</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Costo Total del Lote</span>
          <span className="text-2xl font-bold text-slate-200 font-mono font-tabular mt-1 block">
            ${breakdown?.batchTotalCostUSD?.toLocaleString() || '14,040.00'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">Lote de {sheet?.batch_size?.toLocaleString()} u</span>
        </div>
      </div>

      {/* Volume Cost Curve */}
      {breakdown && breakdown.volumeCurve && (
        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-semibold text-white tracking-tight">Curva de Costo Unitario por Escala de Fabricación</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Dilución de costos fijos, setups y calibraciones a mayor volumen de producción.</p>
            </div>
            <Badge variant="neutral">Curva de Absorción</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center font-mono">
            {breakdown.volumeCurve.map((vc) => (
              <div key={vc.quantity} className="p-2.5 rounded bg-[#10141b] border border-slate-800">
                <span className="text-[11px] text-slate-400 block font-semibold">{(vc.quantity / 1000).toFixed(0)}k u</span>
                <span className="text-sm font-bold text-emerald-400 font-tabular mt-1 block">
                  ${vc.unitCostUSD.toFixed(4)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">${vc.batchCostUSD.toLocaleString()} tot</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost Components Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-white tracking-tight">
          Desglose de Componentes de Costo ({sheet?.components?.length || 0} componentes)
        </h3>
        <DataTable
          columns={columns}
          data={sheet?.components || []}
          searchKey="name"
          searchPlaceholder="Buscar componente..."
          exportFilename={`cost_sheet_${selectedSKU}.csv`}
          emptyMessage="No hay componentes cargados en esta hoja de costo."
        />
      </div>

      {/* Modal: Agregar Componente */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar Componente de Costo Industrial"
        description="Agrega un factor de costo directo o indirecto. El sistema recalculará el true cost y el punto de equilibrio automáticamente."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddComponent}>
              Agregar Componente
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Categoría Industrial</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CostCategory)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            >
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Nombre / Concepto</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Cartulina Cupstock Virgen 260g"
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Tasa USD</label>
              <input
                type="number"
                step="any"
                value={rateUSD}
                onChange={(e) => setRateUSD(e.target.value)}
                placeholder="0.02450"
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipo</label>
              <select
                value={componentType}
                onChange={(e) => setComponentType(e.target.value as any)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="VARIABLE">Variable</option>
                <option value="FIXED">Fijo</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Base</label>
              <select
                value={basis}
                onChange={(e) => setBasis(e.target.value as any)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="PER_UNIT">Por Unidad</option>
                <option value="PER_BATCH">Por Lote</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
