import { createStudio } from '../src/studio.mts';
import { loadArtwork, releaseArtwork, MAX_BYTES } from '../src/artwork.mts';
import { DEFAULT_DESIGN, WRAP, textureUV } from '../src/layout.mts';
import { composePrint } from '../src/print.mts';

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
async function capturedColors() {
  const bitmap = await createImageBitmap(await studio.capture());
  const copy = document.createElement('canvas'); copy.width = bitmap.width; copy.height = bitmap.height;
  const ctx = copy.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
  let red = 0, blue = 0, green = 0;
  for (let i = 0; i < pixels.length; i += 16) {
    const [r, g, b] = pixels.slice(i, i + 3);
    if (r > g * 1.4 && r > b * 1.4) red++;
    if (b > r * 1.4 && b > g * 1.2) blue++;
    if (g > r * 1.4 && g > b * 1.2) green++;
  }
  copy.width = 0; copy.height = 0;
  return { red, blue, green };
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
  await check('Regresión: diseño 360° cubre todo el contorno, incluso al desplazarlo por la unión posterior', async () => {
    const artCanvas = document.createElement('canvas'); artCanvas.width = 1800; artCanvas.height = 1100;
    const artContext = artCanvas.getContext('2d')!; artContext.fillStyle = '#d41128'; artContext.fillRect(0, 0, 1800, 1100);
    const art = { canvas: artCanvas, width: 1800, height: 1100, name: 'wrap-regression.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 1200; texture.height = Math.round(1200 * WRAP.height / WRAP.width);
    const ctx = texture.getContext('2d')!;
    for (const x of [-180, -90, 0, 90, 180]) {
      composePrint(ctx, art, { ...DEFAULT_DESIGN, mode: 'wrap', x }, 'white');
      for (let u = 0.025; u < 1; u += 0.05) for (const v of [0.08, 0.3, 0.5, 0.7, 0.92]) {
        const uv = textureUV(u, v, 'wrap');
        const pixel = ctx.getImageData(Math.floor(uv[0] * texture.width), Math.floor((1 - uv[1]) * texture.height), 1, 1).data;
        assert(pixel[0] > 150 && pixel[1] < 70 && pixel[2] < 80, `Zona sin imprimir en x=${x}, u=${u}, v=${v}`);
      }
    }
    artContext.fillStyle = '#0c50f0'; artContext.fillRect(0, 0, 360, 1100);
    artContext.fillStyle = '#10c45d'; artContext.fillRect(1440, 0, 360, 1100);
    studio.update(art, { ...DEFAULT_DESIGN, mode: 'wrap' }, 'white');
    studio.showSide(false); const front = await capturedColors();
    studio.showSide(true); const back = await capturedColors();
    assert(front.red > 5000, 'El diseño central no quedó en el frente');
    assert(back.blue + back.green > 5000, 'El reverso quedó vacío o perdió los extremos del diseño');
    studio.showSide(false); releaseArtwork(art); texture.width = 0; texture.height = 0;
  });
  await check('Regresión: líneas horizontales conservan su altura en toda la circunferencia con x=-180° e y=32%', async () => {
    const source = document.createElement('canvas'); source.width = 1200; source.height = 600;
    const paint = source.getContext('2d')!;
    paint.fillStyle = '#fff'; paint.fillRect(0, 0, 1200, 600);
    paint.fillStyle = '#d41128'; paint.fillRect(0, 292, 1200, 16);
    const art = { canvas: source, width: 1200, height: 600, name: 'horizontal-rule.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 1200; texture.height = Math.round(1200 * WRAP.height / WRAP.width);
    const ctx = texture.getContext('2d')!;
    for (const y of [0, 8, 32]) for (const x of [-180, -90, 0, 90, 180]) {
      composePrint(ctx, art, { ...DEFAULT_DESIGN, mode: 'wrap', x, y }, 'white');
      const centers: number[] = [];
      for (let u = 0.025; u < 1; u += 0.05) {
        const column = ctx.getImageData(Math.floor(u * texture.width), 0, 1, texture.height).data;
        let count = 0, sum = 0;
        for (let row = 0; row < texture.height; row++) if (column[row * 4] > 150 && column[row * 4 + 1] < 70) { count++; sum += row; }
        assert(count > 0, `La línea se cortó al envolver x=${x}, y=${y}, u=${u}`);
        centers.push(sum / count);
      }
      assert(Math.max(...centers) - Math.min(...centers) <= 1, `El movimiento horizontal inclinó la línea: x=${x}, y=${y}`);
      assert(Math.abs(centers[0] - texture.height * (0.5 - y / 100)) <= 2, 'La altura no coincide con el desplazamiento solicitado');
    }
    composePrint(ctx, art, { ...DEFAULT_DESIGN, mode: 'wrap', x: -180 }, 'white');
    const left = ctx.getImageData(0, 0, texture.width, texture.height).data;
    composePrint(ctx, art, { ...DEFAULT_DESIGN, mode: 'wrap', x: 180 }, 'white');
    const right = ctx.getImageData(0, 0, texture.width, texture.height).data;
    assert(left.every((value, index) => value === right[index]), '-180° y +180° no producen la misma envoltura');
    source.width = 0; source.height = 0; texture.width = 0; texture.height = 0;
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
