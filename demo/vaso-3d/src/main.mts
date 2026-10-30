import { t, pageLocale } from '../integration/i18n.js';
import { createStudio, type Paper, type Studio } from './studio.mts';
import { loadArtwork, exampleArtwork, releaseArtwork, type Artwork } from './artwork.mts';
import { createSurfaceLayout, DEFAULT_DESIGN, frontFitMode, type LayoutMode } from './layout.mts';
import { drawPrintPreview } from './print.mts';
import { CATALOG, DEFAULT_MODEL_ID, previewModel, modelLabel, selectionStatus, formatMm, type SupplierModel } from './catalog.mts';
import { createModelPicker } from './model-picker.mts';

const embeddedRoot = document.querySelector<HTMLElement>('[data-niu-studio]');
const studioRoot = embeddedRoot ?? document;
const idPrefix = embeddedRoot?.dataset.idPrefix ?? '';
function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(idPrefix + id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}
// The standalone page owns its navigation; the inline version uses the site
// header and never binds handlers to the site's menu or other product controls.
if (!embeddedRoot) {
const navToggle = element<HTMLButtonElement>('nav-toggle');
const siteNav = element('site-nav');
function closeNavigation(): void {
  siteNav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', t('Abrir menú'));
}
navToggle.addEventListener('click', () => {
  const open = siteNav.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', t(open ? 'Cerrar menú' : 'Abrir menú'));
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
}

const viewer = element<HTMLCanvasElement>('viewer');
const stage = element('stage');
const quoteLink = element<HTMLAnchorElement>('request-quote');
const downloadButton = element<HTMLButtonElement>('download-design');
const modelDownloadButton = element<HTMLButtonElement>('download-model');
const controlsFieldset = element<HTMLFieldSetElement>('design-controls');
const input = element<HTMLInputElement>('artwork-file');
const notice = element('upload-notice');
const dropZone = element('drop-zone');
const toast = element('toast');
const printPreview = element<HTMLCanvasElement>('print-preview');
const state = { ...DEFAULT_DESIGN };
const initialModel = CATALOG.find((model) => model.id === DEFAULT_MODEL_ID)!;
const initialShape = previewModel(initialModel)!.shape;
let selectedModel = DEFAULT_MODEL_ID;
let surface = createSurfaceLayout(initialShape);
let paper: Paper = 'white';
let artwork: Artwork | null = exampleArtwork();
let studio: Studio | null = null;
let loading = false;
let exporting = false;
let lostContext = false;
let toastTimer = 0;
let generation = 0;
const privacyMessage = 'Archivo privado: no se envía a un servidor.';
const modelGroups = [
  { id: 'cup-single', family: 'cup', wall: 'single', label: t('Vaso · pared simple') },
  { id: 'cup-double', family: 'cup', wall: 'double', label: t('Vaso · pared doble') },
  { id: 'pot-single', family: 'pot', wall: 'single', label: t('Pote · pared simple') },
] as const;
function chooseModel(id: string): void {
  const select = element<HTMLSelectElement>('cup-model');
  if (select.disabled) return;
  select.value = id; select.dispatchEvent(new Event('change', { bubbles: true }));
}
const familyPicker = createModelPicker(element<HTMLButtonElement>('model-family'), element('model-family-options'), id => {
  const group = modelGroups.find(item => item.id === id)!;
  const current = CATALOG.find(item => item.id === selectedModel)!;
  const models = CATALOG.filter(item => item.family === group.family && item.wall === group.wall && selectionStatus(item.id).selectable);
  const next = models.find(item => item.sizeOz === current.sizeOz)
    ?? models.find(item => item.sizeOz === (group.family === 'pot' ? 8 : 12)) ?? models[0];
  if (next) chooseModel(next.id);
});
const sizePicker = createModelPicker(element<HTMLButtonElement>('model-size'), element('model-size-options'), chooseModel);

function syncModelPickers(cup: SupplierModel): void {
  familyPicker.setOptions(modelGroups.map(group => ({ value: group.id, label: group.label })), `${cup.family}-${cup.wall}`);
  sizePicker.setOptions(CATALOG.filter(item => item.family === cup.family && item.wall === cup.wall && selectionStatus(item.id).selectable)
    .sort((a, b) => a.sizeOz - b.sizeOz).map(item => ({ value: item.id, label: `${item.sizeOz} oz` })), cup.id);
}

function showNotice(message: string, kind: '' | 'warning' | 'error' = ''): void {
  notice.textContent = t(message);
  notice.className = `notice${kind ? ` is-${kind}` : ''}`;
}
function announce(message: string): void {
  clearTimeout(toastTimer); toast.textContent = t(message); toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4500);
}

function initializeCatalog(): void {
  const select = element<HTMLSelectElement>('cup-model');
  select.replaceChildren();
  for (const [family, wall, label] of [['cup', 'single', 'Vasos · Pared simple'], ['cup', 'double', 'Vasos · Pared doble'], ['pot', 'single', 'Potes · Pared simple']] as const) {
    const group = document.createElement('optgroup');
    group.label = t(label);
    for (const cup of CATALOG.filter((m) => m.family === family && m.wall === wall).sort((a, b) => a.sizeOz - b.sizeOz)) {
      const option = new Option(modelLabel(cup), cup.id, cup.id === DEFAULT_MODEL_ID, cup.id === DEFAULT_MODEL_ID);
      option.disabled = !selectionStatus(cup.id).selectable;
      option.title = cup.supplier + ' · ' + cup.source.file;
      group.append(option);
    }
    select.append(group);
  }
  const rows = element('catalog-measurements');
  rows.replaceChildren();
  for (const cup of CATALOG) {
    const row = document.createElement('tr');
    row.dataset.modelId = cup.id;
    row.title = cup.supplier + ' · ' + cup.source.file;
    const values = [`${cup.family === 'pot' ? 'Pote' : 'Vaso'} ${cup.sizeOz} oz ${cup.wall === 'double' ? 'D' : 'S'}`, formatMm(cup.rimOuterDiameterMm), formatMm(cup.heightMm), formatMm(cup.footDiameterMm)];
    values.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.setAttribute('scope', 'row');
      cell.textContent = t(value); row.append(cell);
    });
    rows.append(row);
  }
  element('catalog-notes').textContent = t('S: pared simple · D: pared doble. Boca: diámetro exterior del borde. Apoyo: diámetro del pie. Medidas nominales de los planos de Mingyuan y Ruida. El vaso de 9 oz reemplaza al vaso de 8 oz; el pote de 8 oz es un modelo independiente.');
  updateModelInfo(initialModel);
  select.addEventListener('change', () => {
    if (!selectionStatus(select.value).selectable || !studio) { select.value = selectedModel; return; }
    const cup = CATALOG.find((item) => item.id === select.value)!;
    const model = previewModel(cup)!;
    studio.setDimensions(model.shape);
    surface = createSurfaceLayout(model.shape);
    selectedModel = select.value;
    updateModelInfo(cup);
    redraw();
    announce(modelLabel(cup) + '. Conservamos tu arte y ajustes.');
  });
}
function updateModelInfo(cup: SupplierModel): void {
  syncModelPickers(cup);
  element('model-caption').textContent = t(modelLabel(cup).toLocaleUpperCase(pageLocale()));
  element('model-caption-detail').textContent = t(`${cup.supplier} · Boca ${formatMm(cup.rimOuterDiameterMm)} mm · Alto ${formatMm(cup.heightMm)} mm · Apoyo ${formatMm(cup.footDiameterMm)} mm`);
  element('model-notice').textContent = t(`${modelLabel(cup)}. Medidas del plano de ${cup.supplier}. Tu arte y ajustes 360° se conservan.`);
  element('model-source').textContent = t(`Fuente: ${cup.source.file} · ${cup.source.date}${cup.source.revision ? ' · Rev. ' + cup.source.revision : ''}`);
}
function updateEnabled(): void {
  const busy = loading || exporting;
  downloadButton.disabled = !studio || !artwork || lostContext || busy;
  modelDownloadButton.disabled = !studio || lostContext || busy;
  controlsFieldset.disabled = !artwork || busy;
  element<HTMLFieldSetElement>('application-controls').disabled = !artwork || busy;
  input.disabled = busy;
  element<HTMLSelectElement>('cup-model').disabled = !studio || lostContext || busy;
  familyPicker.setDisabled(!studio || lostContext || busy);
  sizePicker.setDisabled(!studio || lostContext || busy);
  studioRoot.querySelectorAll<HTMLButtonElement>('[data-material]').forEach(button => { button.disabled = busy; });
  dropZone.classList.toggle('is-busy', busy);
  dropZone.setAttribute('aria-busy', String(busy));
  element<HTMLButtonElement>('reset-design').disabled = !artwork || busy;
  element<HTMLButtonElement>('remove-artwork').disabled = !artwork || busy;
}
function redraw(): void {
  const model = CATALOG.find(item => item.id === selectedModel)!;
  const message = t(`Hola, quiero pedir presupuesto de un envase personalizado NIU PACK.\nModelo: ${modelLabel(model)}.\nPapel: ${paper === 'kraft' ? 'Kraft' : 'blanco'}.`);
  quoteLink.href = `https://wa.me/595971350619?text=${encodeURIComponent(message)}`;
  const front = state.mode === 'logo';
  const duplicate = front && state.duplicateBack;
  const fullWidth = state.mode === 'wrap' && state.fullWidth;
  element('wrap-width-controls').hidden = state.mode !== 'wrap';
  element('front-controls').hidden = !front;
  element('front-fit-controls').hidden = !front;
  const frontFit = frontFitMode(state, surface);
  studioRoot.querySelectorAll<HTMLButtonElement>('[data-front-fit]').forEach((button) => {
    const selected = button.dataset.frontFit === frontFit;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
  });
  element('front-fit-help').textContent = t(frontFit === 'cover'
    ? 'Llena cada mitad al 100%. Recorta bordes, sin deformar.'
    : 'Imagen completa al 100%. Puede dejar márgenes.');
  element('size-label').textContent = t(front ? 'Tamaño frontal' : 'Tamaño del arte');
  element('coverage-value').textContent = t(fullWidth ? 'Ancho 360° activo' : 'Libre');
  const widthButton = element<HTMLButtonElement>('fit-wrap-width');
  widthButton.setAttribute('aria-pressed', String(fullWidth));
  widthButton.classList.toggle('is-selected', fullWidth);
  const duplicateButton = element<HTMLButtonElement>('duplicate-back');
  duplicateButton.setAttribute('aria-pressed', String(duplicate));
  duplicateButton.classList.toggle('is-selected', duplicate);
  element('duplicate-status').textContent = t(duplicate ? 'Frente y reverso' : 'Reverso libre');
  element('wrap-width-help').textContent = t(fullWidth
    ? `Ancho completo con altura al ${state.size}%. Pulsá de nuevo para deshacer. El tamaño ajusta ahora la altura.`
    : 'Conserva la altura elegida; adapta sólo el ancho y no repite el arte.');
  element('duplicate-back-help').textContent = t(duplicate
    ? 'Los cambios del frente se copian igual atrás. Cada mitad recorta el arte en sus propios límites. Pulsá de nuevo para quitar la copia.'
    : 'Copia los 180° frontales a los 180° posteriores, con la misma orientación y proporciones.');
  printPreview.parentElement!.classList.toggle('is-front', front);
  element('preview-first').textContent = t(front ? 'Frente · 180°' : 'Reverso');
  element('preview-second').textContent = t(front ? duplicate ? 'Reverso · 180°' : 'Reverso libre · 180°' : 'Frente');
  element('preview-third').hidden = front;
  studio?.update(artwork, state, paper);
  drawPrintPreview(printPreview, artwork, state, paper, surface);
}
function resetDesign(mode: LayoutMode = state.mode): void {
  Object.assign(state, DEFAULT_DESIGN, { mode });
  studioRoot.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => {
    const selected = button.dataset.layout === mode;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  const sizeInput = element<HTMLInputElement>('design-size');
  sizeInput.min = '10'; sizeInput.max = '400';
  const xInput = element<HTMLInputElement>('design-x');
  xInput.min = mode === 'wrap' ? '-180' : '-90';
  xInput.max = mode === 'wrap' ? '180' : '90';
  element('x-label').textContent = t('Horizontal');
  element('layout-help').textContent = t(mode === 'wrap'
    ? 'Diseño continuo sobre el contorno completo. Ajustá tamaño y posición o adaptá el ancho a 360°.'
    : 'Ajustá el arte dentro de los 180° frontales. Conserva sus proporciones y se recorta al salir de esa mitad.');
  printPreview.setAttribute('aria-label', t(mode === 'wrap'
    ? 'Banda rectangular del diseño 360 grados: centro al frente y extremos unidos atrás.'
    : 'Dos mitades completas de 180 grados: frente a la izquierda y reverso a la derecha.'));
  for (const [id, key, suffix, output] of sliderBindings) {
    element<HTMLInputElement>(id).value = String(state[key]);
    element(output).textContent = t(`${state[key]}${suffix}`);
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
    element(output).textContent = t(`${state[key]}${suffix}`);
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

element('duplicate-back').addEventListener('click', () => {
  if (!artwork || state.mode !== 'logo') return;
  state.duplicateBack = !state.duplicateBack;
  state.fullWidth = false;
  redraw(); qualityNotice();
  announce(state.duplicateBack
    ? 'Frente duplicado en el reverso. Los cambios se aplican igual en ambas mitades.'
    : 'Copia posterior desactivada. Conservamos el frente y sus ajustes.');
});

studioRoot.querySelectorAll<HTMLButtonElement>('[data-front-fit]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!artwork || state.mode !== 'logo') return;
    state.frontFit = button.dataset.frontFit === 'cover' ? 'cover' : 'contain';
    redraw(); qualityNotice();
    announce(state.frontFit === 'cover'
      ? 'Ajuste para cubrir los 180°. Conservamos las proporciones; los bordes sobrantes se recortan.'
      : 'Ajuste para ver el arte completo. Conservamos la posición y el tamaño elegido.');
  });
});

