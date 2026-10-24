import { CATALOG_CUPS } from './catalog-data.mts';
import { CUP, type CupShape } from './layout.mts';

export interface CatalogCup {
  readonly id: string;
  readonly sizeOz: number;
  readonly topDiameterMm: number | null;
  readonly heightMm: number | null;
  readonly baseDiameterMm: number | null;
  readonly approximate: boolean;
  readonly sourceWall: 'single' | 'double' | 'unspecified';
}
export const DEMO_MODEL_ID = 'illustrative-demo';
export const CATALOG: readonly CatalogCup[] = CATALOG_CUPS;
// User-authorized visual estimate, derived from the existing demo's taper.
// It is separate from the imported catalog, which retains its missing values.
export const ESTIMATED_BASE_RATIO = CUP.bottom / CUP.top;
export function catalogModel(cup: CatalogCup): { shape: CupShape; baseDiameterMm: number; baseEstimated: boolean } | null {
  const { topDiameterMm: top, heightMm: height } = cup;
  if (top === null || height === null || ![top, height].every((n) => Number.isFinite(n) && n > 0)) return null;
  const baseEstimated = cup.baseDiameterMm === null;
  const base = baseEstimated ? Math.round(top * ESTIMATED_BASE_RATIO * 10) / 10 : cup.baseDiameterMm!;
  if (!Number.isFinite(base) || base <= 0 || base >= top) return null;
  // One scene unit = 100 mm. CylinderGeometry takes radii, not diameters.
  return { shape: { top: top / 200, bottom: base / 200, height: height / 100 }, baseDiameterMm: base, baseEstimated };
}

export function pendingReasons(cup: CatalogCup): string[] {
  const reasons: string[] = [];
  const positive = (value: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!positive(cup.topDiameterMm)) reasons.push('Falta diámetro de boca');
  if (!positive(cup.heightMm)) reasons.push('Falta altura');
  if (!positive(cup.baseDiameterMm)) reasons.push('Falta diámetro de base');
  if (positive(cup.topDiameterMm) && positive(cup.baseDiameterMm) && cup.baseDiameterMm! >= cup.topDiameterMm!) reasons.push('Revisar diámetros de boca y base');
  if (cup.approximate) reasons.push('Medidas aproximadas: falta ficha validada');
  if (cup.sourceWall === 'double') reasons.push('Ficha de pared doble: confirmar pared simple');
  return reasons;
}

export function selectionStatus(id: string): { selectable: boolean; reasons: string[] } {
  if (id === DEMO_MODEL_ID) return { selectable: true, reasons: [] };
  const cup = CATALOG.find((item) => item.id === id);
  if (!cup) return { selectable: false, reasons: ['Modelo no disponible'] };
  return { selectable: catalogModel(cup) !== null, reasons: pendingReasons(cup) };
}

export function formatMm(value: number | null): string {
  return value === null ? 'Pendiente' : new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(value);
}
