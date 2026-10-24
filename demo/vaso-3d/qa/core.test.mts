import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterMetadata, checkDimensions, MAX_PIXELS } from '../src/artwork.mts';
import { surfaceUV, textureUV, artworkPlacement, DEFAULT_DESIGN, WRAP, PRINT_MARGIN, SHEET_WIDTH, SHEET_HEIGHT, CUP, suggestedLayout } from '../src/layout.mts';

test('PNG dimensions are read from content before allocating an image', () => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1600); view.setUint32(20, 900);
  assert.deepEqual(rasterMetadata(bytes), { kind: 'PNG', width: 1600, height: 900 });
});
test('baseline and progressive JPEG dimensions are supported', () => {
  for (const marker of [0xc0, 0xc2]) {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, marker, 0, 8, 8, 3, 132, 6, 64, 3]);
    assert.deepEqual(rasterMetadata(bytes), { kind: 'JPG', width: 1600, height: 900 });
  }
});
test('invalid, truncated and spoofed raster content is rejected', () => {
  for (const bytes of [new Uint8Array(), Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 20]), new TextEncoder().encode('<script>bad</script>')]) {
    assert.throws(() => rasterMetadata(bytes));
  }
});
test('pixel limits apply even when the encoded file is small', () => {
  for (const size of [[0, 100], [-1, 10], [Infinity, 10], [9000, 1], [5000, 5000]]) assert.throws(() => checkDimensions(...size));
  assert.equal(MAX_PIXELS, 16_000_000);
  assert.doesNotThrow(() => checkDimensions(4000, 4000));
});
test('annular-sector UVs stay within texture bounds and are symmetric at the seam', () => {
  for (let u = 0; u <= 1; u += 0.01) for (let v = 0; v <= 1; v += 0.05) {
    const [x, y] = surfaceUV(u, v);
    assert.ok(x >= -1e-10 && x <= 1 + 1e-10 && y >= -1e-10 && y <= 1 + 1e-10);
  }
  assert.ok(Math.abs(surfaceUV(0, 0.5)[0] + surfaceUV(1, 0.5)[0] - 1) < 1e-10);
  assert.ok(Math.abs(surfaceUV(0, 0.5)[1] - surfaceUV(1, 0.5)[1]) < 1e-10);
});
test('the physical scale of the sheet accounts for taper', () => {
  const step = 1e-6;
  const a = surfaceUV(0.5, 0);
  const b = surfaceUV(0.5 + step, 0);
  const c = surfaceUV(0.5, 1);
  const d = surfaceUV(0.5 + step, 1);
  const lowerDistance = Math.hypot((b[0] - a[0]) * SHEET_WIDTH, (b[1] - a[1]) * SHEET_HEIGHT);
  const upperDistance = Math.hypot((d[0] - c[0]) * SHEET_WIDTH, (d[1] - c[1]) * SHEET_HEIGHT);
  assert.ok(Math.abs(upperDistance / lowerDistance - CUP.top / CUP.bottom) < 1e-6);
});
test('portrait, square and landscape artwork preserves its proportions at all supported sizes', () => {
  for (const mode of ['logo', 'wrap'] as const) for (const [width, height] of [[100, 500], [1000, 1000], [2000, 300]]) for (const size of [10, 35, 90, 100, 180, 400]) {
    const result = artworkPlacement(width, height, { ...DEFAULT_DESIGN, mode, size });
    assert.ok(Math.abs(result.width / result.height - width / height) < 1e-10);
  }
});

test('full circumference width preserves chosen height and position at every supported scale', () => {
  for (const [width, height] of [[1800, 1100], [1000, 1000], [400, 1200]]) for (const size of [10, 50, 90, 100, 180, 400]) {
    const state = { ...DEFAULT_DESIGN, mode: 'wrap' as const, size, x: -180, y: 8 };
    const before = artworkPlacement(width, height, state);
    const after = artworkPlacement(width, height, { ...state, fullWidth: true });
    assert.equal(after.height, before.height);
    assert.equal(after.radius, before.radius);
    assert.equal(after.angle, before.angle);
    assert.ok(Math.abs(after.width * after.stretchX - WRAP.width) < 1e-10);
    assert.equal(state.size, size);
  }
});

test('width fitting acts along the circumference after rotation, preserving the vertical extent', () => {
  for (const rotation of [-180, -90, -9, 0, 27, 90, 180]) {
    const state = { ...DEFAULT_DESIGN, mode: 'wrap' as const, size: 90, rotation };
    const before = artworkPlacement(1800, 1100, state);
    const after = artworkPlacement(1800, 1100, { ...state, fullWidth: true });
    const horizontalExtent = Math.abs(Math.cos(after.rotation)) * after.width + Math.abs(Math.sin(after.rotation)) * after.height;
    assert.ok(Math.abs(horizontalExtent * after.stretchX - WRAP.width) < 1e-10);
    assert.equal(after.height, before.height);
    assert.equal(after.width, before.width);
    assert.equal(after.rotation, before.rotation);
    assert.ok(Number.isFinite(after.stretchX) && after.stretchX > 0);
  }
  assert.equal(artworkPlacement(1800, 1100, { ...DEFAULT_DESIGN, fullWidth: true }).stretchX, 1);
});
test('a wide composition suggests wrap, while square and portrait artwork start as a logo', () => {
  assert.equal(suggestedLayout(1800, 1100), 'wrap');
  assert.equal(suggestedLayout(1000, 1000), 'logo');
  assert.equal(suggestedLayout(500, 900), 'logo');
});
test('wrap uses equal angular steps and constant wall height throughout the circumference', () => {
  for (const height of [0, 0.2, 0.5, 0.8, 1]) for (let angle = 0; angle <= 1; angle += 0.05) {
    const uv = textureUV(angle, height, 'wrap');
    assert.equal(uv[0], angle);
    assert.equal(uv[1], height);
  }
});
test('wrap initial fit covers the rectangular print band with uniform image scale', () => {
  for (const [width, height] of [[1800, 1100], [1000, 1000], [400, 1200]]) {
    const place = artworkPlacement(width, height, { ...DEFAULT_DESIGN, mode: 'wrap' });
    assert.ok(place.width >= WRAP.width - 1e-10);
    assert.ok(place.height >= WRAP.height - PRINT_MARGIN * 2 - 1e-10);
  }
});
test('horizontal movement, vertical movement and rotation do not implicitly resize the wrap image', () => {
  const base = artworkPlacement(1800, 1100, { ...DEFAULT_DESIGN, mode: 'wrap' });
  for (const x of [-180, -90, 0, 90, 180]) for (const y of [-38, 8, 32, 38]) for (const rotation of [-140, -9, 0, 27, 90]) {
    const place = artworkPlacement(1800, 1100, { ...DEFAULT_DESIGN, mode: 'wrap', x, y, rotation });
    assert.equal(place.width, base.width);
    assert.equal(place.height, base.height);
  }
});
