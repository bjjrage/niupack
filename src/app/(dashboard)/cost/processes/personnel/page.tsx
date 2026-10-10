'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, History, Pencil, Plus, RefreshCw, Save, Trash2, UserRoundPlus, Users, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  IndustrialSector,
  PlantPersonnel,
  PlantPersonnelAssignment,
  PlantSalaryBand,
  PlantSalaryBandRate,
  SectorPersonnelSummary,
} from '@/types';

const sectors: { id: IndustrialSector; label: string }[] = [
  { id: 'FORMADO', label: 'Formado' },
  { id: 'CALIDAD', label: 'Calidad' },
  { id: 'EMPAQUE', label: 'Empaque' },
];
const processLabel = (process?: IndustrialSector | null) => sectors.find((sector) => sector.id === process)?.label || 'Personal de planta';

const today = () => new Date().toISOString().slice(0, 10);
const money = (amount = 0) => `Gs. ${Math.round(amount).toLocaleString('es-PY')}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || data.error || 'No se pudo completar la operación.');
  return data as T;
}

export default function PersonnelPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [tab, setTab] = useState<'personnel' | 'bands'>('personnel');
  const [personnel, setPersonnel] = useState<PlantPersonnel[]>([]);
  const [assignments, setAssignments] = useState<PlantPersonnelAssignment[]>([]);
  const [bands, setBands] = useState<PlantSalaryBand[]>([]);
  const [summaries, setSummaries] = useState<Partial<Record<IndustrialSector, SectorPersonnelSummary>>>({});

  const [editingBandId, setEditingBandId] = useState<string | null>(null);
  const [bandName, setBandName] = useState('');
  const [bandDescription, setBandDescription] = useState('');
  const [bandSalary, setBandSalary] = useState('');
  const [bandValidFrom, setBandValidFrom] = useState(today());
  const [bandStatus, setBandStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [hireDate, setHireDate] = useState(today());
  const [personStatus, setPersonStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [initialBandId, setInitialBandId] = useState('');
  const [initialSector, setInitialSector] = useState<IndustrialSector | ''>('');
  const [assignmentPerson, setAssignmentPerson] = useState<PlantPersonnel | null>(null);
  const [assignmentSector, setAssignmentSector] = useState<IndustrialSector>('FORMADO');
  const [assignmentGeneration, setAssignmentGeneration] = useState<'GEN1' | 'GEN2'>('GEN1');
  const [assignmentPercent, setAssignmentPercent] = useState('100');
  const [assignmentFrom, setAssignmentFrom] = useState(today());
  const [assignmentLine, setAssignmentLine] = useState('');
  const [historyBand, setHistoryBand] = useState<PlantSalaryBand | null>(null);
  const [historyRates, setHistoryRates] = useState<PlantSalaryBandRate[]>([]);
  const [processContext, setProcessContext] = useState<IndustrialSector | null>(null);
  const [returnTo, setReturnTo] = useState('/cost/processes');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedProcess = query.get('process');
    if (requestedProcess && sectors.some((sector) => sector.id === requestedProcess)) {
      const selectedProcess = requestedProcess as IndustrialSector;
      setProcessContext(selectedProcess);
      setInitialSector(selectedProcess);
      setAssignmentSector(selectedProcess);
    }
    const requestedReturn = query.get('returnTo');
    if (requestedReturn?.startsWith('/cost/processes')) setReturnTo(requestedReturn);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bandData, personnelData, assignmentData, parameterData] = await Promise.all([
        api<{ bands: PlantSalaryBand[] }>('/api/cost/processes/salary-bands?active_only=false'),
        api<{ personnel: PlantPersonnel[] }>('/api/cost/processes/personnel?active_only=false'),
        api<{ assignments: PlantPersonnelAssignment[] }>('/api/cost/processes/personnel/assignments?active_only=false'),
        api<{ sectorPersonnelSummaries?: Partial<Record<IndustrialSector, SectorPersonnelSummary>> }>('/api/cost/processes/parameters'),
      ]);
      setBands(bandData.bands || []);
      setPersonnel(personnelData.personnel || []);
      setAssignments(assignmentData.assignments || []);
      setSummaries(parameterData.sectorPersonnelSummaries || {});
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Error al cargar personal y bandas.', error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const activeBands = useMemo(() => bands.filter((band) => band.status === 'ACTIVE'), [bands]);

  const resetBandForm = () => {
    setEditingBandId(null);
    setBandName('');
    setBandDescription('');
    setBandSalary('');
    setBandValidFrom(today());
    setBandStatus('ACTIVE');
  };

  const saveBand = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const currentBand = editingBandId ? bands.find((band) => band.id === editingBandId) : undefined;
      const salaryChanged = !currentBand || Number(bandSalary) !== currentBand.monthly_salary_pyg;
      const body = {
        name: bandName.trim(),
        description: bandDescription.trim(),
        status: bandStatus,
        monthly_salary_pyg: salaryChanged ? Number(bandSalary) : undefined,
        valid_from: salaryChanged ? bandValidFrom : undefined,
      };
      await api('/api/cost/processes/salary-bands', {
        method: editingBandId ? 'PUT' : 'POST',
        body: JSON.stringify(editingBandId ? { ...body, id: editingBandId } : body),
      });
      resetBandForm();
      setFeedback({ text: editingBandId ? 'Banda salarial actualizada.' : 'Banda salarial creada.' });
      await loadData();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'No se pudo guardar la banda.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const editBand = (band: PlantSalaryBand) => {
    setTab('bands');
    setEditingBandId(band.id);
    setBandName(band.name);
    setBandDescription(band.description || '');
    setBandSalary(String(band.monthly_salary_pyg || ''));
    setBandValidFrom(today());
    setBandStatus(band.status);
  };

  const openHistory = async (band: PlantSalaryBand) => {
    try {
      const data = await api<{ rates: PlantSalaryBandRate[] }>(`/api/cost/processes/salary-bands/${band.id}/history`);
      setHistoryBand(band);
      setHistoryRates(data.rates || []);
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'No se pudo cargar el historial.', error: true });
    }
  };

  const removeBand = async (band: PlantSalaryBand) => {
    if (!window.confirm(`¿Eliminar o desactivar ${band.name}?`)) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({ id: band.id });
      const data = await api<{ result?: { deactivated?: boolean } }>(`/api/cost/processes/salary-bands?${query}`, { method: 'DELETE' });
      setFeedback({ text: data.result?.deactivated ? 'La banda tiene asignaciones y se desactivó.' : 'Banda eliminada.' });
      await loadData();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'No se pudo eliminar la banda.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const resetPersonForm = () => {
    setEditingPersonId(null);
    setEmployeeCode('');
    setDisplayName('');
    setHireDate(today());
    setPersonStatus('ACTIVE');
    setInitialBandId('');
    setInitialSector(processContext || '');
    setBandValidFrom(today());
  };

  const savePerson = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingPersonId && personStatus === 'ACTIVE' && !initialBandId) {
      setFeedback({ text: 'Cada empleado activo debe tener una banda salarial vigente.', error: true });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const body = {
        employee_code: employeeCode.trim(),
        display_name: displayName.trim(),
        hire_date: hireDate,
        status: personStatus,
      };
      if (editingPersonId) {
        const currentPerson = personnel.find((person) => person.id === editingPersonId);
        const salaryChanged = Boolean(initialBandId && initialBandId !== currentPerson?.current_band_id);
        await api('/api/cost/processes/personnel', {
          method: 'PUT',
          body: JSON.stringify({
            ...body,
            id: editingPersonId,
            termination_date: personStatus === 'INACTIVE' ? today() : null,
            ...(salaryChanged ? { salary_band_id: initialBandId, salary_valid_from: bandValidFrom } : {}),
          }),
        });
      } else {
        const initialAssignment = personStatus === 'ACTIVE'
          ? { salary_band_id: initialBandId, sector: initialSector || undefined }
          : {};
        await api('/api/cost/processes/personnel', { method: 'POST', body: JSON.stringify({ ...body, ...initialAssignment }) });
      }
      resetPersonForm();
      setFeedback({ text: editingPersonId ? 'Empleado actualizado.' : 'Empleado creado.' });
      await loadData();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'No se pudo guardar el empleado.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const editPerson = (person: PlantPersonnel) => {
    setEditingPersonId(person.id);
    setEmployeeCode(person.employee_code);
    setDisplayName(person.display_name);
    setHireDate(person.hire_date);
    setPersonStatus(person.status);
    setInitialBandId(person.current_band_id || '');
    setInitialSector(person.primary_sector || processContext || '');
    setBandValidFrom(today());
  };

  const deactivatePerson = async (person: PlantPersonnel) => {
    if (!window.confirm(`¿Desactivar a ${person.display_name}?`)) return;
    setBusy(true);
    try {
      await api(`/api/cost/processes/personnel?id=${encodeURIComponent(person.id)}`, { method: 'DELETE' });
      setFeedback({ text: 'Empleado desactivado; sus asignaciones históricas se conservan.' });
      await loadData();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'No se pudo desactivar el empleado.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const openAssignments = (person: PlantPersonnel) => {
    setAssignmentPerson(person);
    setAssignmentSector(processContext || person.primary_sector || 'FORMADO');
    setAssignmentGeneration('GEN1');
    setAssignmentPercent('100');
    setAssignmentFrom(today());
    setAssignmentLine('');
  };

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!assignmentPerson) return;
    setBusy(true);
    try {
      await api('/api/cost/processes/personnel/assignments', {
        method: 'POST',
        body: JSON.stringify({
          personnel_id: assignmentPerson.id,
          sector: assignmentSector,
          ...(assignmentSector === 'FORMADO' ? { machine_generation: assignmentGeneration } : {}),
          allocation_percent: Number(assignmentPercent),
          valid_from: assignmentFrom,
          line_id: assignmentLine.trim() || undefined,
        }),
      });
      setFeedback({ text: 'Asignación operativa guardada.' });
      await loadData();
      setAssignmentPerson((current) => current ? personnel.find((person) => person.id === current.id) || current : null);
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'No se pudo guardar la asignación.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const removeAssignment = async (assignment: PlantPersonnelAssignment) => {
    if (!window.confirm('¿Eliminar esta asignación?')) return;
    setBusy(true);
    try {
      await api(`/api/cost/processes/personnel/assignments?id=${encodeURIComponent(assignment.id)}`, { method: 'DELETE' });
      setFeedback({ text: 'Asignación eliminada.' });
      await loadData();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'No se pudo eliminar la asignación.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const selectedAssignments = assignments.filter((assignment) => assignment.personnel_id === assignmentPerson?.id);
  const visiblePersonnel = processContext
    ? personnel.filter((person) => person.assignments?.some((assignment) => assignment.sector === processContext))
    : personnel;

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href={returnTo} className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a {processLabel(processContext)}
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
            <Users className="h-5 w-5 text-brand-400" /> PERSONAL Y BANDAS SALARIALES{processContext ? ` · ${processLabel(processContext).toUpperCase()}` : ''}
          </h1>
          <p className="mt-1 text-xs text-slate-400">Maestro de empleados, tarifas con vigencia y asignación a sectores industriales.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Recargar
        </Button>
      </header>

      {feedback && (
        <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-xs ${feedback.error ? 'border-rose-800 bg-rose-950/30 text-rose-200' : 'border-emerald-800 bg-emerald-950/30 text-emerald-200'}`}>
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      {processContext && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#12161f] p-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Resumen · {processLabel(processContext)}</div>
            <div className="mt-1 text-sm font-semibold text-white">{summaries[processContext]?.assigned_count || 0} personas asignadas</div>
          </div>
          <div className="font-mono text-sm text-emerald-300">{money(summaries[processContext]?.monthly_salary_base_pyg)} / mes por bandas vigentes</div>
        </section>
      )}

      <div className="flex gap-2 border-b border-slate-800">
        <button type="button" onClick={() => setTab('personnel')} className={`border-b-2 px-3 py-2 text-xs font-semibold ${tab === 'personnel' ? 'border-brand-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
          <Users className="mr-1.5 inline h-3.5 w-3.5" /> Personal ({visiblePersonnel.length})
        </button>
        <button type="button" onClick={() => setTab('bands')} className={`border-b-2 px-3 py-2 text-xs font-semibold ${tab === 'bands' ? 'border-brand-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
          <Wallet className="mr-1.5 inline h-3.5 w-3.5" /> Bandas salariales ({bands.length})
        </button>
      </div>

      {tab === 'bands' ? (
        <div className="space-y-4">
          <form onSubmit={saveBand} className="grid gap-3 rounded-xl border border-slate-800 bg-[#12161f] p-4 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] text-slate-400">Nombre</label>
              <input required value={bandName} onChange={(e) => setBandName(e.target.value)} className="field" placeholder="Operario calificado" />
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] text-slate-400">Descripción</label>
              <input value={bandDescription} onChange={(e) => setBandDescription(e.target.value)} className="field" placeholder="Opcional" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] text-slate-400">Salario mensual (Gs.)</label>
              <input required type="number" min="0" step="1" value={bandSalary} onChange={(e) => setBandSalary(e.target.value)} className="field font-mono" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] text-slate-400">Vigente desde</label>
              <input required type="date" value={bandValidFrom} onChange={(e) => setBandValidFrom(e.target.value)} className="field" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] text-slate-400">Estado</label>
              <select value={bandStatus} onChange={(e) => setBandStatus(e.target.value as 'ACTIVE' | 'INACTIVE')} className="field">
                <option value="ACTIVE">Activa</option><option value="INACTIVE">Inactiva</option>
              </select>
            </div>
            <div className="flex gap-2 md:col-span-12 md:justify-end">
              {editingBandId && <Button type="button" variant="outline" size="sm" onClick={resetBandForm}>Cancelar edición</Button>}
              <Button type="submit" variant="primary" size="sm" disabled={busy}><Save className="h-3.5 w-3.5" /> {editingBandId ? 'Guardar cambios' : 'Crear banda'}</Button>
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#12161f]">
            <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Bandas registradas</div>
            {bands.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">No hay bandas salariales.</div> : bands.map((band) => (
              <div key={band.id} className="flex flex-col gap-3 border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">{band.name}<Badge variant={band.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">{band.status === 'ACTIVE' ? 'ACTIVA' : 'INACTIVA'}</Badge></div>
                  <div className="mt-1 text-[11px] text-slate-500">{band.description || 'Sin descripción'} · desde {band.current_rate?.valid_from || 'sin tarifa'}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-2 font-mono text-sm font-semibold text-emerald-300">{money(band.monthly_salary_pyg)} / mes</span>
                  <Button variant="outline" size="sm" onClick={() => void openHistory(band)}><History className="h-3.5 w-3.5" /> Historial</Button>
                  <Button variant="outline" size="sm" onClick={() => editBand(band)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void removeBand(band)}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={savePerson} className="grid gap-3 rounded-xl border border-slate-800 bg-[#12161f] p-4 md:grid-cols-12">
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] text-slate-400">Código</label>
              <input required value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} className="field font-mono" placeholder="OP-008" />
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] text-slate-400">Nombre completo</label>
              <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="field" placeholder="Nombre y apellido" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] text-slate-400">Fecha de ingreso</label>
              <input required type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="field" />
            </div>
            {editingPersonId ? (
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] text-slate-400">Estado</label>
                <select value={personStatus} onChange={(e) => setPersonStatus(e.target.value as 'ACTIVE' | 'INACTIVE')} className="field"><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select>
              </div>
            ) : (
              <>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-400">Banda salarial vigente</label>
                  <select required={personStatus === 'ACTIVE'} value={initialBandId} onChange={(e) => setInitialBandId(e.target.value)} className="field"><option value="">Sin asignar</option>{activeBands.map((band) => <option key={band.id} value={band.id}>{band.name}</option>)}</select>
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-[11px] text-slate-400">Proceso inicial</label>
                  <select value={initialSector} onChange={(e) => setInitialSector(e.target.value as IndustrialSector | '')} className="field"><option value="">Sin asignar</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.label}</option>)}</select>
                </div>
              </>
            )}
            {editingPersonId && (
              <div className="md:col-span-3">
                <label className="mb-1 block text-[11px] text-slate-400">Banda salarial vigente de la persona</label>
                <select required={personStatus === 'ACTIVE'} value={initialBandId} onChange={(event) => setInitialBandId(event.target.value)} className="field">
                  <option value="">Sin banda</option>{activeBands.map((band) => <option key={band.id} value={band.id}>{band.name} · {money(band.monthly_salary_pyg)}</option>)}
                </select>
                <input type="date" value={bandValidFrom} onChange={(event) => setBandValidFrom(event.target.value)} className="field mt-1" aria-label="Vigente desde" />
              </div>
            )}            <div className="flex gap-2 md:col-span-12 md:justify-end">
              {editingPersonId && <Button type="button" variant="outline" size="sm" onClick={resetPersonForm}>Cancelar edición</Button>}
              <Button type="submit" variant="primary" size="sm" disabled={busy}><UserRoundPlus className="h-3.5 w-3.5" /> {editingPersonId ? 'Guardar empleado' : 'Agregar empleado'}</Button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#12161f]">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-[#0e1219] text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-3">Empleado</th><th className="px-4 py-3">Sector / banda</th><th className="px-4 py-3">Asignaciones</th><th className="px-4 py-3">Salario actual</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr>
              </thead>
              <tbody>
                {visiblePersonnel.map((person) => {
                  const personAssignments = assignments.filter((assignment) => assignment.personnel_id === person.id && (!assignment.valid_to || assignment.valid_to >= today()));
                  return (
                    <tr key={person.id} className="border-t border-slate-800/70">
                      <td className="px-4 py-3"><div className="font-mono font-semibold text-white">{person.employee_code}</div><div className="mt-1 text-slate-400">{person.display_name}</div><div className="mt-1 text-[10px] text-slate-600">Ingreso {person.hire_date}</div></td>
                      <td className="px-4 py-3"><div className="text-slate-200">{sectors.find((sector) => sector.id === person.primary_sector)?.label || 'Sin sector'}</div><div className="mt-1 text-slate-500">{person.current_band_name || 'Sin banda'}</div></td>
                      <td className="max-w-sm px-4 py-3"><div className="flex flex-wrap gap-1.5">{personAssignments.length ? personAssignments.map((assignment) => <span key={assignment.id} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">{processLabel(assignment.sector)}: {(assignment.machine_generation ? (assignment.machine_generation === 'GEN1' ? 'Gen. 1' : 'Gen. 2') : 'Proceso')} · {assignment.allocation_percent}%</span>) : <span className="text-slate-600">Sin asignación</span>}</div></td>
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-300">{money(person.current_salary_pyg)}</td>
                      <td className="px-4 py-3"><Badge variant={person.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">{person.status === 'ACTIVE' ? 'ACTIVO' : 'INACTIVO'}</Badge></td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={person.status !== 'ACTIVE'} onClick={() => openAssignments(person)}><Plus className="h-3.5 w-3.5" /> Asignar</Button><Button variant="outline" size="sm" onClick={() => editPerson(person)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>{person.status === 'ACTIVE' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void deactivatePerson(person)}>Desactivar</Button>}</div></td>
                    </tr>
                  );
                })}
                {!visiblePersonnel.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{loading ? 'Cargando personal…' : 'Todavía no hay empleados registrados.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {assignmentPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-[#12161f] p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div><h2 className="text-sm font-bold text-white">Asignaciones de {assignmentPerson.display_name}</h2><p className="mt-1 text-[11px] text-slate-500">La suma de asignaciones simultáneas por empleado no puede superar 100%.</p></div>
              <button type="button" onClick={() => setAssignmentPerson(null)} aria-label="Cerrar"><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <form onSubmit={saveAssignment} className="grid gap-3 rounded-lg border border-slate-800 bg-[#0e1219] p-3 sm:grid-cols-2">
              <label className="text-[11px] text-slate-400">Sector<select required value={assignmentSector} onChange={(e) => setAssignmentSector(e.target.value as IndustrialSector)} className="field mt-1">{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.label}</option>)}</select></label>
              {assignmentSector === 'FORMADO' && <label className="text-[11px] text-slate-400">Generación de máquina<select required value={assignmentGeneration} onChange={(event) => setAssignmentGeneration(event.target.value as 'GEN1' | 'GEN2')} className="field mt-1"><option value="GEN1">Gen. 1</option><option value="GEN2">Gen. 2</option></select></label>}
              <label className="text-[11px] text-slate-400">Porcentaje de dedicación<input required type="number" min="1" max="100" step="0.1" value={assignmentPercent} onChange={(e) => setAssignmentPercent(e.target.value)} className="field mt-1" /></label>
              <label className="text-[11px] text-slate-400">Vigente desde<input required type="date" value={assignmentFrom} onChange={(e) => setAssignmentFrom(e.target.value)} className="field mt-1" /></label>
              <label className="text-[11px] text-slate-400 sm:col-span-2">Línea de planta (opcional)<input value={assignmentLine} onChange={(e) => setAssignmentLine(e.target.value)} className="field mt-1" placeholder="Línea 1" /></label>
              <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" size="sm" disabled={busy || !assignmentPerson.current_band_id}><Plus className="h-3.5 w-3.5" /> Guardar asignación</Button></div>
            </form>
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Historial de asignaciones</h3>
              {selectedAssignments.length ? selectedAssignments.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0e1219] px-3 py-2 text-xs">
                  <div><div className="text-white">{processLabel(assignment.sector)} · {(assignment.machine_generation ? (assignment.machine_generation === 'GEN1' ? 'Gen. 1' : 'Gen. 2') : 'Proceso')} · {assignment.allocation_percent}%</div><div className="mt-1 text-[10px] text-slate-500">{assignment.valid_from} – {assignment.valid_to || 'actual'}</div></div>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void removeAssignment(assignment)}><Trash2 className="h-3.5 w-3.5" /> Quitar</Button>
                </div>
              )) : <div className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">Sin asignaciones anteriores.</div>}
            </div>
          </div>
        </div>
      )}

      {historyBand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-[#12161f] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3"><div><h2 className="text-sm font-bold text-white">Historial salarial · {historyBand.name}</h2><p className="mt-1 text-[11px] text-slate-500">Cada tarifa conserva su vigencia y valor original.</p></div><button type="button" onClick={() => setHistoryBand(null)} aria-label="Cerrar"><X className="h-4 w-4 text-slate-400" /></button></div>
            <div className="space-y-2">{historyRates.length ? historyRates.map((rate) => <div key={rate.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0e1219] px-3 py-2 text-xs"><div><div className="font-mono font-semibold text-white">{money(rate.monthly_salary_pyg)} / mes</div><div className="mt-1 text-slate-500">{rate.valid_from} – {rate.valid_to || 'actual'}</div></div><CalendarDays className="h-4 w-4 text-brand-400" /></div>) : <div className="p-6 text-center text-xs text-slate-500">No hay cambios de tarifa.</div>}</div>
            <div className="mt-4 flex justify-end"><Button variant="outline" size="sm" onClick={() => setHistoryBand(null)}>Cerrar</Button></div>
          </div>
        </div>
      )}

      <style jsx global>{`.field{width:100%;min-height:38px;border:1px solid rgb(51 65 85);border-radius:6px;background:#0c0f14;padding:0 10px;color:#f8fafc;font-size:12px;outline:none}.field:focus{border-color:rgb(129 140 248)}`}</style>
    </main>
  );
}
