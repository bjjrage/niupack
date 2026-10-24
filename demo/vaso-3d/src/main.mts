import { createStudio, type Paper, type Studio } from './studio.mts';
import { loadArtwork, exampleArtwork, releaseArtwork, type Artwork } from './artwork.mts';
import { CUP, DEFAULT_SURFACE, createSurfaceLayout, DEFAULT_DESIGN, suggestedLayout, type LayoutMode } from './layout.mts';
import { drawPrintPreview } from './print.mts';
import { CATALOG, DEMO_MODEL_ID, catalogModel, selectionStatus, formatMm } from './catalog.mts';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}
const navToggle = element<HTMLButtonElement>('nav-toggle');
const siteNav = element('site-nav');
function closeNavigation(): void {
  siteNav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Abrir menú');
}
navToggle.addEventListener('click', () => {
  const open = siteNav.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
});
siteNav.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('a')) closeNavigation();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
    closeNavigation(); navToggle.focus();
  }
});
window.matchMedia('(min-width: 961px)').addEventListener('change', closeNavigation);

const viewer = element<HTMLCanvasElement>('viewer');
const stage = element('stage');
const downloadButton = element<HTMLButtonElement>('download');
const controlsFieldset = element<HTMLFieldSetElement>('design-controls');
const input = element<HTMLInputElement>('artwork-file');
const notice = element('upload-notice');
const dropZone = element('drop-zone');
const toast = element('toast');
const printPreview = element<HTMLCanvasElement>('print-preview');
const state = { ...DEFAULT_DESIGN };
let selectedModel = DEMO_MODEL_ID;
let surface = DEFAULT_SURFACE;
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