function qualityNotice(): void {
  if (!artwork) { showNotice(privacyMessage); return; }
  const messages: string[] = [];
  if (Math.min(artwork.width, artwork.height) < 500 && (state.size >= 90 || state.mode === 'wrap' && state.fullWidth)) messages.push('La imagen es pequeña y puede verse pixelada al ampliarla.');
  if (artwork.kind === 'JPG') messages.push('El fondo del JPG también se aplica. Para un logo sin fondo, usá PNG con transparencia.');
  if (artwork.width > 2048 || artwork.height > 2048) messages.push('Se redujo la resolución para cuidar el rendimiento del visor.');
  showNotice(messages.length ? messages.map(message => t(message)).join(' ') : privacyMessage, messages.length ? 'warning' : '');
}

async function upload(file: File): Promise<void> {
  if (exporting) { announce('Esperá a que termine la descarga.'); return; }
  if (loading) { announce('Esperá a que termine de cargar la imagen actual.'); return; }
  const ticket = ++generation;
  loading = true; updateEnabled(); showNotice('Preparando tu imagen…');
  try {
    const next = await loadArtwork(file);
    if (ticket !== generation) { releaseArtwork(next); return; }
    const previous = artwork; artwork = next;
    resetDesign('logo');
    studio?.showSide(false);
    releaseArtwork(previous);
    element('file-name').textContent = next.name;
    element('file-meta').textContent = t(`${next.kind} · ${next.width} × ${next.height} px`);
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
studioRoot.querySelectorAll<HTMLButtonElement>('[data-material]').forEach((button) => {
  button.addEventListener('click', () => {
    paper = button.dataset.material === 'kraft' ? 'kraft' : 'white';
    studioRoot.querySelectorAll<HTMLButtonElement>('[data-material]').forEach((option) => {
      const selected = option === button;
      option.classList.toggle('is-selected', selected); option.setAttribute('aria-pressed', String(selected));
    });
    redraw();
  });
});
studioRoot.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => {
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
element('reset-view').addEventListener('click', () => studio?.resetView());
async function downloadDesign(format: 'png' | 'glb'): Promise<void> {
  if (!studio || (format === 'png' && !artwork) || lostContext || loading || exporting) return;
  const button = format === 'png' ? downloadButton : modelDownloadButton;
  const label = element(format === 'png' ? 'download-label' : 'download-model-label');
  exporting = true;
  button.setAttribute('aria-busy', 'true');
  label.textContent = t(format === 'png' ? 'Preparando PNG…' : 'Preparando 3D…');
  updateEnabled();
  const filename = `niupack-${selectedModel}-${paper}.${format}`;
  try {
    const blob = format === 'png' ? await studio.capture() : await studio.exportModel(selectedModel);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    announce(format === 'png' ? 'Tu vista 3D se descargó en PNG.' : 'Tu modelo 3D se descargó en GLB.');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'No se pudo descargar el archivo. Intentá de nuevo.', 'error');
  } finally {
    exporting = false;
    button.setAttribute('aria-busy', 'false');
    label.textContent = t(format === 'png' ? 'Descargar PNG' : 'Descargar 3D');
    updateEnabled();
  }
}
downloadButton.addEventListener('click', () => { void downloadDesign('png'); });
modelDownloadButton.addEventListener('click', () => { void downloadDesign('glb'); });
element('view-front').addEventListener('click', () => studio?.showSide(false));
element('view-back').addEventListener('click', () => studio?.showSide(true));
element('reload-viewer').addEventListener('click', () => window.location.reload());
viewer.addEventListener('keydown', (event) => {
  const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'];
  if (!handled.includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft') studio?.rotate(-0.12);
  if (event.key === 'ArrowRight') studio?.rotate(0.12);
  if (event.key === 'ArrowUp') studio?.rotate(0, -0.08);
  if (event.key === 'ArrowDown') studio?.rotate(0, 0.08);
  if (event.key === 'Home') studio?.resetView();
});
initializeCatalog();
embeddedRoot?.addEventListener('niupack:select-model', (event) => {
  const id = (event as CustomEvent<{ modelId?: unknown }>).detail?.modelId;
  if (typeof id !== 'string' || !selectionStatus(id).selectable || !studio || loading || exporting || lostContext) return;
  const select = element<HTMLSelectElement>('cup-model');
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});

try {
  studio = createStudio(viewer, (lost) => {
    lostContext = lost;
    element('stage-error').hidden = !lost;
    element('stage-error-message').textContent = t('La vista 3D se interrumpió. Estamos intentando recuperarla; tu diseño sigue en esta pestaña.');
    updateEnabled();
  });
  studio.setDimensions(initialShape);
  redraw();
  (embeddedRoot ?? document.documentElement).dataset.studio = 'ready';
} catch (error) {
  element('stage-error').hidden = false;
  (embeddedRoot ?? document.documentElement).dataset.studio = 'unavailable';
  console.error('No se pudo iniciar NIUPACK Studio:', error);
} finally {
  element('stage-loading').hidden = true;
  stage.setAttribute('aria-busy', 'false'); updateEnabled();
}
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) { generation++; studio?.dispose(); releaseArtwork(artwork); }
});
