import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractCatalog } from '../scripts/catalog-source.mjs';
import { CATALOG, DEMO_MODEL_ID, catalogModel, pendingReasons, selectionStatus, type CatalogCup } from '../src/catalog.mts';
import { createSurfaceLayout, artworkPlacement, textureUV, DEFAULT_DESIGN } from '../src/layout.mts';

test('the demo imports the actual website catalog without changing or inventing measurements', async () => {
  const source = await readFile(new URL('../../../js/showroom.js', import.meta.url), 'utf8');
  assert.deepEqual(CATALOG, extractCatalog(source));
  assert.deepEqual(CATALOG.map((cup) => cup.sizeOz), [4, 6, 8, 12, 16, 21, 24]);
  const cup = CATALOG.find((item) => item.sizeOz === 12)!;
  assert.equal(cup.topDiameterMm, 83.8);
  assert.equal(cup.heightMm, 110);
  assert.equal(cup.baseDiameterMm, null);
});

test('missing catalog bases stay missing in source data, while authorized demo estimates enable previews', () => {
  for (const cup of CATALOG) {
    assert.equal(cup.baseDiameterMm, null);
    assert.ok(pendingReasons(cup).includes('Falta diámetro de base'));
    assert.equal(selectionStatus(cup.id).selectable, true);
    const model = catalogModel(cup)!;
    assert.equal(model.baseEstimated, true);
    assert.ok(model.baseDiameterMm > 0 && model.baseDiameterMm < cup.topDiameterMm!);
    assert.equal(model.shape.top * 200, cup.topDiameterMm);
    assert.ok(Math.abs(model.shape.height * 100 - cup.heightMm!) < 1e-10);
  }
  assert.equal(selectionStatus(DEMO_MODEL_ID).selectable, true);
  assert.equal(selectionStatus('cup-not-in-catalog').selectable, false);
});

test('real base measurements replace estimates; invalid or incomplete shape data stays unavailable', () => {
  const cup = CATALOG.find((item) => item.sizeOz === 12)!;
  const measured = catalogModel({ ...cup, baseDiameterMm: 57 })!;
  assert.equal(measured.baseEstimated, false);
  assert.equal(measured.baseDiameterMm, 57);
  for (const base of [0, -1, NaN, Infinity, 90]) assert.equal(catalogModel({ ...cup, baseDiameterMm: base }), null);
  assert.equal(catalogModel({ ...cup, heightMm: null }), null);
  assert.equal(catalogModel({ ...cup, topDiameterMm: 0 }), null);
});

test('all catalog shapes develop one full circumference and keep width fitting independent of vertical placement', () => {
  const state = { ...DEFAULT_DESIGN, mode: 'wrap' as const, size: 50, x: -137, y: 12, rotation: -9 };
  const unchanged = { ...state };
  const layouts = CATALOG.map((cup) => createSurfaceLayout(catalogModel(cup)!.shape));
  assert.ok(layouts[0].cup.height !== layouts[6].cup.height);
  for (const layout of layouts) {
    assert.ok(Math.abs(layout.sheet.outer * layout.sectorAngle - 2 * Math.PI * layout.cup.top) < 1e-10);
    assert.ok(Math.abs(layout.sheet.inner * layout.sectorAngle - 2 * Math.PI * layout.cup.bottom) < 1e-10);
    assert.deepEqual(textureUV(0.23, 0.7, 'wrap', layout), [0.23, 0.7]);
    const free = artworkPlacement(1800, 1100, state, layout);
    const fit = artworkPlacement(1800, 1100, { ...state, fullWidth: true }, layout);
    assert.equal(fit.height, free.height);
    assert.equal(fit.radius, free.radius);
    const rotatedWidth = Math.abs(Math.cos(fit.rotation)) * fit.width + Math.abs(Math.sin(fit.rotation)) * fit.height;
    assert.ok(Math.abs(rotatedWidth * fit.stretchX - layout.wrap.width) < 1e-10);
    for (const u of [0, 0.5, 1]) for (const v of [0, 1]) assert.ok(textureUV(u, v, 'logo', layout).every(Number.isFinite));
  }
  assert.deepEqual(state, unchanged);
});

test('approximate and double-wall source measurements keep their pending validation notes', () => {
  assert.ok(pendingReasons(CATALOG.find((cup) => cup.sizeOz === 4)!).some((reason) => reason.includes('aproximadas')));
  for (const size of [16, 21, 24]) assert.ok(pendingReasons(CATALOG.find((cup) => cup.sizeOz === size)!).some((reason) => reason.includes('pared doble')));
});

test('zero, negative, nonfinite and inverted measurements cannot qualify as verified geometry', () => {
  const sample: CatalogCup = { id: 'test-only', sizeOz: 12, heightMm: 110, topDiameterMm: 83.8, baseDiameterMm: 55, approximate: false, sourceWall: 'single' };
  assert.deepEqual(pendingReasons(sample), []);
  for (const value of [null, 0, -1, NaN, Infinity]) {
    assert.ok(pendingReasons({ ...sample, baseDiameterMm: value }).includes('Falta diámetro de base'));
  }
  assert.ok(pendingReasons({ ...sample, baseDiameterMm: 90 }).some((reason) => reason.includes('Revisar diámetros')));
});

test('the catalog importer rejects ambiguous, executable or invalid measurement sources', () => {
  for (const source of [
    'const cupDimensions = {}; function another() { const cupDimensions = {}; }',
    "const cupDimensions = {'12 oz': {diameter: compute(), height: '110'}};",
    "const cupDimensions = {'12 oz': {diameter: '83,8', height: '0'}};",
    "const cupDimensions = {'12 oz': {diameter: '83,8'}, '12 oz': {diameter: '90'}};",
  ]) assert.throws(() => extractCatalog(source));
});
