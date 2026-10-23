export const CUP = { height: 1.1, top: 0.45, bottom: 0.3 } as const;
export const SLANT = Math.hypot(CUP.height, CUP.top - CUP.bottom);
export const CONE_RATIO = (CUP.top - CUP.bottom) / SLANT;
export const SECTOR_ANGLE = Math.PI * 2 * CONE_RATIO;
const outer = CUP.top / CONE_RATIO;
const inner = CUP.bottom / CONE_RATIO;
export const SHEET = {
  outer,
  inner,
  halfWidth: outer * Math.sin(SECTOR_ANGLE / 2),
  minY: inner * Math.cos(SECTOR_ANGLE / 2),
  maxY: outer,
};
export const SHEET_WIDTH = SHEET.halfWidth * 2;
export const SHEET_HEIGHT = SHEET.maxY - SHEET.minY;

export type LayoutMode = 'logo' | 'wrap';
export const PRINT_MARGIN = 0.045;
export interface DesignState { size: number; x: number; y: number; rotation: number; mode: LayoutMode }
export const DEFAULT_DESIGN: Readonly<DesignState> = { size: 100, x: 0, y: 0, rotation: 0, mode: 'logo' };

// A suggestion only: the user can always switch layouts explicitly.
export function suggestedLayout(width: number, height: number): LayoutMode {
  return width / height >= 1.25 ? 'wrap' : 'logo';
}

// An annular-sector development, not a rectangular cylinder UV map. Distances
// on the printed sheet follow the actual taper of the paper cup.
export function surfaceUV(circumferenceFraction: number, heightFraction: number): [number, number] {
  const phi = (circumferenceFraction - 0.5) * SECTOR_ANGLE;
  const radius = (CUP.bottom + heightFraction * (CUP.top - CUP.bottom)) / CONE_RATIO;
  return [(radius * Math.sin(phi) + SHEET.halfWidth) / SHEET_WIDTH, (radius * Math.cos(phi) - SHEET.minY) / SHEET_HEIGHT];
}

export function artworkPlacement(width: number, height: number, state: DesignState) {
  const radius = SHEET.inner + SLANT * (0.5 + state.y / 100);
  const rotation = state.rotation * Math.PI / 180;
  // For full artwork, cover the actual annular sector with one uniformly scaled
  // image. Sampling the boundary also accounts for image rotation and offset;
  // enlarging a front-logo rectangle cannot cover the cone's back or its corners.
  let cover = 0;
  if (state.mode === 'wrap') {
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    for (const edge of [SHEET.inner + PRINT_MARGIN, SHEET.outer - PRINT_MARGIN]) {
      for (let i = 0; i <= 96; i++) {
        const phi = (i / 96 - 0.5) * SECTOR_ANGLE;
        const dx = edge * Math.sin(phi);
        const dy = radius - edge * Math.cos(phi);
        cover = Math.max(cover, Math.abs(dx * cos + dy * sin) * 2 / width, Math.abs(-dx * sin + dy * cos) * 2 / height);
      }
    }
  }
  const fit = (state.mode === 'wrap' ? cover * 1.002 : Math.min(1.08 / width, 0.72 / height)) * state.size / 100;
  return {
    width: width * fit,
    height: height * fit,
    radius,
    angle: state.x / 360 * SECTOR_ANGLE,
    rotation,
  };
}
