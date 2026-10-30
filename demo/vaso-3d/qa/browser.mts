import { createStudio } from '../src/studio.mts';
import { loadArtwork, releaseArtwork, MAX_BYTES } from '../src/artwork.mts';
import { CUP, DEFAULT_DESIGN, WRAP, textureUV, createSurfaceLayout } from '../src/layout.mts';
import { CATALOG, catalogModel } from '../src/catalog.mts';
import { composePrint } from '../src/print.mts';
import { pdfFixture } from './pdf-fixture.mjs';

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
  let red = 0, blue = 0, green = 0, redSumX = 0, blueSumX = 0;
  for (let i = 0; i < pixels.length; i += 16) {
    const [r, g, b] = pixels.slice(i, i + 3);
    if (r > g * 1.4 && r > b * 1.4) { red++; redSumX += (i / 4) % copy.width; }
    if (b > r * 1.4 && b > g * 1.2) { blue++; blueSumX += (i / 4) % copy.width; }
    if (g > r * 1.4 && g > b * 1.2) green++;
  }
  copy.width = 0; copy.height = 0;
  return { red, blue, green, redX: redSumX / red, blueX: blueSumX / blue };
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
  await check('PDF: primera página, texto y color, proporciones y aplicación 3D', async () => {
    const art = await loadArtwork(new File([pdfFixture()], 'design.pdf', { type: 'application/pdf' }));
    try {
      assert(art.kind === 'PDF' && art.width === 1536 && art.height === 2048, 'PDF con dimensiones incorrectas');
      const pixels = art.canvas.getContext('2d')!.getImageData(0, 0, art.width, art.height).data;
      let red = 0, blue = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        if (pixels[i] > pixels[i + 1] * 1.4 && pixels[i] > pixels[i + 2] * 1.4) red++;
        if (pixels[i + 2] > pixels[i] * 1.4) blue++;
      }
      assert(red > 1000 && blue === 0, 'Se usó una página distinta de la primera');
      studio.update(art, DEFAULT_DESIGN, 'white'); await captureHasDesign();
    } finally { releaseArtwork(art); }
  });
  await check('PDF: respeta la rotación del documento', async () => {
    const art = await loadArtwork(new File([pdfFixture(90)], 'rotated.pdf', { type: 'application/pdf' }));
    assert(art.width === 2048 && art.height === 1536, 'Rotación del PDF perdida'); releaseArtwork(art);
  });
  for (const content of ['not a PDF', '%PDF-1.7\ninvalid document']) await check('Rechazo de PDF inválido', async () => {
    let rejected = false;
    try { releaseArtwork(await loadArtwork(new File([content], 'broken.pdf'))); } catch { rejected = true; }
    assert(rejected, 'Se aceptó un PDF inválido');
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
  await check('Ajustar ancho a 360°: cierra el espacio posterior sin cambiar altura ni repetir el arte', async () => {
    const source = document.createElement('canvas'); source.width = 1200; source.height = 600;
    const paint = source.getContext('2d')!;
    paint.fillStyle = '#d41128'; paint.fillRect(0, 0, 1200, 600);
    paint.fillStyle = '#0c50f0'; paint.fillRect(540, 0, 120, 600);
    const art = { canvas: source, width: 1200, height: 600, name: 'width-fit.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 1200; texture.height = Math.round(1200 * WRAP.height / WRAP.width);
    const ctx = texture.getContext('2d')!;
    const isInk = (r: number, g: number, b: number) => r > g * 1.4 || b > r * 1.4;
    for (const size of [10, 50, 90, 150, 400]) {
      const state = { ...DEFAULT_DESIGN, mode: 'wrap' as const, size };
      composePrint(ctx, art, state, 'white');
      const before = ctx.getImageData(600, 0, 1, texture.height).data;
      for (const x of [-180, -90, 0, 90, 180]) {
        composePrint(ctx, art, { ...state, fullWidth: true, x }, 'white');
        const after = ctx.getImageData(600, 0, 1, texture.height).data;
        for (let row = 0; row < texture.height; row++) {
          const i = row * 4;
          assert(isInk(before[i], before[i + 1], before[i + 2]) === isInk(after[i], after[i + 1], after[i + 2]), `La altura cambió: tamaño=${size}, x=${x}, fila=${row}`);
        }
        const band = ctx.getImageData(0, Math.floor(texture.height / 2), texture.width, 1).data;
        let blue = 0;
        for (let col = 0; col < texture.width; col++) {
          const i = col * 4;
          assert(isInk(band[i], band[i + 1], band[i + 2]), `Hueco radial: tamaño=${size}, x=${x}, columna=${col}`);
          if (band[i + 2] > band[i] * 1.4) blue++;
        }
        // One source marker occupies 10% of the circumference, regardless of
        // scale or seam position. Repeated art would produce extra markers.
        assert(Math.abs(blue - 120) <= 2, `El motivo se repitió o perdió ancho: ${blue} px, tamaño=${size}, x=${x}`);
      }
    }
    studio.update(art, { ...DEFAULT_DESIGN, mode: 'wrap', size: 90, fullWidth: true }, 'white');
    studio.showSide(false); const front = await capturedColors();
    studio.showSide(true); const back = await capturedColors();
    assert(front.blue > 500, 'La marca central no aparece en el frente del render');
    assert(back.red > 5000 && back.blue < front.blue / 10, 'El reverso perdió cobertura o repitió la marca central');
    studio.showSide(false); releaseArtwork(art); texture.width = 0; texture.height = 0;
  });
  await check('Ajustar ancho conserva también la altura y posición de un arte rotado', async () => {
    const source = document.createElement('canvas'); source.width = 1200; source.height = 600;
    const paint = source.getContext('2d')!; paint.fillStyle = '#d41128'; paint.fillRect(0, 0, 1200, 600);
    const art = { canvas: source, width: 1200, height: 600, name: 'rotated-width-fit.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 1200; texture.height = Math.round(1200 * WRAP.height / WRAP.width);
    const ctx = texture.getContext('2d')!;
    function verticalBounds() {
      const pixels = ctx.getImageData(0, 0, texture.width, texture.height).data;
      let top = texture.height, bottom = -1;
      for (let y = 0; y < texture.height; y++) for (let x = 0; x < texture.width; x++) {
        const i = (y * texture.width + x) * 4;
        if (pixels[i] > pixels[i + 1] * 1.4) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      }
      return [top, bottom];
    }
    for (const rotation of [-9, 15, 90]) for (const y of [0, 8]) {
      const state = { ...DEFAULT_DESIGN, mode: 'wrap' as const, size: 30, rotation, y };
      composePrint(ctx, art, state, 'white'); const before = verticalBounds();
      composePrint(ctx, art, { ...state, fullWidth: true }, 'white'); const after = verticalBounds();
      assert(Math.abs(before[0] - after[0]) <= 1 && Math.abs(before[1] - after[1]) <= 1, `Altura o posición alteradas con rotación=${rotation}, y=${y}: ${before} → ${after}`);
    }
    source.width = 0; source.height = 0; texture.width = 0; texture.height = 0;
  });
  await check('Tamaños del catálogo: cambia la forma, conserva JPG/PNG y mantiene la cobertura 360°', async () => {
    const jpg = await loadArtwork(await fixture('design-flat.jpg'));
    const png = await loadArtwork(await fixture('logo-transparent.png'));
    const state = { ...DEFAULT_DESIGN, mode: 'wrap' as const, fullWidth: true, size: 50, x: -137, y: 8, rotation: -9 };
    const before = JSON.stringify(state);
    const source = document.createElement('canvas'); source.width = 1200; source.height = 600;
    const paint = source.getContext('2d')!; paint.fillStyle = '#d41128'; paint.fillRect(0, 0, 1200, 600);
    const band = { canvas: source, width: 1200, height: 600, name: 'catalog-band.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 900;
    const bounds: number[] = [];
    try {
      for (const cup of CATALOG) {
        const model = catalogModel(cup)!;
        const layout = createSurfaceLayout(model.shape);
        studio.setDimensions(model.shape);
        for (const art of [jpg, png]) {
          studio.update(art, state, 'kraft');
          assert((await studio.capture()).size > 10000, 'El arte se perdió al cambiar el tamaño');
          assert(art.canvas.width > 0, 'El cambio liberó el archivo activo');
        }
        texture.height = Math.round(texture.width * layout.wrap.height / layout.wrap.width);
        const ctx = texture.getContext('2d')!;
        composePrint(ctx, band, { ...state, rotation: 0, y: 0 }, 'white', layout);
        const row = ctx.getImageData(0, Math.floor(texture.height / 2), texture.width, 1).data;
        for (let col = 0; col < texture.width; col++) assert(row[col * 4] > row[col * 4 + 1] * 1.4, 'Hueco radial en ' + cup.sizeOz + ' oz');
        studio.update(band, { ...DEFAULT_DESIGN, mode: 'wrap', fullWidth: true }, 'white');
        studio.showSide(false);
        const bitmap = await createImageBitmap(await studio.capture());
        const copy = document.createElement('canvas'); copy.width = bitmap.width; copy.height = bitmap.height;
        const copyCtx = copy.getContext('2d')!; copyCtx.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = copyCtx.getImageData(0, 0, copy.width, copy.height).data;
        let x0 = copy.width, x1 = -1, y0 = copy.height, y1 = -1;
        for (let y = 0; y < copy.height; y++) for (let x = 0; x < copy.width; x++) {
          const i = (y * copy.width + x) * 4;
          if (pixels[i] > pixels[i + 1] * 1.4 && pixels[i] > pixels[i + 2] * 1.4) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        assert(x1 > x0 && y1 > y0, 'Vaso sin arte visible');
        bounds.push((x1 - x0) / (y1 - y0));
        copy.width = 0; copy.height = 0;
      }
      const pot8 = CATALOG.findIndex((m) => m.id === 'pot-8oz');
      const cup21 = CATALOG.findIndex((m) => m.id === 'cup-21oz');
      assert(bounds[pot8] > bounds[cup21] * 2, 'Pote 8 oz y vaso 21 oz conservaron la misma silueta');
      assert(JSON.stringify(state) === before, 'Los ajustes se modificaron');
      studio.setDimensions(CUP); studio.update(jpg, DEFAULT_DESIGN, 'white');
    } finally {
      releaseArtwork(jpg); releaseArtwork(png); source.width = 0; texture.width = 0;
    }
  });
  await check('Cambiar entre Logo y 360° actualiza la textura y el frente después de redimensionar el vaso', async () => {
    const source = document.createElement('canvas'); source.width = 1000; source.height = 1000;
    const paint = source.getContext('2d')!; paint.fillStyle = '#d41128'; paint.fillRect(250, 250, 500, 500);
    const art = { canvas: source, width: 1000, height: 1000, name: 'sparse-logo.png', kind: 'PNG' as const };
    try {
      for (const id of ['pot-3oz', 'cup-12oz', 'cup-21oz', 'cup-12oz-double']) {
        studio.setDimensions(catalogModel(CATALOG.find((cup) => cup.id === id)!)!.shape);
        studio.update(art, { ...DEFAULT_DESIGN, mode: 'wrap', x: -137, size: 90, fullWidth: true }, 'white');
        await studio.capture();
        studio.update(art, DEFAULT_DESIGN, 'white');
        studio.showSide(false); const front = await capturedColors();
        studio.showSide(true); const back = await capturedColors();
        assert(front.red > 500, 'El logo desapareció del frente al cambiar de modo en ' + id);
        assert(back.red < front.red / 5, 'El logo dejó una textura anterior en el reverso');
      }
      studio.setDimensions(CUP); studio.update(art, DEFAULT_DESIGN, 'white');
      studio.showSide(false);
    } finally { source.width = 0; source.height = 0; }
  });
  await check('Frente 180°: agrandar, desplazar y rotar no imprimen en el reverso', async () => {
    const source = document.createElement('canvas'); source.width = 1200; source.height = 600;
    const paint = source.getContext('2d')!;
    paint.fillStyle = '#d41128'; paint.fillRect(0, 0, 600, 600);
    paint.fillStyle = '#0c50f0'; paint.fillRect(600, 0, 600, 600);
    const art = { canvas: source, width: 1200, height: 600, name: 'front-only.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 400;
    try {
      for (const id of ['pot-3oz', 'cup-9oz', 'cup-12oz-double', 'cup-21oz']) {
        const layout = createSurfaceLayout(catalogModel(CATALOG.find(m => m.id === id)!)!.shape);
        texture.height = Math.round(texture.width * layout.wrap.height / layout.wrap.width);
        const ctx = texture.getContext('2d')!;
        for (const size of [10, 48, 100, 200, 400]) for (const x of [-90, 0, 90]) for (const rotation of [-45, 0, 90]) {
          const state = { ...DEFAULT_DESIGN, size, x, y: 8, rotation };
          composePrint(ctx, art, state, 'white', layout);
          const pixels = ctx.getImageData(0, 0, texture.width, texture.height).data;
          for (let y = 0; y < texture.height; y++) for (let col = 0; col < texture.width; col++) {
            if (col >= 100 && col < 300) continue;
            const i = (y * texture.width + col) * 4;
            assert(pixels[i] === 250 && pixels[i + 1] === 248 && pixels[i + 2] === 242, `El frente invadió el reverso: ${id}, ${size}%, x=${x}, r=${rotation}`);
          }
        }
      }
      studio.setDimensions(CUP); studio.update(art, DEFAULT_DESIGN, 'white');
      studio.showSide(false); const front = await capturedColors();
      studio.showSide(true); const back = await capturedColors();
      assert(front.red > 500 && front.blue > 500, 'El frente perdió la composición');
      assert(back.red + back.blue < 100, 'El render muestra arte en el reverso sin duplicación');
      studio.showSide(false);
    } finally { source.width = 0; texture.width = 0; }
  });
  await check('Duplicar en reverso copia píxeles idénticos sin espejar, deformar ni superponer', async () => {
    const source = document.createElement('canvas'); source.width = 1200; source.height = 600;
    const paint = source.getContext('2d')!;
    paint.fillStyle = '#d41128'; paint.fillRect(0, 0, 600, 600);
    paint.fillStyle = '#0c50f0'; paint.fillRect(600, 0, 600, 600);
    const art = { canvas: source, width: 1200, height: 600, name: 'asymmetric-front.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 400;
    const png = await loadArtwork(await fixture('logo-transparent.png'));
    const jpg = await loadArtwork(await fixture('design-flat.jpg'));
    try {
      for (const model of CATALOG) {
        const layout = createSurfaceLayout(catalogModel(model)!.shape);
        texture.height = Math.round(400 * layout.wrap.height / layout.wrap.width);
        const ctx = texture.getContext('2d')!;
        for (const [size, x, y, rotation] of [[48, 0, 0, 0], [100, 0, 0, 0], [180, 45, 8, -9], [400, -90, 38, 90]]) for (const image of [art, png]) {
          const state = { ...DEFAULT_DESIGN, size, x, y, rotation };
          composePrint(ctx, image, state, 'kraft', layout);
          const before = ctx.getImageData(100, 0, 200, texture.height).data;
          composePrint(ctx, image, { ...state, duplicateBack: true }, 'kraft', layout);
          const pixels = ctx.getImageData(0, 0, 400, texture.height).data;
          for (let row = 0; row < texture.height; row++) for (let col = 0; col < 200; col++) for (let channel = 0; channel < 4; channel++) {
            const front = (row * 400 + 100 + col) * 4 + channel;
            const rear = (row * 400 + (300 + col) % 400) * 4 + channel;
            const original = (row * 200 + col) * 4 + channel;
            assert(pixels[front] === before[original], 'Duplicar modificó el frente');
            assert(pixels[rear] === pixels[front], `La copia posterior difiere o está espejada: ${model.id}`);
          }
        }
        studio.setDimensions(layout.cup);
        for (const image of [jpg, png]) {
          studio.update(image, { ...DEFAULT_DESIGN, duplicateBack: true, size: 100, x: 12, y: 8, rotation: -9 }, 'kraft');
          assert((await studio.capture()).size > 10000, 'La duplicación perdió JPG/PNG en ' + model.id);
        }
      }
      studio.setDimensions(CUP);
      studio.update(art, { ...DEFAULT_DESIGN, duplicateBack: true }, 'white');
      studio.showSide(false); const front = await capturedColors();
      studio.showSide(true); const back = await capturedColors();
      assert(front.red > 500 && front.blue > 500 && back.red > 500 && back.blue > 500, 'Falta el arte en una de las caras');
      assert(front.redX < front.blueX && back.redX < back.blueX, 'El reverso está espejado');
      studio.showSide(false);
      studio.update(jpg, { ...DEFAULT_DESIGN, duplicateBack: true }, 'white');
    } finally { source.width = 0; texture.width = 0; releaseArtwork(png); releaseArtwork(jpg); }
  });
  await check('Potes 3/5/8 oz: una imagen 1672 × 941 cubre ambas mitades sin franjas ni estiramiento', async () => {
    const source = document.createElement('canvas'); source.width = 1672; source.height = 941;
    const paint = source.getContext('2d')!;
    paint.fillStyle = '#d41128'; paint.fillRect(0, 0, 836, 941);
    paint.fillStyle = '#0c50f0'; paint.fillRect(836, 0, 836, 941);
    const art = { canvas: source, width: 1672, height: 941, name: 'pot-coverage.png', kind: 'PNG' as const };
    const texture = document.createElement('canvas'); texture.width = 1200;
    const isInk = (pixels: Uint8ClampedArray, i: number) => pixels[i] > pixels[i + 1] * 1.4 || pixels[i + 2] > pixels[i] * 1.4;
    try {
      for (const model of CATALOG.filter(m => m.family === 'pot')) {
        const layout = createSurfaceLayout(catalogModel(model)!.shape);
        texture.height = Math.round(1200 * layout.wrap.height / layout.wrap.width);
        const ctx = texture.getContext('2d')!;
        const state = { ...DEFAULT_DESIGN, duplicateBack: true };
        composePrint(ctx, art, { ...state, frontFit: 'contain' }, 'white', layout);
        const before = ctx.getImageData(0, Math.floor(texture.height / 2), 1200, 1).data;
        assert(before.some((_, i) => i % 4 === 0 && !isInk(before, i)), 'No se reprodujo la franja de papel del ajuste anterior');
        composePrint(ctx, art, state, 'white', layout);
        const pixels = ctx.getImageData(0, 0, 1200, texture.height).data;
        for (let i = 0; i < pixels.length; i += 4) assert(isInk(pixels, i), 'Franja sin cubrir en ' + model.id);
        studio.setDimensions(layout.cup); studio.update(art, state, 'white');
        for (const back of [false, true]) {
          studio.showSide(back); const colors = await capturedColors();
          assert(colors.red > 500 && colors.blue > 500, 'La cobertura perdió una cara en ' + model.id);
        }
        studio.showSide(false); studio.rotate(Math.PI / 2);
        const bitmap = await createImageBitmap(await studio.capture());
        const image = document.createElement('canvas'); image.width = bitmap.width; image.height = bitmap.height;
        const imageCtx = image.getContext('2d')!; imageCtx.drawImage(bitmap, 0, 0); bitmap.close();
        const rendered = imageCtx.getImageData(0, 0, image.width, image.height).data;
        let best = { ink: 0, span: 0 };
        for (let row = Math.floor(image.height * 0.4); row < image.height * 0.8; row++) {
          let ink = 0, first = image.width, last = -1;
          for (let col = 0; col < image.width; col++) if (isInk(rendered, (row * image.width + col) * 4)) { ink++; first = Math.min(first, col); last = col; }
          if (ink > best.ink) best = { ink, span: last - first + 1 };
        }
        assert(best.ink > 50 && best.span - best.ink <= 3, 'El render lateral conserva una franja sin arte: ' + model.id);
        image.width = 0;
      }
      studio.setDimensions(CUP); studio.update(art, { ...DEFAULT_DESIGN, duplicateBack: true }, 'white'); studio.showSide(false);
    } finally { source.width = 0; texture.width = 0; }
  });
  await check('La rueda y Ctrl/trackpad no cambian el tamaño del producto ni bloquean la página', async () => {
    studio.resetView();
    const before = new Uint8Array(await (await studio.capture()).arrayBuffer());
    const pageWheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    canvas.dispatchEvent(pageWheel);
    assert(!pageWheel.defaultPrevented, 'El visor bloqueó el scroll normal de la página');
    const pinch = new WheelEvent('wheel', { deltaY: -25, ctrlKey: true, bubbles: true, cancelable: true });
    canvas.dispatchEvent(pinch);
    assert(!pinch.defaultPrevented, 'El visor consumió un gesto de zoom del navegador');
    const after = new Uint8Array(await (await studio.capture()).arrayBuffer());
    assert(before.length === after.length && before.every((value, index) => value === after[index]), 'La rueda cambió la cámara del producto');
    studio.resetView();
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
