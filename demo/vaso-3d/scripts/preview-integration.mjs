import { readFile, writeFile, mkdir, copyFile, cp, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import { inlineStudioMarkup, scopeStudioCSS, integrateStudioHome } from './inline-studio.mjs';

const demo = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(demo, '../..');
const build = resolve(demo, 'dist');
const preview = resolve(build, 'vista-integrada');
const moduleOutput = resolve(preview, 'personaliza-tu-vaso');
const rootSource = await readFile(resolve(repository, 'index.html'), 'utf8');
const heroCard = /<div class="visual-card hero-product-card" data-tilt>[\s\S]*?<div class="visual-badge">[^<]*<\/div>\s*<\/div>/;
if (!heroCard.test(rootSource)) throw new Error('No se encontró la tarjeta original del hero.');
const previewSource = rootSource
  .replace(heroCard, await readFile(resolve(demo, 'integration/hero.html'), 'utf8'))
  .replace('class="hero-visual reveal"', 'class="hero-video-visual reveal"')
  .replace('class="hero section-dark"', 'class="hero section-dark hero-video-hero"');
const moduleSource = await readFile(resolve(build, 'index.html'), 'utf8');
await mkdir(moduleOutput, { recursive: true });

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
const stylesPath = resolve(preview, 'css/styles.css');
const styles = await readFile(stylesPath, 'utf8');
await writeFile(stylesPath, styles.replace(/^@import[^\n]*fonts\.googleapis\.com[^\n]*\n/, '@font-face { font-family: "Montserrat"; src: url("../fonts/montserrat-latin-variable.woff2") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }\n'), 'utf8');
// The local hero replaces the old visual wrapper; keep its entrance animation in sync.
const motionPath = resolve(preview, 'js/site-motion.js');
await writeFile(motionPath, (await readFile(motionPath, 'utf8')).replace("document.querySelector('.hero-visual')", "document.querySelector('.hero-video-visual')"), 'utf8');

const moduleEntry = moduleSource.match(/<script type="module"[^>]*src="\.\/(assets\/[\w.-]+\.js)"/)?.[1];
const moduleCSS = moduleSource.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[\w.-]+\.css)"/)?.[1];
if (!moduleEntry || !moduleCSS) throw new Error('No se encontraron los recursos compilados del configurador.');
const inline = inlineStudioMarkup(moduleSource);
const inlineOutput = resolve(preview, 'studio');
for (const folder of ['assets', 'fonts']) await cp(resolve(build, folder), resolve(inlineOutput, folder), { recursive: true });
await writeFile(resolve(inlineOutput, 'assets/scoped-studio.css'), scopeStudioCSS(await readFile(resolve(build, moduleCSS), 'utf8'), inline.ids), 'utf8');
let home = integrateStudioHome(previewSource, inline.content)
  .replace('data-studio="pending"', `data-studio="pending" data-studio-entry="./studio/${moduleEntry}"`)
  .replace(/href="index\.html(#[\w-]+)"/g, 'href="$1"');
home = home
  .replace('</head>', '<meta name="robots" content="noindex, nofollow">\n<link rel="icon" href="../favicon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="studio/assets/scoped-studio.css">\n<link rel="stylesheet" href="integration.css">\n</head>')
  .replaceAll('href="en.html"', 'href="https://bjjrage.github.io/niupack/en.html"')
  .replaceAll('href="pt.html"', 'href="https://bjjrage.github.io/niupack/pt.html"')
  .replace('</body>', '<div class="integration-preview-tag">Vista local de integración</div>\n<script type="module" src="integration.js"></script>\n</body>');
await writeFile(resolve(preview, 'index.html'), home, 'utf8');
await copyFile(resolve(demo, 'integration/entry.css'), resolve(preview, 'integration.css'));
await copyFile(resolve(demo, 'integration/entry.js'), resolve(preview, 'integration.js'));
await copyFile(resolve(demo, 'integration/selection.js'), resolve(preview, 'selection.js'));
await copyFile(resolve(demo, 'integration/hero-video.js'), resolve(preview, 'hero-video.js'));
await cp(resolve(demo, 'integration/media'), resolve(preview, 'media'), { recursive: true });

// Use the actual compiled module as a subpage with local return navigation.
for (const folder of ['assets', 'fonts']) await cp(resolve(build, folder), resolve(moduleOutput, folder), { recursive: true });
for (const file of ['logo-niupack.png', 'favicon.svg']) await copyFile(resolve(build, file), resolve(moduleOutput, file));
await writeFile(resolve(moduleOutput, 'index.html'), moduleSource.replaceAll('https://bjjrage.github.io/niupack/index.html', '../index.html'), 'utf8');
console.log('Vista integrada generada solo en demo/vaso-3d/dist/vista-integrada/.');
console.log('Abrí /demo/vaso-3d/vista-integrada/index.html#configurador-3d en el servidor de la demo.');
