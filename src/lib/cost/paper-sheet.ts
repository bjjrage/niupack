// Paper sheets ("pliegos") are quoted in centimetres (70 x 100 is a standard sheet), while the cost
// engine stores and computes in millimetres. These helpers keep the screen in cm without touching
// the stored unit, so existing data and the engine stay unchanged.

export function mmToCm(mm: number): number {
  return Number.isFinite(mm) ? Number((mm / 10).toFixed(2)) : 0;
}

export function cmToMm(cm: number): number {
  return Number.isFinite(cm) ? Number((cm * 10).toFixed(1)) : 0;
}

/** Surface of paper available per unit, in cm². Zero when any input is missing. */
export function sheetAreaPerUnitCm2(widthMm: number, heightMm: number, unitsPerSheet: number): number {
  if (!(widthMm > 0) || !(heightMm > 0) || !(unitsPerSheet > 0)) return 0;
  return (widthMm / 10) * (heightMm / 10) / unitsPerSheet;
}

// A cup body blank is roughly 80-400 cm². Far outside this range the measures were almost
// certainly typed in the wrong unit (e.g. cm entered as mm gives ~4 cm² per unit).
const MIN_PLAUSIBLE_CM2 = 20;
const MAX_PLAUSIBLE_CM2 = 1000;

export function sheetMeasuresLookWrong(widthMm: number, heightMm: number, unitsPerSheet: number): string | null {
  const area = sheetAreaPerUnitCm2(widthMm, heightMm, unitsPerSheet);
  if (area === 0) return null;
  if (area < MIN_PLAUSIBLE_CM2 || area > MAX_PLAUSIBLE_CM2) {
    return `Superficie por unidad: ${area.toLocaleString('es-PY', { maximumFractionDigits: 1 })} cm². Verifique las medidas del pliego (en cm) y las unidades por pliego.`;
  }
  return null;
}
