export interface CupDetails {
  readonly fullHeight: number;
  readonly surfaceBottom: number;
  readonly bodyTop: number;
  readonly foot: number;
  readonly innerSlope: number;
  readonly innerTop: number;
  readonly innerBottom: number;
  readonly floorHeight: number;
  readonly wallThickness: number;
  readonly rimOuter: number;
  readonly rimInner: number;
  readonly rimHeight: number;
  readonly sleeve: boolean;
  readonly sleeveBottomRoll: number;
}
export interface CupShape {
  readonly height: number; readonly top: number; readonly bottom: number;
  readonly printMargin?: number;
  readonly defaultFrontFit?: FrontFit;
  readonly details?: CupDetails;
}
export const CUP: CupShape = { height: 1.1, top: 0.45, bottom: 0.3 };

export function createSurfaceLayout(cup: CupShape) {
  if (![cup.height, cup.top, cup.bottom].every((n) => Number.isFinite(n) && n > 0) || cup.bottom >= cup.top) {
    throw new Error('Las medidas del vaso deben ser positivas y la base menor que la boca.');
  }
  const slant = Math.hypot(cup.height, cup.top - cup.bottom);
  const coneRatio = (cup.top - cup.bottom) / slant;
  const sectorAngle = Math.PI * 2 * coneRatio;
  const outer = cup.top / coneRatio;
  const inner = cup.bottom / coneRatio;
  const sheet = {
    outer, inner,
    halfWidth: outer * Math.sin(sectorAngle / 2),
    minY: inner * Math.cos(sectorAngle / 2),
    maxY: outer,
  };
  return {
    cup: { ...cup }, slant, coneRatio, sectorAngle, sheet,
    sheetWidth: sheet.halfWidth * 2,
    sheetHeight: sheet.maxY - sheet.minY,
    printMargin: cup.printMargin ?? 0.045 * cup.height / CUP.height,
    wrap: { width: Math.PI * (cup.top + cup.bottom), height: slant },
  };
}
export type SurfaceLayout = ReturnType<typeof createSurfaceLayout>;
export const DEFAULT_SURFACE = createSurfaceLayout(CUP);
// Retain the original constants for the existing prototype and regression tests.
export const SLANT = DEFAULT_SURFACE.slant;
export const CONE_RATIO = DEFAULT_SURFACE.coneRatio;
export const SECTOR_ANGLE = DEFAULT_SURFACE.sectorAngle;
export const SHEET = DEFAULT_SURFACE.sheet;
export const SHEET_WIDTH = DEFAULT_SURFACE.sheetWidth;
export const SHEET_HEIGHT = DEFAULT_SURFACE.sheetHeight;
export const PRINT_MARGIN = DEFAULT_SURFACE.printMargin;
export const WRAP = DEFAULT_SURFACE.wrap;

export type LayoutMode = 'logo' | 'wrap';
export type FrontFit = 'contain' | 'cover';
export interface DesignState { size: number; x: number; y: number; rotation: number; mode: LayoutMode; fullWidth: boolean; duplicateBack: boolean; frontFit: FrontFit | 'auto' }
export const DEFAULT_DESIGN: Readonly<DesignState> = { size: 100, x: 0, y: 0, rotation: 0, mode: 'logo', fullWidth: false, duplicateBack: false, frontFit: 'auto' };

export function frontFitMode(state: DesignState, layout = DEFAULT_SURFACE): FrontFit {
  return state.frontFit === 'auto' ? layout.cup.defaultFrontFit ?? 'contain' : state.frontFit;
}

// Annular development for an isolated logo, using the selected cup's taper.
export function surfaceUV(u: number, v: number, layout = DEFAULT_SURFACE): [number, number] {
  const phi = (u - 0.5) * layout.sectorAngle;
  const radius = (layout.cup.bottom + v * (layout.cup.top - layout.cup.bottom)) / layout.coneRatio;
  return [(radius * Math.sin(phi) + layout.sheet.halfWidth) / layout.sheetWidth, (radius * Math.cos(phi) - layout.sheet.minY) / layout.sheetHeight];
}

// Both applications use angular coordinates. A fixed 180° face occupies
// exactly half the circumference at every height, including on tapered cups.
export function textureUV(u: number, v: number, _mode: LayoutMode, _layout = DEFAULT_SURFACE): [number, number] {
  return [u, v];
}

export function artworkPlacement(width: number, height: number, state: DesignState, layout = DEFAULT_SURFACE) {
  const radius = layout.sheet.inner + layout.slant * (0.5 + state.y / 100);
  const rotation = state.rotation * Math.PI / 180;
  const cover = Math.max(layout.wrap.width / width, (layout.wrap.height - layout.printMargin * 2) / height);
  const fitWidth = layout.wrap.width / 2 / width;
  const fitHeight = (layout.wrap.height - layout.printMargin * 2) / height;
  const logoFit = frontFitMode(state, layout) === 'cover' ? Math.max(fitWidth, fitHeight) : Math.min(fitWidth, fitHeight);
  const fit = (state.mode === 'wrap' ? cover : logoFit) * state.size / 100;
  const placedWidth = width * fit;
  const placedHeight = height * fit;
  const rotatedWidth = Math.abs(Math.cos(rotation)) * placedWidth + Math.abs(Math.sin(rotation)) * placedHeight;
  return {
    width: placedWidth,
    height: placedHeight,
    // Stretch only the horizontal axis after rotation; vertical coordinates stay.
    stretchX: state.mode === 'wrap' && state.fullWidth ? layout.wrap.width / rotatedWidth : 1,
    boundsWidth: rotatedWidth,
    boundsHeight: Math.abs(Math.sin(rotation)) * placedWidth + Math.abs(Math.cos(rotation)) * placedHeight,
    radius,
    angle: state.x / 360 * layout.sectorAngle,
    rotation,
  };
}
