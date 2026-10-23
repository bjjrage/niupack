import { createStudio } from '../src/studio.mts';
import { loadArtwork, releaseArtwork, MAX_BYTES } from '../src/artwork.mts';
import { DEFAULT_DESIGN } from '../src/layout.mts';

const canvas = document.querySelector<HTMLCanvasElement>('#qa-viewer')!;
canvas.style.width = '640px'; canvas.style.height = '600px';
let contextLost = false;
const studio = createStudio(canvas, (lost) => { contextLost = lost; });
const results = document.querySelector('#results')!;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function fixture(name: string) {
  const response = await fetch(`./fixtures/${name}`);
  assert(response.ok, 'Fixture no disponible');
  return new File([await response.blob()], name);
}
async function check(name: string, action: () => void | Promise<void>) {
  const row = document.createElement('li');
  try { await action(); row.textContent = `PASS · ${name}`; }
  catch (error) { row.textContent = `FAIL · ${name}: ${error instanceof Error ? error.message : String(error)}`; }
  results.append(row);
}
async function captureHasDesign() {
  const blob = await studio.capture();
  assert(blob.size > 10000, 'Captura demasiado pequeña');
  const bitmap = await createImageBitmap(blob);
  const copy = document.createElement('canvas'); copy.width = bitmap.width; copy.height = bitmap.height;
  const ctx = copy.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
  let colored = 0;
  for (let i = 0; i < pixels.length; i += 16) if (pixels[i] > pixels[i + 1] * 1.4 && pixels[i] > pixels[i + 2] * 1.4) colored++;
  assert(colored > 500, 'La captura no contiene el diseño de color esperado');
  copy.width = 0; copy.height = 0;
}
document.querySelector<HTMLButtonElement>('#run')!.addEventListener('click', async (event) => {
  (event.currentTarget as HTMLButtonElement).disabled = true;
  await check('JPG plano decodificado y aplicado sobre el vaso', async () => {
    const art = await loadArtwork(await fixture('design-flat.jpg'));
    assert(art.kind === 'JPG' && art.width === 1200 && art.height === 900, 'Dimensiones o formato incorrectos');
    studio.update(art, DEFAULT_DESIGN, 'white');
    await captureHasDesign(); releaseArtwork(art);
  });
  await check('PNG conserva transparencia y funciona sobre kraft', async () => {
    const art = await loadArtwork(await fixture('logo-transparent.png'));
    const ctx = art.canvas.getContext('2d')!;
    assert(ctx.getImageData(0, 0, 1, 1).data[3] === 0, 'La transparencia se perdió');
    const pixels = ctx.getImageData(0, 0, art.canvas.width, art.canvas.height).data;
    assert(pixels.some((value, index) => index % 4 === 3 && value > 0), 'El logo está vacío');
    studio.update(art, { ...DEFAULT_DESIGN, rotation: 25, x: 30, y: 10 }, 'kraft');
    const png = await studio.capture(); assert(png.size > 10000, 'No se generó la vista kraft'); releaseArtwork(art);
  });
  await check('SVG simple compatible', async () => {
    const art = await loadArtwork(await fixture('simple.svg'));
    assert(art.kind === 'SVG', 'SVG no detectado');
    studio.update(art, DEFAULT_DESIGN, 'white'); await captureHasDesign(); releaseArtwork(art);
  });
  for (const name of ['unsafe.svg', 'broken.jpg']) await check(`Rechazo seguro de ${name}`, async () => {
    let rejected = false;
    try { releaseArtwork(await loadArtwork(await fixture(name))); } catch { rejected = true; }
    assert(rejected, 'Se aceptó un archivo inválido');
  });
  await check('Límite de peso antes de decodificar', async () => {
    let rejected = false;
    try { await loadArtwork(new File([new Uint8Array(MAX_BYTES + 1)], 'large.png')); } catch { rejected = true; }
    assert(rejected, 'Se aceptó un archivo de más de 12 MB');
  });
  await check('Reemplazos sucesivos y liberación del canvas anterior', async () => {
    for (let i = 0; i < 12; i++) {
      const art = await loadArtwork(await fixture(i % 2 ? 'simple.svg' : 'design-flat.jpg'));
      studio.update(art, { ...DEFAULT_DESIGN, x: i * 15 }, i % 2 ? 'kraft' : 'white');
      releaseArtwork(art); assert(art.canvas.width === 0 && art.canvas.height === 0, 'Canvas no liberado');
    }
    const art = await loadArtwork(await fixture('simple.svg'));
    studio.update(art, DEFAULT_DESIGN, 'white');
    await captureHasDesign(); await captureHasDesign(); releaseArtwork(art);
  });
  await check('Pérdida y recuperación del contexto WebGL con diseño conservado', async () => {
    const gl = canvas.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    assert(extension, 'Extensión de prueba no disponible');
    const until = async (condition: () => boolean) => {
      const start = performance.now();
      while (!condition() && performance.now() - start < 6000) await new Promise((resolve) => setTimeout(resolve, 100));
      assert(condition(), 'El contexto no cambió de estado a tiempo');
    };
    extension.loseContext(); await until(() => contextLost);
    await new Promise((resolve) => setTimeout(resolve, 250));
    extension.restoreContext(); await until(() => !contextLost);
    await captureHasDesign();
  });
  document.body.dataset.result = results.textContent?.includes('FAIL') ? 'failed' : 'passed';
  const done = document.createElement('p'); done.id = 'done'; done.textContent = `Finalizado: ${document.body.dataset.result}`; document.body.append(done);
});
