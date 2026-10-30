import { getDocument, GlobalWorkerOptions, AnnotationMode } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { MAX_ARTWORK_EDGE, MAX_PIXELS, type Artwork } from './artwork.mts';

GlobalWorkerOptions.workerSrc = workerURL;

export async function loadPDFArtwork(bytes: Uint8Array, name: string): Promise<Artwork> {
  const assets = new URL(/* @vite-ignore */ '../pdf/', import.meta.url);
  const task = getDocument({
    data: bytes,
    useSystemFonts: false,
    enableXfa: false,
    stopAtErrors: true,
    // Downsample large embedded images rather than silently omitting them.
    canvasMaxAreaInBytes: MAX_PIXELS * 4,
    cMapUrl: new URL('cmaps/', assets).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', assets).href,
    wasmUrl: new URL('wasm/', assets).href,
    iccUrl: new URL('iccs/', assets).href,
  });
  const canvas = document.createElement('canvas');
  let timer = 0;
  const timeout = new Error('El PDF tardó demasiado en procesarse. Probá con una versión más simple.');
  try {
    await Promise.race([
      (async () => {
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        const original = page.getViewport({ scale: 1 });
        if (![original.width, original.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid PDF dimensions');
        const viewport = page.getViewport({ scale: MAX_ARTWORK_EDGE / Math.max(original.width, original.height) });
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        if (!canvas.getContext('2d')) throw new Error('Canvas unavailable');
        await page.render({ canvas, viewport, background: 'rgba(0,0,0,0)', annotationMode: AnnotationMode.DISABLE }).promise;
      })(),
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(timeout), 30_000); }),
    ]);
    return { canvas, name, width: canvas.width, height: canvas.height, kind: 'PDF' };
  } catch (error) {
    canvas.width = 0; canvas.height = 0;
    if (error === timeout) throw timeout;
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('El PDF está protegido con contraseña. Subí una copia sin contraseña.');
    throw new Error('No se pudo abrir el PDF. Puede estar dañado o usar contenido no compatible.');
  } finally {
    window.clearTimeout(timer);
    await task.destroy().catch(() => {});
  }
}
