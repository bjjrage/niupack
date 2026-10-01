'use client';

import Link from 'next/link';
import { ArrowRight, Compass, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { ScenarioEngine } from '@/lib/engines/scenario-engine';
import type { IndustrialProductCostInput, MarketBenchmark, MarketCode, ProductAttribute } from '@/types';
import { useEffect, useMemo, useState } from 'react';

const markets: MarketCode[] = ['BR', 'AR', 'BO', 'PY'];

export default function ScenariosPage() {
  const [skus, setSkus] = useState<ProductAttribute[]>([]);
  const [sku, setSku] = useState('');
  const [input, setInput] = useState<IndustrialProductCostInput | null>(null);
  const [benchmarks, setBenchmarks] = useState<MarketBenchmark[]>([]);
  const [batchSize, setBatchSize] = useState(0);
  const [rawMaterialPercent, setRawMaterialPercent] = useState(0);
  const [printingDieCutPercent, setPrintingDieCutPercent] = useState(0);
  const [operationalPercent, setOperationalPercent] = useState(0);
  const [scrapPercent, setScrapPercent] = useState(0);
  const [depreciationPercent, setDepreciationPercent] = useState(0);
  const [packagingPercent, setPackagingPercent] = useState(0);
  const [targetMarginPercent, setTargetMarginPercent] = useState(15);
  const [annualVolumeUnits, setAnnualVolumeUnits] = useState(0);
  const [marketKey, setMarketKey] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSku = async (targetSku: string) => {
    if (!targetSku) return;
    const response = await fetch(`/api/cost/industrial?sku=${encodeURIComponent(targetSku)}`);
    const data = await response.json();
    setInput(data.input || null);
    if (data.input) setBatchSize(data.input.batch_size);
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/cost/skus').then((response) => response.json()),
      fetch('/api/cost/benchmarks').then((response) => response.json()),
    ]).then(([skuData, priceData]) => {
      const availableSkus = (skuData.skus || []) as ProductAttribute[];
      const availablePrices = priceData.prices || [];
      setSkus(availableSkus);
      const firstSku = availableSkus[0]?.sku || '';
      setSku(firstSku);
      if (firstSku) void loadSku(firstSku);
      const derived = availableSkus.flatMap((candidate) => markets.map((market) => MarketBenchmarkEngine.calculateBenchmark(availablePrices, candidate.sku, market)).filter(Boolean) as MarketBenchmark[]);
      setBenchmarks(derived);
      setMarketKey(derived.find((candidate) => candidate.sku === firstSku)?.country_code || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const benchmark = benchmarks.find((candidate) => candidate.sku === sku && `${candidate.country_code}` === marketKey);
  const simulation = useMemo(() => {
    if (!input || !batchSize) return null;
    return ScenarioEngine.simulateV1({
      input,
      batchSize,
      rawMaterialPercent,
      printingDieCutPercent,
      operationalPercent,
      scrapPercent,
      depreciationPercent,
      packagingPercent,
      targetMarginPercent,
      annualVolumeUnits: annualVolumeUnits > 0 ? annualVolumeUnits : undefined,
      marketBenchmarkUSD: benchmark?.weighted_benchmark_usd,
    });
  }, [input, batchSize, rawMaterialPercent, printingDieCutPercent, operationalPercent, scrapPercent, depreciationPercent, packagingPercent, targetMarginPercent, annualVolumeUnits, benchmark]);

  const reset = () => {
    setRawMaterialPercent(0); setPrintingDieCutPercent(0); setOperationalPercent(0); setScrapPercent(0); setDepreciationPercent(0); setPackagingPercent(0); setTargetMarginPercent(15); setAnnualVolumeUnits(0); if (input) setBatchSize(input.batch_size);
  };

  const variable = (label: string, value: number, setValue: (value: number) => void, min = -50, max = 50) => (
    <label className="block space-y-1.5 text-xs text-slate-300"><span className="flex justify-between"><span>{label}</span><span className="font-mono text-white">{value > 0 ? '+' : ''}{value}%</span></span><input type="range" min={min} max={max} step="1" value={value} onChange={(event) => setValue(Number(event.target.value))} className="w-full accent-brand-500" /></label>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4"><div><div className="flex items-center gap-2"><span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Módulo 3</span><span className="text-xs text-slate-600">/</span><span className="text-xs text-slate-400">Cost Intelligence V1</span></div><h1 className="mt-1 text-xl font-bold text-white">Simulador de escenarios por SKU</h1><p className="mt-0.5 text-xs text-slate-400">Cada variable cambia únicamente su rubro de costo. No usa Process Engine ni valores de mercado inventados.</p></div><button onClick={reset} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /> Restablecer</button></div>

      <div className="flex flex-wrap items-center gap-3 rounded border border-slate-800 bg-[#141820] p-4"><span className="text-xs text-slate-400">SKU real:</span><select value={sku} onChange={(event) => { setSku(event.target.value); void loadSku(event.target.value); }} className="rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs font-mono text-white">{skus.map((candidate) => <option key={candidate.sku} value={candidate.sku}>{candidate.sku}</option>)}</select>{input && <Badge variant="success">CONFIGURADO</Badge>}{input && <span className="text-[11px] text-slate-500">Lote base: {input.batch_size.toLocaleString()} u</span>}</div>

      {!loading && !input && <div className="rounded border border-amber-800/70 bg-amber-950/20 p-5 text-xs text-amber-100">Este SKU está <strong>SIN CONFIGURAR</strong>. <Link className="underline" href="/cost/cost-sheets">Configurar hoja de costo</Link> antes de simular.</div>}

      {input && <div className="grid grid-cols-1 gap-6 lg:grid-cols-3"><div className="space-y-5 rounded border border-slate-800 bg-[#141820] p-5"><div className="flex items-center justify-between border-b border-slate-800 pb-3"><h3 className="text-xs font-semibold text-white">Variables V1</h3><Badge variant="brand">Tiempo real</Badge></div><label className="block text-xs text-slate-300">Tamaño de lote<input type="number" min="1" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value) || 0)} className="mt-1 w-full rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 font-mono text-xs text-white" /></label>{variable('Materia prima', rawMaterialPercent, setRawMaterialPercent)}{variable('Impresión + troquelado', printingDieCutPercent, setPrintingDieCutPercent)}{variable('Costos operativos', operationalPercent, setOperationalPercent)}{variable('Merma', scrapPercent, setScrapPercent)}{variable('Depreciación', depreciationPercent, setDepreciationPercent)}{variable('Embalaje', packagingPercent, setPackagingPercent)}<label className="block text-xs text-slate-300">Margen objetivo<span className="mt-1 flex items-center gap-2"><input type="range" min="0" max="60" step="1" value={targetMarginPercent} onChange={(event) => setTargetMarginPercent(Number(event.target.value))} className="w-full accent-brand-500" /><span className="w-12 font-mono text-white">{targetMarginPercent}%</span></span></label><label className="block text-xs text-slate-300">Volumen anual configurado (opcional)<input type="number" min="0" value={annualVolumeUnits} onChange={(event) => setAnnualVolumeUnits(Number(event.target.value) || 0)} className="mt-1 w-full rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 font-mono text-xs text-white" /></label></div>

        <div className="space-y-5 lg:col-span-2">{simulation && <><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Costo base', simulation.baseUnitCostUSD], ['Costo simulado', simulation.simulatedUnitCostUSD], ['Delta USD/u', simulation.unitCostDeltaUSD], ['Precio sugerido', simulation.suggestedPriceUSD]].map(([label, value]) => <div key={String(label)} className="rounded border border-slate-800 bg-[#141820] p-4"><span className="block text-xs text-slate-400">{label}</span><span className="mt-1 block font-mono text-xl font-bold text-white">${Number(value).toFixed(5)}</span></div>)}</div><div className="rounded border border-slate-800 bg-[#141820] p-5"><div className="flex items-center gap-2 border-b border-slate-800 pb-3"><Compass className="h-4 w-4 text-brand-400" /><h3 className="text-xs font-semibold text-white">Impacto trazable por rubro</h3></div><div className="mt-3 divide-y divide-slate-800">{simulation.baseRubrics.map((rubric) => { const simulated = simulation.simulatedRubrics.find((candidate) => candidate.key === rubric.key); const delta = (simulated?.impact_usd_per_unit || 0) - rubric.impact_usd_per_unit; return <div key={rubric.key} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="text-slate-300">{rubric.label} <span className="text-[10px] text-slate-500">({rubric.enabled ? rubric.source : 'OFF'})</span></span><span className="font-mono text-slate-400">Base ${rubric.impact_usd_per_unit.toFixed(5)} · Sim ${Number(simulated?.impact_usd_per_unit || 0).toFixed(5)} · <span className={delta <= 0 ? 'text-emerald-400' : 'text-rose-400'}>{delta > 0 ? '+' : ''}{delta.toFixed(5)}</span></span></div>; })}</div></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2"><div className="rounded border border-slate-800 bg-[#141820] p-4 text-xs text-slate-300">Delta lote: <span className="font-mono font-bold text-white">${simulation.batchCostDeltaUSD.toLocaleString()} USD</span>{simulation.annualImpactUSD !== null && <><br />Impacto anual: <span className="font-mono font-bold text-emerald-400">${simulation.annualImpactUSD.toLocaleString()} USD</span></>}</div><div className="rounded border border-slate-800 bg-[#141820] p-4 text-xs text-slate-300">{benchmark ? <><select value={marketKey} onChange={(event) => setMarketKey(event.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2 py-1 text-xs text-white"><option value={benchmark.country_code}>{benchmark.country_code}</option>{benchmarks.filter((candidate) => candidate.sku === sku).map((candidate) => <option key={candidate.country_code} value={candidate.country_code}>{candidate.country_code}</option>)}</select><br />Benchmark real: <span className="font-mono text-white">${benchmark.weighted_benchmark_usd.toFixed(4)} USD/u</span><br />Brecha: <span className="font-mono text-white">${simulation.priceGapUSD?.toFixed(4)} /u ({simulation.priceGapPercent}%)</span></> : <span>Sin benchmark real disponible.</span>}</div></div></>}</div></div>}

      {!loading && !input && skus.length === 0 && <div className="rounded border border-slate-800 bg-[#141820] p-5 text-xs text-slate-400">No hay SKUs activos en el Maestro.</div>}
      {input && <div className="text-right"><Link href="/cost/cost-sheets"><Button variant="secondary" size="sm">Editar hoja de costo <ArrowRight className="ml-1 h-3 w-3" /></Button></Link></div>}
    </div>
  );
}
