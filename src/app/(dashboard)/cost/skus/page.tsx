'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, Plus, Layers, Calculator, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ProductAttribute, Product } from '@/types';

export default function SKUsPage() {
  const [skus, setSkus] = useState<ProductAttribute[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [skuCode, setSkuCode] = useState('');
  const [sizeOz, setSizeOz] = useState('12');
  const [sizeMl, setSizeMl] = useState('360');
  const [material, setMaterial] = useState('Cartulina Cupstock');
  const [paperWeight, setPaperWeight] = useState('260');
  const [coating, setCoating] = useState('1 PE');
  const [wallType, setWallType] = useState<'single' | 'double' | 'n/a'>('single');
  const [moq, setMoq] = useState('10000');
  const [compatibleLids, setCompatibleLids] = useState('LID-12OZ-PICO');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/cost/skus');
      if (res.ok) {
        const data = await res.json();
        setSkus(data.skus || []);
        setProducts(data.products || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSKU = async () => {
    if (!skuCode) return;

    try {
      const productId = products.find((p) => p.category === 'cups')?.id || products[0]?.id;
      const res = await fetch('/api/cost/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          sku: skuCode,
          size_oz: sizeOz,
          size_ml: sizeMl,
          material,
          paper_weight_gsm: paperWeight,
          coating,
          wall_type: wallType,
          moq,
          compatible_lids: compatibleLids,
          notes,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFeedback(`SKU ${skuCode} agregado exitosamente.`);
        fetchData();
        setSkuCode('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const columns: Column<ProductAttribute>[] = [
    {
      key: 'sku',
      header: 'Código SKU',
      render: (s) => (
        <div>
          <span className="font-mono text-xs font-bold text-brand-400">{s.sku}</span>
          <span className="text-[11px] text-slate-500 block">{s.notes || 'Especificación estándar'}</span>
        </div>
      ),
      className: 'w-36',
    },
    {
      key: 'size_oz',
      header: 'Capacidad',
      render: (s) => (
        <span className="font-mono text-xs text-white font-tabular">
          {s.size_oz ? `${s.size_oz} oz (${s.size_ml} ml)` : 'N/A'}
        </span>
      ),
      className: 'w-28',
    },
    {
      key: 'wall_type',
      header: 'Tipo de Pared',
      render: (s) => (
        <Badge variant={s.wall_type === 'double' ? 'brand' : 'neutral'} size="sm">
          {s.wall_type === 'double' ? 'Doble Pared Térmica' : 'Pared Simple'}
        </Badge>
      ),
      className: 'w-36 text-center',
    },
    {
      key: 'material',
      header: 'Material & Gramaje',
      render: (s) => (
        <span className="text-xs text-slate-300">
          {s.material} ({s.paper_weight_gsm} g/m²) · {s.coating}
        </span>
      ),
    },
    {
      key: 'carton_quantity',
      header: 'Packaging',
      render: (s) => (
        <span className="font-mono text-xs text-slate-400 font-tabular">
          {s.pack_quantity} u/paq · {s.carton_quantity} u/caja
        </span>
      ),
      className: 'w-36',
    },
    {
      key: 'moq',
      header: 'MOQ Mínimo',
      render: (s) => (
        <span className="font-mono text-xs font-bold text-slate-200 font-tabular">
          {s.moq.toLocaleString()} u
        </span>
      ),
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
            <span className="text-xs text-slate-400">Cost & Pricing Intelligence</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Maestro de Productos & SKUs
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Especificaciones técnicas, gramajes, recubrimientos y packaging del catálogo industrial de NIUPACK.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nuevo SKU
        </Button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={skus}
        searchKey="sku"
        searchPlaceholder="Buscar por código de SKU o material..."
        exportFilename="niupack_skus.csv"
        emptyMessage="No hay SKUs registrados."
        actions={(row) => (
          <Link href={`/cost/cost-sheets?sku=${row.sku}`}>
            <Button variant="outline" size="sm">
              <Calculator className="h-3.5 w-3.5 mr-1" /> Hoja de Costo
            </Button>
          </Link>
        )}
      />

      {/* Modal: Nuevo SKU */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Nuevo SKU en Catálogo"
        description="Parámetros técnicos de fabricación para vaso, pote, bandeja o termoformado."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateSKU}>
              Guardar SKU
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Código SKU</label>
              <input
                type="text"
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                placeholder="CUP-10OZ-SW"
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Capacidad (oz)</label>
              <input
                type="number"
                value={sizeOz}
                onChange={(e) => setSizeOz(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Capacidad (ml)</label>
              <input
                type="number"
                value={sizeMl}
                onChange={(e) => setSizeMl(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipo de Pared</label>
              <select
                value={wallType}
                onChange={(e) => setWallType(e.target.value as any)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="single">Pared Simple</option>
                <option value="double">Pared Doble (Aislante)</option>
                <option value="n/a">N/A (Bandejas/Termoformados)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Gramaje Cartulina (g/m²)</label>
              <input
                type="number"
                value={paperWeight}
                onChange={(e) => setPaperWeight(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Recubrimiento (Coating)</label>
              <input
                type="text"
                value={coating}
                onChange={(e) => setCoating(e.target.value)}
                placeholder="1 PE 18g / Biodegradable"
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Pedido Mínimo (MOQ)</label>
              <input
                type="number"
                value={moq}
                onChange={(e) => setMoq(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Notas Técnicas / Usos</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ej. Línea especial para café de especialidad y delivery térmico."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            ></textarea>
          </div>
        </div>
      </Modal>
    </div>
  );
}
