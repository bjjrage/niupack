'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, FileSearch, Link2, Radar, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

interface Reason { code: string; points: number; text: string }
interface Candidate {
  id: string; display_name: string; ruc: string | null; potential: 'ALTO' | 'MEDIO' | 'BAJO' | 'NO_EVALUADO'; score: number;
  reasons: Reason[]; roles: Array<{ role: string; confirmed: boolean }>; tender_ids: string[]; products: string[];
  review_status: 'PENDIENTE' | 'APROBADA' | 'DESCARTADA' | 'CONVERTIDA'; review_note: string | null;
  crm_company_id: string | null; crm_opportunity_id: string | null;
}
interface Tender { id: string; source: string; external_id: string; source_url: string | null; title: string; convening_entity: string | null; status: string | null; is_test_data: boolean; created_at: string }
interface TenderDetail {
  tender: Tender & { raw_document?: { unconfirmed?: string[]; documents?: Array<{ title: string; url?: string }> } };
  items: Array<{ id: string; line_no: number; description: string; quantity: number | null; unit: string | null; presentation: string | null; is_injectable: boolean; injectable_evidence: string | null }>;
  parties: Array<{ id: string; role: string; name: string; ruc: string | null; role_confirmed: boolean; evidence: string; evidence_url: string | null }>;
}
interface SearchHit { ocid: string; title: string; status?: string; entity?: string; suppliers: Array<{ name: string; ruc?: string }> }

const POTENTIAL_VARIANT = { ALTO: 'success', MEDIO: 'warning', BAJO: 'neutral', NO_EVALUADO: 'neutral' } as const;
const STATUS_LABEL: Record<Candidate['review_status'], string> = { PENDIENTE: 'Pendiente de revisión', APROBADA: 'Aprobada', DESCARTADA: 'Descartada', CONVERTIDA: 'En prospectos' };

