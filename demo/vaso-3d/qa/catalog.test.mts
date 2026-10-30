import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { validateSupplierData } from '../scripts/supplier-source.mjs';
import { CATALOG, DEFAULT_MODEL_ID, PENDING_MODELS, catalogModel, previewModel, selectionStatus, type SupplierModel } from '../src/catalog.mts';
import { createSurfaceLayout, artworkPlacement, textureUV, DEFAULT_DESIGN, frontFitMode } from '../src/layout.mts';
import { createCupParts } from '../src/cup-geometry.mts';

test('supplier drawings replace the old showroom measurements with ten identified models', async () => {
  const source = JSON.parse(await readFile(new URL('../data/supplier-models.json', import.meta.url), 'utf8'));
  assert.deepEqual(CATALOG, validateSupplierData(source));
  assert.equal(CATALOG.length, 10);
  const expected = [
    ['cup-6oz', 71.99, 49.34, 76.5], ['cup-9oz', 77.8, 54.94, 87],
    ['cup-12oz', 83.2, 55.3, 109], ['cup-16oz', 89.7, 61.46, 124.5], ['cup-21oz', 89.7, 60.63, 166],
    ['pot-3oz', 70.4, 57.84, 40], ['pot-5oz', 71.6, 57.8, 46], ['pot-8oz', 97.01, 78.36, 54],
    ['cup-9oz-double', 77.83, 54.94, 87], ['cup-12oz-double', 83.21, 55.3, 109],
  ] as const;
  for (const [id, rim, foot, height] of expected) {
    const model = CATALOG.find((m) => m.id === id)!;
    assert.deepEqual([model.rimOuterDiameterMm, model.footDiameterMm, model.heightMm], [rim, foot, height]);
    assert.match(model.source.sha256, /^[a-f0-9]{64}$/);
    assert.equal(catalogModel(model)!.baseEstimated, false);
    assert.equal(selectionStatus(id).selectable, true);
  }
});

test('21 oz preview is 15 percent shorter without changing width or supplier measurements', () => {
  const model = CATALOG.find(item => item.id === 'cup-21oz')!;
  const original = JSON.stringify(model);
  const source = catalogModel(model)!.shape;
  const preview = previewModel(model)!.shape;
  const material = new THREE.MeshBasicMaterial();
  const parts = createCupParts(preview, { exterior: material, inside: material, paper: material, bottom: material });
  const bounds = new THREE.Box3().setFromObject(parts.group), size = bounds.getSize(new THREE.Vector3());
  assert.equal(model.heightMm, 166);
  assert.equal(JSON.stringify(model), original);
  assert.ok(Math.abs(size.y * 100 - 166 * 0.85) < 0.0001);
  assert.ok(Math.abs(size.x * 100 - model.rimOuterDiameterMm) < 0.0001);
  assert.equal(preview.top, source.top); assert.equal(preview.bottom, source.bottom);
  assert.equal(preview.nominalHeightMm, 166); assert.equal(preview.visualHeightScale, 0.85);
  assert.deepEqual(parts.group.userData, { nominalHeightMm: 166, visualHeightScale: 0.85 });
  const layout = createSurfaceLayout(preview);
  const artwork = artworkPlacement(1200, 900, DEFAULT_DESIGN, layout);
  assert.ok(Math.abs(artwork.width / artwork.height - 1200 / 900) < 1e-12, 'Artwork proportions changed');
  for (const other of CATALOG.filter(item => item.id !== model.id)) assert.deepEqual(previewModel(other), catalogModel(other));
  parts.disposeGeometry(); material.dispose();
});

test('8 oz is a Mingyuan pot and the replacement drinking cup is 9 oz; missing sheets stay disabled', () => {
  assert.equal(CATALOG.some((m) => m.family === 'cup' && m.sizeOz === 8), false);
  assert.equal(CATALOG.find((m) => m.id === 'pot-8oz')!.supplier, 'Mingyuan');
  assert.equal(CATALOG.find((m) => m.id === 'cup-9oz')!.supplier, 'Ruida');
  assert.equal(DEFAULT_MODEL_ID, 'cup-12oz');
  assert.equal(selectionStatus('cup-8oz').selectable, false);
  for (const model of PENDING_MODELS) assert.equal(selectionStatus(model.id).selectable, false);
});

test('the foot, angle, paper thickness and floor elevation reproduce the separately dimensioned bottom', () => {
  for (const model of CATALOG) {
    const d = catalogModel(model)!.shape.details!;
    assert.ok(Math.abs(d.innerBottom * 200 - model.bottomFormingDiameterMm) < 0.025, model.id + ': bottom-forming diameter mismatch');
    assert.ok(Math.abs(d.foot * 200 - model.footDiameterMm) < 1e-10);
    assert.ok(Math.abs(d.floorHeight * 100 - model.bottomRecessMm) < 1e-10);
    assert.ok(d.rimOuter > catalogModel(model)!.shape.top, 'Rolled mouth must project beyond the wall');
  }
});

test('double-wall models have their own sleeve angle, bottom roll and exposed inner cup', () => {
  for (const size of [9, 12]) {
    const single = CATALOG.find((m) => m.id === 'cup-' + size + 'oz')!;
    const double = CATALOG.find((m) => m.id === 'cup-' + size + 'oz-double')!;
    const one = catalogModel(single)!.shape;
    const two = catalogModel(double)!.shape;
    assert.equal(one.details!.sleeve, false);
    assert.equal(two.details!.sleeve, true);
    assert.equal(two.details!.surfaceBottom, 0.12);
    assert.ok(Math.abs((two.top - two.bottom) / two.height - Math.tan(double.sleeveAngleDeg! * Math.PI / 180)) < 1e-12);
    assert.ok(two.top > one.top);
  }
});

