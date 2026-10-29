// Keep the published module's product selectors, images, dimensions and nested carousels.
(() => {
  history.scrollRestoration = 'manual';
  window.addEventListener('load', () => window.scrollTo(0, 0), {once:true});
  const showroom = document.querySelector('.showroom');
  if (!showroom) return;
  showroom.querySelectorAll('.showroom-panel').forEach(panel => {
    const quote = panel.querySelector('.showroom-consult');
    quote.textContent = 'Consultar por WhatsApp ↗';
    const configurator = document.createElement('a');
    configurator.href = 'https://bjjrage.github.io/niupack/#configurador-3d';
    configurator.textContent = 'Abrir configurador 3D del sitio ↗';
    configurator.className = 'catalogue-configurator';
    configurator.target = '_blank';
    configurator.rel = 'noopener';
    panel.append(configurator);
  });
  const heading = document.querySelector('.product-heading');
  heading.querySelector('.eyebrow').textContent = 'NIUPACK / CATÁLOGO INTERACTIVO';
  heading.querySelector('h2').textContent = 'Productos que acompañan tu marca';
  const tabs = [...showroom.querySelectorAll('[role="tab"]')];
  const tablist = showroom.querySelector('.showroom-tabs');
  const spread = showroom.querySelector('.showroom-layout');
  showroom.insertBefore(tablist, spread);
  const previous = document.querySelector('#book-prev');
  const next = document.querySelector('#book-next');
  let active = -1;
  function updatePage() {
    const index = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    if (index < 0 || index === active) return;
    const wasActive = active;
    active = index;
    previous.disabled = index === 0;
    next.disabled = index === tabs.length - 1;
    document.querySelector('#book-page').textContent = `${String(index + 1).padStart(2, '0')} / ${String(tabs.length).padStart(2, '0')} · ${tabs[index].textContent.trim()}`;
    history.replaceState(null, '', '#'+encodeURIComponent(tabs[index].textContent.trim().toLowerCase().replaceAll(' ', '-')));
    if (wasActive !== -1) {
      spread.classList.remove('book-turn');
      void spread.offsetWidth;
      spread.classList.add('book-turn');
      document.querySelector('.catalogue-book').scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
  }
  function turn(step) { const target = tabs[active + step]; if (target) target.click(); }
  previous.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  document.addEventListener('keydown', event => {
    if (event.target.closest('button,a,input,select,textarea,[role="listbox"]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); turn(1); }
  });
  const initial = decodeURIComponent(location.hash.slice(1));
  const initialIndex = tabs.findIndex(tab => tab.textContent.trim().toLowerCase().replaceAll(' ', '-') === initial);
  if (initialIndex > -1) tabs[initialIndex].click();
  new MutationObserver(updatePage).observe(tablist, {subtree:true, attributes:true, attributeFilter:['aria-selected']});
  updatePage();
})();
