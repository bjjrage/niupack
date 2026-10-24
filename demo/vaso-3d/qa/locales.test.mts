import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { t, pageLocale, translateMarkup } from '../integration/i18n.js';
import { inlineStudioMarkup, integrateStudioHome } from '../scripts/inline-studio.mjs';

for (const [file, language, duplicate, quote] of [
  ['index.html', 'es', 'Duplicar en reverso', 'Pedí presupuesto'],
  ['en.html', 'en', 'Duplicate on back', 'Request a quote'],
  ['pt.html', 'pt-BR', 'Duplicar no verso', 'Pedir orçamento'],
]) {
  test(`${file} receives the same integrated workflow with localized controls`, async () => {
    const original = await readFile(new URL('../../../' + file, import.meta.url), 'utf8');
    const module = inlineStudioMarkup(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
    const localized = translateMarkup(module.content, language);
    const home = integrateStudioHome(original, localized);
    assert.match(home, /id="configurador-3d"/);
    assert.ok(home.includes(duplicate));
    assert.ok(home.includes(quote));
    assert.match(home, /id="studio-duplicate-back"/);
    assert.match(home, /data-layout="wrap"/);
    assert.doesNotMatch(home, /id="personalizacion"/);
    assert.ok(integrateStudioHome(original + `<a href="${file}#personalizacion">link</a>`, localized).includes('href="#configurador-3d"'));
    if (language !== 'es') assert.doesNotMatch(localized, /Subí tu imagen|Duplicar en reverso|Pedí presupuesto|Restablecer/);
  });
}

test('runtime model changes, wrap fitting and quote messages remain in the page language', () => {
  for (const locale of ['en', 'pt']) {
    const label = t('Vaso 9 oz · Pared doble', locale);
    assert.ok(label.includes(locale === 'en' ? 'Double wall' : 'Parede dupla'));
    assert.match(t('Ancho completo con altura al 53%. Pulsá de nuevo para deshacer. El tamaño ajusta ahora la altura.', locale), /53%/);
    assert.doesNotMatch(t('Ancho completo con altura al 53%. Pulsá de nuevo para deshacer. El tamaño ajusta ahora la altura.', locale), /Pulsá/);
    const quote = t(`Hola, quiero pedir presupuesto de un envase personalizado NIU PACK.\nModelo: ${label}.\nPapel: blanco.`, locale);
    assert.ok(quote.startsWith(locale === 'en' ? 'Hello,' : 'Olá,'));
    assert.ok(quote.includes(label));
    assert.ok(quote.includes(locale === 'en' ? 'Paper: white.' : 'Papel: branco.'));
    assert.doesNotMatch(t('El pote de 20 oz todavía no tiene un modelo 3D disponible. Elegí otro tamaño en el configurador.', locale), /todavía|Elegí/);
  }
});

test('translation preserves control wiring, source values and the commercial destination', () => {
  const html = '<button id="front" data-layout="logo" aria-label="Duplicar en reverso">Duplicar en reverso</button>';
  const translated = translateMarkup(html, 'en');
  assert.match(translated, /id="front" data-layout="logo"/);
  assert.match(translated, /aria-label="Duplicate on back"/);
  const quote = translateMarkup('<a href="https://wa.me/595971350619?text=Hola%2C%20quiero%20pedir%20presupuesto%20de%20envases%20personalizados%20NIU%20PACK.">Pedí presupuesto</a>', 'pt');
  assert.match(quote, /wa\.me\/595971350619/);
  assert.match(decodeURIComponent(quote), /Olá, gostaria/);
  assert.equal(t('Fuente: $&.pdf', 'en'), 'Source: $&.pdf');
  assert.equal(pageLocale('pt-BR'), 'pt');
  assert.equal(pageLocale('en-US'), 'en');
  assert.equal(pageLocale('fr'), 'es');
});
