// Enhance the existing catalogue: retain its fields, data and event listeners.
window.setupProductShowroom = function (carousel) {
  if (!carousel) return;
  const cards = [...carousel.querySelectorAll('.product-card')];
  if (!cards.length) return;
  const isEnglish = document.documentElement.lang === 'en';
  const names = cards.map(card => card.querySelector('h3').textContent);
  carousel.className = 'showroom';
  carousel.innerHTML = `<div class="showroom-top"><span>${isEnglish ? 'EXPLORE OUR LINES' : 'EXPLORÁ NUESTRAS LÍNEAS'}</span><span class="showroom-counter" aria-live="polite"></span></div>
    <div class="showroom-layout"><div class="showroom-stage" aria-label="${isEnglish ? 'Products in perspective' : 'Productos en perspectiva'}">
      <div class="showroom-art"></div>
      <div class="showroom-stage-controls"><button type="button" data-step="-1" aria-label="${isEnglish ? 'Previous product' : 'Producto anterior'}">←</button><span>${isEnglish ? 'DRAG TO EXPLORE' : 'ARRASTRÁ PARA EXPLORAR'}</span><button type="button" data-step="1" aria-label="${isEnglish ? 'Next product' : 'Producto siguiente'}">→</button></div>
    </div><div class="showroom-details"></div></div><div class="showroom-tabs" role="tablist" aria-label="${isEnglish ? 'Product lines' : 'Líneas de producto'}"></div>`;
  const stage = carousel.querySelector('.showroom-stage');
  const art = carousel.querySelector('.showroom-art');
  const details = carousel.querySelector('.showroom-details');
  const tablist = carousel.querySelector('.showroom-tabs');
  let active = 0;
  const images = [], panels = [], tabs = [];
  cards.forEach((card, index) => {
    const image = card.querySelector('.product-card-media img');
    const figure = document.createElement('button');
    figure.type = 'button';
    figure.className = 'showroom-product';
    figure.setAttribute('aria-label', `${isEnglish ? 'Explore' : 'Explorar'} ${names[index]}`);
    image.draggable = false;
    figure.append(image);
    figure.addEventListener('click', () => show(index));
    art.append(figure);
    images.push(figure);
    const panel = document.createElement('div');
    panel.className = 'showroom-panel';
    panel.id = `showroom-panel-${index}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `showroom-tab-${index}`);
    panel.innerHTML = `<p class="showroom-kicker">${isEnglish ? 'MADE FOR YOUR BRAND' : 'HECHO PARA TU MARCA'}</p>`;
    panel.append(card.querySelector('h3'), card.querySelector('p'), card.querySelector('.product-fields'));
    const link = document.createElement('a');
    link.className = 'button showroom-consult';
    link.textContent = isEnglish ? 'Inquire about this product ↗' : 'Consultar este producto ↗';
    link.target = '_blank';
    link.rel = 'noopener';
    function updateLink() {
      const selection = [...panel.querySelectorAll('.product-fields label')].map(label => {
        const title = label.firstChild.textContent.trim();
        const value = label.querySelector('.custom-select-trigger, .product-static-select')?.textContent.trim();
        return `${title}: ${value || '-'}`;
      });
      const intro = isEnglish
        ? `Hello, I would like to inquire about ${names[index]}.`
        : `Hola, quiero consultar por ${names[index]}.`;
      link.href = `https://wa.me/595971350619?text=${encodeURIComponent([intro, ...selection].join('\n'))}`;
    }
    panel.addEventListener('custom-select-change', updateLink);
    link.addEventListener('click', updateLink);
    // Size menus are initialized by main.js later in this same task.
    queueMicrotask(updateLink);
    panel.append(link);
    details.append(panel);
    panels.push(panel);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `showroom-tab-${index}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.append(document.createTextNode(names[index]));
    tab.addEventListener('click', () => show(index));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % cards.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + cards.length) % cards.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = cards.length - 1;
      if (target === undefined) return;
      event.preventDefault(); show(target); tabs[target].focus();
    });
    tabs.push(tab); tablist.append(tab);
  });
  function show(index) {
    active = (index + cards.length) % cards.length;
    carousel.querySelector('.showroom-counter').textContent = `${String(active + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
    images.forEach((image, i) => {
      let offset = (i - active + cards.length) % cards.length;
      if (offset > cards.length / 2) offset -= cards.length;
      image.dataset.position = offset === 0 ? 'active' : offset === -1 ? 'previous' : offset === 1 ? 'next' : 'hidden';
      image.tabIndex = Math.abs(offset) === 1 ? 0 : -1;
      image.setAttribute('aria-hidden', String(Math.abs(offset) > 1));
      panels[i].hidden = i !== active;
      tabs[i].setAttribute('aria-selected', String(i === active));
      tabs[i].tabIndex = i === active ? 0 : -1;
    });
    carousel.querySelectorAll('.custom-select.is-open').forEach(select => {
      select.classList.remove('is-open');
      select.querySelector('button').setAttribute('aria-expanded', 'false');
    });
  }
  carousel.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => show(active + Number(button.dataset.step))));
  let start = null;
  function relativeOffset(index) {
    let offset = (index - active + cards.length) % cards.length;
    if (offset > cards.length / 2) offset -= cards.length;
    return offset;
  }
  function clearDragStyles() {
    images.forEach(image => {
      image.style.removeProperty('transform');
      image.style.removeProperty('opacity');
    });
    carousel.classList.remove('is-dragging');
  }
  function previewDrag(dx) {
    const travel = Math.max(240, stage.getBoundingClientRect().width * .42);
    const progress = Math.max(-1, Math.min(1, dx / travel));
    const amount = Math.abs(progress);
    images.forEach((image, index) => {
      const offset = relativeOffset(index);
      let x;
      let z;
      let rotate;
      let scale;
      let opacity;
      if (offset === 0) {
        x = progress < 0 ? -50 - 62 * amount : -50 + 62 * amount;
        z = 60 - 360 * amount;
        rotate = progress < 0 ? -32 * amount : 32 * amount;
        scale = 1 - .32 * amount;
        opacity = 1 - .42 * amount;
      } else if (progress < 0 && offset === 1) {
        x = 12 - 62 * amount;
        z = -300 + 360 * amount;
        rotate = -32 * (1 - amount);
        scale = .68 + .32 * amount;
        opacity = .58 + .42 * amount;
      } else if (progress > 0 && offset === -1) {
        x = -112 + 62 * amount;
        z = -300 + 360 * amount;
        rotate = 32 * (1 - amount);
        scale = .68 + .32 * amount;
        opacity = .58 + .42 * amount;
      } else {
        image.style.removeProperty('transform');
        image.style.removeProperty('opacity');
        return;
      }
      image.style.transform = `translate(${x}%, ${-48 - 3 * amount}%) translateZ(${z}px) rotateY(${rotate}deg) scale(${scale})`;
      image.style.opacity = String(opacity);
    });
    return { progress, travel };
  }
  function resetDrag() {
    clearDragStyles();
  }
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('.showroom-stage-controls') || event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, index: images.indexOf(event.target.closest('.showroom-product')) };
    carousel.classList.add('is-dragging');
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    const clicked = start.index;
    start = null;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const { travel } = previewDrag(horizontal ? dx : 0);
    if (horizontal && Math.abs(dx) > Math.max(45, travel * .18)) show(active + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && clicked >= 0) show(clicked);
    requestAnimationFrame(resetDrag);
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  });
  stage.addEventListener('pointercancel', () => { start = null; resetDrag(); });
  stage.addEventListener('pointermove', event => {
    if (start) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      previewDrag(Math.abs(dx) > Math.abs(dy) ? dx : 0);
      return;
    }
    if (event.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = stage.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - .5;
    const y = (event.clientY - box.top) / box.height - .5;
    art.style.setProperty('--look-x', `${x * 13}deg`);
    art.style.setProperty('--look-y', `${-y * 9}deg`);
    art.style.setProperty('--scene-x', `${x * 18}px`);
    art.style.setProperty('--scene-y', `${y * 12}px`);
    stage.style.setProperty('--spot-x', `${(x + .5) * 100}%`);
    stage.style.setProperty('--spot-y', `${(y + .5) * 100}%`);
  });
  stage.addEventListener('pointerleave', () => {
    art.style.setProperty('--look-x', '0deg');
    art.style.setProperty('--look-y', '0deg');
    art.style.setProperty('--scene-x', '0px');
    art.style.setProperty('--scene-y', '0px');
    stage.style.setProperty('--spot-x', '50%');
    stage.style.setProperty('--spot-y', '42%');
  });
  carousel.addEventListener('keydown', event => {
    const select = event.target.closest('[data-custom-select]');
    if (!select) return;
    const options = [...select.querySelectorAll('[role="option"]')];
    if (event.key === 'Escape') {
      select.classList.remove('is-open');
      const trigger = select.querySelector('.custom-select-trigger');
      trigger.setAttribute('aria-expanded', 'false'); trigger.focus();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); select.classList.add('is-open');
      select.querySelector('.custom-select-trigger').setAttribute('aria-expanded', 'true');
      const current = options.indexOf(document.activeElement);
      options[(current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
    }
  });
  show(0);
};
