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

export interface DesignState { size: number; x: number; y: number; rotation: number }
export const DEFAULT_DESIGN: Readonly<DesignState> = { size: 100, x: 0, y: 0, rotation: 0 };

// An annular-sector development, not a rectangular cylinder UV map. Distances
// on the printed sheet follow the actual taper of the paper cup.
export function surfaceUV(circumferenceFraction: number, heightFraction: number): [number, number] {
  const phi = (circumferenceFraction - 0.5) * SECTOR_ANGLE;
  const radius = (CUP.bottom + heightFraction * (CUP.top - CUP.bottom)) / CONE_RATIO;
  return [(radius * Math.sin(phi) + SHEET.halfWidth) / SHEET_WIDTH, (radius * Math.cos(phi) - SHEET.minY) / SHEET_HEIGHT];
}

export function artworkPlacement(width: number, height: number, state: DesignState) {
  const fit = Math.min(1.08 / width, 0.72 / height) * state.size / 100;
  return {
    width: width * fit,
    height: height * fit,
    radius: SHEET.inner + SLANT * (0.5 + state.y / 100),
    angle: state.x / 360 * SECTOR_ANGLE,
    rotation: state.rotation * Math.PI / 180,
  };
}
