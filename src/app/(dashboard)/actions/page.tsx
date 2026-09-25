'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ActionItem, ActionType, MarketCode } from '@/types';

export default function ActionCenterPage() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Form fields
  const [title, setTitle] = useState('');
  const [actionType, setActionType] = useState<ActionType>('visibility_check');
  const [priority, setPriority] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [evidence, setEvidence] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [owner, setOwner] = useState('Comercial NIUPACK');
  const [marketCode, setMarketCode] = useState<MarketCode>('BR');
  const [sku, setSku] = useState('CUP-12OZ-SW');
  const [dueDate, setDueDate] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchActions();
  }, []);

  const fetchActions = async () => {
    try {
      const res = await fetch('/api/actions');
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: ActionItem['status']) => {
    try {
      const res = await fetch(`/api/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchActions();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAction = async () => {
    if (!title || !recommendedAction) return;

    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          action_type: actionType,
          priority,
          evidence,
          recommended_action: recommendedAction,
          owner,
          market_code: marketCode,
          sku,
          due_date: dueDate || undefined,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFeedback('Acción operativa registrada.');
        fetchActions();
        setTitle('');
        setEvidence('');
        setRecommendedAction('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredActions = actions.filter((a) => {
    if (priorityFilter !== 'ALL' && a.priority !== priorityFilter) return false;
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    return true;
  });

  const columns: Column<ActionItem>[] = [
    {
      key: 'priority',
      header: 'Prioridad',
      render: (a) => {
        const variants = {
          CRITICAL: 'danger',
          HIGH: 'warning',
          MEDIUM: 'neutral',
          LOW: 'neutral',
        } as const;
        return <Badge variant={variants[a.priority] || 'neutral'}>{a.priority}</Badge>;
      },
      className: 'w-24 text-center',
    },
    {
      key: 'title',
      header: 'Acción / Hallazgo',
      render: (a) => (
        <div>
          <span className="font-semibold text-white text-xs block">{a.title}</span>
          <span className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
            <strong>Acción:</strong> {a.recommended_action}
          </span>
        </div>
      ),
    },
    {
      key: 'market_code',
      header: 'Mercado / SKU',
      render: (a) => (
        <div className="font-mono text-[11px]">
          <span className="text-slate-300 font-semibold">{a.market_code || 'Global'}</span>
          {a.sku && <span className="text-slate-500 block">{a.sku}</span>}
        </div>
      ),
      className: 'w-28',
    },
    {
      key: 'owner',
      header: 'Responsable',
      render: (a) => (
        <span className="text-xs text-slate-300 truncate flex items-center gap-1">
          <User className="h-3 w-3 text-slate-500" />
          {a.owner}
        </span>
      ),
      className: 'w-36',
    },
    {
      key: 'due_date',
      header: 'Vencimiento',
      render: (a) => (
        <span className="font-mono text-[11px] text-slate-400">
          {a.due_date || 'Inmediato'}
        </span>
      ),
      className: 'w-24',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (a) => {
        const variants = {
          PENDING: 'warning',
          IN_PROGRESS: 'brand',
          COMPLETED: 'success',
          DISMISSED: 'neutral',
        } as const;
        return <Badge variant={variants[a.status] || 'neutral'}>{a.status}</Badge>;
      },
      className: 'w-28 text-center',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Centro de Operaciones</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Action Center</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Centro de Acciones Comerciales & Operativas
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Plan de trabajo interno derivado de hallazgos en visibilidad, brechas de precios, respuestas de RFQs y mermas industriales.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nueva Acción
        </Button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-slate-400 font-medium">Prioridad:</span>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-[#141820] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
          >
            <option value="ALL">Todas las prioridades</option>
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Media</option>
            <option value="LOW">Baja</option>
          </select>

          <span className="text-slate-400 font-medium ml-2">Estado:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#141820] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
          >
            <option value="ALL">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="IN_PROGRESS">En Progreso</option>
            <option value="COMPLETED">Completada</option>
          </select>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          Mostrando <strong className="text-white">{filteredActions.length}</strong> de {actions.length} acciones
        </span>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredActions}
        searchKey="title"
        searchPlaceholder="Buscar acción o responsable..."
        exportFilename="actions_center.csv"
        emptyMessage="No hay acciones con los filtros seleccionados."
        actions={(row) => (
          <div className="flex items-center justify-end gap-1">
            {row.status === 'PENDING' && (
              <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(row.id, 'IN_PROGRESS')}>
                Iniciar
              </Button>
            )}
            {row.status === 'IN_PROGRESS' && (
              <Button variant="secondary" size="sm" onClick={() => handleUpdateStatus(row.id, 'COMPLETED')}>
                <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" /> Completar
              </Button>
            )}
          </div>
        )}
      />

      {/* Modal: Nueva Acción */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Nueva Acción Interna"
        description="Asigna una tarea comercial, de visibilidad o de planta derivada de datos del OS."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateAction}>
              Guardar Acción
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Título de la Acción</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Negociar precio de cartulina virgen con proveedor CMPC"
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipo de Acción</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="visibility_check">Chequeo de Visibilidad</option>
                <option value="query_battery_update">Actualizar Batería de Consultas</option>
                <option value="supplier_research">Investigación de Proveedores</option>
                <option value="rfq_followup">Seguimiento de RFQ</option>
                <option value="cost_data_missing">Cargar Datos de Costo Faltantes</option>
                <option value="efficiency_review">Revisión de Eficiencia en Planta</option>
                <option value="pricing_review">Revisión de Precios Comerciales</option>
                <option value="market_gap_review">Revisión de Brecha de Mercado</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="CRITICAL">Crítica</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Media</option>
                <option value="LOW">Baja</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Evidencia / Justificación con Datos</label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
              placeholder="Ej. El precio del papel representa el 52% del costo y la brecha en Brasil es +8.6%..."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            ></textarea>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Acción Concreta Recomendada</label>
            <textarea
              value={recommendedAction}
              onChange={(e) => setRecommendedAction(e.target.value)}
              rows={2}
              placeholder="Ej. Solicitar reunión comercial para contrato trimestral de 600 toneladas con descuento 4%..."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            ></textarea>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Responsable / Dueño</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Fecha de Vencimiento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
