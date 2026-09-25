'use client';

import React, { useState, useEffect } from 'react';
import {
  Truck,
  Box,
  Layers,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Scale,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ExportLogisticsEngine, STANDARD_CONTAINERS } from '@/lib/engines/export-logistics-engine';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { useCopilot } from '@/components/copilot/CopilotContext';
import {
  ContainerType,
  FclLogisticsResult,
  LandedCostBreakdown,
  LclLogisticsResult,
  LogisticsBreakEvenResult,
  ProductPackagingSpec,
} from '@/types';

export function ExportLogisticsClient() {
  const { updateScreenContext } = useCopilot();

  // Selected parameters
  const [sku, setSku] = useState<string>('CUP-12OZ-SW');
  const [destinationCountry, setDestinationCountry] = useState<string>('BR');
  const [destinationPort, setDestinationPort] = useState<string>('São Paulo / Santos');
  const [exportQuantity, setExportQuantity] = useState<number>(300000);
  const [activeTab, setActiveTab] = useState<'LCL' | 'FCL' | 'BREAK_EVEN' | 'LANDED'>('LCL');

  // Packaging State
  const [unitsPerBox, setUnitsPerBox] = useState<number>(1000);
  const [boxLengthCm, setBoxLengthCm] = useState<number>(50);
  const [boxWidthCm, setBoxWidthCm] = useState<number>(40);
  const [boxHeightCm, setBoxHeightCm] = useState<number>(45);
  const [boxWeightKg, setBoxWeightKg] = useState<number>(9.5);

  // FX State
  const [fxRate, setFxRate] = useState<number>(6010);
  const [fxStatus, setFxStatus] = useState<string>('CURRENT');
  const [fxRefreshing, setFxRefreshing] = useState<boolean>(false);

  // LCL Parameters
  const [lclRatePerM3, setLclRatePerM3] = useState<number>(180);
  const [lclMinCharge, setLclMinCharge] = useState<number>(250);
  const [lclOriginCharges, setLclOriginCharges] = useState<number>(120);
  const [lclDestCharges, setLclDestCharges] = useState<number>(150);
  const [lclDocCharges, setLclDocCharges] = useState<number>(80);
  const [lclCustomsCharges, setLclCustomsCharges] = useState<number>(90);
  const [lclInsuranceCharges, setLclInsuranceCharges] = useState<number>(45);

  // FCL Parameters
  const [containerType, setContainerType] = useState<ContainerType>('40HC');
  const [fclFreightCost, setFclFreightCost] = useState<number>(3200);
  const [fclOriginCharges, setFclOriginCharges] = useState<number>(250);
  const [fclDestCharges, setFclDestCharges] = useState<number>(200);
  const [fclDocCharges, setFclDocCharges] = useState<number>(120);
  const [fclCustomsCharges, setFclCustomsCharges] = useState<number>(180);
  const [fclInsuranceCharges, setFclInsuranceCharges] = useState<number>(80);
  const [manualOverrideBoxes, setManualOverrideBoxes] = useState<string>('');

  // Landed Cost & Benchmark
  const [marketBenchmarkUSD, setMarketBenchmarkUSD] = useState<number>(0.068);
  const [dutiesPercent, setDutiesPercent] = useState<number>(10);
  const [factoryUnitCostUSD, setFactoryUnitCostUSD] = useState<number>(0.04609);

  // Calculated box volume in m3
  const boxVolumeM3 = ExportLogisticsEngine.calculateBoxVolume(boxLengthCm, boxWidthCm, boxHeightCm);

  const packaging: ProductPackagingSpec = {
    sku,
    units_per_box: unitsPerBox,
    box_length_cm: boxLengthCm,
    box_width_cm: boxWidthCm,
    box_height_cm: boxHeightCm,
    box_weight_kg: boxWeightKg,
    box_volume_m3: boxVolumeM3,
  };

  // Load FX and SKU packaging from API
  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    loadSkuPackaging(sku);
  }, [sku]);

  const fetchInitialData = async () => {
    try {
      const fxRes = await fetch('/api/fx');
      if (fxRes.ok) {
        const data = await fxRes.json();
        if (data.costingRate) {
          setFxRate(data.costingRate);
          setFxStatus(data.status);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshFx = async () => {
    setFxRefreshing(true);
    try {
      const res = await fetch('/api/fx?refresh=true');
      if (res.ok) {
        const data = await res.json();
        if (data.costingRate) {
          setFxRate(data.costingRate);
          setFxStatus(data.status);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFxRefreshing(false);
    }
  };

  const loadSkuPackaging = async (targetSku: string) => {
    try {
      const res = await fetch(`/api/cost/logistics`);
      if (res.ok) {
        const data = await res.json();
        const found = (data.packagingSpecs || []).find((s: ProductPackagingSpec) => s.sku === targetSku);
        if (found) {
          setUnitsPerBox(found.units_per_box);
          setBoxLengthCm(found.box_length_cm);
          setBoxWidthCm(found.box_width_cm);
          setBoxHeightCm(found.box_height_cm);
          setBoxWeightKg(found.box_weight_kg);
        }
      }

      // Also get plant factory cost
      const costRes = await fetch(`/api/cost/industrial?sku=${targetSku}`);
      if (costRes.ok) {
        const costData = await costRes.json();
        if (costData.breakdown) {
          setFactoryUnitCostUSD(costData.breakdown.true_unit_cost_usd);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update container default freight on type change
  const handleContainerTypeChange = (type: ContainerType) => {
    setContainerType(type);
    setFclFreightCost(STANDARD_CONTAINERS[type]?.default_freight_usd || 3200);
  };

  // Real-time calculations
  const totalBoxesRequired = Math.ceil(exportQuantity / unitsPerBox);
  const totalM3Required = Number((totalBoxesRequired * boxVolumeM3).toFixed(2));
  const totalWeightKg = Number((totalBoxesRequired * boxWeightKg).toFixed(1));

  // LCL result
  const lclResult: LclLogisticsResult = ExportLogisticsEngine.calculateLclCost({
    packaging,
    number_of_units: exportQuantity,
    freight_cost_per_m3_usd: lclRatePerM3,
    minimum_charge_usd: lclMinCharge,
    origin_charges_usd: lclOriginCharges,
    destination_charges_usd: lclDestCharges,
    documentation_usd: lclDocCharges,
    customs_usd: lclCustomsCharges,
    insurance_usd: lclInsuranceCharges,
  });

  // FCL result
  const actualBoxesParsed = manualOverrideBoxes ? parseInt(manualOverrideBoxes, 10) : undefined;
  const fclResult: FclLogisticsResult = ExportLogisticsEngine.calculateFclCost({
    container_type: containerType,
    packaging,
    container_freight_cost_usd: fclFreightCost,
    origin_charges_usd: fclOriginCharges,
    destination_charges_usd: fclDestCharges,
    documentation_usd: fclDocCharges,
    customs_usd: fclCustomsCharges,
    insurance_usd: fclInsuranceCharges,
    actual_boxes_per_container: actualBoxesParsed,
  });

  // Break Even
  const breakEvenResult: LogisticsBreakEvenResult = ExportLogisticsEngine.calculateLogisticsBreakEven(
    packaging,
    lclRatePerM3,
    STANDARD_CONTAINERS['20FT'].default_freight_usd,
    STANDARD_CONTAINERS['40HC'].default_freight_usd
  );

  // Landed Cost
  const activeFreightUnitUSD =
    activeTab === 'LCL' ? lclResult.freight_cost_per_unit_usd : fclResult.freight_cost_per_unit_usd;

  const landedCost: LandedCostBreakdown = ExportLogisticsEngine.calculateLandedCost({
    sku,
    factoryUnitCostUSD,
    exportPackagingUSD: 0.002,
    originLogisticsUSD: 0.0015,
    documentationUSD: 0.0005,
    freightUnitUSD: activeFreightUnitUSD,
    insuranceUSD: 0.0005,
    destinationChargesUSD: 0.002,
    dutiesPercent,
    fxRate,
  });

  // Register Copilot Context
  useEffect(() => {
    updateScreenContext({
      route: '/cost/logistics',
      module: 'Export Logistics',
      sku,
      market: destinationCountry,
      volume: exportQuantity,
      unitCostUSD: factoryUnitCostUSD,
      benchmarkUSD: marketBenchmarkUSD,
      gapPercent: Number((((marketBenchmarkUSD - landedCost.landed_unit_usd) / marketBenchmarkUSD) * 100).toFixed(1)),
      customParams: {
        method: activeTab,
        freightUnitUSD: activeFreightUnitUSD,
        landedCostUSD: landedCost.landed_unit_usd,
        landedCostPYG: landedCost.landed_unit_pyg,
        fxRate,
        breakEven20ft: breakEvenResult.break_even_units_20ft,
        breakEven40hc: breakEvenResult.break_even_units_40hc,
      },
    });
  }, [
    sku,
    destinationCountry,
    exportQuantity,
    factoryUnitCostUSD,
    marketBenchmarkUSD,
    activeTab,
    activeFreightUnitUSD,
    landedCost.landed_unit_usd,
    landedCost.landed_unit_pyg,
    fxRate,
    breakEvenResult.break_even_units_20ft,
    breakEvenResult.break_even_units_40hc,
    updateScreenContext,
  ]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-brand-500/10 text-brand-400">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">Motor Logístico de Exportación & Landed Cost</span>
              <span className="text-[11px] text-slate-400">Cálculo determinístico FCL, LCL y cascada EXW / FOB / CIF / Landed</span>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-slate-700 hidden sm:block" />

          {/* SKU Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">SKU:</span>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono font-semibold"
            >
              <option value="CUP-12OZ-SW">CUP-12OZ-SW (12 oz Simple)</option>
              <option value="CUP-8OZ-SW">CUP-8OZ-SW (8 oz Simple)</option>
              <option value="CUP-16OZ-SW">CUP-16OZ-SW (16 oz Simple)</option>
              <option value="CUP-12OZ-DW">CUP-12OZ-DW (12 oz Doble Pared)</option>
              <option value="CUP-4OZ-SW">CUP-4OZ-SW (4 oz Café)</option>
            </select>
          </div>

          {/* Destination Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Destino:</span>
            <select
              value={destinationCountry}
              onChange={(e) => {
                setDestinationCountry(e.target.value);
                if (e.target.value === 'BR') setDestinationPort('São Paulo / Santos');
                else if (e.target.value === 'AR') setDestinationPort('Buenos Aires');
                else if (e.target.value === 'BO') setDestinationPort('Santa Cruz de la Sierra');
              }}
              className="bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-semibold"
            >
              <option value="BR">Brasil (Santos / SP)</option>
              <option value="AR">Argentina (Bs. As.)</option>
              <option value="BO">Bolivia (Santa Cruz)</option>
            </select>
          </div>
        </div>

        {/* Live FX Badge */}
        <div className="flex items-center gap-2 bg-[#0c0f14] px-3 py-1.5 rounded-lg border border-slate-700/80">
          <span className="text-[11px] text-slate-400 font-medium">TC BNF Oficial:</span>
          <span className="font-mono text-emerald-400 font-bold text-xs">
            Gs. {fxRate.toLocaleString('es-PY')} / USD
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            {fxStatus === 'CURRENT' ? 'Venta BNF' : 'Fallback DB'}
          </span>
          <button
            onClick={handleRefreshFx}
            disabled={fxRefreshing}
            title="Refrescar cotización BNF"
            className="text-slate-400 hover:text-white p-0.5 ml-1 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${fxRefreshing ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards: Logistics & Landed Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#141820] border border-brand-500/40 rounded-lg p-4 relative overflow-hidden">
          <span className="text-[11px] text-brand-300 font-bold uppercase tracking-wider block">
            COSTO PLANTA (EXW)
          </span>
          <div className="mt-1">
            <span className="text-2xl font-black text-white font-mono font-tabular">
              ${factoryUnitCostUSD.toFixed(5)}{' '}
              <span className="text-xs font-sans text-slate-400 font-normal">USD/u</span>
            </span>
            <div className="text-sm font-bold text-amber-400 font-mono mt-0.5">
              Gs. {Math.round(factoryUnitCostUSD * fxRate).toLocaleString('es-PY')} /u
            </div>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-2 block border-t border-slate-800/80 pt-1">
            Base: ${((factoryUnitCostUSD * 1000)).toFixed(2)} USD / 1.000 u
          </span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">
            Flete Logístico Unitario ({activeTab})
          </span>
          <div className="text-xl font-bold text-sky-400 font-mono font-tabular mt-1">
            ${activeFreightUnitUSD.toFixed(5)}{' '}
            <span className="text-xs text-slate-400 font-normal">USD/u</span>
          </div>
          <div className="text-xs font-mono text-sky-500 mt-0.5">
            Gs. {Math.round(activeFreightUnitUSD * fxRate).toLocaleString('es-PY')} /u
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1.5 block border-t border-slate-800/80 pt-1">
            Ponderación: {((activeFreightUnitUSD / landedCost.landed_unit_usd) * 100).toFixed(1)}% del landed cost
          </span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-emerald-400 font-medium block">
            Costo Puesto en Destino (LANDED)
          </span>
          <div className="text-xl font-bold text-emerald-400 font-mono font-tabular mt-1">
            ${landedCost.landed_unit_usd.toFixed(5)}{' '}
            <span className="text-xs text-slate-400 font-normal">USD/u</span>
          </div>
          <div className="text-xs font-mono text-emerald-500 mt-0.5">
            Gs. {landedCost.landed_unit_pyg.toLocaleString('es-PY')} /u
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1.5 block border-t border-slate-800/80 pt-1">
            Incluye arancel {dutiesPercent}% y gastos de puerto
          </span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">
            Volumen & Break-Even FCL
          </span>
          <div className="text-xl font-bold text-white font-mono font-tabular mt-1">
            {exportQuantity.toLocaleString('es-PY')} u
          </div>
          <div className="text-xs font-mono text-amber-400 mt-0.5">
            {totalBoxesRequired} cajas ({totalM3Required} m³)
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1.5 block border-t border-slate-800/80 pt-1">
            FCL 20FT conviene desde {breakEvenResult.break_even_units_20ft.toLocaleString('es-PY')} u
          </span>
        </div>
      </div>

      {/* Packaging Specifications Bar */}
      <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-sky-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Especificaciones de Empaque Secundario ({sku})
            </h3>
          </div>
          <div className="text-right flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">Volumen Caja Calculado:</span>
            <span className="text-sky-400 font-bold">{boxVolumeM3} m³</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Unidades / Caja</label>
            <input
              type="number"
              value={unitsPerBox}
              onChange={(e) => setUnitsPerBox(parseInt(e.target.value, 10) || 1000)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Largo (cm)</label>
            <input
              type="number"
              value={boxLengthCm}
              onChange={(e) => setBoxLengthCm(parseFloat(e.target.value) || 50)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Ancho (cm)</label>
            <input
              type="number"
              value={boxWidthCm}
              onChange={(e) => setBoxWidthCm(parseFloat(e.target.value) || 40)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Alto (cm)</label>
            <input
              type="number"
              value={boxHeightCm}
              onChange={(e) => setBoxHeightCm(parseFloat(e.target.value) || 45)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Peso Caja (kg)</label>
            <input
              type="number"
              value={boxWeightKg}
              onChange={(e) => setBoxWeightKg(parseFloat(e.target.value) || 9.5)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Tirada a Exportar (u)</label>
            <input
              type="number"
              step="10000"
              value={exportQuantity}
              onChange={(e) => setExportQuantity(parseInt(e.target.value, 10) || 100000)}
              className="w-full bg-[#0c0f14] border border-brand-500/50 rounded px-2.5 py-1 text-brand-300 font-mono font-bold"
            />
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 bg-[#141820] p-1.5 rounded-lg border border-slate-800">
        <button
          onClick={() => setActiveTab('LCL')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'LCL' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          1. LCL (Carga Consolidada por m³)
        </button>
        <button
          onClick={() => setActiveTab('FCL')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'FCL' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          2. FCL (Contenedores 20FT / 40FT / 40HC)
        </button>
        <button
          onClick={() => setActiveTab('BREAK_EVEN')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'BREAK_EVEN' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          3. Comparativa & Break-Even Logístico
        </button>
        <button
          onClick={() => setActiveTab('LANDED')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'LANDED' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          4. Cascada Landed Cost (EXW a Landed)
        </button>
      </div>

      {/* TAB 1: LCL CONTENT */}
      {activeTab === 'LCL' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
              Parámetros de Flete LCL (Consolidado por Volumen)
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Tarifa Flete (USD / m³)
                </label>
                <input
                  type="number"
                  value={lclRatePerM3}
                  onChange={(e) => setLclRatePerM3(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Cargo Mínimo (USD)
                </label>
                <input
                  type="number"
                  value={lclMinCharge}
                  onChange={(e) => setLclMinCharge(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Gastos Origen / Terminal (USD)
                </label>
                <input
                  type="number"
                  value={lclOriginCharges}
                  onChange={(e) => setLclOriginCharges(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Gastos Destino / Handling (USD)
                </label>
                <input
                  type="number"
                  value={lclDestCharges}
                  onChange={(e) => setLclDestCharges(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Documentación / BL (USD)
                </label>
                <input
                  type="number"
                  value={lclDocCharges}
                  onChange={(e) => setLclDocCharges(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Aduana & Seguro (USD)
                </label>
                <input
                  type="number"
                  value={lclCustomsCharges + lclInsuranceCharges}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setLclCustomsCharges(val * 0.65);
                    setLclInsuranceCharges(val * 0.35);
                  }}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            {/* Formula callout */}
            <div className="bg-[#0c0f14] p-3 rounded border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
              <span className="text-slate-500 block text-[10px]">Fórmula aplicada:</span>
              <div>
                Volumen caja: ({boxLengthCm}/100) × ({boxWidthCm}/100) × ({boxHeightCm}/100) = <span className="text-white font-bold">{boxVolumeM3} m³</span>
              </div>
              <div>
                Total tirada: {totalBoxesRequired} cajas × {boxVolumeM3} m³ = <span className="text-sky-400 font-bold">{totalM3Required} m³</span>
              </div>
              <div>
                Flete Base: {totalM3Required} m³ × ${lclRatePerM3}/m³ = <span className="text-emerald-400 font-bold">${lclResult.freight_subtotal_usd.toFixed(2)} USD</span>
              </div>
            </div>
          </div>

          {/* LCL Output Card */}
          <div className="lg:col-span-4 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800">
              Resultados Flete LCL
            </h4>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400">Total Flete LCL:</span>
                <span className="font-mono text-white font-bold">${lclResult.total_lcl_cost_usd.toFixed(2)} USD</span>
              </div>

              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400">Costo Flete por Caja:</span>
                <span className="font-mono text-sky-400 font-bold">${lclResult.freight_cost_per_box_usd.toFixed(4)} USD</span>
              </div>

              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-400 block font-medium">COSTO LOGÍSTICO POR UNIDAD:</span>
                <div className="text-lg font-black text-amber-400 font-mono">
                  ${lclResult.freight_cost_per_unit_usd.toFixed(5)} USD/u
                </div>
                <div className="text-xs font-mono text-amber-500">
                  Gs. {Math.round(lclResult.freight_cost_per_unit_usd * fxRate).toLocaleString('es-PY')} /u
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal Flete Puro:</span>
                  <span className="font-mono text-slate-300">${lclResult.freight_subtotal_usd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gastos Origen + Destino + Doc:</span>
                  <span className="font-mono text-slate-300">${lclResult.other_charges_subtotal_usd.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FCL CONTENT */}
      {activeTab === 'FCL' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
              Configuración de Contenedor Completo (FCL)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Tipo de Contenedor</label>
                <select
                  value={containerType}
                  onChange={(e) => handleContainerTypeChange(e.target.value as ContainerType)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-semibold"
                >
                  <option value="20FT">20FT Standard (33.0 m³)</option>
                  <option value="40FT">40FT Standard (67.0 m³)</option>
                  <option value="40HC">40HC High Cube (76.0 m³)</option>
                  <option value="CUSTOM">Custom Truck / Semi (85.0 m³)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Costo Flete Contenedor (USD)</label>
                <input
                  type="number"
                  value={fclFreightCost}
                  onChange={(e) => setFclFreightCost(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Override Manual Cajas (Opcional)
                </label>
                <input
                  type="number"
                  placeholder={`Auto: ${fclResult.boxes_by_volume} cajas`}
                  value={manualOverrideBoxes}
                  onChange={(e) => setManualOverrideBoxes(e.target.value)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            {/* Container specs callout */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Capacidad Volumétrica:</span>
                <span className="text-sm font-bold text-white font-mono">
                  {STANDARD_CONTAINERS[containerType]?.usable_m3} m³
                </span>
                <span className="text-[10px] text-sky-400 block mt-0.5">
                  Límite m³: {fclResult.boxes_by_volume} cajas
                </span>
              </div>

              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Payload Máximo:</span>
                <span className="text-sm font-bold text-white font-mono">
                  {(STANDARD_CONTAINERS[containerType]?.max_payload_kg).toLocaleString()} kg
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Límite Peso: {fclResult.boxes_by_weight} cajas
                </span>
              </div>

              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Cajas Utilizables:</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {fclResult.usable_boxes} cajas
                </span>
                <span className="text-[10px] text-emerald-500/80 block mt-0.5">
                  {(fclResult.usable_boxes * unitsPerBox).toLocaleString()} unidades
                </span>
              </div>

              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Utilización de Contenedor:</span>
                <span className="text-sm font-bold text-amber-400 font-mono">
                  {fclResult.volume_utilization_percent}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Peso: {fclResult.weight_utilization_percent}%
                </span>
              </div>
            </div>
          </div>

          {/* FCL Output Card */}
          <div className="lg:col-span-4 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800">
              Resultados FCL ({containerType})
            </h4>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400">Flete por Caja:</span>
                <span className="font-mono text-white font-bold">${fclResult.freight_cost_per_box_usd.toFixed(4)} USD</span>
              </div>

              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-400 block font-medium">FLETE UNITARIO POR VASO:</span>
                <div className="text-lg font-black text-emerald-400 font-mono">
                  ${fclResult.freight_cost_per_unit_usd.toFixed(5)} USD/u
                </div>
                <div className="text-xs font-mono text-emerald-500">
                  Gs. {Math.round(fclResult.freight_cost_per_unit_usd * fxRate).toLocaleString('es-PY')} /u
                </div>
              </div>

              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-400 block font-medium">EXPORTACIÓN TOTAL UNITARIA:</span>
                <div className="text-sm font-bold text-white font-mono">
                  ${fclResult.total_export_cost_per_unit_usd.toFixed(5)} USD/u
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Incluye origen (${fclOriginCharges}), doc (${fclDocCharges}), aduana y seguro.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BREAK-EVEN COMPARISON */}
      {activeTab === 'BREAK_EVEN' && (
        <div className="bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Análisis Comparativo LCL vs Contenedor FCL (Logistics Break-Even)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Punto de equilibrio volumétrico donde contratar un contenedor completo supera a la carga consolidada.
              </p>
            </div>
            <div className="text-right">
              <Badge variant="brand">BREAK-EVEN: {breakEvenResult.break_even_units_20ft.toLocaleString('es-PY')} u</Badge>
            </div>
          </div>

          {/* Break-Even Highlight Banner */}
          <div className="p-4 bg-sky-950/40 border border-sky-800/60 rounded-lg flex items-start gap-3">
            <Scale className="h-5 w-5 text-sky-400 mt-0.5 shrink-0" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-sky-300 block">Regla Operativa de Despacho:</span>
              <p className="text-slate-300 leading-relaxed">
                {breakEvenResult.summary_message}
              </p>
            </div>
          </div>

          {/* Volume Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-left">
                  <th className="py-2.5 font-semibold">Tirada (Unidades)</th>
                  <th className="py-2.5 font-semibold">Cajas</th>
                  <th className="py-2.5 font-semibold">Volumen Total</th>
                  <th className="py-2.5 font-semibold">Flete LCL Unitario</th>
                  <th className="py-2.5 font-semibold">FCL 20FT Unitario</th>
                  <th className="py-2.5 font-semibold">FCL 40HC Unitario</th>
                  <th className="py-2.5 font-semibold">Modalidad Óptima</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {breakEvenResult.volume_breakdown.map((row) => (
                  <tr key={row.volume_units} className="hover:bg-slate-800/20">
                    <td className="py-2.5 text-white font-bold">{row.volume_units.toLocaleString('es-PY')} u</td>
                    <td className="py-2.5 text-slate-300">{row.boxes} cajas</td>
                    <td className="py-2.5 text-slate-400">{row.total_m3} m³</td>
                    <td className="py-2.5 text-slate-300">${row.lcl_unit_cost_usd.toFixed(5)}</td>
                    <td className="py-2.5 text-slate-300">${row.fcl_20ft_unit_cost_usd.toFixed(5)}</td>
                    <td className="py-2.5 text-slate-300">${row.fcl_40hc_unit_cost_usd.toFixed(5)}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.best_method === '40HC'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : row.best_method === '20FT'
                            ? 'bg-sky-950 text-sky-400 border border-sky-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {row.best_method}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LANDED COST CASCADE */}
      {activeTab === 'LANDED' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Cascada de Costos de Exportación (Incoterms 2020)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Construcción progresiva desde costo de fábrica (EXW Asunción) hasta costo puesto en destino.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Arancel Importación (%):</span>
                <input
                  type="number"
                  value={dutiesPercent}
                  onChange={(e) => setDutiesPercent(parseFloat(e.target.value) || 0)}
                  className="w-16 bg-[#0c0f14] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono text-center"
                />
              </div>
            </div>

            {/* Stepped Incoterm Progress Cards */}
            <div className="space-y-3 font-mono text-xs">
              {/* 1. EXW */}
              <div className="bg-[#0c0f14] p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-sans uppercase font-bold block">1. EXW (Ex Works) - Planta Asunción</span>
                  <span className="text-sm font-bold text-white">${landedCost.exw_unit_usd.toFixed(5)} USD/u</span>
                </div>
                <div className="text-right">
                  <span className="text-amber-400 font-bold block">Gs. {landedCost.exw_unit_pyg.toLocaleString('es-PY')} /u</span>
                  <span className="text-[10px] text-slate-500 font-sans">Costo fabril puro</span>
                </div>
              </div>

              {/* 2. FOB */}
              <div className="bg-[#0c0f14] p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-sans uppercase font-bold block">2. FOB (Free On Board) - Puerto Terrestre / Terminal</span>
                  <span className="text-sm font-bold text-sky-400">${landedCost.fob_unit_usd.toFixed(5)} USD/u</span>
                </div>
                <div className="text-right">
                  <span className="text-sky-500 font-bold block">Gs. {landedCost.fob_unit_pyg.toLocaleString('es-PY')} /u</span>
                  <span className="text-[10px] text-slate-500 font-sans">+ Empaque exp. + Logística origen + Documentación</span>
                </div>
              </div>

              {/* 3. CIF */}
              <div className="bg-[#0c0f14] p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-sans uppercase font-bold block">3. CIF (Cost, Insurance & Freight) - Puerto Destino</span>
                  <span className="text-sm font-bold text-amber-400">${landedCost.cif_unit_usd.toFixed(5)} USD/u</span>
                </div>
                <div className="text-right">
                  <span className="text-amber-500 font-bold block">Gs. {landedCost.cif_unit_pyg.toLocaleString('es-PY')} /u</span>
                  <span className="text-[10px] text-slate-500 font-sans">+ Flete internacional (${activeFreightUnitUSD.toFixed(5)}) + Seguro</span>
                </div>
              </div>

              {/* 4. LANDED */}
              <div className="bg-[#0c0f14] p-3.5 rounded-lg border border-emerald-500/50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-400 font-sans uppercase font-bold block">4. LANDED (Costo Final en Depósito Destino)</span>
                  <span className="text-base font-black text-emerald-400">${landedCost.landed_unit_usd.toFixed(5)} USD/u</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-emerald-400 block">Gs. {landedCost.landed_unit_pyg.toLocaleString('es-PY')} /u</span>
                  <span className="text-[10px] text-slate-400 font-sans">+ Arancel importación ({dutiesPercent}%) + Gastos despacho</span>
                </div>
              </div>
            </div>
          </div>

          {/* Benchmark Comparison Card */}
          <div className="lg:col-span-4 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800">
              Competitividad vs Benchmark ({destinationCountry})
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Benchmark de Mercado ({destinationPort}):
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="0.001"
                    value={marketBenchmarkUSD}
                    onChange={(e) => setMarketBenchmarkUSD(parseFloat(e.target.value) || 0.068)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded pl-6 pr-3 py-1.5 text-xs text-white font-mono font-bold"
                  />
                </div>
              </div>

              <div className="bg-[#0c0f14] p-3 rounded border border-slate-800 space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Precio Mercado:</span>
                  <span className="text-white font-bold">${marketBenchmarkUSD.toFixed(4)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Landed Cost NIUPACK:</span>
                  <span className="text-emerald-400 font-bold">${landedCost.landed_unit_usd.toFixed(5)} USD</span>
                </div>
                <div className="border-t border-slate-800 pt-1.5 flex justify-between font-bold">
                  <span className="text-slate-400 font-sans">Margen Bruto Landed:</span>
                  <span className={`${marketBenchmarkUSD > landedCost.landed_unit_usd ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(((marketBenchmarkUSD - landedCost.landed_unit_usd) / marketBenchmarkUSD) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-900/60 rounded border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <span className="font-bold text-slate-200 block">Diagnóstico de Entrada:</span>
                {marketBenchmarkUSD > landedCost.landed_unit_usd ? (
                  <p className="text-emerald-400">
                    ✓ NIUPACK cuenta con una ventaja de costo landed de $
                    {(marketBenchmarkUSD - landedCost.landed_unit_usd).toFixed(5)} USD/u para competir en {destinationPort}.
                  </p>
                ) : (
                  <p className="text-amber-400">
                    ⚠ El costo landed excede el benchmark por $
                    {(landedCost.landed_unit_usd - marketBenchmarkUSD).toFixed(5)} USD/u. Se recomienda migrar a contenedor FCL 40HC o negociar exención arancelaria Mercosur.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
