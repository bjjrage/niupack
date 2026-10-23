import type { Artwork } from './artwork.mts';
import { SHEET, SHEET_WIDTH, SHEET_HEIGHT, SECTOR_ANGLE, PRINT_MARGIN, WRAP, artworkPlacement, type DesignState } from './layout.mts';

function clipSector(ctx: CanvasRenderingContext2D, scale: number): void {
  const start = -Math.PI / 2 - SECTOR_ANGLE / 2;
  const end = -Math.PI / 2 + SECTOR_ANGLE / 2;
  ctx.beginPath();
  ctx.arc(0, 0, (SHEET.outer - PRINT_MARGIN) * scale, start, end);
  ctx.arc(0, 0, (SHEET.inner + PRINT_MARGIN) * scale, end, start, true);
  ctx.closePath(); ctx.clip();
}

function composeWrap(ctx: CanvasRenderingContext2D, artwork: Artwork, state: DesignState): void {
  const { width, height } = ctx.canvas;
  const placement = artworkPlacement(artwork.canvas.width, artwork.canvas.height, state);
  const margin = PRINT_MARGIN / WRAP.height * height;
  const shift = state.x / 360 * width;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, margin, width, height - margin * 2); ctx.clip();
  for (const turn of [-1, 0, 1]) {
    ctx.save();
    // Disjoint rectangular tiles translate around the circumference without
    // rotating their contents or overlaying the neighbouring part of the image.
    ctx.translate(turn * width + shift, 0);
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    ctx.translate(width / 2, height / 2 - state.y / 100 * height);
    ctx.scale(width / WRAP.width, height / WRAP.height);
    ctx.rotate(placement.rotation);
    ctx.drawImage(artwork.canvas, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
    ctx.restore();
  }
  ctx.restore();
}

// The mesh and preview use the same composition and coordinate convention.
export function composePrint(ctx: CanvasRenderingContext2D, artwork: Artwork | null, state: DesignState, paper: 'white' | 'kraft'): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = paper === 'white' ? '#faf8f2' : '#be996e';
  ctx.fillRect(0, 0, width, height);
  if (!artwork) return;
  if (state.mode === 'wrap') { composeWrap(ctx, artwork, state); return; }
  // An isolated logo retains the metric annular projection.
  const scale = width / SHEET_WIDTH;
  const placement = artworkPlacement(artwork.canvas.width, artwork.canvas.height, state);
  ctx.save();
  ctx.translate(width / 2, SHEET.maxY * scale);
  clipSector(ctx, scale);
  for (const turn of [-1, 0, 1]) {
    const phi = placement.angle + turn * SECTOR_ANGLE;
    ctx.save();
    ctx.rotate(phi);
    ctx.translate(0, -placement.radius * scale);
    ctx.rotate(placement.rotation);
    ctx.drawImage(artwork.canvas, -placement.width * scale / 2, -placement.height * scale / 2, placement.width * scale, placement.height * scale);
    ctx.restore();
  }
  ctx.restore();
}

export function drawPrintPreview(canvas: HTMLCanvasElement, artwork: Artwork | null, state: DesignState, paper: 'white' | 'kraft'): void {
  const ratio = state.mode === 'wrap' ? WRAP.height / WRAP.width : SHEET_HEIGHT / SHEET_WIDTH;
  const height = Math.round(canvas.width * ratio);
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  composePrint(ctx, artwork, state, paper);
  ctx.save();
  ctx.strokeStyle = '#7d8574'; ctx.lineWidth = 1.25;
  ctx.setLineDash([4, 4]);
  if (state.mode === 'wrap') {
    const margin = PRINT_MARGIN / WRAP.height * canvas.height;
    ctx.strokeRect(0.75, margin, canvas.width - 1.5, canvas.height - margin * 2);
  } else {
    const scale = canvas.width / SHEET_WIDTH;
    const angle = SECTOR_ANGLE / 2;
    ctx.translate(canvas.width / 2, SHEET.maxY * scale);
    ctx.beginPath();
    ctx.arc(0, 0, (SHEET.outer - PRINT_MARGIN) * scale, -Math.PI / 2 - angle, -Math.PI / 2 + angle);
    ctx.arc(0, 0, (SHEET.inner + PRINT_MARGIN) * scale, -Math.PI / 2 + angle, -Math.PI / 2 - angle, true);
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}
