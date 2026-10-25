import postcss from 'postcss';

export const STUDIO_ROOT = 'niu-studio';
export const STUDIO_PREFIX = 'studio-';

export function inlineStudioMarkup(html) {
  const workspace = html.match(/<main\b[^>]*class="workspace"[\s\S]*?<\/main>/)?.[0];
  const toast = html.match(/<div id="toast"[^>]*><\/div>/)?.[0];
  if (!workspace || !toast) throw new Error('Falta el configurador compilado.');
  let content = workspace.replace('<main ', '<div ').replace(/<\/main>$/, '</div>') + '\n' + toast;
  content = content.replace(/<(\/?)(h[123])\b/g, (_, slash, tag) => '<' + slash + 'h' + (Number(tag[1]) + 1));
  const ids = [...content.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) throw new Error('IDs duplicados en el módulo.');
  content = content.replace(/\b(id|for|aria-labelledby|aria-describedby|aria-controls)="([^"]*)"/g, (_, attr, value) => {
    const mapped = value.split(/\s+/).map(id => idSet.has(id) ? STUDIO_PREFIX + id : id).join(' ');
    return attr + '="' + mapped + '"';
  });
  // Controls remain unavailable until the lazy entry has installed listeners.
  content = content.replace(/<(fieldset|select)\b[^>]*>|<input\b[^>]*type="file"[^>]*>/g, (tag) => /\bdisabled\b/.test(tag) ? tag : tag.replace(/>$/, ' disabled>'));
  content = content.replace(/<button\b[^>]*\bid="studio-(?:reset-design|remove-artwork)"[^>]*>/g, tag => tag.replace(/>$/, ' disabled>'));
  return { content, ids };
}

export function scopeStudioCSS(css, ids) {
  const root = postcss.parse(css);
  const scope = '#' + STUDIO_ROOT;
  const idSet = new Set(ids);
  const keyframes = new Map();
  root.walkAtRules(rule => {
    if (rule.name === 'font-face') rule.remove(); // The host already uses local Montserrat.
    if (/keyframes$/.test(rule.name)) {
      const renamed = 'niu-studio-' + rule.params;
      keyframes.set(rule.params, renamed); rule.params = renamed;
    }
  });
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    rule.selector = postcss.list.comma(rule.selector).map(selector => {
      let mapped = selector
        .replace(/#([\w-]+)/g, (whole, id) => idSet.has(id) ? '#' + STUDIO_PREFIX + id : whole)
        .replace(/\bh([123])\b/g, (_, level) => 'h' + (Number(level) + 1));
      if (/^(?:html|body|:root)(?=$|:)/.test(mapped)) return mapped.replace(/^(?:html|body|:root)/, scope);
      return scope + ' ' + mapped;
    }).join(',');
  });
  root.walkDecls(/animation(?:-name)?$/, decl => {
    for (const [original, renamed] of keyframes) decl.value = decl.value.replace(new RegExp('\\b' + original + '\\b', 'g'), renamed);
  });
  return root.toString();
}

export function integrateStudioHome(source, moduleMarkup) {
  const section = id => source.match(new RegExp('<section\\b[^>]*\\bid="' + id + '"[\\s\\S]*?<\\/section>'))?.[0];
  const products = section('productos'), thermo = section('termoformados'), personalization = section('personalizacion');
  if (!products || !thermo || !personalization) throw new Error('No se encontró la estructura pública esperada.');
  const inserted = `<section class="section studio-section" id="configurador-3d" tabindex="-1" aria-labelledby="studio-studio-title">
    <div class="container">
      <p id="studio-product-notice" class="studio-product-notice" role="status" hidden></p>
      <div id="${STUDIO_ROOT}" data-niu-studio data-id-prefix="${STUDIO_PREFIX}" data-studio="pending">${moduleMarkup}</div>
    </div>
  </section>`;
  return source.replace(thermo, '').replace(personalization, '')
    .replace(products, products + '\n' + inserted + '\n' + thermo)
    .replace(/(<div class="hero-actions">\s*)<a\b[^>]*>/, '$1<a class="button" href="#configurador-3d">')
    .replace(/(?:index|en|pt)\.html#personalizacion/g, '#configurador-3d')
    .replaceAll('href="#personalizacion"', 'href="#configurador-3d"');
}
