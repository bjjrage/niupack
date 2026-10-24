import type { Artwork } from './artwork.mts';
import { DEFAULT_SURFACE, artworkPlacement, type DesignState, type SurfaceLayout } from './layout.mts';

// The editable face is rendered once, clipped to a fixed 180° rectangle.
// The rear face receives these same pixels, never a second transformed image.
const frontFaces = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();
function composeFront(ctx: CanvasRenderingContext2D, artwork: Artwork, state: DesignState, layout: SurfaceLayout): HTMLCanvasElement {
  let face = frontFaces.get(ctx);
  if (!face) { face = document.createElement('canvas'); frontFaces.set(ctx, face); }
  const w = Math.ceil(ctx.canvas.width / 2), h = ctx.canvas.height;
  if (face.width !== w || face.height !== h) { face.width = w; face.height = h; }
  const paint = face.getContext('2d')!;
  paint.clearRect(0, 0, w, h);
  const margin = layout.printMargin / layout.wrap.height * h;
  const placement = artworkPlacement(artwork.canvas.width, artwork.canvas.height, state, layout);
  paint.save();
  paint.beginPath(); paint.rect(0, margin, w, h - margin * 2); paint.clip();
  // x is local to the front face; ±90° places its center on a side boundary.
  const x = Math.max(-90, Math.min(90, state.x));
  paint.translate(w / 2 + x / 180 * w, h / 2 - state.y / 100 * h);
  paint.scale(w / (layout.wrap.width / 2), h / layout.wrap.height);
  paint.rotate(placement.rotation);
  paint.drawImage(artwork.canvas, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
  paint.restore();
  return face;
}

function composeWrap(ctx: CanvasRenderingContext2D, artwork: Artwork, state: DesignState, layout: SurfaceLayout): void {
  const { wrap: WRAP, printMargin: PRINT_MARGIN } = layout;
  const { width, height } = ctx.canvas;
  const placement = artworkPlacement(artwork.canvas.width, artwork.canvas.height, state, layout);
  const margin = PRINT_MARGIN / WRAP.height * height;
  const shift = state.x / 360 * width;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, margin, width, height - margin * 2); ctx.clip();
  for (const turn of [-1, 0, 1]) {
    ctx.save();
    ctx.translate(turn * width + shift, 0);
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    ctx.translate(width / 2, height / 2 - state.y / 100 * height);
    ctx.scale(width / WRAP.width, height / WRAP.height);
    ctx.scale(placement.stretchX, 1);
    ctx.rotate(placement.rotation);
    ctx.drawImage(artwork.canvas, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
    ctx.restore();
  }
  ctx.restore();
}

function paperBackground(ctx: CanvasRenderingContext2D, paper: 'white' | 'kraft'): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = paper === 'white' ? '#faf8f2' : '#be996e';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// Real texture order is back-left / full front / back-right. Each destination
// is disjoint; even oversized or rotated art cannot cross a side boundary.
export function composePrint(ctx: CanvasRenderingContext2D, artwork: Artwork | null, state: DesignState, paper: 'white' | 'kraft', layout = DEFAULT_SURFACE): void {
  paperBackground(ctx, paper);
  if (!artwork) return;
  if (state.mode === 'wrap') { composeWrap(ctx, artwork, state, layout); return; }
  const face = composeFront(ctx, artwork, state, layout);
  const { width, height } = ctx.canvas;
  ctx.drawImage(face, width / 4, 0, width / 2, height);
  if (state.duplicateBack) {
    ctx.drawImage(face, 0, 0, face.width / 2, face.height, width * 3 / 4, 0, width / 4, height);
    ctx.drawImage(face, face.width / 2, 0, face.width / 2, face.height, 0, 0, width / 4, height);
  }
}

export function drawPrintPreview(canvas: HTMLCanvasElement, artwork: Artwork | null, state: DesignState, paper: 'white' | 'kraft', layout = DEFAULT_SURFACE): void {
  const height = Math.round(canvas.width * layout.wrap.height / layout.wrap.width);
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (state.mode === 'wrap') composePrint(ctx, artwork, state, paper, layout);
  else {
    // Show both complete faces side by side, rather than splitting the rear
    // composition at the texture seam. The same clipped face feeds the mesh.
    paperBackground(ctx, paper);
    if (artwork) {
      const face = composeFront(ctx, artwork, state, layout);
      ctx.drawImage(face, 0, 0, canvas.width / 2, height);
      if (state.duplicateBack) ctx.drawImage(face, canvas.width / 2, 0, canvas.width / 2, height);
    }
  }
  ctx.save();
  ctx.strokeStyle = '#7d8574'; ctx.lineWidth = 1.25; ctx.setLineDash([4, 4]);
  const margin = layout.printMargin / layout.wrap.height * canvas.height;
  ctx.strokeRect(0.75, margin + 0.75, canvas.width - 1.5, canvas.height - margin * 2 - 1.5);
  if (state.mode === 'logo') {
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, margin); ctx.lineTo(canvas.width / 2, canvas.height - margin); ctx.stroke();
  }
  ctx.restore();
}
