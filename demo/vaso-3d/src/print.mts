import type { Artwork } from './artwork.mts';
import { SHEET, SHEET_WIDTH, SECTOR_ANGLE, PRINT_MARGIN, artworkPlacement, type DesignState } from './layout.mts';

function clipSector(ctx: CanvasRenderingContext2D, scale: number): void {
  const start = -Math.PI / 2 - SECTOR_ANGLE / 2;
  const end = -Math.PI / 2 + SECTOR_ANGLE / 2;
  ctx.beginPath();
  ctx.arc(0, 0, (SHEET.outer - PRINT_MARGIN) * scale, start, end);
  ctx.arc(0, 0, (SHEET.inner + PRINT_MARGIN) * scale, end, start, true);
  ctx.closePath(); ctx.clip();
}

// Shared by the GPU texture and the flat preview. Each copy owns one wedge,
// so large wrap artwork cannot overwrite the neighbouring side of the cup.
export function composePrint(ctx: CanvasRenderingContext2D, artwork: Artwork | null, state: DesignState, paper: 'white' | 'kraft'): void {
  const { width, height } = ctx.canvas;
  const scale = width / SHEET_WIDTH;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = paper === 'white' ? '#faf8f2' : '#be996e';
  ctx.fillRect(0, 0, width, height);
  if (!artwork) return;
  const placement = artworkPlacement(artwork.canvas.width, artwork.canvas.height, state);
  ctx.save();
  ctx.translate(width / 2, SHEET.maxY * scale);
  clipSector(ctx, scale);
  for (const turn of [-1, 0, 1]) {
    const phi = placement.angle + turn * SECTOR_ANGLE;
    ctx.save();
    ctx.rotate(phi);
    if (state.mode === 'wrap') clipSector(ctx, scale);
    ctx.translate(0, -placement.radius * scale);
    ctx.rotate(placement.rotation);
    ctx.drawImage(artwork.canvas, -placement.width * scale / 2, -placement.height * scale / 2, placement.width * scale, placement.height * scale);
    ctx.restore();
  }
  ctx.restore();
}

export function drawPrintPreview(canvas: HTMLCanvasElement, artwork: Artwork | null, state: DesignState, paper: 'white' | 'kraft'): void {
  const ctx = canvas.getContext('2d')!;
  composePrint(ctx, artwork, state, paper);
  const scale = canvas.width / SHEET_WIDTH;
  const angle = SECTOR_ANGLE / 2;
  ctx.save();
  ctx.translate(canvas.width / 2, SHEET.maxY * scale);
  ctx.strokeStyle = '#7d8574'; ctx.lineWidth = 1.25;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, (SHEET.outer - PRINT_MARGIN) * scale, -Math.PI / 2 - angle, -Math.PI / 2 + angle);
  ctx.arc(0, 0, (SHEET.inner + PRINT_MARGIN) * scale, -Math.PI / 2 + angle, -Math.PI / 2 - angle, true);
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}
