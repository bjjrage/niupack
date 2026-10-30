import * as THREE from 'three';
import type { CupShape, CupDetails } from './layout.mts';

export interface CupMaterials {
  exterior: THREE.Material; inside: THREE.Material; paper: THREE.Material; bottom: THREE.Material;
}
function legacyDetails(shape: CupShape): CupDetails {
  const slope = (shape.top - shape.bottom) / shape.height;
  return {
    fullHeight: shape.height + 0.019, surfaceBottom: 0, bodyTop: shape.height,
    foot: shape.bottom, innerSlope: slope, floorHeight: 0.056, wallThickness: 0.015,
    innerTop: shape.top - 0.015, innerBottom: shape.bottom + 0.056 * slope - 0.015,
    rimOuter: shape.top + 0.013, rimInner: shape.top - 0.025, rimHeight: 0.038,
    sleeve: false, sleeveBottomRoll: 0,
  };
}
function lathe(points: Array<[number, number]>): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 192, Math.PI);
}
function rolledEdge(centerRadius: number, centerY: number, horizontalRadius: number, verticalRadius: number): THREE.LatheGeometry {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= 48; i++) {
    const angle = i / 48 * Math.PI * 2;
    points.push([centerRadius + horizontalRadius * Math.cos(angle), centerY + verticalRadius * Math.sin(angle)]);
  }
  return lathe(points);
}
export function createCupParts(shape: CupShape, materials: CupMaterials) {
  const d = shape.details ?? legacyDetails(shape);
  const group = new THREE.Group();
  group.name = 'supplier-cup';
  if (shape.visualHeightScale !== undefined) {
    group.userData = { nominalHeightMm: shape.nominalHeightMm, visualHeightScale: shape.visualHeightScale };
  }
  group.position.y = 0.025;
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, name: string, y = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  }
  const exterior = add(new THREE.CylinderGeometry(shape.top, shape.bottom, shape.height, 192, 32, true, Math.PI), materials.exterior, 'printed-wall', d.surfaceBottom + shape.height / 2);
  const insideHeight = d.bodyTop - d.floorHeight;
  add(new THREE.CylinderGeometry(d.innerTop, d.innerBottom, insideHeight, 160, 1, true), materials.inside, 'inner-wall', d.floorHeight + insideHeight / 2);
  const centerRadius = (d.rimOuter + d.rimInner) / 2;
  const rimHorizontal = (d.rimOuter - d.rimInner) / 2;
  const rimVertical = d.rimHeight / 2;
  const centerY = d.fullHeight - rimVertical;
  add(rolledEdge(centerRadius, centerY, rimHorizontal, rimVertical), materials.paper, 'rolled-rim');
  // Join the supplied wall profile to the lower inner quarter of the roll.
  const joinR = centerRadius - rimHorizontal / Math.SQRT2;
  const joinY = centerY - rimVertical / Math.SQRT2;
  add(lathe([[shape.top, d.bodyTop], [joinR, joinY]]), materials.paper, 'rim-neck');
  add(lathe([[d.innerTop, d.bodyTop], [d.rimInner, centerY]]), materials.inside, 'inner-rim-neck');
  if (d.sleeve) {
    const lowerTop = d.foot + d.surfaceBottom * d.innerSlope;
    add(new THREE.CylinderGeometry(lowerTop, d.foot, d.surfaceBottom, 160, 1, true), materials.paper, 'exposed-inner-cup', d.surfaceBottom / 2);
    const rollRadius = d.sleeveBottomRoll / 2;
    add(rolledEdge(shape.bottom - rollRadius, d.surfaceBottom + rollRadius, rollRadius, rollRadius), materials.paper, 'sleeve-bottom-roll');
  }
  // The recessed floor is positioned at its drawing elevation, not at the
  // foot plane. Its radius agrees with the separate bottom-forming dimension.
  const floor = add(new THREE.CircleGeometry(d.innerBottom, 160), materials.paper, 'inner-floor', d.floorHeight);
  floor.rotation.x = -Math.PI / 2;
  const underside = add(new THREE.CircleGeometry(d.innerBottom, 160), materials.bottom, 'floor-underside', d.floorHeight);
  underside.rotation.x = Math.PI / 2;
  const footInside = Math.max(0.001, d.foot - d.wallThickness);
  add(new THREE.CylinderGeometry(d.innerBottom, footInside, d.floorHeight, 160, 1, true), materials.inside, 'under-floor-wall', d.floorHeight / 2);
  add(lathe([[footInside, 0], [d.foot, 0]]), materials.paper, 'foot-fold');
  return {
    group, exterior,
    disposeGeometry() { group.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); },
  };
}
