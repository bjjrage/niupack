// Enhance the existing catalogue: retain its fields, data and event listeners.
window.setupProductShowroom = function (carousel) {
  if (!carousel) return;
  const cards = [...carousel.querySelectorAll('.product-card')];
  if (!cards.length) return;
  const isEnglish = document.documentElement.lang === 'en';
  const isPortuguese = document.documentElement.lang === 'pt-BR';
  const copy = isPortuguese
    ? {
        exploreLines: 'EXPLORE NOSSAS LINHAS',
        stageLabel: 'Produtos em perspectiva',
        previous: 'Produto anterior',
        next: 'Próximo produto',
        drag: 'ARRASTE PARA EXPLORAR',
        productLines: 'Linhas de produtos',
        explore: 'Explorar',
        madeForBrand: 'FEITO PARA SUA MARCA',
        inquire: 'Consultar este produto ↗',
        inquireIntro: (name) => `Olá, gostaria de consultar sobre ${name}.`,
      }
    : isEnglish
      ? {
          exploreLines: 'EXPLORE OUR LINES',
          stageLabel: 'Products in perspective',
          previous: 'Previous product',
          next: 'Next product',
          drag: 'DRAG TO EXPLORE',
          productLines: 'Product lines',
          explore: 'Explore',
          madeForBrand: 'MADE FOR YOUR BRAND',
          inquire: 'Inquire about this product ↗',
          inquireIntro: (name) => `Hello, I would like to inquire about ${name}.`,
        }
      : {
          exploreLines: 'EXPLORÁ NUESTRAS LÍNEAS',
          stageLabel: 'Productos en perspectiva',
          previous: 'Producto anterior',
          next: 'Producto siguiente',
          drag: 'ARRASTRÁ PARA EXPLORAR',
          productLines: 'Líneas de producto',
          explore: 'Explorar',
          madeForBrand: 'HECHO PARA TU MARCA',
          inquire: 'Consultar este producto ↗',
          inquireIntro: (name) => `Hola, quiero consultar por ${name}.`,
        };
  const names = cards.map(card => card.querySelector('h3').textContent);
  carousel.className = 'showroom';
  carousel.innerHTML = `<div class="showroom-top"><span>${copy.exploreLines}</span><span class="showroom-counter" aria-live="polite"></span></div>
    <div class="showroom-layout"><div class="showroom-stage" aria-label="${copy.stageLabel}">
      <div class="showroom-art"></div>
      <div class="showroom-stage-controls"><button type="button" data-step="-1" aria-label="${copy.previous}">←</button><span>${copy.drag}</span><button type="button" data-step="1" aria-label="${copy.next}">→</button></div>
    </div><div class="showroom-details"></div></div><div class="showroom-tabs" role="tablist" aria-label="${copy.productLines}"></div>`;
  const stage = carousel.querySelector('.showroom-stage');
  const art = carousel.querySelector('.showroom-art');
  const details = carousel.querySelector('.showroom-details');
  const tablist = carousel.querySelector('.showroom-tabs');
  const counter = carousel.querySelector('.showroom-counter');
  const stageHint = carousel.querySelector('.showroom-stage-controls span');
  const dragSizesCopy = isPortuguese ? 'ARRASTE ENTRE TAMANHOS' : isEnglish ? 'DRAG THROUGH SIZES' : 'ARRASTR\u00c1 ENTRE TAMA\u00d1OS';
  let active = 0;
  let nestedCarousel = null;
  const images = [], panels = [], tabs = [], visualResetters = [], measurementRefreshers = [];

  function leaveNestedCarousel() {
    if (!nestedCarousel) return;
    nestedCarousel.deactivate();
    nestedCarousel = null;
    carousel.classList.remove('is-size-carousel');
    stageHint.textContent = copy.drag;
  }

  function enterNestedCarousel(controller) {
    if (nestedCarousel && nestedCarousel !== controller) nestedCarousel.deactivate();
    nestedCarousel = controller;
    carousel.classList.add('is-size-carousel');
    stageHint.textContent = dragSizesCopy;
    controller.activate();
  }

  function navigateStage(step) {
    if (nestedCarousel) nestedCarousel.step(step);
    else show(active + step);
  }

  function applyMeasurementLayout(figure, measures, variant, fallbackAspect) {
    const aspect = variant.imageAspect || fallbackAspect;
    const availableWidth = figure.clientWidth;
    const availableHeight = figure.clientHeight;
    if (!availableWidth || !availableHeight) return;
    let boxWidth = availableWidth;
    let boxHeight = boxWidth / aspect;
    if (boxHeight > availableHeight) {
      boxHeight = availableHeight;
      boxWidth = boxHeight * aspect;
    }
    const bounds = variant.measureBounds;
    measures.style.width = `${boxWidth}px`;
    measures.style.height = `${boxHeight}px`;
    measures.style.setProperty('--cup-display-scale', variant.scale);
    measures.style.setProperty('--cup-display-width-scale', variant.widthScale || '1');
    measures.style.setProperty('--measure-object-left', `${bounds.left}%`);
    measures.style.setProperty('--measure-object-right', `${bounds.right}%`);
    measures.style.setProperty('--measure-object-top', `${bounds.top}%`);
    measures.style.setProperty('--measure-object-bottom', `${bounds.bottom}%`);
  }

  function setVisualSelectValue(select, value) {
    if (!select) return;
    const options = [...select.querySelectorAll('.custom-select-option')];
    const selectedOption = options.find(option => option.dataset.value === value);
    if (!selectedOption) return;
    select.dataset.value = value;
    select.classList.remove('is-open');
    const trigger = select.querySelector('.custom-select-trigger');
    if (trigger) {
      trigger.textContent = selectedOption.textContent;
      trigger.setAttribute('aria-expanded', 'false');
    }
    options.forEach(option => {
      const isSelected = option === selectedOption;
      option.classList.toggle('active', isSelected);
      option.setAttribute('aria-selected', String(isSelected));
    });
  }

  cards.forEach((card, index) => {
    visualResetters[index] = null;
    const image = card.querySelector('.product-card-media img');
    const isCupCard = card.hasAttribute('data-cup-card');
    const isBowlCard = Boolean(card.querySelector('[data-bowl-size]'));
    const figure = document.createElement('button');
    figure.type = 'button';
    figure.className = 'showroom-product';
    figure.setAttribute('aria-label', `${copy.explore} ${names[index]}`);
    image.draggable = false;
    figure.append(image);
    if (isCupCard) {
      figure.dataset.cupVisual = '';
      image.classList.add('showroom-cup-image', 'is-current');
    }
    figure.addEventListener('click', () => show(index));
    art.append(figure);
    images.push(figure);
    const panel = document.createElement('div');
    panel.className = 'showroom-panel';
    panel.id = `showroom-panel-${index}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `showroom-tab-${index}`);
    panel.innerHTML = `<p class="showroom-kicker">${copy.madeForBrand}</p>`;
    panel.append(card.querySelector('h3'), card.querySelector('p'), card.querySelector('.product-fields'));
    if (isCupCard) {
      const typeSelect = panel.querySelector('[data-cup-type]');
      const sizeSelect = panel.querySelector('[data-cup-size]');
      const nextImage = document.createElement('img');
      nextImage.className = 'showroom-cup-image';
      nextImage.draggable = false;
      nextImage.alt = '';
      figure.append(nextImage);
      const measures = document.createElement('span');
      measures.className = 'showroom-cup-measures';
      measures.setAttribute('aria-hidden', 'true');
      measures.innerHTML = '<span class="cup-measure cup-measure-diameter"><span class="cup-measure-value"></span></span><span class="cup-measure cup-measure-height"><span class="cup-measure-value"></span></span>';
      figure.append(measures);
      const dimensionSource = document.createElement('p');
      dimensionSource.className = 'showroom-dimension-source';
      dimensionSource.hidden = true;
      panel.querySelector('.product-fields').after(dimensionSource);

      // Boca superior (A) y altura (B), en mm, de las fichas técnicas provistas.
      const cupDimensions = {
        '4 oz': { diameter: '69,5', height: '44', approximate: true },
        '6 oz': { diameter: '70,5', height: '66' },
        '8 oz': { diameter: '78,12', height: '83' },
        '12 oz': { diameter: '83,8', height: '110' },
        '16 oz': { diameter: '89,4', height: '124,5', sheetType: 'doble' },
        '21 oz': { diameter: '89,65', height: '161', sheetType: 'doble' },
        '24 oz': { diameter: '91,5', height: '177', sheetType: 'doble' },
      };
      const diameterValue = measures.querySelector('.cup-measure-diameter .cup-measure-value');
      const heightValue = measures.querySelector('.cup-measure-height .cup-measure-value');
      function showCupDimensions(type, size, variant) {
        const dimensions = type === 'simple' ? cupDimensions[size] : null;
        figure.classList.toggle('has-cup-measures', Boolean(dimensions && variant));
        dimensionSource.hidden = !dimensions?.sheetType && !dimensions?.approximate;
        if (dimensions?.approximate) dimensionSource.textContent = isPortuguese
          ? 'Medidas aproximadas; ficha técnica específica do copo de 4 oz pendente.'
          : isEnglish
            ? 'Approximate dimensions; specific 4 oz cup technical sheet pending.'
            : 'Medidas aproximadas; ficha técnica específica del vaso de 4 oz pendiente.';
        else if (dimensions?.sheetType) dimensionSource.textContent = isPortuguese
          ? 'Cotas da ficha de parede dupla; imagem ilustrativa de parede simples.'
          : isEnglish
            ? 'Dimensions from the double-wall sheet; single-wall image is illustrative.'
            : 'Cotas de la ficha de pared doble; imagen ilustrativa de pared simple.';
        if (!dimensions || !variant) return;
        const approximateMark = dimensions.approximate ? '≈ ' : '';
        diameterValue.textContent = `${approximateMark}Ø ${dimensions.diameter} mm`;
        heightValue.textContent = `${approximateMark}${dimensions.height} mm`;
        applyMeasurementLayout(figure, measures, variant, 2 / 3);
      }

      const cupImages = {
        simple: {
          all: { src: image.getAttribute('src'), scale: '1' },
          '4 oz': { src: 'assets/showroom/cup-single-4oz-v3.png', scale: '.62', measureBounds: { left: 5.8, right: 5.7, top: 14.8, bottom: 14.8 } },
          '6 oz': { src: 'assets/showroom/cup-single-6oz-v3.png', scale: '.7', measureBounds: { left: 7.7, right: 7.4, top: 17.2, bottom: 13.4 } },
          '8 oz': { src: 'assets/showroom/cup-single-8oz-v5.png', scale: '.78', widthScale: '1.07', measureBounds: { left: 5.3, right: 5.1, top: 15.8, bottom: 11.1 } },
          '12 oz': { src: 'assets/showroom/cup-single-12oz-v3.png', scale: '.88', measureBounds: { left: 5.8, right: 5.7, top: 7.6, bottom: 10.2 } },
          '16 oz': { src: 'assets/showroom/cup-single-16oz-v4.png', scale: '.96', imageAspect: 1079 / 1458, measureBounds: { left: 7.3, right: 7.4, top: 9.8, bottom: 8 } },
          '21 oz': { src: 'assets/showroom/cup-single-21oz-v3.png', scale: '1', measureBounds: { left: 12.2, right: 12.2, top: 8.8, bottom: 8.1 } },
          '24 oz': { src: 'assets/showroom/cup-single-24oz-v3.png', scale: '1.04', measureBounds: { left: 12.2, right: 12.2, top: 5.3, bottom: 7.6 } },
        },
        doble: {
          all: { src: 'assets/showroom/cups-double-all-v3.png', scale: '1' },
          '8 oz': { src: 'assets/showroom/cup-double-8oz-v3.png', scale: '.78' },
          '12 oz': { src: 'assets/showroom/cup-double-12oz-v3.png', scale: '.96' },
        },
      };
      let currentImage = image;
      let requestedImage = 0;
      let railType = '';
      let railItems = [];

      function availableSizes(type) {
        return Object.keys(cupImages[type]).filter(size => size !== 'all');
      }

      function selectCupSize(size) {
        setVisualSelectValue(sizeSelect, size);
        sizeSelect.dispatchEvent(new CustomEvent('custom-select-change', { bubbles: true }));
      }

      function buildSizeRail(type) {
        if (railType === type && railItems.length) return;
        railItems.forEach(item => item.button.remove());
        railItems = availableSizes(type).map(size => {
          const variant = cupImages[type][size];
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'showroom-size-product';
          button.dataset.size = size;
          button.setAttribute('aria-label', `${copy.explore} ${names[index]} ${size}`);
          const railImage = document.createElement('img');
          railImage.src = variant.src;
          railImage.alt = '';
          railImage.draggable = false;
          railImage.style.setProperty('--cup-display-scale', variant.scale);
          railImage.style.setProperty('--cup-display-width-scale', variant.widthScale || '1');
          button.append(railImage);
          button.addEventListener('click', () => selectCupSize(size));
          art.append(button);
          return { button, image: railImage, size };
        });
        railType = type;
      }

      function positionSizeRail(type, size) {
        buildSizeRail(type);
        const sizes = availableSizes(type);
        const selectedIndex = sizes.indexOf(size);
        const selectedScale = Number(cupImages[type][size].scale) || 1;
        railItems.forEach(item => {
          const itemScale = Number(cupImages[type][item.size].scale) || 1;
          const normalization = Math.pow(selectedScale / itemScale, .75);
          item.image.style.setProperty('--cup-orbit-normalize', normalization.toFixed(4));
          let offset = sizes.indexOf(item.size) - selectedIndex;
          if (offset > sizes.length / 2) offset -= sizes.length;
          if (offset < -sizes.length / 2) offset += sizes.length;
          const position = offset === 0 ? 'selected' : offset === -1 ? 'previous' : offset === 1 ? 'next' : 'hidden';
          item.button.dataset.sizePosition = position;
          item.button.tabIndex = Math.abs(offset) === 1 ? 0 : -1;
          item.button.setAttribute('aria-hidden', String(Math.abs(offset) > 1 || offset === 0));
        });
        counter.textContent = `${String(selectedIndex + 1).padStart(2, '0')} / ${String(sizes.length).padStart(2, '0')}`;
      }

      const sizeCarouselController = {
        activate() {
          const type = typeSelect.dataset.value === 'doble' ? 'doble' : 'simple';
          const size = sizeSelect.dataset.value;
          if (availableSizes(type).includes(size)) positionSizeRail(type, size);
        },
        deactivate() {
          railItems.forEach(item => {
            item.button.dataset.sizePosition = 'hidden';
            item.button.tabIndex = -1;
            item.button.setAttribute('aria-hidden', 'true');
          });
        },
        step(step) {
          const type = typeSelect.dataset.value === 'doble' ? 'doble' : 'simple';
          const sizes = availableSizes(type);
          const current = Math.max(0, sizes.indexOf(sizeSelect.dataset.value));
          selectCupSize(sizes[(current + step + sizes.length) % sizes.length]);
        },
        preview(progress) {
          const amount = Math.abs(progress);
          const advancing = progress < 0;
          const targetPosition = advancing ? 'next' : 'previous';
          const oppositePosition = advancing ? 'previous' : 'next';
          const centerX = -50 + progress * 24;
          const centerZ = 150 - amount * 310;
          figure.style.transform = `translate(${centerX}%, -48%) translateZ(${centerZ}px) rotateY(${progress * 16}deg) scale(${1 - amount * .14})`;
          figure.style.opacity = String(1 - amount * .28);
          railItems.forEach(item => {
            const position = item.button.dataset.sizePosition;
            if (position === targetPosition) {
              const startX = advancing ? -8 : -92;
              const x = startX + ((-50 - startX) * amount);
              const startRotate = advancing ? -18 : 18;
              item.button.style.transform = `translate(${x}%, -50%) translateZ(${-220 + amount * 370}px) rotateY(${startRotate * (1 - amount)}deg) scale(${.78 + amount * .22})`;
              item.button.style.opacity = String(.46 + amount * .5);
              item.button.style.filter = `saturate(${.72 + amount * .28}) brightness(${.76 + amount * .24}) blur(${1 - amount}px)`;
              item.button.style.zIndex = '4';
            } else if (position === oppositePosition) {
              const startX = advancing ? -92 : -8;
              const x = startX + (advancing ? -26 : 26) * amount;
              item.button.style.transform = `translate(${x}%, -50%) translateZ(${-220 - amount * 180}px) rotateY(${advancing ? 18 : -18}deg) scale(${.78 - amount * .12})`;
              item.button.style.opacity = String(.46 * (1 - amount * .72));
            }
          });
        },
        clearPreview() {
          figure.style.removeProperty('transform');
          figure.style.removeProperty('opacity');
          railItems.forEach(item => {
            item.button.style.removeProperty('transform');
            item.button.style.removeProperty('opacity');
            item.button.style.removeProperty('filter');
            item.button.style.removeProperty('z-index');
          });
        },
      };

      function updateCupVisual() {
        const type = typeSelect.dataset.value === 'doble' ? 'doble' : 'simple';
        const selectedSize = sizeSelect.dataset.value;
        const size = selectedSize?.endsWith('oz') ? selectedSize : 'all';
        const variant = cupImages[type][size];
        const selection = `${typeSelect.querySelector('.custom-select-trigger').textContent}, ${sizeSelect.querySelector('.custom-select-trigger').textContent}`;
        const dimensions = type === 'simple' ? cupDimensions[size] : null;
        const dimensionLabel = dimensions ? `, Ø ${dimensions.diameter} mm, ${dimensions.height} mm` : '';
        figure.setAttribute('aria-label', `${copy.explore} ${names[index]}: ${selection}${dimensionLabel}`);
        const request = ++requestedImage;
        if (size !== 'all' && variant && active === index) {
          enterNestedCarousel(sizeCarouselController);
          positionSizeRail(type, size);
        } else if (nestedCarousel === sizeCarouselController) {
          leaveNestedCarousel();
          counter.textContent = `${String(active + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
        }
        // Unmocked sizes remain selectable without swapping the displayed product.
        if (!variant) { showCupDimensions(type, size, null); return; }
        if (currentImage.getAttribute('src') === variant.src) { showCupDimensions(type, size, variant); return; }
        showCupDimensions(type, size, null);

        const preload = new Image();
        preload.onload = () => {
          if (request !== requestedImage) return;
          const incoming = currentImage === image ? nextImage : image;
          incoming.classList.remove('is-current', 'is-exiting');
          incoming.src = variant.src;
          incoming.alt = selection;
          incoming.style.setProperty('--cup-display-scale', variant.scale);
          incoming.style.setProperty('--cup-display-width-scale', variant.widthScale || '1');
          void incoming.offsetWidth;
          currentImage.classList.remove('is-current');
          currentImage.classList.add('is-exiting');
          incoming.classList.add('is-current');
          currentImage = incoming;
          showCupDimensions(type, size, variant);
        };
        preload.src = variant.src;
      }

      panel.addEventListener('custom-select-change', () => queueMicrotask(updateCupVisual));
      measurementRefreshers.push(() => {
        const type = typeSelect.dataset.value === 'doble' ? 'doble' : 'simple';
        const selectedSize = sizeSelect.dataset.value;
        const size = selectedSize?.endsWith('oz') ? selectedSize : 'all';
        const variant = cupImages[type][size];
        if (type === 'simple' && cupDimensions[size] && variant) applyMeasurementLayout(figure, measures, variant, 2 / 3);
      });
      visualResetters[index] = () => {
        const allSizesLabel = isEnglish ? 'All' : 'Todos';
        setVisualSelectValue(typeSelect, 'simple');
        typeSelect.dispatchEvent(new CustomEvent('custom-select-change', { bubbles: true }));
        setVisualSelectValue(sizeSelect, allSizesLabel);
        sizeSelect.dispatchEvent(new CustomEvent('custom-select-change', { bubbles: true }));
      };
      image.style.setProperty('--cup-display-scale', '1');
      queueMicrotask(updateCupVisual);
    } else if (isBowlCard) {
      const sizeSelect = panel.querySelector('[data-bowl-size]');
      const nextImage = document.createElement('img');
      nextImage.className = 'showroom-cup-image';
      nextImage.draggable = false;
      nextImage.alt = '';
      figure.dataset.cupVisual = '';
      image.classList.add('showroom-cup-image', 'is-current');
      figure.append(nextImage);
      const measures = document.createElement('span');
      measures.className = 'showroom-cup-measures';
      measures.setAttribute('aria-hidden', 'true');
      measures.innerHTML = '<span class="cup-measure cup-measure-diameter"><span class="cup-measure-value"></span></span><span class="cup-measure cup-measure-height"><span class="cup-measure-value"></span></span>';
      figure.append(measures);
      const dimensionSource = document.createElement('p');
      dimensionSource.className = 'showroom-dimension-source';
      dimensionSource.hidden = true;
      panel.querySelector('.product-fields').after(dimensionSource);

      // Boca superior (A) y altura (B), en mm, de las fichas técnicas provistas.
      const bowlDimensions = {
        '3 oz': { diameter: '69,5', height: '40,7' },
        '5 oz': { diameter: '69,6', height: '47,2' },
        '8 oz': { diameter: '95,2', height: '55,5' },
        '20 oz': { diameter: '149', height: '78', approximate: true },
      };
      const diameterValue = measures.querySelector('.cup-measure-diameter .cup-measure-value');
      const heightValue = measures.querySelector('.cup-measure-height .cup-measure-value');

      function showBowlDimensions(size, variant) {
        const dimensions = bowlDimensions[size];
        figure.classList.toggle('has-cup-measures', Boolean(dimensions && variant));
        dimensionSource.hidden = !dimensions?.approximate;
        if (dimensions?.approximate) dimensionSource.textContent = isPortuguese
          ? 'Medidas aproximadas do mockup; ficha técnica de 20 oz pendente.'
          : isEnglish
            ? 'Approximate mockup dimensions; 20 oz technical sheet pending.'
            : 'Medidas aproximadas del mockup; ficha técnica de 20 oz pendiente.';
        if (!dimensions || !variant) return;
        const approximateMark = dimensions.approximate ? '≈ ' : '';
        diameterValue.textContent = `${approximateMark}Ø ${dimensions.diameter} mm`;
        heightValue.textContent = `${approximateMark}${dimensions.height} mm`;
        applyMeasurementLayout(figure, measures, variant, 3 / 2);
      }

      const bowlImages = {
        all: { src: image.getAttribute('src'), scale: '.7' },
        '3 oz': { src: 'assets/showroom/bowl-icecream-3oz-v4.png', scale: '.483', measureBounds: { left: 17.4, right: 17.7, top: 15.7, bottom: 12.4 } },
        '5 oz': { src: 'assets/showroom/bowl-icecream-5oz-v4.png', scale: '.483', widthScale: '.99', measureBounds: { left: 11.9, right: 12, top: 9.8, bottom: 7.1 } },
        '8 oz': { src: 'assets/showroom/bowl-icecream-8oz-v4.png', scale: '.574', measureBounds: { left: 14.1, right: 14.1, top: 13.3, bottom: 11.3 } },
        '20 oz': { src: 'assets/showroom/bowl-icecream-20oz-v5.png', scale: '.658', measureBounds: { left: 7.6, right: 7.6, top: 10.9, bottom: 7.8 } },
      };
      let currentImage = image;
      let requestedImage = 0;

      const bowlSizes = Object.keys(bowlImages).filter(size => size !== 'all');
      let bowlRailItems = [];

      function selectBowlSize(size) {
        setVisualSelectValue(sizeSelect, size);
        sizeSelect.dispatchEvent(new CustomEvent('custom-select-change', { bubbles: true }));
      }

      function buildBowlRail() {
        if (bowlRailItems.length) return;
        bowlRailItems = bowlSizes.map(size => {
          const variant = bowlImages[size];
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'showroom-size-product';
          button.dataset.size = size;
          button.setAttribute('aria-label', `${copy.explore} ${names[index]} ${size}`);
          const railImage = document.createElement('img');
          railImage.src = variant.src;
          railImage.alt = '';
          railImage.draggable = false;
          railImage.style.setProperty('--cup-display-scale', variant.scale);
          railImage.style.setProperty('--cup-display-width-scale', variant.widthScale || '1');
          button.append(railImage);
          button.addEventListener('click', () => selectBowlSize(size));
          art.append(button);
          return { button, image: railImage, size };
        });
      }

      function positionBowlRail(size) {
        buildBowlRail();
        const selectedIndex = bowlSizes.indexOf(size);
        const selectedScale = Number(bowlImages[size].scale) || 1;
        bowlRailItems.forEach(item => {
          const itemScale = Number(bowlImages[item.size].scale) || 1;
          const normalization = Math.pow(selectedScale / itemScale, .75);
          item.image.style.setProperty('--cup-orbit-normalize', normalization.toFixed(4));
          let offset = bowlSizes.indexOf(item.size) - selectedIndex;
          if (offset > bowlSizes.length / 2) offset -= bowlSizes.length;
          if (offset < -bowlSizes.length / 2) offset += bowlSizes.length;
          const position = offset === 0 ? 'selected' : offset === -1 ? 'previous' : offset === 1 ? 'next' : 'hidden';
          item.button.dataset.sizePosition = position;
          item.button.tabIndex = Math.abs(offset) === 1 ? 0 : -1;
          item.button.setAttribute('aria-hidden', String(Math.abs(offset) > 1 || offset === 0));
        });
        counter.textContent = `${String(selectedIndex + 1).padStart(2, '0')} / ${String(bowlSizes.length).padStart(2, '0')}`;
      }

      const bowlCarouselController = {
        activate() {
          const size = sizeSelect.dataset.value;
          if (bowlSizes.includes(size)) positionBowlRail(size);
        },
        deactivate() {
          bowlRailItems.forEach(item => {
            item.button.dataset.sizePosition = 'hidden';
            item.button.tabIndex = -1;
            item.button.setAttribute('aria-hidden', 'true');
          });
        },
        step(step) {
          const current = Math.max(0, bowlSizes.indexOf(sizeSelect.dataset.value));
          selectBowlSize(bowlSizes[(current + step + bowlSizes.length) % bowlSizes.length]);
        },
        preview(progress) {
          const amount = Math.abs(progress);
          const advancing = progress < 0;
          const targetPosition = advancing ? 'next' : 'previous';
          const oppositePosition = advancing ? 'previous' : 'next';
          const centerX = -50 + progress * 24;
          const centerZ = 150 - amount * 310;
          figure.style.transform = `translate(${centerX}%, -48%) translateZ(${centerZ}px) rotateY(${progress * 16}deg) scale(${1 - amount * .14})`;
          figure.style.opacity = String(1 - amount * .28);
          bowlRailItems.forEach(item => {
            const position = item.button.dataset.sizePosition;
            if (position === targetPosition) {
              const startX = advancing ? -8 : -92;
              const x = startX + ((-50 - startX) * amount);
              const startRotate = advancing ? -18 : 18;
              item.button.style.transform = `translate(${x}%, -50%) translateZ(${-220 + amount * 370}px) rotateY(${startRotate * (1 - amount)}deg) scale(${.78 + amount * .22})`;
              item.button.style.opacity = String(.46 + amount * .5);
              item.button.style.filter = `saturate(${.72 + amount * .28}) brightness(${.76 + amount * .24}) blur(${1 - amount}px)`;
              item.button.style.zIndex = '4';
            } else if (position === oppositePosition) {
              const startX = advancing ? -92 : -8;
              const x = startX + (advancing ? -26 : 26) * amount;
              item.button.style.transform = `translate(${x}%, -50%) translateZ(${-220 - amount * 180}px) rotateY(${advancing ? 18 : -18}deg) scale(${.78 - amount * .12})`;
              item.button.style.opacity = String(.46 * (1 - amount * .72));
            }
          });
        },
        clearPreview() {
          figure.style.removeProperty('transform');
          figure.style.removeProperty('opacity');
          bowlRailItems.forEach(item => {
            item.button.style.removeProperty('transform');
            item.button.style.removeProperty('opacity');
            item.button.style.removeProperty('filter');
            item.button.style.removeProperty('z-index');
          });
        },
      };

      function updateBowlVisual() {
        const selectedSize = sizeSelect.dataset.value;
        const size = selectedSize === 'Todos' || selectedSize === 'All' ? 'all' : selectedSize;
        const variant = bowlImages[size];
        const selection = sizeSelect.querySelector('.custom-select-trigger').textContent;
        const dimensions = bowlDimensions[size];
        const dimensionLabel = dimensions ? `, Ø ${dimensions.diameter} mm, ${dimensions.height} mm` : '';
        figure.setAttribute('aria-label', `${copy.explore} ${names[index]}: ${selection}${dimensionLabel}`);
        const request = ++requestedImage;
        if (size !== 'all' && variant && active === index) {
          enterNestedCarousel(bowlCarouselController);
          positionBowlRail(size);
        } else if (nestedCarousel === bowlCarouselController) {
          leaveNestedCarousel();
          counter.textContent = `${String(active + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
        }
        if (!variant) { showBowlDimensions(size, null); return; }
        if (currentImage.getAttribute('src') === variant.src) { showBowlDimensions(size, variant); return; }
        showBowlDimensions(size, null);

        const preload = new Image();
        preload.onload = () => {
          if (request !== requestedImage) return;
          const incoming = currentImage === image ? nextImage : image;
          incoming.classList.remove('is-current', 'is-exiting');
          incoming.src = variant.src;
          incoming.alt = selection;
          incoming.style.setProperty('--cup-display-scale', variant.scale);
          incoming.style.setProperty('--cup-display-width-scale', variant.widthScale || '1');
          void incoming.offsetWidth;
          currentImage.classList.remove('is-current');
          currentImage.classList.add('is-exiting');
          incoming.classList.add('is-current');
          currentImage = incoming;
          showBowlDimensions(size, variant);
        };
        preload.src = variant.src;
      }

      panel.addEventListener('custom-select-change', () => queueMicrotask(updateBowlVisual));
      measurementRefreshers.push(() => {
        const selectedSize = sizeSelect.dataset.value;
        const size = selectedSize === 'Todos' || selectedSize === 'All' ? 'all' : selectedSize;
        const variant = bowlImages[size];
        if (bowlDimensions[size] && variant) applyMeasurementLayout(figure, measures, variant, 3 / 2);
      });
      visualResetters[index] = () => {
        setVisualSelectValue(sizeSelect, isEnglish ? 'All' : 'Todos');
        sizeSelect.dispatchEvent(new CustomEvent('custom-select-change', { bubbles: true }));
      };
      image.style.setProperty('--cup-display-scale', '1');
      queueMicrotask(updateBowlVisual);
    }
    const link = document.createElement('a');
    link.className = 'button showroom-consult';
    link.textContent = copy.inquire;
    link.target = '_blank';
    link.rel = 'noopener';
    function updateLink() {
      const selection = [...panel.querySelectorAll('.product-fields label')].map(label => {
        const title = label.firstChild.textContent.trim();
        const value = label.querySelector('.custom-select-trigger, .product-static-select')?.textContent.trim();
        return `${title}: ${value || '-'}`;
      });
      const intro = copy.inquireIntro(names[index]);
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
  window.addEventListener('resize', () => measurementRefreshers.forEach(refresh => refresh()), { passive: true });
  function show(index) {
    const nextActive = (index + cards.length) % cards.length;
    if (nextActive !== active) {
      leaveNestedCarousel();
      visualResetters.forEach(reset => reset?.());
    }
    active = nextActive;
    counter.textContent = `${String(active + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
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
  carousel.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => navigateStage(Number(button.dataset.step))));
  let start = null;
  function relativeOffset(index) {
    let offset = (index - active + cards.length) % cards.length;
    if (offset > cards.length / 2) offset -= cards.length;
    return offset;
  }
  function clearDragStyles() {
    carousel.classList.remove('is-dragging');
    requestAnimationFrame(() => {
      nestedCarousel?.clearPreview?.();
      images.forEach(image => {
        image.style.removeProperty('transform');
        image.style.removeProperty('opacity');
      });
    });
  }
  function previewDrag(dx) {
    const travel = Math.max(240, stage.getBoundingClientRect().width * .42);
    const progress = Math.max(-1, Math.min(1, dx / travel));
    const amount = Math.abs(progress);
    if (nestedCarousel) {
      nestedCarousel.preview(progress);
      return { progress, travel };
    }
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
    if (horizontal && Math.abs(dx) > Math.max(45, travel * .18)) navigateStage(dx < 0 ? 1 : -1);
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
