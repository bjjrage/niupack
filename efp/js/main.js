/* =========================================================
   EFP Flexibles del Paraguay — interacciones
   ========================================================= */

/* Datos de contacto: editar aquí y se actualizan en toda la página. */
const CONFIG = {
  whatsapp: "595000000000",            // solo dígitos, con código de país
  phoneLabel: "+595 000 000 000",
  email: "ventas@efp.com.py",
  address: "Asunción, Paraguay",
  hours: "Lunes a viernes, 8:00 a 17:30",
};

const PRODUCTS = {
  vasos: {
    icon: "#i-cup",
    tag: "Polipapel",
    title: "Vasos de polipapel",
    desc: "Vasos de cartón con barrera de polietileno para bebidas calientes y frías. Firmes en la mano, sin filtraciones y con una superficie ideal para impresión.",
    formats: ["4, 6, 8, 10 y 12 oz", "16 y 20 oz", "Pared simple y doble", "Tapas planas y domo"],
    uses: ["Cafeterías", "Casas de té y jugos", "Máquinas expendedoras", "Eventos y catering"],
    feats: ["Frío y calor", "Imprimible", "Tapas compatibles"],
  },
  potes: {
    icon: "#i-pot",
    tag: "Polipapel",
    title: "Potes de polipapel",
    desc: "Potes con barrera interna que resisten humedad, frío y calor. La solución para porciones de helado, sopas, ensaladas, salsas y postres.",
    formats: ["4 y 8 oz", "12 y 16 oz", "26 y 32 oz", "Tapas de papel o plástico"],
    uses: ["Heladerías", "Rotiserías", "Delivery de comidas", "Salsas y aderezos"],
    feats: ["Apto freezer", "Comida caliente", "Imprimible"],
  },
  carton: {
    icon: "#i-tray",
    tag: "Cartón",
    title: "Bandejas de cartón",
    desc: "Bandejas y cajas de cartón kraft o blanco para servir y transportar comida rápida y productos de panadería, con buena rigidez y presentación.",
    formats: ["Barquitos en varias medidas", "Cajas para hamburguesa", "Bandejas para panificados", "Cajas con tapa"],
    uses: ["Hamburgueserías", "Papas fritas y snacks", "Panaderías", "Food trucks"],
    feats: ["Cartón kraft / blanco", "Reciclable", "Rígidas"],
  },
  bolsas: {
    icon: "#i-bag",
    tag: "Papel kraft",
    title: "Bolsas de delivery",
    desc: "Bolsas de papel de fondo cuadrado que se mantienen en pie al cargarlas. Resistentes al peso de pedidos completos y listas para llevar su marca.",
    formats: ["Manija plana o retorcida", "Sin manija (tipo sobre)", "Chica, mediana y grande", "Kraft natural o blanco"],
    uses: ["Delivery y take away", "Restaurantes", "Panaderías", "Comercio minorista"],
    feats: ["Fondo cuadrado", "Alta resistencia", "Impresión a 1–4 colores"],
  },
  antigrasa: {
    icon: "#i-paper",
    tag: "Papel",
    title: "Papel antigrasa",
    desc: "Papel resistente a grasas y aceites para envolver, forrar bandejas y presentar alimentos sin que traspasen las manchas.",
    formats: ["Hojas precortadas", "Bobinas", "Blanco o kraft", "Genérico o impreso"],
    uses: ["Hamburguesas y sándwiches", "Forrado de bandejas", "Panadería y confitería", "Fiambrería"],
    feats: ["Barrera a grasa", "Contacto directo", "Personalizable"],
  },
  plasticas: {
    icon: "#i-plastic",
    tag: "PET · PP",
    title: "Bandejas plásticas para delivery",
    desc: "Envases termoformados con bisagra y bandejas con tapa. Transparencia para exhibir el producto y cierre seguro para el transporte.",
    formats: ["Con bisagra (clamshell)", "Base + tapa", "Con divisiones", "PET cristal o PP microondeable"],
    uses: ["Delivery de comidas", "Ensaladas y postres", "Exhibición en góndola", "Catering"],
    feats: ["Cierre seguro", "Transparente", "PP apto microondas"],
  },
};

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const waUrl = (text) =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;

document.documentElement.classList.remove("no-js");

