'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Filter, ShieldCheck, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { MarketPriceObservation, PriceSourceType, MarketCode } from '@/types';

export default function MarketPricesPage() {
  const [prices, setPrices] = useState<MarketPriceObservation[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [skuFilter, setSkuFilter] = useState('ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');

  // Form fields
  const [countryCode, setCountryCode] = useState<MarketCode>('BR');
  const [supplierName, setSupplierName] = useState('');
  const [sku, setSku] = useState('CUP-12OZ-SW');
  const [quantity, setQuantity] = useState('300000');
  const [moq, setMoq] = useState('50000');
  const [originalPrice, setOriginalPrice] = useState('');
  const [originalCurrency, setOriginalCurrency] = useState('BRL');
  const [sourceType, setSourceType] = useState<PriceSourceType>('FORMAL_QUOTE');
  const [incoterm, setIncoterm] = useState('FOB');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    try {
      const res = await fetch('/api/market/prices');
      if (res.ok) {
        const data = await res.json();
        setPrices(data.prices || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreatePrice = async () => {
    if (!originalPrice || !supplierName) {
      alert('Por favor ingrese proveedor y precio original');
      return;
    }

    try {
      const res = await fetch('/api/market/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country_code: countryCode,
          supplier_name: supplierName,
          sku,
          quantity,
          moq,
          original_price: originalPrice,
          original_currency: originalCurrency,
          source_type: sourceType,
          incoterm,
          notes,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFeedback('Observación de precio registrada y normalizada a USD.');
        fetchPrices();
        // Reset form
        setSupplierName('');
        setOriginalPrice('');
        setNotes('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredPrices = prices.filter((p) => {
    if (skuFilter !== 'ALL' && p.sku !== skuFilter) return false;
    if (countryFilter !== 'ALL' && p.country_code !== countryFilter) return false;
    return true;
  });

  const columns: Column<MarketPriceObservation>[] = [
    {
      key: 'country_code',
      header: 'País',
      render: (p) => (
        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
          {p.country_code}
        </span>
      ),
      className: 'w-16',
    },
    {
      key: 'supplier_name',
      header: 'Proveedor / Fabricante',
      render: (p) => (
        <div>
          <span className="font-semibold text-white text-xs">{p.supplier_name || 'Anónimo / Mercado'}</span>
          <span className="text-[11px] text-slate-500 font-mono block">Incoterm: {p.incoterm || 'FOB'}</span>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU Observado',
      render: (p) => <span className="font-mono text-xs text-brand-300 font-medium">{p.sku}</span>,
      className: 'w-28',
    },
    {
      key: 'quantity',
      header: 'Volumen',
      render: (p) => (
        <span className="font-mono text-xs text-slate-300 font-tabular">
          {p.quantity.toLocaleString()} u
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'original_price',
      header: 'Precio Original',
      render: (p) => (
        <span className="font-mono text-xs text-slate-400 font-tabular">
          {p.original_currency} {p.original_price.toLocaleString()}
        </span>
      ),
      align: 'right',
      className: 'w-28',
    },
    {
      key: 'normalized_unit_price_usd',
      header: 'Precio Unitario USD',
      render: (p) => (
        <span className="font-mono text-xs font-bold text-emerald-400 font-tabular">
          ${Number(p.normalized_unit_price_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-32',
    },
    {
      key: 'confidence_level',
      header: 'Confianza',
      render: (p) => {
        const pct = Math.round(p.confidence_level * 100);
        return (
          <Badge variant={pct >= 85 ? 'success' : pct >= 70 ? 'neutral' : 'warning'} size="sm">
            {pct}% ({p.source_type})
          </Badge>
        );
      },
      className: 'w-36 text-center',
    },
    {
      key: 'observation_date',
      header: 'Fecha',
      render: (p) => <span className="text-slate-400 font-mono text-[11px]">{p.observation_date}</span>,
      className: 'w-24',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 2</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Market Intelligence</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Observaciones de Precios Regionales
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro auditable de precios observados en Brasil, Argentina y Bolivia con normalización monetaria y ponderación por confianza.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Registrar Precio
        </Button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-slate-400 font-medium">SKU:</span>
          <select
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            className="bg-[#141820] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
          >
            <option value="ALL">Todos los SKUs</option>
            <option value="CUP-12OZ-SW">CUP-12OZ-SW (12 oz)</option>
            <option value="CUP-8OZ-SW">CUP-8OZ-SW (8 oz)</option>
            <option value="CUP-16OZ-SW">CUP-16OZ-SW (16 oz)</option>
            <option value="CUP-12OZ-DW">CUP-12OZ-DW (Doble pared)</option>
          </select>

          <span className="text-slate-400 font-medium ml-2">País:</span>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="bg-[#141820] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
          >
            <option value="ALL">Todos los países</option>
            <option value="BR">BR (Brasil)</option>
            <option value="AR">AR (Argentina)</option>
            <option value="BO">BO (Bolivia)</option>
            <option value="PY">PY (Paraguay)</option>
          </select>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          Mostrando <strong className="text-white">{filteredPrices.length}</strong> de {prices.length} observaciones
        </span>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredPrices}
        searchKey="supplier_name"
        searchPlaceholder="Buscar por proveedor o notas..."
        exportFilename="market_prices.csv"
        emptyMessage="No hay observaciones de precios registradas con estos filtros."
      />

      {/* Modal: Registrar Precio */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Registrar Observación de Precio en Mercado"
        description="El sistema normalizará automáticamente el precio original a USD/unidad según la tasa de cambio y asignará nivel de confianza según la fuente."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreatePrice}>
              Guardar Observación
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">País</label>
              <select
                value={countryCode}
                onChange={(e) => {
                  const c = e.target.value as MarketCode;
                  setCountryCode(c);
                  if (c === 'BR') setOriginalCurrency('BRL');
                  else if (c === 'AR') setOriginalCurrency('ARS');
                  else if (c === 'BO') setOriginalCurrency('BOB');
                  else setOriginalCurrency('USD');
                }}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="BR">Brasil (BR)</option>
                <option value="AR">Argentina (AR)</option>
                <option value="BO">Bolivia (BO)</option>
                <option value="PY">Paraguay (PY)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">SKU</label>
              <select
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              >
                <option value="CUP-12OZ-SW">CUP-12OZ-SW (12 oz Pared Simple)</option>
                <option value="CUP-8OZ-SW">CUP-8OZ-SW (8 oz Pared Simple)</option>
                <option value="CUP-16OZ-SW">CUP-16OZ-SW (16 oz Pared Simple)</option>
                <option value="CUP-12OZ-DW">CUP-12OZ-DW (12 oz Doble Pared)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Proveedor / Fabricante</label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Ej. Copobras, Altacoppo, Pack Solutions..."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Volumen / Cantidad Total</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Precio Total Original</label>
              <input
                type="number"
                step="any"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Ej. 14850"
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Moneda Original</label>
              <select
                value={originalCurrency}
                onChange={(e) => setOriginalCurrency(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              >
                <option value="BRL">BRL (Real brasileño)</option>
                <option value="ARS">ARS (Peso argentino)</option>
                <option value="BOB">BOB (Boliviano)</option>
                <option value="USD">USD (Dólar estadounidense)</option>
                <option value="PYG">PYG (Guaraní)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipo de Fuente</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as PriceSourceType)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="FORMAL_QUOTE">Cotización Formal de Fabricante (Muy Alta 95%)</option>
                <option value="DIRECT_EMAIL">Email Directo de Proveedor (Alta 85%)</option>
                <option value="SUPPLIER_CATALOG">Catálogo / Web del Fabricante (Media-Alta 70%)</option>
                <option value="B2B_MARKETPLACE">Marketplace B2B (Media 50%)</option>
                <option value="RETAIL">Retail / Consumo Minorista (Baja 20%)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Incoterm</label>
              <select
                value={incoterm}
                onChange={(e) => setIncoterm(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              >
                <option value="FOB">FOB</option>
                <option value="EXW">EXW</option>
                <option value="CIF">CIF</option>
                <option value="DDP">DDP</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Notas / Condiciones Comerciales</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ej. Incluye clisés y cajas corrugadas. Plazo 25 días."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            ></textarea>
          </div>
        </div>
      </Modal>
    </div>
  );
}
