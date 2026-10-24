import { SUPPLIER_MODELS } from './catalog-data.mts';
import { t, pageLocale } from '../integration/i18n.js';
import type { CupShape } from './layout.mts';

export interface SupplierModel {
  readonly id: string;
  readonly supplier: string;
  readonly family: 'cup' | 'pot';
  readonly wall: 'single' | 'double';
  readonly sizeOz: number;
  readonly heightMm: number;
  readonly rimOuterDiameterMm: number;
  readonly mouthInnerDiameterMm?: number;
  readonly footDiameterMm: number;
  readonly bottomFormingDiameterMm: number;
  readonly rollDiameterMm: number;
  readonly rimDropMm: number;
  readonly wallAngleDeg?: number;
  readonly paperThicknessMm?: number;
  readonly bottomRecessMm: number;
  readonly innerModelId?: string;
  readonly innerWallAngleDeg?: number;
  readonly sleeveAngleDeg?: number;
  readonly innerPaperThicknessMm?: number;
  readonly sleeveThicknessMm?: number;
  readonly exposedBaseHeightMm?: number;
  readonly sleeveBottomRollDiameterMm?: number;
  readonly sleeveLowerOuterDiameterMm?: number;
  readonly source: { readonly file: string; readonly folder: string; readonly page: number; readonly date: string; readonly revision: number | null; readonly sha256: string };
  readonly die: { readonly outerRadiusMm: number; readonly innerRadiusMm: number; readonly angleDeg: number; readonly radialWidthMm: number };
}
export const CATALOG: readonly SupplierModel[] = SUPPLIER_MODELS;
export const DEFAULT_MODEL_ID = 'cup-12oz';
export const PENDING_MODELS = [
  { id: 'cup-4oz', label: 'Vaso 4 oz — ficha pendiente' },
  { id: 'cup-24oz', label: 'Vaso 24 oz — ficha pendiente' },
] as const;
export function modelLabel(model: SupplierModel): string {
  return t((model.family === 'pot' ? 'Pote ' : 'Vaso ') + model.sizeOz + ' oz · ' + (model.wall === 'double' ? 'Pared doble' : 'Pared simple'));
}

// Supplied drawing callouts define the foot, wall angle, finished height and
// rolled rim independently. A mouth/rim diameter is never the cone diameter.
export function catalogModel(model: SupplierModel): { shape: CupShape; baseDiameterMm: number; baseEstimated: false } | null {
  const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (![model.heightMm, model.rimOuterDiameterMm, model.footDiameterMm, model.rollDiameterMm, model.rimDropMm, model.bottomRecessMm].every(positive)) return null;
  if (model.footDiameterMm >= model.rimOuterDiameterMm || model.rimDropMm >= model.heightMm) return null;
  const double = model.wall === 'double';
  const inner = double ? CATALOG.find((m) => m.id === model.innerModelId && m.wall === 'single') : model;
  const angle = double ? model.innerWallAngleDeg : model.wallAngleDeg;
  const thickness = double ? model.innerPaperThicknessMm : model.paperThicknessMm;
  const opening = model.mouthInnerDiameterMm ?? inner?.mouthInnerDiameterMm;
  if (!inner || !positive(angle) || angle >= 45 || !positive(thickness) || !positive(opening)) return null;
  const slope = Math.tan(angle * Math.PI / 180);
  const bodyTop = model.heightMm - model.rimDropMm;
  const foot = model.footDiameterMm / 2;
  const innerOuterTop = foot + bodyTop * slope;
  const surfaceBottom = double ? model.exposedBaseHeightMm! : 0;
  if (!Number.isFinite(surfaceBottom) || surfaceBottom < 0 || surfaceBottom >= bodyTop) return null;
  let top = innerOuterTop;
  let bottom = foot;
  if (double) {
    if (!positive(model.sleeveAngleDeg) || model.sleeveAngleDeg >= 45 || !positive(model.sleeveThicknessMm) || !positive(model.sleeveBottomRollDiameterMm)) return null;
    const sleeveSlope = Math.tan(model.sleeveAngleDeg * Math.PI / 180);
    if (model.sleeveLowerOuterDiameterMm !== undefined) {
      if (!positive(model.sleeveLowerOuterDiameterMm)) return null;
      bottom = model.sleeveLowerOuterDiameterMm / 2;
      top = bottom + (bodyTop - surfaceBottom) * sleeveSlope;
    } else {
      // The 9 oz sleeve has angle/thickness/top attachment dimensions; its
      // lower diameter follows those dimensions, without a guessed ratio.
      top = innerOuterTop + model.sleeveThicknessMm;
      bottom = top - (bodyTop - surfaceBottom) * sleeveSlope;
    }
  }
  const floorRadius = foot + model.bottomRecessMm * slope - thickness;
  if (!(top > bottom && bottom > 0 && floorRadius > 0 && bodyTop > model.bottomRecessMm && model.rimOuterDiameterMm > opening)) return null;
  return {
    baseDiameterMm: model.footDiameterMm, baseEstimated: false,
    shape: {
      top: top / 100, bottom: bottom / 100, height: (bodyTop - surfaceBottom) / 100,
      // The print surface is the visible wall; folding allowances belong to
      // the separate source dieline, not to an invented proportional margin.
      printMargin: 0,
      defaultFrontFit: model.family === 'pot' ? 'cover' : 'contain',
      details: {
        fullHeight: model.heightMm / 100, surfaceBottom: surfaceBottom / 100,
        bodyTop: bodyTop / 100, foot: foot / 100, innerSlope: slope,
        innerTop: (innerOuterTop - thickness) / 100, innerBottom: floorRadius / 100,
        floorHeight: model.bottomRecessMm / 100, wallThickness: thickness / 100,
        rimOuter: model.rimOuterDiameterMm / 200, rimInner: opening / 200,
        rimHeight: model.rollDiameterMm / 100, sleeve: double,
        sleeveBottomRoll: (model.sleeveBottomRollDiameterMm ?? 0) / 100,
      },
    },
  };
}
export function selectionStatus(id: string): { selectable: boolean; reasons: string[] } {
  const model = CATALOG.find((item) => item.id === id);
  return model && catalogModel(model)
    ? { selectable: true, reasons: [] }
    : { selectable: false, reasons: ['Falta ficha completa del proveedor'] };
}
export function formatMm(value: number | null): string {
  return value === null ? t('Pendiente') : new Intl.NumberFormat(pageLocale(), { maximumFractionDigits: 2 }).format(value);
}