/* ---------- Datos de contacto ---------- */
$$("[data-contact]").forEach((el) => { el.textContent = CONFIG[el.dataset.contact]; });
$$("[data-wa-link]").forEach((a) => {
  a.href = waUrl("Hola EFP, quisiera recibir información comercial.");
  a.target = "_blank";
  a.rel = "noopener";
});
$$("[data-mail-link]").forEach((a) => { a.href = `mailto:${CONFIG.email}`; });
$$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

/* ---------- Fotos: si la imagen existe, reemplaza a la ilustración ---------- */
const usePhoto = (img) => {
  const box = img.parentElement;
  const ok = () => box.classList.add("has-photo");
  const fail = () => box.classList.remove("has-photo");
  if (img.complete && img.naturalWidth) ok();
  img.addEventListener("load", ok);
  img.addEventListener("error", fail);
};
$$("[data-photo]").forEach(usePhoto);
const modalPhoto = $("[data-modal-photo]");
usePhoto(modalPhoto);

/* ---------- Header y navegación ---------- */
const header = $("[data-header]");
const nav = $("[data-nav]");
const burger = $("[data-burger]");
const waFloat = $(".wa-float");

const onScroll = () => {
  const y = window.scrollY;
  header.classList.toggle("is-scrolled", y > 30);
  waFloat.classList.toggle("is-visible", y > window.innerHeight * 0.6);
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const setMenu = (open) => {
  nav.classList.toggle("is-open", open);
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  document.body.classList.toggle("is-locked", open);
};
burger.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
$$("a", nav).forEach((a) => a.addEventListener("click", () => setMenu(false)));

/* Enlace activo según la sección visible */
const navLinks = $$('a[href^="#"]:not(.btn)', nav);
const sections = navLinks.map((a) => $(a.getAttribute("href"))).filter(Boolean);
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    navLinks.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === `#${e.target.id}`));
  });
}, { rootMargin: "-45% 0px -50% 0px" });
sections.forEach((s) => spy.observe(s));

/* ---------- Revelado al hacer scroll ---------- */
const revealer = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const siblings = $$(".reveal", e.target.parentElement);
    const i = Math.max(0, siblings.indexOf(e.target));
    e.target.style.transitionDelay = `${Math.min(i, 6) * 70}ms`;
    e.target.classList.add("is-in");
    revealer.unobserve(e.target);
  });
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
$$(".reveal").forEach((el) => revealer.observe(el));

/* ---------- Parallax del hero ---------- */
const stage = $("[data-parallax]");
if (stage && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
  const layers = $$("[data-depth]", stage);
  let raf = 0;
  window.addEventListener("pointermove", (ev) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const x = ev.clientX / window.innerWidth - 0.5;
      const y = ev.clientY / window.innerHeight - 0.5;
      layers.forEach((l) => {
        const d = Number(l.dataset.depth);
        l.style.transform = `translate3d(${-x * d}px, ${-y * d}px, 0)`;
      });
    });
  });
}

/* ---------- Filtro de productos ---------- */
const filterBar = $("[data-filters]");
filterBar.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-filter]");
  if (!btn) return;
  $$("[data-filter]", filterBar).forEach((b) => {
    const on = b === btn;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", String(on));
  });
  const f = btn.dataset.filter;
  $$("[data-products] .product").forEach((card) => {
    const show = f === "all" || card.dataset.cat.split(" ").includes(f);
    card.classList.toggle("is-hidden", !show);
    if (show) card.classList.add("is-in");
  });
});

/* ---------- Modal de producto ---------- */
const modal = $("[data-modal]");
let lastFocus = null;

const fillList = (el, items) => {
  el.innerHTML = "";
  items.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    el.appendChild(li);
  });
};

const openModal = (key) => {
  const p = PRODUCTS[key];
  if (!p) return;
  lastFocus = document.activeElement;
  $("[data-modal-art]", modal).setAttribute("href", p.icon);
  modalPhoto.parentElement.classList.remove("has-photo");
  modalPhoto.alt = p.title;
  modalPhoto.src = `img/${key}.jpg`;
  $("[data-modal-tag]", modal).textContent = p.tag;
  $("[data-modal-title]", modal).textContent = p.title;
  $("[data-modal-desc]", modal).textContent = p.desc;
  fillList($("[data-modal-formats]", modal), p.formats);
  fillList($("[data-modal-uses]", modal), p.uses);
  const feats = $("[data-modal-feats]", modal);
  feats.innerHTML = "";
  p.feats.forEach((t) => {
    const s = document.createElement("span");
    s.textContent = t;
    feats.appendChild(s);
  });
  $("[data-modal-wa]", modal).href = waUrl(`Hola EFP, quisiera cotizar: ${p.title}.`);
  $("[data-modal-form]", modal).dataset.product = p.title;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-locked");
  $(".modal__close", modal).focus();
};

