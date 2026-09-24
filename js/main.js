const header = document.querySelector('[data-header]');
const nav = document.querySelector('[data-nav]');
const navToggle = document.querySelector('[data-nav-toggle]');
const reveals = document.querySelectorAll('.reveal');
const tiltCards = document.querySelectorAll('[data-tilt]');
const whatsappForm = document.querySelector('[data-whatsapp-form]');
const productsSection = document.querySelector('#productos');
const productCarousel = document.querySelector('[data-product-carousel]');
const cupType = productsSection?.querySelector('[data-cup-type]');
const cupSize = productsSection?.querySelector('[data-cup-size]');
const lidType = productsSection?.querySelector('[data-lid-type]');
const lidSize = productsSection?.querySelector('[data-lid-size]');
const customSelects = productsSection?.querySelectorAll('[data-custom-select]') || [];

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.addEventListener('click', (event) => {
    if (event.target.tagName === 'A') {
      nav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

window.addEventListener('scroll', () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 24);
}, { passive: true });

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.16 });

reveals.forEach((element) => revealObserver.observe(element));

function rotateElement(event, wrapper, target, maxRotate = 10) {
  const rect = wrapper.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  target.style.transform = `rotateX(${(-y * maxRotate).toFixed(2)}deg) rotateY(${(x * maxRotate).toFixed(2)}deg) rotateZ(-4deg)`;
}

