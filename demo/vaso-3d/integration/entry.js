import { studioSelection } from './selection.js';
import { initializeHeroVideo } from './hero-video.js';
import { t } from './i18n.js';

initializeHeroVideo();

// Shared integration for all three site languages.
const section = document.getElementById('configurador-3d');
const root = document.querySelector('[data-niu-studio]');
const notice = document.getElementById('studio-product-notice');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let initialization;
let request = 0;

function initialize() {
  if (!initialization) {
    initialization = import(root.dataset.studioEntry).then(() => {
      if (root.dataset.studio !== 'ready') throw new Error(t('El visor no pudo iniciar.'));
    }).catch(error => {
      root.dataset.studio = 'unavailable';
      notice.hidden = false;
      notice.textContent = t('No pudimos iniciar el configurador. Recargá la página para volver a intentar.');
      throw error;
    });
  }
  return initialization;
}

function showSection() {
  history.replaceState(null, '', '#configurador-3d');
  section.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  section.focus({ preventScroll: true });
}

function panelSelection(panel) {
  const cup = panel.querySelector('[data-cup-size]');
  const pot = panel.querySelector('[data-bowl-size]');
  return {
    family: cup ? 'cup' : pot ? 'pot' : null,
    size: (cup ?? pot)?.dataset.value ?? '',
    wall: panel.querySelector('[data-cup-type]')?.dataset.value ?? 'simple',
  };
}

function bindProductLinks() {
  document.querySelectorAll('.showroom-panel .showroom-consult').forEach(link => {
    link.href = '#configurador-3d';
    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.setAttribute('aria-label', t('Consultar este producto en el configurador 3D'));
  });
}

// Capture before the existing showroom's WhatsApp click handler.
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link) return;
  const panel = link.matches('.showroom-consult') ? link.closest('.showroom-panel') : null;
  if (!panel && link.getAttribute('href') !== '#configurador-3d') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const selection = panel ? panelSelection(panel) : null;
  const current = ++request;
  showSection();
  void initialize().then(() => {
    if (current !== request) return;
    if (!selection) { notice.hidden = true; return; }
    const available = new Set([...root.querySelectorAll('#studio-cup-model option:not(:disabled)')].map(option => option.value));
    const result = studioSelection(selection, available);
    notice.textContent = t(result.notice);
    notice.hidden = !result.notice;
    if (result.modelId) root.dispatchEvent(new CustomEvent('niupack:select-model', { detail: { modelId: result.modelId } }));
  }).catch(() => {});
}, true);
document.addEventListener('custom-select-change', () => queueMicrotask(bindProductLinks));
bindProductLinks();

// Warm the 3D engine immediately behind the branded loader so the public page
// is already interactive when it becomes visible. Wait two paint frames after
// initialization so the canvas has actually rendered before signalling ready.
const nextPaint = () => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});
const studioBoot = initialize()
  .catch(() => {})
  .then(nextPaint)
  .finally(() => {
    window.dispatchEvent(new CustomEvent('niupack:studio-settled', {
      detail: { status: root.dataset.studio ?? 'unavailable' },
    }));
  });

if (location.hash === '#personalizacion' || location.hash === '#configurador-3d') {
  const revealDirectLink = async () => {
    await Promise.all([document.fonts?.ready ?? Promise.resolve(), studioBoot]);
    history.replaceState(null, '', '#configurador-3d');
    // Catalog initialization and local fonts can change layout on a direct link.
    requestAnimationFrame(() => section.scrollIntoView({ behavior: 'instant', block: 'start' }));
  };
  if (document.readyState === 'complete') void revealDirectLink();
  else window.addEventListener('load', () => { void revealDirectLink(); }, { once: true });
}
