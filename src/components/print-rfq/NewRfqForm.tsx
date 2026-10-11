'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { PRINT_PROCESSES } from '@/lib/print-rfq/domain';
import { api, buttonClass, ghostButtonClass, inputClass, postJson } from './format';

interface SkuOption { id: string; sku: string; name: string; material: string | null }
interface DraftItem {
  key: number; sku: string; product_attribute_id: string | null; description: string; quantity: string; unit: string;
  process: string; substrate: string; colors: string; dimensions: string; finish: string; notes: string; file: File | null;
}
let counter = 0;
const blankItem = (): DraftItem => ({ key: ++counter, sku: '', product_attribute_id: null, description: '', quantity: '', unit: 'un', process: '', substrate: '', colors: '', dimensions: '', finish: '', notes: '', file: null });
const ART_ACCEPT = '.pdf,.png,.jpg,.jpeg,.svg,.ai,.eps,.tif,.tiff,.zip';

/** Nueva solicitud: cada ítem lleva su SKU, la ficha de impresión y el arte que se pide cotizar. */
export function NewRfqForm() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<'' | 'PROCUREMENT' | 'COST_DISCOVERY'>('');
  const [title, setTitle] = useState('');
  const [specifications, setSpecifications] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [expiresDays, setExpiresDays] = useState('14');
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    api<{ skus: SkuOption[] }>('/api/print-rfq/skus?q=').then((r) => setSkus(r.skus)).catch(() => setSkus([]));
  }, []);

  const update = (key: number, patch: Partial<DraftItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const pickSku = (key: number, sku: string) => {
    const match = skus.find((s) => s.sku.toLowerCase() === sku.trim().toLowerCase());
    update(key, match ? { sku: match.sku, product_attribute_id: match.id, description: items.find((i) => i.key === key)?.description || match.name } : { sku, product_attribute_id: null });
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!purpose) { setError('Elegí si es una solicitud de compra o para descubrir costos.'); return; }
    setBusy(true); setError(null);
    try {
      const body = {
        header: {
          purpose, title, specifications: specifications || undefined, required_date: requiredDate || undefined,
          expires_at: new Date(Date.now() + Number(expiresDays || 14) * 86_400_000).toISOString(),
        },
        items: items.map((i) => ({
          sku: i.sku, description: i.description, quantity: Number(i.quantity), unit: i.unit, product_attribute_id: i.product_attribute_id,
          print_spec: Object.fromEntries(Object.entries({ process: i.process, substrate: i.substrate, colors: i.colors, dimensions: i.dimensions, finish: i.finish, notes: i.notes }).filter(([, v]) => v.trim())),
        })),
      };
      const created = await postJson<{ id: string; code: string }>('/api/print-rfq/rfqs', body);
      const workspace = await api<{ items: Array<{ id: string }> }>(`/api/print-rfq/rfqs/${created.id}`);
      const failures: string[] = [];
      for (const [index, item] of items.entries()) {
        if (!item.file) continue;
        setProgress(`Registrando arte ${index + 1} de ${items.length}…`);
        const form = new FormData();
        form.set('item_id', workspace.items[index].id);
        form.set('file', item.file);
        try { await api(`/api/print-rfq/rfqs/${created.id}/art`, { method: 'POST', body: form }); }
        catch (e) { failures.push(`${item.sku}: ${(e as Error).message}`); }
      }
      if (failures.length) window.alert(`La solicitud ${created.code} se creó, pero no se pudo registrar el arte de:\n${failures.join('\n')}\n\nPodés subirlo desde la solicitud.`);
      router.push(`/imprentas/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <datalist id="print-skus">{skus.map((s) => <option key={s.id} value={s.sku}>{s.name}</option>)}</datalist>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}

      <section className="space-y-3 rounded border border-slate-800 bg-[#141820] p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-[11px] text-slate-400">Título *<input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Vasos 12oz — impresión 4 colores" className={inputClass} /></label>
          <label className="text-[11px] text-slate-400">¿Para qué es? *
            <select required value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)} className={inputClass}>
              <option value="">Elegí una opción</option>
              <option value="PROCUREMENT">Compra: puede terminar en una orden de compra</option>
              <option value="COST_DISCOVERY">Descubrir costos: solo comparar, sin comprar</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-400">Necesitamos para<input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} className={inputClass} /></label>
          <label className="text-[11px] text-slate-400">Las imprentas pueden cotizar durante (días)<input type="number" min={1} max={90} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} className={inputClass} /></label>
        </div>
        <label className="block text-[11px] text-slate-400">Indicaciones generales para las imprentas<textarea rows={2} value={specifications} onChange={(e) => setSpecifications(e.target.value)} className={inputClass} /></label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Productos a imprimir</h2>
          <button type="button" onClick={() => setItems((l) => [...l, blankItem()])} className={ghostButtonClass}><Plus className="h-3 w-3" />Agregar SKU</button>
        </div>
        {items.map((item, index) => (
          <div key={item.key} className="space-y-3 rounded border border-slate-800 bg-[#141820] p-4" data-testid="rfq-item">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-300">Ítem {index + 1}</p>
              {items.length > 1 && <button type="button" aria-label={`Quitar ítem ${index + 1}`} onClick={() => setItems((l) => l.filter((i) => i.key !== item.key))} className="text-slate-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-[11px] text-slate-400">SKU *<input required list="print-skus" value={item.sku} onChange={(e) => pickSku(item.key, e.target.value)} className={inputClass} /></label>
              <label className="text-[11px] text-slate-400 md:col-span-2">Descripción *<input required value={item.description} onChange={(e) => update(item.key, { description: e.target.value })} className={inputClass} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">Cantidad *<input required type="number" min="0.0001" step="any" value={item.quantity} onChange={(e) => update(item.key, { quantity: e.target.value })} className={inputClass} /></label>
                <label className="text-[11px] text-slate-400">Unidad *<input required value={item.unit} onChange={(e) => update(item.key, { unit: e.target.value })} className={inputClass} /></label>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-5">
              <label className="text-[11px] text-slate-400">Proceso
                <select value={item.process} onChange={(e) => update(item.key, { process: e.target.value })} className={inputClass}>
                  <option value="">A definir por la imprenta</option>
                  {PRINT_PROCESSES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Sustrato<input value={item.substrate} onChange={(e) => update(item.key, { substrate: e.target.value })} placeholder="Cartulina 250 g" className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Colores<input value={item.colors} onChange={(e) => update(item.key, { colors: e.target.value })} placeholder="4 + barniz" className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Medidas<input value={item.dimensions} onChange={(e) => update(item.key, { dimensions: e.target.value })} placeholder="120 × 90 mm" className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Acabado<input value={item.finish} onChange={(e) => update(item.key, { finish: e.target.value })} placeholder="Laminado mate" className={inputClass} /></label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-[11px] text-slate-400">Notas de impresión<input value={item.notes} onChange={(e) => update(item.key, { notes: e.target.value })} className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Arte a cotizar (PDF, AI, EPS, PNG, JPG, SVG, TIF o ZIP · máx. 4 MB)
                <input type="file" accept={ART_ACCEPT} onChange={(e) => update(item.key, { file: e.target.files?.[0] ?? null })} className={`${inputClass} file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-white`} />
              </label>
            </div>
            {!item.file && <p className="text-[11px] text-amber-400">Sin arte no se puede invitar a las imprentas. Podés subirlo después, desde la solicitud.</p>}
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <button disabled={busy} className={buttonClass}>{busy ? 'Creando…' : 'Crear solicitud'}</button>
        {progress && <span className="text-xs text-slate-400">{progress}</span>}
      </div>
    </form>
  );
}
