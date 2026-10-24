import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { inlineStudioMarkup, scopeStudioCSS, integrateStudioHome } from '../scripts/inline-studio.mjs';
import { studioSelection } from '../integration/selection.js';
import { CATALOG } from '../src/catalog.mts';

test('the local home replaces personalization with Products → Studio → Thermo, preserving the original blocks', async () => {
  const original = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
  const home = integrateStudioHome(original, '<p>STUDIO</p>');
  const blocks = [...home.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  const start = blocks.indexOf('productos');
  assert.deepEqual(blocks.slice(start, start + 3), ['productos', 'configurador-3d', 'termoformados']);
  assert.equal(home.includes('id="personalizacion"'), false);
  for (const id of ['productos', 'termoformados', 'contacto']) {
    const originalBlock = original.match(new RegExp('<section\\b[^>]*id="' + id + '"[\\s\\S]*?<\\/section>'))![0];
    assert.ok(home.includes(originalBlock), id + ' content changed');
  }
  assert.ok(integrateStudioHome(original + '<a href="#personalizacion">Personalizar</a>', '').includes('href="#configurador-3d"'));
});

test('the embedded module has unique prefixed IDs, matching labels, one host main and no duplicate header', async () => {
  const module = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const { content, ids } = inlineStudioMarkup(module);
  assert.equal(/<main\b|<header\b|<footer\b|<h1\b/.test(content), false);
  for (const id of ids) assert.ok(content.includes(`id="studio-${id}"`), id);
  assert.ok(content.includes('for="studio-artwork-file"'));
  assert.ok(content.includes('aria-describedby="studio-model-notice"'));
  assert.match(content, /<h2 id="studio-studio-title"/);
  assert.match(content, /<input[^>]*id="studio-artwork-file"[^>]* disabled>/);
  assert.doesNotMatch(content, /<input[^>]*type="range"[^>]* disabled>/);
});

test('module CSS cannot style the host body, headings or controls; animations are namespaced', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const { ids } = inlineStudioMarkup(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  const scoped = scopeStudioCSS(css, ids);
  const result = postcss.parse(scoped);
  result.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    for (const selector of postcss.list.comma(rule.selector)) assert.ok(selector.startsWith('#niu-studio'), selector);
  });
  assert.equal(scoped.includes('@font-face'), false);
  assert.ok(scoped.includes('@keyframes niu-studio-pulse'));
  assert.ok(scoped.includes('animation: niu-studio-pulse'));
  assert.ok(scoped.includes('#niu-studio h2'));
});

test('showroom selection uses real supplier models, distinguishing the 8 oz pot from the replaced drinking cup', () => {
  const available = new Set(CATALOG.map(model => model.id));
  assert.equal(studioSelection({ family: 'cup', size: '8 oz' }, available).modelId, 'cup-9oz');
  assert.equal(studioSelection({ family: 'cup', size: '8oz', wall: 'doble' }, available).modelId, 'cup-9oz-double');
  assert.equal(studioSelection({ family: 'pot', size: '8 oz' }, available).modelId, 'pot-8oz');
  assert.equal(studioSelection({ family: 'cup', size: 'Todos' }, available).modelId, 'cup-12oz');
  for (const selection of [{ family: 'pot', size: '20 oz' }, { family: 'cup', size: '4 oz' }, { family: 'lid' }]) {
    const result = studioSelection(selection, available);
    assert.equal(result.modelId, null);
    assert.ok(result.notice.length > 20);
  }
});
