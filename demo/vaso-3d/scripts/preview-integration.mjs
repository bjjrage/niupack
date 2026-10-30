import { readFile, writeFile, mkdir, copyFile, cp, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import { inlineStudioMarkup, scopeStudioCSS, integrateStudioHome } from './inline-studio.mjs';
import { translateMarkup, t } from '../integration/i18n.js';
import { showroomMarkup, showroomScript, showroomControls } from './showroom-artwork.mjs';

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
const showroomArtwork = JSON.parse(await readFile(resolve(demo, 'data/showroom-artwork.json'), 'utf8'));
const supplierModels = JSON.parse(await readFile(resolve(demo, 'data/supplier-models.json'), 'utf8')).models;
await cp(resolve(demo, 'integration/showroom'), resolve(preview, 'showroom'), { recursive: true });
const showroomPath = resolve(preview, 'js/showroom.js');
await writeFile(showroomPath, showroomScript(await readFile(showroomPath, 'utf8'), showroomArtwork, supplierModels), 'utf8');
const mainPath = resolve(preview, 'js/main.js');
await writeFile(mainPath, showroomControls(await readFile(mainPath, 'utf8')), 'utf8');
if (!production) {
  const beforeDirectory=resolve(demo,'tools/showroom/output/realism-before');
  let hasBefore=false;
  try{hasBefore=(await lstat(beforeDirectory)).isDirectory()}catch(error){if(error.code!=='ENOENT')throw error}
  if(hasBefore)await cp(beforeDirectory,resolve(preview,'showroom-before'),{recursive:true});
  const cards=showroomArtwork.items.map(item=>{
    const size=item.id.match(/-(\d+)oz/)?.[1];
    const label=item.id.startsWith('pot-')?`Pote ${size} oz`:`Vaso ${size} oz · ${item.id.includes('-double-')?'Pared doble':'Pared simple'}`;
    return `<article><img src="${item.src}" alt="${item.brand}"><h2>${label}</h2><p>${item.brand}${item.alternative?' · alternativa':''}</p>${hasBefore?`<details><summary>Ver versión anterior</summary><img src="showroom-before/${item.id}.webp" alt="Versión anterior · ${item.brand}"></details>`:''}</article>`;
  }).join('');
  await writeFile(resolve(preview, 'showroom-review.html'), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Acabado fotográfico · NIU PACK</title><link rel="stylesheet" href="showroom-review.css"><header><a href="index.html#productos">← Ver el carrusel en la página</a><h1>Vasos y potes con acabado fotográfico</h1><p>Revisión local de los productos individuales. Las portadas originales se conservan. Heylife espresso en 4 oz; Burger King como principal y Subway como alternativa de 16 oz. ${hasBefore?'Abrí «Ver versión anterior» para comparar cada producto. ':''}Los modelos sin plano completo siguen siendo ilustrativos.</p></header><main>${cards}</main></html>`, 'utf8');
  await writeFile(resolve(preview, 'showroom-review.css'), '@font-face{font-family:Montserrat;src:url(fonts/montserrat-latin-variable.woff2)}*{box-sizing:border-box}body{margin:0;padding:32px;font-family:Montserrat,Arial,sans-serif;color:#15191f;background:#f5f3ef}header{max-width:1100px;margin:0 auto 30px}header a{color:#dc2428}h1{font-size:32px}p{font-size:14px;line-height:1.7}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}article{background:white;border:1px solid #ddd;border-radius:16px;padding:18px}article img{width:100%;height:330px;object-fit:contain}h2{font-size:15px;margin-bottom:0}summary{cursor:pointer;color:#dc2428;font-size:12px;font-weight:600;padding-block:12px}details img{border-top:1px solid #eee}@media(max-width:1000px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){body{padding:18px}main{grid-template-columns:1fr}}', 'utf8');
}

const moduleEntry = moduleSource.match(/<script type="module"[^>]*src="\.\/(assets\/[\w.-]+\.js)"/)?.[1];
const moduleCSS = moduleSource.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[\w.-]+\.css)"/)?.[1];
if (!moduleEntry || !moduleCSS) throw new Error('No se encontraron los recursos compilados del configurador.');
const inline = inlineStudioMarkup(moduleSource);
const inlineOutput = resolve(preview, 'studio');
for (const folder of ['assets', 'fonts', 'pdf']) await cp(resolve(build, folder), resolve(inlineOutput, folder), { recursive: true });
await writeFile(resolve(inlineOutput, 'assets/scoped-studio.css'), scopeStudioCSS(await readFile(resolve(build, moduleCSS), 'utf8'), inline.ids), 'utf8');
// One composition pipeline for all languages: translated templates retain their
// own existing site copy, while the hero and configurator share the same features.
for (const [filename, locale] of [['index.html', 'es'], ['en.html', 'en'], ['pt.html', 'pt']]) {
  const source = showroomMarkup(await readFile(resolve(repository, filename), 'utf8'));
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
  for (const folder of ['assets', 'fonts', 'pdf']) await cp(resolve(build, folder), resolve(moduleOutput, folder), { recursive: true });
  for (const file of ['logo-niupack.png', 'favicon.svg']) await copyFile(resolve(build, file), resolve(moduleOutput, file));
  await writeFile(resolve(moduleOutput, 'index.html'), moduleSource.replaceAll('https://bjjrage.github.io/niupack/index.html', '../index.html'), 'utf8');
}
console.log(production ? 'Sitio público compilado en demo/vaso-3d/dist/website/.' : 'Vista integrada generada solo en demo/vaso-3d/dist/vista-integrada/.');
