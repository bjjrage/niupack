import { createStudio, type Paper, type Studio } from './studio.mts';
import { loadArtwork, exampleArtwork, releaseArtwork, type Artwork } from './artwork.mts';
import { DEFAULT_DESIGN, SHEET_HEIGHT, SHEET_WIDTH, suggestedLayout, type LayoutMode } from './layout.mts';
import { drawPrintPreview } from './print.mts';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}
const viewer = element<HTMLCanvasElement>('viewer');
const stage = element('stage');
const downloadButton = element<HTMLButtonElement>('download');
const controlsFieldset = element<HTMLFieldSetElement>('design-controls');
const input = element<HTMLInputElement>('artwork-file');
const notice = element('upload-notice');
const dropZone = element('drop-zone');
const toast = element('toast');
const printPreview = element<HTMLCanvasElement>('print-preview');
printPreview.height = Math.round(printPreview.width * SHEET_HEIGHT / SHEET_WIDTH);
const state = { ...DEFAULT_DESIGN };
let paper: Paper = 'white';
let artwork: Artwork | null = exampleArtwork();
let studio: Studio | null = null;
let loading = false;
let lostContext = false;
let saving = false;
let toastTimer = 0;
let generation = 0;
const privacyMessage = 'Tu archivo se procesa en este navegador. No se envía ni se guarda en un servidor.';

