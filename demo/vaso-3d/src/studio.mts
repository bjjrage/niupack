import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Artwork } from './artwork.mts';
import { CUP, SHEET_WIDTH, SHEET_HEIGHT, textureUV, type DesignState, type LayoutMode } from './layout.mts';
import { composePrint } from './print.mts';

export type Paper = 'white' | 'kraft';
export interface Studio {
  update(artwork: Artwork | null, state: DesignState, paper: Paper): void;
  resetView(): void;
  showSide(back: boolean): void;
  zoom(factor: number): void;
  rotate(horizontal: number, vertical?: number): void;
  capture(): Promise<Blob>;
  dispose(): void;
}

function noiseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(256, 256);
  let seed = 712;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const value = 110 + (seed % 40);
    image.data[i] = value; image.data[i + 1] = value; image.data[i + 2] = value; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 5);
  return texture;
}

function contactShadow(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(128, 128, 15, 128, 128, 125);
  gradient.addColorStop(0, 'rgba(43,37,26,0.31)');
  gradient.addColorStop(0.3, 'rgba(43,37,26,0.22)');
  gradient.addColorStop(0.6, 'rgba(43,37,26,0.07)');
  gradient.addColorStop(1, 'rgba(43,37,26,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.35), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.04, 0.002, 0.04);
  return shadow;
}

export function createStudio(canvas: HTMLCanvasElement, onContext: (lost: boolean) => void): Studio {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'default', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eeede8');
  scene.fog = new THREE.Fog('#eeede8', 6, 15);
  const camera = new THREE.PerspectiveCamera(31, 1, 0.05, 40);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.61, 0);
  controls.enablePan = false;
  controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.65;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = Math.PI / 2 + 0.09;
  controls.minDistance = 1.95;
  controls.maxDistance = 5.4;
  camera.position.set(0, 1.54, 3.35);
  controls.update();
  controls.saveState();

  function makeEnvironment() {
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const result = pmrem.fromScene(environment, 0.04);
    environment.dispose(); pmrem.dispose();
    return result;
  }
  let envMap = makeEnvironment();
  scene.environment = envMap.texture;
  scene.environmentIntensity = 0.32;
  scene.add(new THREE.HemisphereLight('#ffffff', '#9d9483', 1.45));
  const key = new THREE.DirectionalLight('#fff8ed', 2.5);
  key.position.set(-2.8, 4.5, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.3; key.shadow.camera.right = 2.3;
  key.shadow.camera.top = 2.3; key.shadow.camera.bottom = -2.3;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 12;
  key.shadow.normalBias = 0.018; key.shadow.bias = -0.0002;
  key.shadow.radius = 6;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#f4f7ff', 0.65);
  fill.position.set(3, 2, -1.4); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#e5e2da', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor, contactShadow());

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = Math.min(window.innerWidth < 780 ? 1024 : 2048, renderer.capabilities.maxTextureSize);
  textureCanvas.height = Math.round(textureCanvas.width * SHEET_HEIGHT / SHEET_WIDTH);
  const ctx = textureCanvas.getContext('2d')!;
  const printTexture = new THREE.CanvasTexture(textureCanvas);
  printTexture.colorSpace = THREE.SRGBColorSpace;
  printTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const grain = noiseTexture();
  const exteriorMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', map: printTexture, bumpMap: grain, bumpScale: 0.0012, roughness: 0.87, metalness: 0 });
  const insideMaterial = new THREE.MeshStandardMaterial({ color: '#eee9dd', roughness: 0.78, side: THREE.BackSide, bumpMap: grain, bumpScale: 0.0006 });
  const paperMaterial = new THREE.MeshStandardMaterial({ color: '#f5f1e7', roughness: 0.84, bumpMap: grain, bumpScale: 0.0009 });
  const bottomMaterial = new THREE.MeshStandardMaterial({ color: '#ded8c9', roughness: 0.88 });
  const cup = new THREE.Group();
  cup.position.y = 0.025;
  const bodyGeometry = new THREE.CylinderGeometry(CUP.top, CUP.bottom, CUP.height, 192, 32, true, Math.PI);
  const uv = bodyGeometry.getAttribute('uv');
  const nativeUV = Float32Array.from(uv.array);
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = textureUV(nativeUV[i * 2], nativeUV[i * 2 + 1], 'logo');
    uv.setXY(i, u, v);
  }
  const exterior = new THREE.Mesh(bodyGeometry, exteriorMaterial);
  exterior.position.y = CUP.height / 2;
  exterior.castShadow = true; exterior.receiveShadow = true;
  cup.add(exterior);
  const interior = new THREE.Mesh(new THREE.CylinderGeometry(CUP.top - 0.015, CUP.bottom - 0.015, CUP.height - 0.055, 160, 1, true), insideMaterial);
  interior.position.y = CUP.height / 2 + 0.0275;
  interior.receiveShadow = true; cup.add(interior);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(CUP.top - 0.006, 0.019, 20, 192), paperMaterial);
  rim.rotation.x = Math.PI / 2; rim.position.y = CUP.height;
  rim.castShadow = true; rim.receiveShadow = true; cup.add(rim);
  const bottomRim = new THREE.Mesh(new THREE.TorusGeometry(CUP.bottom - 0.008, 0.012, 12, 160), paperMaterial);
  bottomRim.rotation.x = Math.PI / 2; bottomRim.position.y = 0.012;
  bottomRim.castShadow = true; cup.add(bottomRim);
  const innerBase = new THREE.Mesh(new THREE.CircleGeometry(CUP.bottom - 0.014, 160), paperMaterial);
  innerBase.rotation.x = -Math.PI / 2; innerBase.position.y = 0.056;
  innerBase.receiveShadow = true; cup.add(innerBase);
  const base = new THREE.Mesh(new THREE.CircleGeometry(CUP.bottom - 0.01, 160), bottomMaterial);
  base.rotation.x = Math.PI / 2; base.position.y = 0.025; cup.add(base);
  scene.add(cup);

  let frame = 0;
  let disposed = false;
  let contextLost = false;
  let exportInProgress = false;
  let mobileLayout: boolean | null = null;
  let mappedMode: LayoutMode = 'logo';
  function invalidate(): void {
    if (!frame && !disposed && !contextLost && !document.hidden && !exportInProgress) frame = requestAnimationFrame(render);
  }
  function render(): void {
    frame = 0;
    if (disposed || contextLost) return;
    controls.update();
    renderer.render(scene, camera);
  }
  function resize(): void {
    if (exportInProgress) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const mobile = window.innerWidth < 780;
    if (mobile !== mobileLayout) {
      mobileLayout = mobile;
      camera.position.set(0, mobile ? 1.62 : 1.54, mobile ? 3.65 : 3.35);
      controls.update(); controls.saveState();
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.setViewOffset(width, height, mobile ? 0 : -width * 0.1, -height * (mobile ? 0.12 : 0.03), width, height);
    camera.updateProjectionMatrix();
    invalidate();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  controls.addEventListener('change', invalidate);
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { resize(); invalidate(); } };
  const lost = (event: Event) => { event.preventDefault(); contextLost = true; cancelAnimationFrame(frame); frame = 0; onContext(true); };
  const restored = () => {
    contextLost = false;
    // Render targets have no CPU pixel source and must be regenerated after loss.
    envMap.dispose(); envMap = makeEnvironment(); scene.environment = envMap.texture;
    printTexture.needsUpdate = true; grain.needsUpdate = true;
    onContext(false); resize(); invalidate();
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', resize);
  resize();

  return {
    update(artwork, state, paper) {
      if (mappedMode !== state.mode) {
        for (let i = 0; i < uv.count; i++) {
          const [u, v] = textureUV(nativeUV[i * 2], nativeUV[i * 2 + 1], state.mode);
          uv.setXY(i, u, v);
        }
        uv.needsUpdate = true;
        mappedMode = state.mode;
      }
      const color = paper === 'white' ? '#f5f1e7' : '#b68d60';
      paperMaterial.color.set(color);
      bottomMaterial.color.set(paper === 'white' ? '#ddd7c9' : '#a57f53');
      composePrint(ctx, artwork, state, paper);
      printTexture.needsUpdate = true;
      invalidate();
    },
    resetView() { controls.reset(); invalidate(); },
    showSide(back) {
      // Reset first to clear any damping left from a drag, then choose a known
      // front/back angle. Loading a new image always returns to its front.
      controls.reset();
      if (back) {
        const offset = camera.position.clone().sub(controls.target);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        camera.position.copy(controls.target).add(offset);
        controls.update();
      }
      invalidate();
    },
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset); controls.update(); invalidate();
    },
    rotate(horizontal, vertical = 0) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += horizontal;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + vertical, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update(); invalidate();
    },
    async capture() {
      if (contextLost || disposed) throw new Error('El visor no está disponible. Esperá a que se recupere o volvé a cargar la página.');
      if (exportInProgress) throw new Error('Ya hay una descarga en preparación.');
      exportInProgress = true;
      const size = renderer.getSize(new THREE.Vector2());
      const ratio = renderer.getPixelRatio();
      const oldAspect = camera.aspect;
      const output = document.createElement('canvas');
      try {
        cancelAnimationFrame(frame); frame = 0;
        const width = window.innerWidth < 780 ? 1200 : 1600;
        const height = Math.round(width / oldAspect);
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
        output.width = width; output.height = height;
        const outputContext = output.getContext('2d');
        if (!outputContext) throw new Error('No se pudo preparar la captura.');
        // Copy immediately while WebGL's drawing buffer is still valid.
        outputContext.drawImage(canvas, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => output.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo generar el PNG.')), 'image/png'));
        return blob;
      } finally {
        output.width = 0; output.height = 0;
        renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false);
        camera.aspect = oldAspect; camera.updateProjectionMatrix();
        exportInProgress = false; resize(); invalidate();
      }
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      observer.disconnect(); controls.dispose();
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshBasicMaterial && material.map && material.map !== printTexture) material.map.dispose();
            material.dispose();
          }
        }
      });
      printTexture.dispose(); grain.dispose(); envMap.dispose(); key.shadow.dispose(); renderer.dispose();
      textureCanvas.width = 0; textureCanvas.height = 0;
    },
  };
}