const emptyManual = { title: '', external_id: '', source_url: '', convening_entity: '', is_test_data: false, item_description: '', item_quantity: '', party_role: 'OFERENTE', party_name: '', party_ruc: '', party_evidence: '' };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; message?: string } }> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export default function LicitacionesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'candidatas' | 'licitaciones'>('candidatas');
  const [filter, setFilter] = useState<'ALL' | Candidate['review_status']>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [importMode, setImportMode] = useState<'dncp' | 'search' | 'document' | 'manual'>('dncp');
  const [identifier, setIdentifier] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [documentText, setDocumentText] = useState('');
  const [documentIsTest, setDocumentIsTest] = useState(false);
  const [manual, setManual] = useState(emptyManual);

  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const [convertTarget, setConvertTarget] = useState<Candidate | null>(null);
  const [createOpportunity, setCreateOpportunity] = useState(true);
  const [ambiguous, setAmbiguous] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ tenders: Tender[]; candidates: Candidate[] }>('/api/licitaciones');
    if (!result.ok) {
      setLoadError(result.data.message || result.data.error || `Error ${result.status}`);
    } else {
      setLoadError(null);
      setCandidates(result.data.candidates);
      setTenders(result.data.tenders);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => candidates.filter((c) => filter === 'ALL' || c.review_status === filter), [candidates, filter]);

  const runImport = async (body: unknown, label: string) => {
    setBusy('import');
    setNotice(null);
    const result = await api<{ title: string; created: boolean; items: number; candidates: number; unconfirmed: string[] }>('/api/licitaciones/import', { method: 'POST', body: JSON.stringify(body) });
    setBusy(null);
    if (!result.ok) {
      setNotice({ kind: 'error', text: `${label}: ${result.data.message || result.data.error}` });
      return;
    }
    const d = result.data;
    setNotice({ kind: 'ok', text: `${d.created ? 'Importada' : 'Actualizada'}: ${d.title}. ${d.items} ítems, ${d.candidates} empresas evaluadas.${d.unconfirmed?.length ? ` Datos no confirmados: ${d.unconfirmed.length}.` : ''}` });
    await load();
  };

  const search = async () => {
    setBusy('search');
    setNotice(null);
    setHits(null);
    const result = await api<{ hits: SearchHit[] }>(`/api/licitaciones/search?q=${encodeURIComponent(query)}`);
    setBusy(null);
    if (!result.ok) setNotice({ kind: 'error', text: `Búsqueda en DNCP: ${result.data.message || result.data.error}` });
    else setHits(result.data.hits);
  };

  const submitManual = () => {
    const quantity = Number(manual.item_quantity);
    void runImport({
      mode: 'manual',
      tender: {
        title: manual.title, external_id: manual.external_id || undefined, source_url: manual.source_url || undefined,
        convening_entity: manual.convening_entity || undefined, is_test_data: manual.is_test_data,
        items: [{ description: manual.item_description, quantity: quantity > 0 ? quantity : undefined }],
        parties: manual.party_name ? [{ role: manual.party_role, name: manual.party_name, ruc: manual.party_ruc || undefined, evidence: manual.party_evidence || undefined }] : [],
      },
    }, 'Carga manual');
  };

  const review = async (candidate: Candidate, decision: 'APROBADA' | 'DESCARTADA' | 'PENDIENTE') => {
    setBusy(candidate.id);
    const result = await api<unknown>(`/api/licitaciones/candidates/${candidate.id}/review`, { method: 'POST', body: JSON.stringify({ decision }) });
    setBusy(null);
    if (!result.ok) setNotice({ kind: 'error', text: result.data.error ?? 'No se pudo guardar la revisión' });
    await load();
  };

  const convert = async (candidate: Candidate, force = false) => {
    setBusy(candidate.id);
    const result = await api<{ company_created: boolean; already_converted: boolean }>(`/api/licitaciones/candidates/${candidate.id}/convert`, {
      method: 'POST', body: JSON.stringify({ create_opportunity: createOpportunity, force_create: force }),
    });
    setBusy(null);
    if (result.status === 409 && result.data.error === 'LICITACION_AMBIGUOUS_COMPANY') { setAmbiguous(true); return; }
    if (!result.ok) { setNotice({ kind: 'error', text: `No se agregó a prospectos: ${result.data.error}` }); setConvertTarget(null); return; }
    setNotice({ kind: 'ok', text: result.data.company_created ? `${candidate.display_name} se agregó a prospectos del CRM.` : `${candidate.display_name} ya existía en el CRM y quedó vinculada.` });
    setConvertTarget(null);
    setAmbiguous(false);
    await load();
  };

  const openDetail = async (id: string) => {
    const result = await api<TenderDetail>(`/api/licitaciones/tenders/${id}`);
    if (result.ok) setDetail(result.data);
    else setNotice({ kind: 'error', text: result.data.error ?? 'No se pudo abrir la licitación' });
  };

  const tenderById = useMemo(() => new Map(tenders.map((t) => [t.id, t])), [tenders]);
  const inputClass = 'w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white';

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2"><Radar className="h-5 w-5 text-brand-500" />Licitaciones · Radar farmacéutico</h1>
          <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
            Encuentra empresas privadas que fabrican, importan o proveen inyectables y podrían comprar cunas para ampollas. NIUPACK no licita al Estado: las licitaciones son fuente de inteligencia comercial.
          </p>
        </div>
        <Link href="/commercial"><Button variant="secondary" size="sm">Ir al CRM</Button></Link>
      </div>

      {notice && (
        <div role="status" className={`p-3 rounded text-xs flex items-center justify-between border ${notice.kind === 'ok' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-red-950/40 border-red-800/60 text-red-300'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white" aria-label="Cerrar aviso">✕</button>
        </div>
      )}
      {loadError && <div role="alert" className="p-3 rounded text-xs border bg-red-950/40 border-red-800/60 text-red-300">No se pudieron cargar los datos: {loadError}</div>}

      {/* Importación */}
      <section className="bg-[#141820] border border-slate-800 rounded p-4 space-y-3" aria-label="Importar licitación">
        <div className="flex flex-wrap gap-1.5">
          {([['dncp', 'Por número o URL', Link2], ['search', 'Buscar en DNCP', FileSearch], ['document', 'Documento OCDS', Upload], ['manual', 'Carga manual', Upload]] as const).map(([mode, label, Icon]) => (
            <button key={mode} onClick={() => setImportMode(mode)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs border ${importMode === mode ? 'bg-brand-950/60 border-brand-800/70 text-brand-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        {importMode === 'dncp' && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-64">
              <label className="block text-[11px] text-slate-400 mb-1">Número de llamado, OCID o URL de contrataciones.gov.py</label>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Ej.: 341163 o ocds-03ad3f-341163-1" className={inputClass} />
            </div>
            <Button size="sm" isLoading={busy === 'import'} disabled={!identifier.trim()} onClick={() => runImport({ mode: 'dncp', identifier }, 'Importación DNCP')}>Importar desde DNCP</Button>
          </div>
        )}

        {importMode === 'search' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-64">
                <label className="block text-[11px] text-slate-400 mb-1">Texto en el título del llamado (buscador oficial de DNCP)</label>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej.: ampolla" className={inputClass} />
              </div>
              <Button size="sm" isLoading={busy === 'search'} disabled={query.trim().length < 3} onClick={search}>Buscar</Button>
            </div>
            {hits && hits.length === 0 && <p className="text-xs text-slate-400">DNCP no devolvió resultados para esa búsqueda.</p>}
            {hits && hits.length > 0 && (
              <ul className="divide-y divide-slate-800 border border-slate-800 rounded">
                {hits.map((hit) => (
                  <li key={hit.ocid} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-white truncate">{hit.title}</p>
                      <p className="text-[11px] text-slate-400">{hit.entity ?? 'Entidad no informada'} · {hit.status ?? 'Estado no informado'} · {hit.ocid}</p>
                      {hit.suppliers.length > 0 && <p className="text-[11px] text-slate-500">Adjudicado a: {hit.suppliers.map((s) => s.name).join(', ')}</p>}
                    </div>
                    <Button size="sm" variant="secondary" disabled={busy === 'import'} onClick={() => runImport({ mode: 'dncp', identifier: hit.ocid }, 'Importación DNCP')}>Importar</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {importMode === 'document' && (
          <div className="space-y-2">
            <label className="block text-[11px] text-slate-400">Pegá el JSON OCDS de la licitación (por ejemplo descargado de DNCP si la API no responde)</label>
            <textarea value={documentText} onChange={(e) => setDocumentText(e.target.value)} rows={5} className={`${inputClass} font-mono`} placeholder='{"releases":[{"ocid":"ocds-03ad3f-…"}]}' />
            <label className="flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={documentIsTest} onChange={(e) => setDocumentIsTest(e.target.checked)} />Marcar como dato de prueba</label>
            <Button size="sm" isLoading={busy === 'import'} disabled={documentText.trim().length < 2} onClick={() => runImport({ mode: 'ocds_document', document: documentText, is_test_data: documentIsTest }, 'Documento OCDS')}>Importar documento</Button>
          </div>
        )}

        {importMode === 'manual' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-400 mb-1">Título de la licitación *</label><input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">Entidad convocante</label><input value={manual.convening_entity} onChange={(e) => setManual({ ...manual, convening_entity: e.target.value })} className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">Número de llamado (opcional)</label><input value={manual.external_id} onChange={(e) => setManual({ ...manual, external_id: e.target.value })} className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">URL de la fuente (opcional)</label><input value={manual.source_url} onChange={(e) => setManual({ ...manual, source_url: e.target.value })} className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">Producto / ítem *</label><input value={manual.item_description} onChange={(e) => setManual({ ...manual, item_description: e.target.value })} placeholder="Ej.: Morfina 10 mg/ml ampolla" className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">Cantidad</label><input value={manual.item_quantity} onChange={(e) => setManual({ ...manual, item_quantity: e.target.value })} inputMode="numeric" className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">Rol de la empresa</label>
              <select value={manual.party_role} onChange={(e) => setManual({ ...manual, party_role: e.target.value })} className={inputClass}>
                {['OFERENTE', 'ADJUDICATARIO', 'FABRICANTE', 'LABORATORIO', 'IMPORTADOR', 'REPRESENTANTE', 'INVITADO'].map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
              </select></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">Empresa</label><input value={manual.party_name} onChange={(e) => setManual({ ...manual, party_name: e.target.value })} className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">RUC</label><input value={manual.party_ruc} onChange={(e) => setManual({ ...manual, party_ruc: e.target.value })} className={inputClass} /></div>
            <div><label className="block text-[11px] text-slate-400 mb-1">Evidencia del rol (documento y página)</label><input value={manual.party_evidence} onChange={(e) => setManual({ ...manual, party_evidence: e.target.value })} placeholder="Sin evidencia, el rol queda NO CONFIRMADO" className={inputClass} /></div>
            <label className="flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={manual.is_test_data} onChange={(e) => setManual({ ...manual, is_test_data: e.target.checked })} />Dato de prueba</label>
            <div className="md:col-span-2"><Button size="sm" isLoading={busy === 'import'} disabled={manual.title.trim().length < 3 || !manual.item_description.trim()} onClick={submitManual}>Guardar licitación</Button></div>
          </div>
        )}
      </section>

      {/* Pestañas */}
      <div className="flex items-center justify-between border-b border-slate-800">
        <div className="flex gap-4">
          {([['candidatas', `Empresas candidatas (${candidates.length})`], ['licitaciones', `Licitaciones (${tenders.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`pb-2 text-xs font-medium border-b-2 ${tab === id ? 'border-brand-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>{label}</button>
          ))}
        </div>
        {tab === 'candidatas' && (
          <select aria-label="Filtrar por estado" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="mb-1 bg-[#0c0f14] border border-slate-700 rounded px-2 py-1 text-xs text-white">
            <option value="ALL">Todas</option>
            {(Object.keys(STATUS_LABEL) as Array<Candidate['review_status']>).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        )}
      </div>

      {loading && <p className="text-xs text-slate-400">Cargando…</p>}

      {tab === 'candidatas' && !loading && (
        visible.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">Todavía no hay empresas candidatas. Importá una licitación para que el radar identifique compradores potenciales.</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((c) => (
              <li key={c.id} className="bg-[#141820] border border-slate-800 rounded p-3" data-testid="candidate-row">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{c.display_name}</p>
                    <p className="text-[11px] text-slate-400">{c.ruc ? `RUC ${c.ruc}` : 'Sin RUC: identificación por nombre, requiere revisión'} · {c.tender_ids.length} licitación(es)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={POTENTIAL_VARIANT[c.potential]}>Potencial {c.potential.toLowerCase()} · {c.score}</Badge>
                    <Badge variant={c.review_status === 'CONVERTIDA' ? 'brand' : c.review_status === 'DESCARTADA' ? 'neutral' : c.review_status === 'APROBADA' ? 'success' : 'warning'}>{STATUS_LABEL[c.review_status]}</Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.roles.map((r) => <Badge key={r.role} size="sm" variant={r.confirmed ? 'neutral' : 'warning'}>{r.role.charAt(0) + r.role.slice(1).toLowerCase()}{r.confirmed ? '' : ' · no confirmado'}</Badge>)}
                </div>
                {c.products.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Productos: {c.products.slice(0, 3).join(' · ')}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>{expanded === c.id ? 'Ocultar evidencia' : 'Ver evidencia y puntaje'}</Button>
                  {c.review_status === 'PENDIENTE' && (<>
                    <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => review(c, 'APROBADA')}>Aprobar</Button>
                    <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => review(c, 'DESCARTADA')}>Descartar</Button>
                  </>)}
                  {c.review_status === 'APROBADA' && (<>
                    <Button size="sm" disabled={busy === c.id} onClick={() => { setAmbiguous(false); setConvertTarget(c); }}>Agregar a prospectos</Button>
                    <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => review(c, 'PENDIENTE')}>Volver a pendiente</Button>
                  </>)}
                  {c.review_status === 'DESCARTADA' && <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => review(c, 'PENDIENTE')}>Reabrir</Button>}
                  {c.review_status === 'CONVERTIDA' && <Link href="/commercial" className="text-xs text-brand-400 hover:underline inline-flex items-center gap-1">Ver en CRM <ExternalLink className="h-3 w-3" /></Link>}
                </div>
                {expanded === c.id && (
                  <div className="mt-3 border-t border-slate-800 pt-3 space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-300 mb-1">Por qué este puntaje</p>
                      <ul className="space-y-1">
                        {c.reasons.map((r) => (
                          <li key={r.code} className="text-[11px] text-slate-400 flex gap-2"><span className="w-8 shrink-0 text-right font-mono text-slate-300">{r.points > 0 ? `+${r.points}` : '0'}</span><span>{r.text}</span></li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-300 mb-1">Licitaciones de origen</p>
                      <ul className="space-y-1">
                        {c.tender_ids.map((id) => {
                          const t = tenderById.get(id);
                          return <li key={id} className="text-[11px]"><button className="text-brand-400 hover:underline text-left" onClick={() => openDetail(id)}>{t ? t.title : id}</button></li>;
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'licitaciones' && !loading && (
        tenders.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">No hay licitaciones importadas.</p> : (
          <ul className="divide-y divide-slate-800 border border-slate-800 rounded bg-[#141820]">
            {tenders.map((t) => (
              <li key={t.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{t.title}</p>
                  <p className="text-[11px] text-slate-400">{t.convening_entity ?? 'Entidad no informada'} · {t.status ?? 'Estado no informado'} · {t.external_id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.is_test_data && <Badge size="sm" variant="warning">Dato de prueba</Badge>}
                  <Badge size="sm">{t.source === 'DNCP_OCDS' ? 'DNCP' : 'Manual'}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => openDetail(t.id)}>Ver detalle</Button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {/* Detalle de licitación */}
      <Modal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.tender.title ?? ''} description={detail ? `${detail.tender.convening_entity ?? ''} · ${detail.tender.external_id}` : undefined} maxWidth="2xl">
        {detail && (
          <div className="space-y-4 text-xs">
            {detail.tender.source_url && <a href={detail.tender.source_url} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline inline-flex items-center gap-1">Fuente verificable <ExternalLink className="h-3 w-3" /></a>}
            <div>
              <p className="font-semibold text-slate-300 mb-1">Productos</p>
              <ul className="space-y-1">{detail.items.map((i) => (
                <li key={i.id} className="text-slate-400">
                  {i.line_no}. {i.description}{i.quantity ? ` · ${i.quantity.toLocaleString('es-PY')} ${i.unit ?? ''}` : ''}{i.presentation ? ` · ${i.presentation}` : ''}
                  {i.is_injectable && <Badge size="sm" variant="brand" className="ml-2">Inyectable</Badge>}
                  {i.injectable_evidence && <span className="block text-[11px] text-slate-500">Evidencia: {i.injectable_evidence}</span>}
                </li>))}</ul>
            </div>
            <div>
              <p className="font-semibold text-slate-300 mb-1">Empresas y roles</p>
              <ul className="space-y-1.5">{detail.parties.map((p) => (
                <li key={p.id} className="text-slate-400">
                  <span className="text-white">{p.name}</span>{p.ruc ? ` · RUC ${p.ruc}` : ''} · <Badge size="sm" variant={p.role_confirmed ? 'neutral' : 'warning'}>{p.role.charAt(0) + p.role.slice(1).toLowerCase()}{p.role_confirmed ? '' : ' · no confirmado'}</Badge>
                  <span className="block text-[11px] text-slate-500">Evidencia: {p.evidence}</span>
                </li>))}</ul>
            </div>
            {(detail.tender.raw_document?.unconfirmed?.length ?? 0) > 0 && (
              <div className="rounded border border-amber-800/60 bg-amber-950/30 p-3">
                <p className="font-semibold text-amber-300 flex items-center gap-1.5 mb-1"><AlertTriangle className="h-3.5 w-3.5" />Datos no confirmados</p>
                <ul className="list-disc pl-4 text-amber-200/80 space-y-0.5">{detail.tender.raw_document!.unconfirmed!.map((u) => <li key={u}>{u}</li>)}</ul>
              </div>
            )}
            {(detail.tender.raw_document?.documents?.length ?? 0) > 0 && (
              <div>
                <p className="font-semibold text-slate-300 mb-1">Documentos de la licitación</p>
                <ul className="space-y-0.5">{detail.tender.raw_document!.documents!.slice(0, 12).map((d, idx) => <li key={idx}>{d.url ? <a className="text-brand-400 hover:underline" href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : <span className="text-slate-400">{d.title}</span>}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmación de "Agregar a prospectos" */}
      <Modal isOpen={Boolean(convertTarget)} onClose={() => { setConvertTarget(null); setAmbiguous(false); }} title="Agregar a prospectos" description="Se crea o vincula la empresa en el CRM como prospecto. No se contacta a nadie ni se la convierte en cliente."
        footer={convertTarget && (<>
          <Button variant="outline" size="sm" onClick={() => { setConvertTarget(null); setAmbiguous(false); }}>Cancelar</Button>
          {ambiguous
            ? <Button size="sm" variant="danger" isLoading={busy === convertTarget.id} onClick={() => convert(convertTarget, true)}>Crear como empresa nueva</Button>
            : <Button size="sm" isLoading={busy === convertTarget.id} onClick={() => convert(convertTarget)}>Confirmar</Button>}
        </>)}>
        {convertTarget && (
          <div className="space-y-3 text-xs text-slate-300">
            <p><span className="text-white font-medium">{convertTarget.display_name}</span>{convertTarget.ruc ? ` · RUC ${convertTarget.ruc}` : ''}</p>
            {ambiguous ? (
              <p role="alert" className="rounded border border-amber-800/60 bg-amber-950/30 p-3 text-amber-200">
                En el CRM ya hay una empresa con nombre equivalente pero otro RUC (o varias coincidencias). Revisala en el CRM: si es la misma, completá su RUC; si es otra empresa, podés crearla como nueva.
              </p>
            ) : (
              <label className="flex items-center gap-2"><input type="checkbox" checked={createOpportunity} onChange={(e) => setCreateOpportunity(e.target.checked)} />Crear también una oportunidad (etapa NUEVO)</label>
            )}
          </div>
        )}
      </Modal>
      {!loading && candidates.length > 0 && filter === 'ALL' && tab === 'candidatas' && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" />Los roles marcados “no confirmado” no suman puntaje: el adjudicatario no se asume fabricante.</p>
      )}
    </div>
  );
}
