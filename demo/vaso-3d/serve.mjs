import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

// Deliberately serves only the compiled demo, never the repository or OS.
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const mounts = ['/demo/vaso-3d/', '/niupack/demo/vaso-3d/'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
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
    response.writeHead(200, {
      'Content-Type': types[extname(filename)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : await readFile(filename));
  } catch {
    response.writeHead(404).end('No encontrado');
  }
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error('El puerto 4173 ya está en uso. Si el demo ya está abierto, usá http://127.0.0.1:4173/demo/vaso-3d/');
  else console.error('No se pudo iniciar el servidor local:', error.message);
  process.exitCode = 1;
});
server.listen(4173, '127.0.0.1', () => console.log('NIUPACK Studio: http://127.0.0.1:4173/demo/vaso-3d/'));
