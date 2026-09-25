'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Factory, Plus, CheckCircle2, Globe, Mail, Phone, ExternalLink, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Supplier, SupplierStatus, MarketCode } from '@/types';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState<MarketCode>('BR');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [evidence, setEvidence] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/market/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApproveSupplier = async (id: string) => {
    try {
      const res = await fetch(`/api/market/suppliers/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        setFeedback('Proveedor aprobado humanamente para contacto por RFQ.');
        fetchSuppliers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSupplier = async () => {
    if (!name) return;

    try {
      const res = await fetch('/api/market/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          country_code: countryCode,
          city,
          website,
          email,
          discovery_evidence: evidence,
          status: 'REVIEWED',
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFeedback(`Fabricante ${name} agregado al maestro.`);
        fetchSuppliers();
        setName('');
        setWebsite('');
        setEmail('');
        setEvidence('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const columns: Column<Supplier>[] = [
    {
      key: 'country_code',
      header: 'País',
      render: (s) => (
        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
          {s.country_code}
        </span>
      ),
      className: 'w-16',
    },
    {
      key: 'name',
      header: 'Fabricante / Razón Social',
      render: (s) => (
        <div>
          <span className="font-semibold text-white text-xs">{s.name}</span>
          <span className="text-[11px] text-slate-500 block">{s.city || 'Ubicación regional'}</span>
        </div>
      ),
    },
    {
      key: 'website',
      header: 'Sitio Web / Contacto',
      render: (s) => (
        <div className="text-xs space-y-0.5">
          {s.website && (
            <a
              href={s.website}
              target="_blank"
              rel="noreferrer"
              className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
            >
              <Globe className="h-3 w-3" />
              <span className="truncate max-w-[160px]">{s.website.replace('https://', '')}</span>
            </a>
          )}
          {s.email && (
            <span className="text-slate-400 block font-mono text-[11px]">
              <Mail className="h-2.5 w-2.5 inline mr-1 text-slate-500" />
              {s.email}
            </span>
          )}
        </div>
      ),
      className: 'w-48',
    },
    {
      key: 'status',
      header: 'Estado de Contacto',
      render: (s) => {
        const variants: Record<SupplierStatus, 'neutral' | 'warning' | 'success' | 'brand' | 'danger'> = {
          DISCOVERED: 'neutral',
          REVIEWED: 'warning',
          APPROVED_FOR_CONTACT: 'success',
          CONTACTED: 'brand',
          RESPONDED: 'success',
          INVALID: 'danger',
        };
        return <Badge variant={variants[s.status] || 'neutral'}>{s.status}</Badge>;
      },
      className: 'w-36 text-center',
    },
    {
      key: 'discovery_source',
      header: 'Origen / Evidencia',
      render: (s) => (
        <span className="text-slate-400 text-xs line-clamp-1" title={s.discovery_evidence}>
          {s.discovery_evidence || s.discovery_source}
        </span>
      ),
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
            Maestro de Fabricantes y Proveedores
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Base de datos de competidores y proveedores regionales con protocolo de aprobación humana para contacto comercial.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/rfq/discovery">
            <Button variant="secondary" size="sm">
              Descubrir con OpenAI Search
            </Button>
          </Link>
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nuevo Proveedor
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Human Approval Reminder */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded flex items-center gap-3 text-xs text-slate-300">
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
        <span>
          <strong>Control de Contacto V1:</strong> Ningún correo de RFQ puede ser despachado a un proveedor sin que su estado sea previamente aprobado por un operador humano (<code>APPROVED_FOR_CONTACT</code>).
        </span>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={suppliers}
        searchKey="name"
        searchPlaceholder="Buscar por fabricante, ciudad o web..."
        exportFilename="suppliers_master.csv"
        emptyMessage="No hay fabricantes registrados en el maestro."
        actions={(row) => (
          <div className="flex items-center justify-end gap-1">
            {(row.status === 'DISCOVERED' || row.status === 'REVIEWED') && (
              <Button variant="outline" size="sm" onClick={() => handleApproveSupplier(row.id)}>
                <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
                Aprobar
              </Button>
            )}
          </div>
        )}
      />

      {/* Modal: Nuevo Proveedor */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar Fabricante al Maestro"
        description="Registra un fabricante regional para posterior benchmarking o envío de especificaciones RFQ."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateSupplier}>
              Guardar Fabricante
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Razón Social / Nombre Comercial</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Copobras S.A."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">País</label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value as MarketCode)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="BR">Brasil (BR)</option>
                <option value="AR">Argentina (AR)</option>
                <option value="BO">Bolivia (BO)</option>
                <option value="PY">Paraguay (PY)</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Ciudad / Estado</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ej. São Paulo, SP"
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Sitio Web</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Email Comercial</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ventas@empresa.com"
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Evidencia / Notas de Descubrimiento</label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
              placeholder="Ej. Catálogo de vasos polipapel 8 a 16 oz con capacidad de entrega en São Paulo..."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            ></textarea>
          </div>
        </div>
      </Modal>
    </div>
  );
}
