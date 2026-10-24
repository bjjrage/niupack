import { readFile, writeFile, mkdir, copyFile, cp, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import { inlineStudioMarkup, scopeStudioCSS, integrateStudioHome } from './inline-studio.mjs';
import { translateMarkup, t } from '../integration/i18n.js';

const demo = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(demo, '../..');
const build = resolve(demo, 'dist');
const production = process.argv.includes('--production');
const preview = resolve(build, production ? 'website' : 'vista-integrada');
const moduleOutput = resolve(preview, 'personaliza-tu-vaso');
const heroCard = /<div class="visual-card hero-product-card" data-tilt>[\s\S]*?<div class="visual-badge">[^<]*<\/div>\s*<\/div>/;
const heroSource = await readFile(resolve(demo, 'integration/hero.html'), 'utf8');
const moduleSource = await readFile(resolve(build, 'index.html'), 'utf8');
await mkdir(production ? preview : moduleOutput, { recursive: true });

// Copy only tracked public website resources. Never serve the repository root.
const files = execFileSync('git', ['ls-files', '-z', '--', 'assets', 'css', 'js'], { cwd: repository, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  if (!/^(assets|css|js)\//.test(file) || file.split('/').includes('..')) throw new Error('Recurso fuera del sitio público.');
  const source = resolve(repository, file);
  const target = resolve(preview, file);
  if ((await lstat(source)).isSymbolicLink() || !(await lstat(source)).isFile()) throw new Error('Recurso no regular: ' + file);
  if (relative(preview, target).startsWith('..' + sep)) throw new Error('Destino fuera de la vista local.');
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
await cp(resolve(build, 'fonts'), resolve(preview, 'fonts'), { recursive: true });
await copyFile(resolve(build, 'favicon.svg'), resolve(preview, 'favicon.svg'));
if (production) {
  for (const file of ['robots.txt', 'sitemap.xml']) {
    await copyFile(resolve(repository, file), resolve(preview, file));
  }
  await writeFile(resolve(preview, '.nojekyll'), '');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  await writeFile(resolve(preview, 'site-version.json'), JSON.stringify({ commit, heroVideo: true, configurator3d: true, languages: ['es', 'en', 'pt'] }) + '\n');
}
const stylesPath = resolve(preview, 'css/styles.css');
const styles = await readFile(stylesPath, 'utf8');
await writeFile(stylesPath, styles.replace(/^@import[^\n]*fonts\.googleapis\.com[^\n]*\n/, '@font-face { font-family: "Montserrat"; src: url("../fonts/montserrat-latin-variable.woff2") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }\n'), 'utf8');
// The local hero replaces the old visual wrapper; keep its entrance animation in sync.
const motionPath = resolve(preview, 'js/site-motion.js');
await writeFile(motionPath, (await readFile(motionPath, 'utf8')).replace("document.querySelector('.hero-visual')", "document.querySelector('.hero-video-visual, .hero-visual')"), 'utf8');

const moduleEntry = moduleSource.match(/<script type="module"[^>]*src="\.\/(assets\/[\w.-]+\.js)"/)?.[1];
const moduleCSS = moduleSource.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[\w.-]+\.css)"/)?.[1];
if (!moduleEntry || !moduleCSS) throw new Error('No se encontraron los recursos compilados del configurador.');
const inline = inlineStudioMarkup(moduleSource);
const inlineOutput = resolve(preview, 'studio');
for (const folder of ['assets', 'fonts']) await cp(resolve(build, folder), resolve(inlineOutput, folder), { recursive: true });
await writeFile(resolve(inlineOutput, 'assets/scoped-studio.css'), scopeStudioCSS(await readFile(resolve(build, moduleCSS), 'utf8'), inline.ids), 'utf8');
// One composition pipeline for all languages: translated templates retain their
// own existing site copy, while the hero and configurator share the same features.
for (const [filename, locale] of [['index.html', 'es'], ['en.html', 'en'], ['pt.html', 'pt']]) {
  const source = await readFile(resolve(repository, filename), 'utf8');
  if (!heroCard.test(source)) throw new Error('No se encontró el hero en ' + filename);
  const integratedSource = source
    .replace(heroCard, translateMarkup(heroSource, locale))
    .replace('class="hero-visual reveal"', 'class="hero-video-visual reveal"')
    .replace('class="hero section-dark"', 'class="hero section-dark hero-video-hero"');
  let home = integrateStudioHome(integratedSource, translateMarkup(inline.content, locale))
    .replace('data-studio="pending"', `data-studio="pending" data-studio-entry="./studio/${moduleEntry}"`)
    .replace(new RegExp('href="' + filename.replace('.', '\\.') + '(#[\\w-]+)"', 'g'), 'href="$1"');
  home = home
    .replace('</head>', (production ? '' : '<meta name="robots" content="noindex, nofollow">\n') + '<link rel="icon" href="favicon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="studio/assets/scoped-studio.css">\n<link rel="stylesheet" href="integration.css">\n</head>')
    .replace('</body>', (production ? '' : `<div class="integration-preview-tag">${t('Vista local de integración', locale)}</div>\n`) + '<script type="module" src="integration.js"></script>\n</body>');
  await writeFile(resolve(preview, filename), home, 'utf8');
}
for (const filename of ['entry.css', 'entry.js', 'selection.js', 'hero-video.js', 'i18n.js']) {
  await copyFile(resolve(demo, 'integration', filename), resolve(preview, filename.replace('entry.', 'integration.')));
}
await cp(resolve(demo, 'integration/media'), resolve(preview, 'media'), { recursive: true });

if (!production) {
  // Keep the old review subpage available locally, outside the published artifact.
  for (const folder of ['assets', 'fonts']) await cp(resolve(build, folder), resolve(moduleOutput, folder), { recursive: true });
  for (const file of ['logo-niupack.png', 'favicon.svg']) await copyFile(resolve(build, file), resolve(moduleOutput, file));
  await writeFile(resolve(moduleOutput, 'index.html'), moduleSource.replaceAll('https://bjjrage.github.io/niupack/index.html', '../index.html'), 'utf8');
}
console.log(production ? 'Sitio público compilado en demo/vaso-3d/dist/website/.' : 'Vista integrada generada solo en demo/vaso-3d/dist/vista-integrada/.');
