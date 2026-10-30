import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { createHash } from 'node:crypto';

// Deliberately serves only the compiled demo, never the repository or OS.
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.NIUPACK_DEMO_PORT || 4173);
const mounts = ['/demo/vaso-3d/', '/niupack/demo/vaso-3d/'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/' || mounts.some((mount) => pathname === mount.slice(0, -1))) {
      response.writeHead(302, { Location: '/demo/vaso-3d/' }).end();
      return;
    }
    const mount = mounts.find((prefix) => pathname.startsWith(prefix));
    if (!mount || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end('No encontrado');
      return;
    }
    const filename = resolve(root, pathname.slice(mount.length) || 'index.html');
    if (!filename.startsWith(root.endsWith(sep) ? root : root + sep) || !(await stat(filename)).isFile()) {
      response.writeHead(404).end('No encontrado');
      return;
    }
    const content = await readFile(filename);
    // The public pages contain the branded loader's own inline styles/scripts.
    // Authorize their exact contents, so the local preview behaves like Pages
    // without broadly permitting arbitrary inline code.
    const html = extname(filename) === '.html' ? content.toString('utf8') : '';
    const hashes = tag => [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
      .filter(match => !/\bsrc\s*=/.test(match[1]))
      .map(match => `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`).join(' ');
    response.writeHead(200, {
      'Content-Type': types[extname(filename)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${hashes('script')}; style-src 'self' ${hashes('style')}; worker-src 'self'; font-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404).end('No encontrado');
  }
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`El puerto ${port} ya está en uso. Si el demo ya está abierto, usá http://127.0.0.1:${port}/demo/vaso-3d/`);
  else console.error('No se pudo iniciar el servidor local:', error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`NIUPACK Studio: http://127.0.0.1:${port}/demo/vaso-3d/`));
