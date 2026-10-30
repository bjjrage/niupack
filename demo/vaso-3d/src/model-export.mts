import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export async function exportCupModel(group: THREE.Group, name: string): Promise<Blob> {
  const snapshot = group.clone(true);
  snapshot.name = name;
  snapshot.position.set(0, 0, 0);
  // Supplier geometry uses 100 mm per unit; glTF uses meters.
  snapshot.scale.multiplyScalar(0.1);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const canvases: HTMLCanvasElement[] = [];
  function copyTexture(texture: THREE.Texture): THREE.Texture {
    const existing = textures.get(texture);
    if (existing) return existing;
    const copy = texture.clone();
    if (texture.image instanceof HTMLCanvasElement) {
      const image = document.createElement('canvas');
      image.width = texture.image.width; image.height = texture.image.height;
      const context = image.getContext('2d');
      if (!context) throw new Error('No se pudo preparar el modelo 3D.');
      context.drawImage(texture.image, 0, 0);
      // Texture.clone shares its Source, so replace it before assigning pixels.
      copy.source = new THREE.Source(image);
      canvases.push(image);
    }
    textures.set(texture, copy);
    return copy;
  }
  function copyMaterial(material: THREE.Material): THREE.Material {
    const existing = materials.get(material);
    if (existing) return existing;
    const copy = material.clone();
    materials.set(material, copy);
    // glTF has no BackSide mode. Preserve the inside wall in other viewers.
    if (copy.side === THREE.BackSide) copy.side = THREE.DoubleSide;
    if (copy instanceof THREE.MeshStandardMaterial) {
      for (const slot of ['map', 'bumpMap'] as const) {
        if (copy[slot]) copy[slot] = copyTexture(copy[slot]);
      }
    }
    return copy;
  }
  try {
    snapshot.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry = object.geometry.clone();
      geometries.add(object.geometry);
      object.material = Array.isArray(object.material) ? object.material.map(copyMaterial) : copyMaterial(object.material);
    });
    const data = await new GLTFExporter().parseAsync(snapshot, { binary: true, trs: true, onlyVisible: true, maxTextureSize: 2048 });
    if (!(data instanceof ArrayBuffer)) throw new Error('No se pudo generar el archivo GLB.');
    return new Blob([data], { type: 'model/gltf-binary' });
  } catch (error) {
    throw new Error('No se pudo generar el archivo GLB.', { cause: error });
  } finally {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials.values()) material.dispose();
    for (const texture of textures.values()) texture.dispose();
    for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; }
  }
}
