/* Motion enhancements for the static site. Native interactions remain the fallback. */
(() => {
  const runtime = window.Motion;
  if (!runtime || !['animate', 'inView', 'scroll', 'hover', 'press', 'stagger', 'spring'].every(key => typeof runtime[key] === 'function')) return;

  const { animate, inView, scroll, hover, press, stagger, spring } = runtime;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 1080px)');
  const running = new Set();
  const buttons = new Map();
  let menuAnimations = [];
  let menuRevision = 0;
  let stopProgress;
  let initialized = false;

  function play(elements, keyframes, options, clean = []) {
    const animation = animate(elements, keyframes, options);
    running.add(animation);
    animation.then(() => {
      running.delete(animation);
      if (!clean.length) return;
      animation.cancel();
      const targets = elements instanceof Element ? [elements] : Array.from(elements);
      targets.forEach(element => clean.forEach(property => element.style.removeProperty(property)));
    });
    return animation;
  }

  function stopMenu() {
    menuAnimations.forEach(animation => { animation.stop(); running.delete(animation); });
    menuAnimations = [];
  }

  function setMenuOpen(nav, toggle, open) {
    const revision = ++menuRevision;
    const visible = nav.classList.contains('is-open');
    stopMenu();
    toggle.setAttribute('aria-expanded', String(open));
    const labels = document.documentElement.lang === 'en' ? ['Open menu', 'Close menu']
      : document.documentElement.lang === 'pt-BR' ? ['Abrir menu', 'Fechar menu'] : ['Abrir menú', 'Cerrar menú'];
    toggle.setAttribute('aria-label', labels[Number(open)]);
    nav.inert = mobile.matches && !open;
    const links = [...nav.querySelectorAll('a')];
    const bars = [...toggle.querySelectorAll('span')];

    if (reduced.matches || !mobile.matches) {
      nav.classList.toggle('is-open', mobile.matches && open);
      [nav, ...links, ...bars].forEach(element => {
        element.style.removeProperty('opacity');
        element.style.removeProperty('transform');
      });
      return;
    }

    if (open) nav.classList.add('is-open');
    if (!open && !visible) return;
    const panel = play(nav, {
      opacity: open ? [visible ? Number(getComputedStyle(nav).opacity) : 0, 1] : 0,
      transform: open ? [visible ? getComputedStyle(nav).transform : 'translateY(-8px)', 'translateY(0px)'] : 'translateY(-8px)',
    }, { duration: open ? 0.24 : 0.16, ease: 'easeOut' });
    menuAnimations.push(panel);
    if (open) menuAnimations.push(play(links, {
      opacity: [0, 1], transform: ['translateY(-5px)', 'translateY(0px)'],
    }, { duration: 0.22, delay: stagger(0.025), ease: 'easeOut' }));
    bars.forEach((bar, index) => {
      const transform = open && index !== 1
        ? `translateY(${index === 0 ? 6 : -6}px) rotate(${index === 0 ? 45 : -45}deg)`
        : 'translateY(0px) rotate(0deg)';
      menuAnimations.push(play(bar, { transform, opacity: open && index === 1 ? 0 : 1 }, { duration: 0.2, ease: 'easeOut' }));
    });
    panel.then(() => {
      if (revision !== menuRevision) return;
      if (!open) nav.classList.remove('is-open');
      panel.cancel();
      [nav, ...links].forEach(element => {
        element.style.removeProperty('opacity');
        element.style.removeProperty('transform');
      });
    });
  }

  function productChange(panel) {
    if (!panel || reduced.matches) return;
    const contents = [...panel.children].filter(element => !element.hidden);
    play(panel, { transform: ['translateY(8px)', 'translateY(0px)'] }, {
      type: 'spring', duration: 0.42, bounce: 0.06,
    }, ['transform']);
    play(contents, { opacity: [0, 1] }, {
      duration: 0.22, delay: stagger(0.025), ease: 'easeOut',
    }, ['opacity']);
  }

  function configureProgress() {
    stopProgress?.();
    stopProgress = undefined;
    let indicator = document.querySelector('.motion-scroll-progress');
    if (reduced.matches) { indicator?.remove(); return; }
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'motion-scroll-progress';
      indicator.setAttribute('aria-hidden', 'true');
      document.body.append(indicator);
    }
    const animation = animate(indicator, { transform: ['scaleX(0)', 'scaleX(1)'] }, { ease: 'linear' });
    const cancelScroll = scroll(animation, { trackContentSize: true });
    stopProgress = () => { cancelScroll(); animation.cancel(); };
  }

  function init() {
    if (initialized) return;
    initialized = true;
    document.documentElement.classList.add('motion-enabled');
    const reveals = [...document.querySelectorAll('.reveal')];
    reveals.forEach(element => {
      element.classList.add('motion-reveal');
      if (reduced.matches || element.closest('.hero')) { element.classList.add('is-visible'); return; }
      inView(element, () => {
        element.classList.add('is-visible');
        if (!reduced.matches) play(element, {
          opacity: [0, 1], transform: ['translateY(18px)', 'translateY(0px)'],
        }, { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }, ['opacity', 'transform']);
      }, { amount: 0.16 });
    });

    // Sample Motion's spring into CSS linear() so the existing 3D drag retains ownership.
    const generator = spring({ keyframes: [0, 1], duration: 640, bounce: 0.08 });
    const samples = Array.from({ length: 41 }, (_, index) => `${generator.next(index * 16).value.toFixed(4)} ${index * 2.5}%`);
    const curve = `linear(${samples.join(', ')})`;
    const showroom = document.querySelector('.showroom');
    if (showroom && CSS.supports('transition-timing-function', curve)) showroom.style.setProperty('--motion-spring', curve);
    if (showroom) inView(showroom, () => productChange(showroom.querySelector('.showroom-panel:not([hidden])')), { amount: 0.15 });

    document.querySelectorAll('.button, .nav-toggle').forEach(button => {
      const state = { hovered: false, pressed: false, animation: null };
      buttons.set(button, state);
      function update() {
        if (reduced.matches) return;
        state.animation?.stop();
        running.delete(state.animation);
        state.animation = play(button, {
          transform: `translateY(${state.hovered && !state.pressed ? -2 : 0}px) scale(${state.pressed ? 0.98 : 1})`,
        }, { type: 'spring', duration: 0.28, bounce: 0.05 });
      }
      hover(button, () => { state.hovered = true; update(); return () => { state.hovered = false; update(); }; });
      press(button, () => { state.pressed = true; update(); return () => { state.pressed = false; update(); }; });
    });

    const nav = document.querySelector('[data-nav]');
    const toggle = document.querySelector('[data-nav-toggle]');
    if (nav && toggle) {
      nav.inert = mobile.matches && toggle.getAttribute('aria-expanded') !== 'true';
      mobile.addEventListener('change', () => setMenuOpen(nav, toggle, false));
    }
    configureProgress();
    reduced.addEventListener('change', () => {
      if (reduced.matches) {
        [...running].forEach(animation => animation.complete());
        reveals.forEach(element => element.classList.add('is-visible'));
        buttons.forEach((state, button) => {
          state.animation?.cancel();
          button.style.removeProperty('transform');
        });
        if (nav && toggle) setMenuOpen(nav, toggle, toggle.getAttribute('aria-expanded') === 'true');
      }
      configureProgress();
    });
  }

  window.NiuMotion = { init, setMenuOpen, productChange };
})();
