import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CATALOG, catalogModel } from '../src/catalog.mts';
import { createCupParts } from '../src/cup-geometry.mts';
import { studioView } from '../src/view.mts';

for (const [width, height, mobile] of [[980, 600, false], [640, 600, false], [340, 540, true]] as const) {
  test(`one camera preserves catalog size differences and fits every model at ${width}×${height}`, () => {
    const view = studioView(mobile);
    const camera = new THREE.PerspectiveCamera(31, width / height, 0.05, 40);
    camera.position.set(...view.position);
    camera.lookAt(new THREE.Vector3(...view.target));
    camera.setViewOffset(width, height, mobile ? 0 : -width * 0.1, -height * (mobile ? 0.12 : 0.03), width, height);
    camera.updateMatrixWorld();
    const material = new THREE.MeshBasicMaterial();
    const sizes = new Map<string, THREE.Vector2>();
    for (const model of CATALOG) {
      const parts = createCupParts(catalogModel(model)!.shape, { exterior: material, inside: material, paper: material, bottom: material });
      parts.group.updateMatrixWorld(true);
      const screen = new THREE.Box2();
      parts.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const vertices = object.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(object.matrixWorld).project(camera);
          screen.expandByPoint(new THREE.Vector2(point.x, point.y));
        }
      });
      assert.ok(screen.min.x > -0.95 && screen.max.x < 0.95 && screen.min.y > -0.95 && screen.max.y < 0.95, `${model.id} is clipped`);
      sizes.set(model.id, screen.getSize(new THREE.Vector2()));
      parts.disposeGeometry();
    }
    material.dispose();
    const size = (id: string) => sizes.get(id)!;
    assert.ok(size('cup-12oz').y > size('cup-9oz').y * 1.15, '12 oz must look taller than 9 oz');
    assert.ok(size('cup-16oz').y > size('cup-12oz').y * 1.1, '16 oz must look taller than 12 oz');
    assert.ok(size('cup-21oz').y > size('cup-16oz').y * 1.2, '21 oz must look taller than 16 oz');
    assert.ok(size('pot-8oz').x > size('pot-5oz').x * 1.3, '8 oz pot must look wider than 5 oz');
    assert.ok(size('pot-8oz').y > size('pot-5oz').y * 1.15, '8 oz pot must look taller than 5 oz');
    assert.ok(size('pot-5oz').y > size('pot-3oz').y * 1.08, '5 oz pot must look taller than 3 oz');
  });
}