function initializeCatalog(): void {
  const select = element<HTMLSelectElement>('cup-model');
  const current = new Option('Modelo de prueba actual', DEMO_MODEL_ID, true, true);
  const pending = document.createElement('optgroup');
  pending.label = 'Catálogo · vista aproximada';
  const rows = element('catalog-measurements');
  rows.replaceChildren();
  for (const cup of CATALOG) {
    const availability = selectionStatus(cup.id);
    const model = catalogModel(cup);
    const option = new Option(`${cup.sizeOz} oz — ${availability.selectable ? 'aproximado' : 'pendiente'}`, cup.id);
    option.disabled = !availability.selectable;
    option.title = availability.reasons.join('. ');
    pending.append(option);
    const row = document.createElement('tr');
    row.dataset.modelId = cup.id;
    const values = [`${cup.sizeOz} oz${cup.approximate ? ' ≈' : cup.sourceWall === 'double' ? ' *' : ''}`, formatMm(cup.topDiameterMm), formatMm(cup.heightMm), model ? `${formatMm(model.baseDiameterMm)}${model.baseEstimated ? ' ≈' : ''}` : formatMm(cup.baseDiameterMm)];
    values.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.setAttribute('scope', 'row');
      cell.textContent = value; row.append(cell);
    });
    rows.append(row);
  }
  select.replaceChildren(current, pending);
  const approximate = CATALOG.filter((cup) => cup.approximate).map((cup) => `${cup.sizeOz} oz`).join(', ');
  const doubleWall = CATALOG.filter((cup) => cup.sourceWall === 'double').map((cup) => `${cup.sizeOz} oz`).join(', ');
  element('catalog-notes').textContent = [
    '≈ Bases estimadas como 2/3 de la boca, siguiendo la proporción del modelo de prueba. No son medidas de fabricación.',
    approximate && `≈ ${approximate}: medidas aproximadas; falta ficha validada.`,
    doubleWall && `* ${doubleWall}: medidas de fichas de pared doble; confirmar pared simple.`,
  ].filter(Boolean).join(' ');
  select.addEventListener('change', () => {
    if (!selectionStatus(select.value).selectable || !studio || saving) { select.value = selectedModel; return; }
    const cup = CATALOG.find((item) => item.id === select.value);
    const model = cup ? catalogModel(cup) : null;
    const shape = model?.shape ?? CUP;
    studio.setDimensions(shape);
    surface = createSurfaceLayout(shape);
    selectedModel = select.value;
    element('model-caption').textContent = cup ? `${cup.sizeOz} OZ · APROXIMADO` : 'MODELO DE PRUEBA';
    element('model-caption-detail').textContent = cup && model
      ? `Boca ${formatMm(cup.topDiameterMm)} mm · Altura ${formatMm(cup.heightMm)} mm · Base ${formatMm(model.baseDiameterMm)} mm${model.baseEstimated ? ' ≈' : ''}`
      : 'Vista ilustrativa · Elegí un tamaño del catálogo';
    element('model-notice').textContent = cup && model
      ? `Vista aproximada de ${cup.sizeOz} oz. ${model.baseEstimated ? 'Base estimada; boca y altura tomadas del catálogo.' : 'Medidas tomadas del catálogo.'} Tu arte y ajustes 360° se conservan.${cup.sourceWall === 'double' ? ' La ficha de origen es de pared doble.' : ''}`
      : 'Probá los tamaños del catálogo con bases estimadas para esta demo. Tu arte y ajustes 360° se conservan.';
    redraw();
    announce(cup ? `Vaso de ${cup.sizeOz} oz, vista aproximada. Conservamos tu arte y ajustes.` : 'Modelo de prueba. Conservamos tu arte y ajustes.');
  });
}
function updateEnabled(): void {
  downloadButton.disabled = !studio || lostContext || loading || saving;
  controlsFieldset.disabled = !artwork || loading;
  input.disabled = loading;
  element<HTMLSelectElement>('cup-model').disabled = !studio || lostContext || loading || saving;
  dropZone.classList.toggle('is-busy', loading);
  dropZone.setAttribute('aria-busy', String(loading));
  element<HTMLButtonElement>('reset-design').disabled = !artwork || loading;
  element<HTMLButtonElement>('remove-artwork').disabled = !artwork || loading;
}
function redraw(): void {
  const fullWidth = state.mode === 'wrap' && state.fullWidth;
  element('wrap-width-controls').hidden = state.mode !== 'wrap';
  element('size-label').textContent = state.mode === 'wrap' ? '1. Tamaño del arte' : 'Tamaño';
  element('coverage-value').textContent = fullWidth ? '360° activo' : 'Libre';
  const widthButton = element<HTMLButtonElement>('fit-wrap-width');
  widthButton.setAttribute('aria-pressed', String(fullWidth));
  widthButton.classList.toggle('is-selected', fullWidth);
  element('wrap-width-help').textContent = fullWidth
    ? `Ancho completo con altura al ${state.size}%. Pulsá de nuevo para deshacer. El tamaño ajusta ahora la altura.`
    : 'Conserva la altura elegida; adapta sólo el ancho y no repite el arte.';
  studio?.update(artwork, state, paper);
  drawPrintPreview(printPreview, artwork, state, paper, surface);
}
function resetDesign(mode: LayoutMode = state.mode): void {
  Object.assign(state, DEFAULT_DESIGN, { mode });
  document.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => {
    const selected = button.dataset.layout === mode;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  const sizeInput = element<HTMLInputElement>('design-size');
  sizeInput.min = mode === 'wrap' ? '10' : '35';
  sizeInput.max = mode === 'wrap' ? '400' : '180';
  element('layout-help').textContent = mode === 'wrap'
    ? 'Primero elegí el tamaño (10% a 400%). Después podés ajustar el ancho para cerrar la vuelta, manteniendo la altura elegida.'
    : 'Ubica la imagen en el frente y conserva sus proporciones. El resto del vaso queda libre.';
  printPreview.setAttribute('aria-label', mode === 'wrap'
    ? 'Banda rectangular del diseño 360 grados: centro al frente y extremos unidos atrás.'
    : 'Vista plana del logo sobre la zona de impresión.');
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

element('fit-wrap-width').addEventListener('click', () => {
  if (!artwork || state.mode !== 'wrap') return;
  state.fullWidth = !state.fullWidth;
  redraw(); qualityNotice();
  announce(state.fullWidth
    ? 'Ancho ajustado a 360°. Conservamos la altura elegida, sin repetir el arte.'
    : 'Ajuste de ancho desactivado. El arte recuperó sus proporciones.');
});

function qualityNotice(): void {
  if (!artwork) { showNotice(privacyMessage); return; }
  const messages: string[] = [];
  if (Math.min(artwork.width, artwork.height) < 500 && (state.size >= 90 || state.mode === 'wrap' && state.fullWidth)) messages.push('La imagen es pequeña y puede verse pixelada al ampliarla.');
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
    const cup = CATALOG.find((item) => item.id === selectedModel);
    anchor.href = url; anchor.download = `niupack-vaso-${cup ? `${cup.sizeOz}oz-aproximado` : 'demo'}-${paper}.png`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    announce('PNG preparado. Revisá las descargas de tu navegador.');
  } catch (error) {
    announce(error instanceof Error ? error.message : 'No se pudo descargar el PNG.');
  } finally {
    saving = false; label.textContent = 'Descargar vista PNG'; updateEnabled();
  }
});

initializeCatalog();

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