const closeModal = () => {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-locked");
  if (lastFocus) lastFocus.focus();
};

$$("[data-product]").forEach((card) => {
  card.addEventListener("click", () => openModal(card.dataset.product));
  card.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openModal(card.dataset.product); }
  });
});
$$("[data-open]").forEach((a) => a.addEventListener("click", (ev) => {
  ev.preventDefault();
  openModal(a.dataset.open);
}));
$$("[data-close]", modal).forEach((el) => el.addEventListener("click", closeModal));
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    if (modal.classList.contains("is-open")) closeModal();
    else if (nav.classList.contains("is-open")) setMenu(false);
  }
  if (ev.key === "Tab" && modal.classList.contains("is-open")) {
    const f = $$("a[href], button", modal.querySelector(".modal__panel"));
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

/* "Usar formulario" preselecciona el producto en el formulario */
$("[data-modal-form]", modal).addEventListener("click", (ev) => {
  const name = ev.currentTarget.dataset.product;
  $$('input[name="productos"]').forEach((c) => { if (c.value === name) c.checked = true; });
  closeModal();
});

/* ---------- Contadores ---------- */
const counter = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    if (reduceMotion) { el.textContent = end + suffix; counter.unobserve(el); return; }
    const t0 = performance.now();
    const dur = 1600;
    const tick = (t) => {
      const k = Math.min((t - t0) / dur, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + suffix;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    counter.unobserve(el);
  });
}, { threshold: 0.6 });
$$("[data-count]").forEach((el) => counter.observe(el));

/* ---------- Acordeón: uno abierto a la vez ---------- */
const acc = $("[data-accordion]");
$$("details", acc).forEach((d) => d.addEventListener("toggle", () => {
  if (d.open) $$("details", acc).forEach((o) => { if (o !== d) o.open = false; });
}));

/* ---------- Formulario de cotización ---------- */
const form = $("[data-form]");
const status = $("[data-status]");

const buildMessage = () => {
  const data = new FormData(form);
  const productos = data.getAll("productos");
  const lines = [
    "Hola EFP, solicito una cotización.",
    "",
    `Nombre: ${data.get("nombre")}`,
    `Empresa: ${data.get("empresa")}`,
    `Teléfono: ${data.get("telefono")}`,
  ];
  if (data.get("email")) lines.push(`Email: ${data.get("email")}`);
  if (data.get("rubro")) lines.push(`Rubro: ${data.get("rubro")}`);
  if (productos.length) lines.push(`Productos: ${productos.join(", ")}`);
  if (data.get("volumen")) lines.push(`Volumen mensual: ${data.get("volumen")}`);
  if (data.get("mensaje")) lines.push("", `Mensaje: ${data.get("mensaje")}`);
  return lines.join("\n");
};

const validate = () => {
  let ok = true;
  $$("[required]", form).forEach((f) => {
    const bad = !f.value.trim();
    f.classList.toggle("is-invalid", bad);
    if (bad) ok = false;
  });
  const email = form.elements.email;
  if (email.value && !email.checkValidity()) { email.classList.add("is-invalid"); ok = false; }
  status.textContent = ok ? "" : "Complete los campos obligatorios: nombre, empresa y teléfono.";
  if (!ok) $(".is-invalid", form)?.focus();
  return ok;
};

$$("input, select, textarea", form).forEach((f) =>
  f.addEventListener("input", () => f.classList.remove("is-invalid")));

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (!validate()) return;
  window.open(waUrl(buildMessage()), "_blank", "noopener");
  status.textContent = "Abrimos WhatsApp con su solicitud. ¡Gracias por contactarnos!";
});

$("[data-send-mail]", form).addEventListener("click", () => {
  if (!validate()) return;
  const subject = `Solicitud de cotización — ${form.elements.empresa.value}`;
  window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildMessage())}`;
  status.textContent = "Abrimos su cliente de correo con la solicitud.";
});
