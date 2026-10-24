import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/website/', import.meta.url));
const base = new URL('https://bjjrage.github.io/niupack/');
const allowed = new Set(['assets', 'css', 'fonts', 'js', 'media', 'studio', 'index.html', 'en.html', 'pt.html', 'robots.txt', 'sitemap.xml', 'favicon.svg', '.nojekyll', 'site-version.json', 'hero-video.js', 'integration.css', 'integration.js', 'selection.js', 'i18n.js']);
for (const entry of await readdir(root)) assert.ok(allowed.has(entry), 'Archivo ajeno al sitio: ' + entry);

async function checkReference(reference, from) {
  if (!reference || /^(?:#|data:|blob:|mailto:|tel:|https?:|\/\/)/i.test(reference)) return;
  const url = new URL(reference, new URL(from, base));
  assert.ok(url.pathname.startsWith(base.pathname), 'Ruta fuera de /niupack/: ' + reference);
  const path = resolve(root, decodeURIComponent(url.pathname.slice(base.pathname.length)) || 'index.html');
  assert.ok(!relative(root, path).startsWith('..' + sep), reference);
  assert.ok((await stat(path)).isFile(), from + ' → ' + reference);
}

for (const page of ['index.html', 'en.html', 'pt.html']) {
  const html = await readFile(resolve(root, page), 'utf8');
  for (const match of html.matchAll(/\b(?:src|href|poster|data-studio-entry)="([^"]+)"/g)) await checkReference(match[1], page);
  assert.match(html, /id="hero-video"/);
  assert.match(html, /id="configurador-3d"/);
  assert.doesNotMatch(html, /Vista local de integración|noindex|hero-product-card|id="personalizacion"/);
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const sections = [...html.matchAll(/<section\b[^>]*id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(sections.slice(sections.indexOf('productos'), sections.indexOf('productos') + 3), ['productos', 'configurador-3d', 'termoformados']);
  if (page !== 'index.html') {
    assert.doesNotMatch(html, /Subí tu imagen|Duplicar en reverso|Pedí presupuesto|Restablecer|Diseño 360°/);
    assert.ok(html.includes(page === 'en.html' ? 'Duplicate on back' : 'Duplicar no verso'));
    assert.ok(html.includes(page === 'en.html' ? 'Request a quote' : 'Pedir orçamento'));
  }
}
for (const css of ['css/styles.css', 'integration.css', 'studio/assets/scoped-studio.css']) {
  for (const match of (await readFile(resolve(root, css), 'utf8')).matchAll(/url\(["']?([^"')]+)["']?\)/g)) await checkReference(match[1], css);
}
assert.match(await readFile(resolve(root, 'js/site-motion.js'), 'utf8'), /hero-video-visual, \.hero-visual/);
assert.ok((await stat(resolve(root, 'media/hero-niupack.mp4'))).size > 1_000_000);
assert.match(JSON.parse(await readFile(resolve(root, 'site-version.json'), 'utf8')).commit, /^[0-9a-f]{40}$/);
console.log('Publicación verificada: recursos resueltos bajo /niupack/, video y 3D integrados; artefacto separado del OS.');