test('render meshes match finished height and rolled rim diameter instead of stretching the rim with the wall', () => {
  const material = new THREE.MeshBasicMaterial();
  for (const model of CATALOG) {
    const shape = catalogModel(model)!.shape;
    const parts = createCupParts(shape, { exterior: material, inside: material, paper: material, bottom: material });
    const box = new THREE.Box3().setFromObject(parts.group);
    assert.ok(Math.abs((box.max.y - 0.025) * 100 - model.heightMm) < 0.0001, model.id + ': total height');
    assert.ok(Math.abs(box.min.y - 0.025) < 1e-7, model.id + ': foot plane');
    assert.ok(Math.abs((box.max.x - box.min.x) * 100 - model.rimOuterDiameterMm) < 0.0001, model.id + ': rolled rim');
    assert.ok(Math.abs(parts.exterior.position.y - (shape.details!.surfaceBottom + shape.height / 2)) < 1e-10);
    assert.equal(Boolean(parts.group.getObjectByName('sleeve-bottom-roll')), model.wall === 'double');
    const floor = parts.group.getObjectByName('inner-floor')!;
    assert.equal(floor.position.y, model.bottomRecessMm / 100);
    parts.group.traverse((mesh) => { if (mesh instanceof THREE.Mesh) assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)); });
    parts.disposeGeometry();
  }
  material.dispose();
});

test('real model layouts retain image proportions and one-circumference width fitting at the chosen height', () => {
  const state = { ...DEFAULT_DESIGN, mode: 'wrap' as const, size: 50, x: -137, y: 12, rotation: -9 };
  const unchanged = { ...state };
  for (const model of CATALOG) {
    const layout = createSurfaceLayout(catalogModel(model)!.shape);
    assert.ok(Math.abs(layout.sheet.outer * layout.sectorAngle - 2 * Math.PI * layout.cup.top) < 1e-10);
    assert.deepEqual(textureUV(0.23, 0.7, 'wrap', layout), [0.23, 0.7]);
    const free = artworkPlacement(1800, 1100, state, layout);
    const fit = artworkPlacement(1800, 1100, { ...state, fullWidth: true }, layout);
    assert.ok(Math.abs(free.width / free.height - 1800 / 1100) < 1e-10);
    assert.equal(fit.height, free.height);
    assert.equal(fit.radius, free.radius);
    const rotatedWidth = Math.abs(Math.cos(fit.rotation)) * fit.width + Math.abs(Math.sin(fit.rotation)) * fit.height;
    assert.ok(Math.abs(rotatedWidth * fit.stretchX - layout.wrap.width) < 1e-10);
  }
  assert.deepEqual(state, unchanged);
});

test('pots start with proportional coverage of each half; cups retain full-art fitting and explicit choices persist', () => {
  for (const model of CATALOG) {
    const layout = createSurfaceLayout(catalogModel(model)!.shape);
    assert.equal(frontFitMode(DEFAULT_DESIGN, layout), model.family === 'pot' ? 'cover' : 'contain');
    for (const [w, h] of [[1672, 941], [1200, 1200], [600, 1400]]) {
      const contain = artworkPlacement(w, h, { ...DEFAULT_DESIGN, frontFit: 'contain' }, layout);
      const cover = artworkPlacement(w, h, { ...DEFAULT_DESIGN, frontFit: 'cover' }, layout);
      assert.ok(contain.width <= layout.wrap.width / 2 + 1e-10 && contain.height <= layout.wrap.height + 1e-10);
      assert.ok(cover.width >= layout.wrap.width / 2 - 1e-10 && cover.height >= layout.wrap.height - 1e-10);
      assert.ok(Math.abs(cover.width / cover.height - w / h) < 1e-10);
      assert.equal(cover.stretchX, 1);
      assert.equal(frontFitMode({ ...DEFAULT_DESIGN, frontFit: 'contain' }, layout), 'contain');
      assert.equal(frontFitMode({ ...DEFAULT_DESIGN, frontFit: 'cover' }, layout), 'cover');
    }
  }
});

test('incomplete or invalid dimensions cannot fall back to estimated proportions', async () => {
  const model = CATALOG.find((m) => m.id === 'cup-12oz')!;
  for (const value of [0, -1, NaN, Infinity, 100]) assert.equal(catalogModel({ ...model, footDiameterMm: value }), null);
  const raw = JSON.parse(await readFile(new URL('../data/supplier-models.json', import.meta.url), 'utf8'));
  for (const field of ['footDiameterMm', 'rimOuterDiameterMm', 'heightMm']) {
    const invalid = structuredClone(raw); delete invalid.models[0][field];
    assert.throws(() => validateSupplierData(invalid));
  }
  const duplicate = structuredClone(raw); duplicate.models.push(duplicate.models[0]);
  assert.throws(() => validateSupplierData(duplicate));
  const missingInner = structuredClone(raw); missingInner.models = missingInner.models.filter((m: SupplierModel) => m.id !== 'cup-9oz');
  assert.throws(() => validateSupplierData(missingInner));
});
