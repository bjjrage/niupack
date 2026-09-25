'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Plus, Send, CheckCircle2, ShieldCheck, Mail, ArrowRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { RFQ, RFQStatus, Supplier } from '@/types';

export default function RFQsPage() {
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  // Form fields
  const [code, setCode] = useState('RFQ-2026-001');
  const [title, setTitle] = useState('Cotización Vaso 12 oz Pared Simple Mercosul');
  const [sku, setSku] = useState('CUP-12OZ-SW');
  const [quantity, setQuantity] = useState('300000');
  const [destination, setDestination] = useState('São Paulo, Brasil');
  const [incoterm, setIncoterm] = useState<'EXW' | 'FOB' | 'CIF' | 'CIP' | 'DDP'>('FOB');
  const [material, setMaterial] = useState('Cartulina Cupstock Virgen 260g');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [resRfq, resSupp] = await Promise.all([
        fetch('/api/rfq/rfqs'),
        fetch('/api/market/suppliers'),
      ]);
      if (resRfq.ok) {
        const data = await resRfq.json();
        setRfqs(data.rfqs || []);
      }
      if (resSupp.ok) {
        const data = await resSupp.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateRFQ = async () => {
    try {
      const res = await fetch('/api/rfq/rfqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          title,
          sku,
          quantity,
          delivery_destination: destination,
          incoterm,
          material,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFeedback(`Especificación técnica ${code} creada exitosamente.`);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDispatch = async () => {
    if (!selectedRFQ || selectedSuppliers.length === 0) return;

    // Transition status to SENT
    try {
      const res = await fetch(`/api/rfq/rfqs/${selectedRFQ.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierIds: selectedSuppliers }),
      });

      if (res.ok) {
        setIsDispatchModalOpen(false);
        setFeedback(`RFQ ${selectedRFQ.code} despachado a ${selectedSuppliers.length} proveedores aprobados.`);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const approvedSuppliers = suppliers.filter((s) => s.status === 'APPROVED_FOR_CONTACT' || s.status === 'REVIEWED');

  const columns: Column<RFQ>[] = [
    {
      key: 'code',
      header: 'Código RFQ',
      render: (r) => (
        <div>
          <span className="font-mono text-xs font-bold text-brand-400">{r.code}</span>
          <span className="text-[11px] text-slate-400 block font-sans">{r.title}</span>
        </div>
      ),
      className: 'w-48',
    },
    {
      key: 'status',
      header: 'Estado RFQ',
      render: (r) => {
        const variants: Record<RFQStatus, 'neutral' | 'warning' | 'success' | 'brand' | 'danger'> = {
          DRAFT: 'neutral',
          REVIEW_REQUIRED: 'warning',
          APPROVED: 'brand',
          SENT: 'brand',
          REPLIED: 'success',
          PARSED: 'success',
          BENCHMARKED: 'success',
          CANCELLED: 'danger',
        };
        return <Badge variant={variants[r.status] || 'neutral'}>{r.status}</Badge>;
      },
      className: 'w-32 text-center',
    },
    {
      key: 'delivery_destination',
      header: 'Destino & Incoterm',
      render: (r) => (
        <span className="text-xs text-slate-300">
          {r.delivery_destination} ({r.incoterm})
        </span>
      ),
      className: 'w-40',
    },
    {
      key: 'items',
      header: 'Ítems & Cantidad Base',
      render: (r) => (
        <div className="font-mono text-xs">
          <span className="text-white font-medium">{r.items?.[0]?.sku || 'CUP-12OZ-SW'}</span>
          <span className="text-slate-400 block text-[11px]">
            {r.items?.[0]?.quantity?.toLocaleString() || '300,000'} u
          </span>
        </div>
      ),
      className: 'w-36',
    },
    {
      key: 'created_at',
      header: 'Fecha',
      render: (r) => <span className="font-mono text-[11px] text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString('es') : 'Hoy'}</span>,
      className: 'w-24',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 4</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">RFQ Intelligence</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Especificaciones Técnicas RFQ (Multi-Proveedor)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Generación y broadcast de pliegos técnicos homogéneos para cotización formal en Brasil, Argentina y Bolivia.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nueva Especificación RFQ
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
        data={rfqs}
        searchKey="code"
        searchPlaceholder="Buscar por código o título..."
        exportFilename="rfqs_list.csv"
        emptyMessage="No hay especificaciones RFQ activas. Crea una nueva especificación para comenzar."
        actions={(row) => (
          <div className="flex items-center justify-end gap-1">
            {row.status === 'DRAFT' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedRFQ(row);
                  setIsDispatchModalOpen(true);
                }}
              >
                <Send className="h-3 w-3 mr-1" /> Despachar
              </Button>
            )}
          </div>
        )}
      />

      {/* Modal: Nueva Especificación RFQ */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Especificación Técnica Comparable (RFQ)"
        description="Esta misma especificación podrá enviarse de manera estandarizada a múltiples proveedores."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateRFQ}>
              Crear RFQ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Código de RFQ</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">SKU Homogéneo</label>
              <select
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              >
                <option value="CUP-12OZ-SW">CUP-12OZ-SW (12 oz Pared Simple)</option>
                <option value="CUP-8OZ-SW">CUP-8OZ-SW (8 oz)</option>
                <option value="CUP-16OZ-SW">CUP-16OZ-SW (16 oz)</option>
                <option value="CUP-12OZ-DW">CUP-12OZ-DW (12 oz Doble Pared)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Título de la Especificación</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Cantidad Base</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Incoterm Requerido</label>
              <select
                value={incoterm}
                onChange={(e) => setIncoterm(e.target.value as any)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              >
                <option value="FOB">FOB (Puerto / Ciudad origen)</option>
                <option value="EXW">EXW (En fábrica)</option>
                <option value="CIF">CIF (Costo y flete)</option>
                <option value="DDP">DDP (Entregado con aranceles)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Destino de Entrega</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Ej. São Paulo, Brasil"
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            />
          </div>
        </div>
      </Modal>

      {/* Modal: Despachar a Proveedores Aprobados */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title={`Despachar ${selectedRFQ?.code} a Proveedores`}
        description="Selecciona los fabricantes aprobados que recibirán la solicitud de cotización por correo corporativo."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsDispatchModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleDispatch}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Autorizar y Despachar ({selectedSuppliers.length})
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded text-xs text-amber-300 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              <strong>Aprobación Humana Obligatoria:</strong> Al confirmar, se generarán los borradores y se autorizará el primer envío desde el Gmail corporativo conectado.
            </span>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-medium text-slate-400 block">Proveedores Disponibles:</span>
            {approvedSuppliers.map((s) => {
              const isChecked = selectedSuppliers.includes(s.id);
              return (
                <label
                  key={s.id}
                  className="flex items-center justify-between p-2.5 rounded bg-[#0c0f14] border border-slate-800 hover:border-slate-700 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setSelectedSuppliers(selectedSuppliers.filter((id) => id !== s.id));
                        } else {
                          setSelectedSuppliers([...selectedSuppliers, s.id]);
                        }
                      }}
                      className="accent-brand-500 rounded"
                    />
                    <div>
                      <span className="font-semibold text-white text-xs block">{s.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {s.country_code} · {s.email || 'Sin correo directo'}
                      </span>
                    </div>
                  </div>
                  <Badge variant="neutral" size="sm">{s.status}</Badge>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