function showNotice(message: string, kind: '' | 'warning' | 'error' = ''): void {
  notice.textContent = message;
  notice.className = `notice${kind ? ` is-${kind}` : ''}`;
}
function announce(message: string): void {
  clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4500);
}
function updateEnabled(): void {
  downloadButton.disabled = !studio || lostContext || loading || saving;
  controlsFieldset.disabled = !artwork || loading;
  input.disabled = loading;
  dropZone.classList.toggle('is-busy', loading);
  dropZone.setAttribute('aria-busy', String(loading));
  element<HTMLButtonElement>('reset-design').disabled = !artwork || loading;
  element<HTMLButtonElement>('remove-artwork').disabled = !artwork || loading;
}
function redraw(): void {
  studio?.update(artwork, state, paper);
  drawPrintPreview(printPreview, artwork, state, paper);
}
function resetDesign(mode: LayoutMode = state.mode): void {
  Object.assign(state, DEFAULT_DESIGN, { mode });
  document.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => {
    const selected = button.dataset.layout === mode;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  element<HTMLInputElement>('design-size').min = mode === 'wrap' ? '100' : '35';
  element('layout-help').textContent = mode === 'wrap'
    ? 'Cubre los 360° sin estirar la imagen. Puede recortar bordes; revisá la vista plana y el reverso.'
    : 'Ubica la imagen en el frente y conserva sus proporciones. El resto del vaso queda libre.';
  for (const [id, key, suffix, output] of sliderBindings) {
    element<HTMLInputElement>(id).value = String(state[key]);
    element(output).textContent = `${state[key]}${suffix}`;
  }
  redraw();
}
const sliderBindings = [
  ['design-size', 'size', ' %', 'size-value'],
  ['design-x', 'x', '°', 'x-value'],
  ['design-y', 'y', ' %', 'y-value'],
  ['design-rotation', 'rotation', '°', 'rotation-value'],
] as const;
for (const [id, key, suffix, output] of sliderBindings) {
  element<HTMLInputElement>(id).addEventListener('input', (event) => {
    state[key] = Number((event.target as HTMLInputElement).value);
    element(output).textContent = `${state[key]}${suffix}`;
    redraw();
    if (artwork && artwork.kind !== 'example') qualityNotice();
  });
}

function qualityNotice(): void {
  if (!artwork) { showNotice(privacyMessage); return; }
  const messages: string[] = [];
  if (Math.min(artwork.width, artwork.height) < 500 && state.size >= 90) messages.push('La imagen es pequeña y puede verse pixelada al ampliarla.');
  if (artwork.kind === 'JPG') messages.push('El fondo del JPG también se aplica. Para un logo sin fondo, usá PNG con transparencia.');
  if (artwork.width > 2048 || artwork.height > 2048) messages.push('Se redujo la resolución para cuidar el rendimiento del visor.');
  showNotice(messages.length ? messages.join(' ') : privacyMessage, messages.length ? 'warning' : '');
}

async function upload(file: File): Promise<void> {
  if (loading) { announce('Esperá a que termine de cargar la imagen actual.'); return; }
  const ticket = ++generation;
  loading = true; updateEnabled(); showNotice('Preparando tu imagen…');
  try {
    const next = await loadArtwork(file);
    if (ticket !== generation) { releaseArtwork(next); return; }
    const previous = artwork; artwork = next;
    resetDesign(suggestedLayout(next.width, next.height));
    studio?.showSide(false);
    releaseArtwork(previous);
    element('file-name').textContent = next.name;
    element('file-meta').textContent = `${next.kind} · ${next.width} × ${next.height} px`;
    element('file-info').hidden = false;
    qualityNotice();
    announce('Tu diseño ya está sobre el vaso.');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'No se pudo cargar la imagen.', 'error');
  } finally {
    loading = false; input.value = ''; updateEnabled();
  }
}
input.addEventListener('change', () => { const file = input.files?.[0]; if (file) void upload(file); });
for (const name of ['dragenter', 'dragover']) {
  dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('is-dragging'); });
}
for (const name of ['dragleave', 'drop']) {
  dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('is-dragging'); });
}
dropZone.addEventListener('drop', (event) => {
  const files = (event as DragEvent).dataTransfer?.files;
  if (files?.length === 1) void upload(files[0]);
  else if (files?.length) showNotice('Subí una imagen por vez.', 'error');
});
// Keep accidental drops outside the upload target from navigating away.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
document.querySelectorAll<HTMLButtonElement>('[data-material]').forEach((button) => {
  button.addEventListener('click', () => {
    paper = button.dataset.material === 'kraft' ? 'kraft' : 'white';
    document.querySelectorAll<HTMLButtonElement>('[data-material]').forEach((option) => {
      const selected = option === button;
      option.classList.toggle('is-selected', selected); option.setAttribute('aria-pressed', String(selected));
    });
    redraw();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => {
  button.addEventListener('click', () => {
    resetDesign(button.dataset.layout === 'wrap' ? 'wrap' : 'logo');
    studio?.showSide(false);
    qualityNotice();
  });
});
element('reset-design').addEventListener('click', () => { resetDesign(); qualityNotice(); announce('Ajustes restablecidos.'); });
element('remove-artwork').addEventListener('click', () => {
  releaseArtwork(artwork); artwork = null;
  element('file-info').hidden = true; showNotice(privacyMessage); updateEnabled(); redraw();
  announce('Diseño eliminado. Podés subir otra imagen.');
});
element('zoom-in').addEventListener('click', () => studio?.zoom(0.88));
element('zoom-out').addEventListener('click', () => studio?.zoom(1.14));
element('reset-view').addEventListener('click', () => studio?.resetView());
element('view-front').addEventListener('click', () => studio?.showSide(false));
element('view-back').addEventListener('click', () => studio?.showSide(true));
element('reload-viewer').addEventListener('click', () => window.location.reload());
viewer.addEventListener('keydown', (event) => {
  const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'];
  if (!handled.includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft') studio?.rotate(-0.12);
  if (event.key === 'ArrowRight') studio?.rotate(0.12);
  if (event.key === 'ArrowUp') studio?.rotate(0, -0.08);
  if (event.key === 'ArrowDown') studio?.rotate(0, 0.08);
  if (event.key === '+' || event.key === '=') studio?.zoom(0.9);
  if (event.key === '-') studio?.zoom(1.1);
  if (event.key === 'Home') studio?.resetView();
});
downloadButton.addEventListener('click', async () => {
  if (!studio || saving) return;
  saving = true; updateEnabled();
  const label = downloadButton.querySelector('span')!;
  label.textContent = 'Preparando PNG…';
  try {
    const blob = await studio.capture();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `niupack-vaso-12oz-${paper}.png`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    announce('PNG preparado. Revisá las descargas de tu navegador.');
  } catch (error) {
    announce(error instanceof Error ? error.message : 'No se pudo descargar el PNG.');
  } finally {
    saving = false; label.textContent = 'Descargar vista PNG'; updateEnabled();
  }
});

try {
  studio = createStudio(viewer, (lost) => {
    lostContext = lost;
    element('stage-error').hidden = !lost;
    element('stage-error-message').textContent = 'La vista 3D se interrumpió. Estamos intentando recuperarla; tu diseño sigue en esta pestaña.';
    updateEnabled();
  });
  redraw();
  document.documentElement.dataset.studio = 'ready';
} catch (error) {
  element('stage-error').hidden = false;
  document.documentElement.dataset.studio = 'unavailable';
  console.error('No se pudo iniciar NIUPACK Studio:', error);
} finally {
  element('stage-loading').hidden = true;
  stage.setAttribute('aria-busy', 'false'); updateEnabled();
}
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) { generation++; studio?.dispose(); releaseArtwork(artwork); }
});