tiltCards.forEach((card) => {
  card.addEventListener('mousemove', (event) => rotateElement(event, card, card, 6));
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

function setupProductCarousel(carousel) {
  const track = carousel?.querySelector('[data-carousel-track]');
  const cards = [...(track?.querySelectorAll('.product-card') || [])];
  const prev = carousel?.querySelector('[data-carousel-prev]');
  const next = carousel?.querySelector('[data-carousel-next]');
  if (!carousel || !track || cards.length < 2) return;
  if (carousel.dataset.initialized === 'true') return;
  carousel.dataset.initialized = 'true';

  let activeIndex = 0;
  let startX = 0;
  let isDragging = false;
  const total = cards.length;

  function getCircularOffset(index) {
    let offset = index - activeIndex;
    if (offset > total / 2) offset -= total;
    if (offset < -total / 2) offset += total;
    return offset;
  }

  function getLayout() {
    const bounds = carousel.getBoundingClientRect();
    const sideX = Math.max(260, Math.min(350, bounds.width * 0.3));
    const farX = Math.max(390, Math.min(540, bounds.width * 0.46));
    return { sideX, farX };
  }

  function updateCarousel() {
    const { sideX, farX } = getLayout();
    cards.forEach((card, index) => {
      const offset = getCircularOffset(index);

      card.classList.remove('is-active', 'is-prev', 'is-next', 'is-far-prev', 'is-far-next', 'is-hidden', 'is-near');
      card.style.pointerEvents = 'none';
      card.style.filter = '';

      if (offset === 0) {
        card.classList.add('is-active');
        card.style.zIndex = '80';
        card.style.opacity = '1';
        card.style.transform = 'translate(-50%, -50%) translateX(0) translateZ(0) rotateY(0deg) scale(1.06)';
        card.style.pointerEvents = 'auto';
      } else if (offset === 1) {
        card.classList.add('is-next');
        card.style.zIndex = '20';
        card.style.opacity = '0.78';
        card.style.transform = `translate(-50%, -50%) translateX(${sideX}px) translateZ(-140px) rotateY(-18deg) scale(0.9)`;
      } else if (offset === -1) {
        card.classList.add('is-prev');
        card.style.zIndex = '20';
        card.style.opacity = '0.78';
        card.style.transform = `translate(-50%, -50%) translateX(${-sideX}px) translateZ(-140px) rotateY(18deg) scale(0.9)`;
      } else if (offset > 1) {
        card.classList.add('is-far-next', 'is-hidden');
        card.style.zIndex = '1';
        card.style.opacity = '0';
        card.style.transform = `translate(-50%, -50%) translateX(${farX}px) translateZ(-280px) rotateY(-28deg) scale(0.68)`;
      } else if (offset < -1) {
        card.classList.add('is-far-prev', 'is-hidden');
        card.style.zIndex = '1';
        card.style.opacity = '0';
        card.style.transform = `translate(-50%, -50%) translateX(${-farX}px) translateZ(-280px) rotateY(28deg) scale(0.68)`;
      }
    });
  }

  function showNext() {
    activeIndex = (activeIndex + 1) % total;
    updateCarousel();
  }

  function showPrev() {
    activeIndex = (activeIndex - 1 + total) % total;
    updateCarousel();
  }

  function canStartDrag(target) {
    return !target.closest('button, a, select, input, textarea, label, [data-custom-select]');
  }

  carousel.classList.add('is-3d');
  updateCarousel();

  prev?.addEventListener('click', showPrev);
  next?.addEventListener('click', showNext);

  carousel.addEventListener('pointerdown', (event) => {
    if (!canStartDrag(event.target)) return;
    isDragging = true;
    startX = event.clientX;
    carousel.classList.add('is-dragging');
    carousel.setPointerCapture(event.pointerId);
    closeCustomSelects();
  });

  const endDrag = (event) => {
    if (!isDragging) return;
    const delta = event.clientX - startX;
    isDragging = false;
    carousel.classList.remove('is-dragging');
    if (carousel.hasPointerCapture(event.pointerId)) {
      carousel.releasePointerCapture(event.pointerId);
    }
    if (Math.abs(delta) > 45) {
      delta < 0 ? showNext() : showPrev();
    }
  };

  carousel.addEventListener('pointerup', endDrag);
  carousel.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', updateCarousel);
}

if (window.setupProductShowroom) {
  window.setupProductShowroom(productCarousel);
} else {
  setupProductCarousel(productCarousel);
}

function closeCustomSelects(except) {
  customSelects.forEach((select) => {
    if (select !== except) {
      select.classList.remove('is-open');
      select.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
}

function setCustomSelectValue(select, value, label = value) {
  if (!select) return;
  const trigger = select.querySelector('.custom-select-trigger');
  const options = select.querySelectorAll('.custom-select-option');

  select.dataset.value = value;
  if (trigger) trigger.textContent = label;
  options.forEach((option) => {
    const isActive = option.dataset.value === value;
    option.classList.toggle('active', isActive);
    option.setAttribute('aria-selected', String(isActive));
  });
}

function fillCustomSelect(select, options) {
  if (!select) return;
  const menu = select.querySelector('.custom-select-menu');
  if (!menu) return;

  menu.innerHTML = '';
  options.forEach((option, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `custom-select-option${index === 0 ? ' active' : ''}`;
    item.dataset.value = option;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(index === 0));
    item.textContent = option;
    menu.appendChild(item);
  });
  setCustomSelectValue(select, options[0] || '', options[0] || '');
}

if (cupType && cupSize) {
  const cupSizes = {
    simple: ['4 oz', '8 oz', '10 oz', '12 oz', '14 oz', '16 oz', '21 oz', '24 oz'],
    doble: ['8 oz', '12 oz'],
  };

  const updateCupSizes = () => fillCustomSelect(cupSize, cupSizes[cupType.dataset.value] || cupSizes.simple);
  cupType.addEventListener('custom-select-change', updateCupSizes);
  updateCupSizes();
}

if (lidType && lidSize) {
  const lidSizes = {
    pico: ['6 oz', '8 oz', '12 oz', '16 oz', '21 oz', '24 oz'],
    'sin-pico': ['6 oz', '8 oz', '12 oz', '16 oz'],
  };

  const updateLidSizes = () => fillCustomSelect(lidSize, lidSizes[lidType.dataset.value] || lidSizes.pico);
  lidType.addEventListener('custom-select-change', updateLidSizes);
  updateLidSizes();
}

customSelects.forEach((select) => {
  const trigger = select.querySelector('.custom-select-trigger');

  trigger?.addEventListener('click', () => {
    const willOpen = !select.classList.contains('is-open');
    closeCustomSelects(select);
    select.classList.toggle('is-open', willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
  });

  select.addEventListener('click', (event) => {
    const option = event.target.closest('.custom-select-option');
    if (!option) return;

    setCustomSelectValue(select, option.dataset.value || option.textContent, option.textContent);
    select.classList.remove('is-open');
    trigger?.setAttribute('aria-expanded', 'false');
    select.dispatchEvent(new CustomEvent('custom-select-change', { bubbles: true }));
  });
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-custom-select]')) closeCustomSelects();
});

if (whatsappForm) {
  whatsappForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(whatsappForm);
    const isEnglish = document.documentElement.lang === 'en';
    const lines = isEnglish
      ? [
          'Hello, I would like to request a quote for NIU PACK products.',
          `Name: ${data.get('nombre') || '-'}`,
          `Company: ${data.get('empresa') || '-'}`,
          `Phone: ${data.get('telefono') || '-'}`,
          `Product: ${data.get('producto') || '-'}`,
          `Message: ${data.get('mensaje') || '-'}`,
        ]
      : [
          'Hola, quiero solicitar una cotización de productos NIU PACK.',
          `Nombre: ${data.get('nombre') || '-'}`,
          `Empresa: ${data.get('empresa') || '-'}`,
          `Teléfono: ${data.get('telefono') || '-'}`,
          `Producto: ${data.get('producto') || '-'}`,
          `Mensaje: ${data.get('mensaje') || '-'}`,
        ];

    window.open(`https://wa.me/595971350619?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  });
}
