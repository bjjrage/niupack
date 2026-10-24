export interface CupShape { readonly height: number; readonly top: number; readonly bottom: number }
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
    printMargin: 0.045 * cup.height / CUP.height,
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
export interface DesignState { size: number; x: number; y: number; rotation: number; mode: LayoutMode; fullWidth: boolean }
export const DEFAULT_DESIGN: Readonly<DesignState> = { size: 100, x: 0, y: 0, rotation: 0, mode: 'logo', fullWidth: false };

export function suggestedLayout(width: number, height: number): LayoutMode {
  return width / height >= 1.25 ? 'wrap' : 'logo';
}

// Annular development for an isolated logo, using the selected cup's taper.
export function surfaceUV(u: number, v: number, layout = DEFAULT_SURFACE): [number, number] {
  const phi = (u - 0.5) * layout.sectorAngle;
  const radius = (layout.cup.bottom + v * (layout.cup.top - layout.cup.bottom)) / layout.coneRatio;
  return [(radius * Math.sin(phi) + layout.sheet.halfWidth) / layout.sheetWidth, (radius * Math.cos(phi) - layout.sheet.minY) / layout.sheetHeight];
}

// Wrap remains angular: moving around a tapered cup does not rotate fragments.
export function textureUV(u: number, v: number, mode: LayoutMode, layout = DEFAULT_SURFACE): [number, number] {
  return mode === 'wrap' ? [u, v] : surfaceUV(u, v, layout);
}

export function artworkPlacement(width: number, height: number, state: DesignState, layout = DEFAULT_SURFACE) {
  const radius = layout.sheet.inner + layout.slant * (0.5 + state.y / 100);
  const rotation = state.rotation * Math.PI / 180;
  const cover = Math.max(layout.wrap.width / width, (layout.wrap.height - layout.printMargin * 2) / height);
  const logoFit = Math.min(1.08 * layout.cup.top / CUP.top / width, 0.72 * layout.cup.height / CUP.height / height);
  const fit = (state.mode === 'wrap' ? cover : logoFit) * state.size / 100;
  const placedWidth = width * fit;
  const placedHeight = height * fit;
  const rotatedWidth = Math.abs(Math.cos(rotation)) * placedWidth + Math.abs(Math.sin(rotation)) * placedHeight;
  return {
    width: placedWidth,
    height: placedHeight,
    // Stretch only the horizontal axis after rotation; vertical coordinates stay.
    stretchX: state.mode === 'wrap' && state.fullWidth ? layout.wrap.width / rotatedWidth : 1,
    radius,
    angle: state.x / 360 * layout.sectorAngle,
    rotation,
  };
}
