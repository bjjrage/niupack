import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FLEXIBLES_ROOT, resolveDemoFile, withBaseHref } from '@/lib/demo/static-site';

describe('demo del sitio de flexibles: resolución de archivos', () => {
  it('sirve index.html por defecto y los recursos conocidos con su tipo', () => {
    expect(resolveDemoFile(undefined)).toMatchObject({ contentType: 'text/html; charset=utf-8', isIndex: true });
    expect(resolveDemoFile(['index.html'])?.isIndex).toBe(true);
    expect(resolveDemoFile(['css', 'styles.css'])).toMatchObject({ contentType: 'text/css; charset=utf-8', isIndex: false });
    expect(resolveDemoFile(['js', 'main.js'])?.contentType).toBe('text/javascript; charset=utf-8');
    expect(resolveDemoFile(['img', 'hero.jpg'])?.contentType).toBe('image/jpeg');
    expect(resolveDemoFile(['img', 'logo-full.png'])?.absolutePath).toBe(path.resolve(FLEXIBLES_ROOT, 'img', 'logo-full.png'));
  });

  it('rechaza recorridos de carpeta, rutas absolutas y extensiones no permitidas', () => {
    for (const bad of [['..', 'package.json'], ['..', '..', '.env.local'], ['img', '..', '..', 'x.png'], ['%2e%2e', 'a.png'], ['C:', 'x.png'], ['img\\hero.jpg'], ['.env'], ['index.html.bak'], ['secret.json'], ['tools', 'generate-images.mjs'], ['a', 'b', 'c', 'd', 'e.png'], ['']]) {
      expect(resolveDemoFile(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('nunca resuelve fuera de la carpeta aunque el nombre parezca válido', () => {
    const file = resolveDemoFile(['img', 'hero.jpg'], '/srv/demo')!;
    expect(file.absolutePath.startsWith(path.resolve('/srv/demo') + path.sep)).toBe(true);
  });

  it('fija la base del HTML una sola vez para que las rutas relativas funcionen bajo /demo/flexibles', () => {
    const html = '<!doctype html><html><head>\n<title>x</title></head><body><img src="img/hero.jpg"></body></html>';
    const result = withBaseHref(html);
    expect(result).toContain('<base href="/demo/flexibles/">');
    expect(withBaseHref(result).match(/<base /g)).toHaveLength(1);
  });
});

describe('ruta /demo/flexibles', () => {
  it('sin sesión devuelve 401 y no entrega ningún archivo', async () => {
    vi.resetModules();
    vi.doMock('@/lib/auth/identity', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/auth/identity')>();
      return { ...actual, requireNiuIdentity: async () => { throw new actual.NiuAuthError('AUTH_REQUIRED', 401); } };
    });
    const route = await import('@/app/demo/flexibles/[[...path]]/route');
    const res = await route.GET(new Request('http://localhost/demo/flexibles/css/styles.css'), { params: Promise.resolve({ path: ['css', 'styles.css'] }) });
    expect(res.status).toBe(401);
    vi.doUnmock('@/lib/auth/identity');
  });

  it('con sesión entrega el HTML con base, los recursos, y 404 ante rutas inválidas', async () => {
    vi.resetModules();
    vi.doMock('@/lib/auth/identity', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/auth/identity')>();
      return { ...actual, requireNiuIdentity: async () => ({ userId: 'u', organizationId: 'o', profileId: 'p', role: 'admin', email: 'a@b.c' }) };
    });
    const route = await import('@/app/demo/flexibles/[[...path]]/route');
    const get = (segments?: string[]) => route.GET(new Request('http://localhost/demo/flexibles'), { params: Promise.resolve({ path: segments }) });

    const index = await get();
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toMatch(/text\/html/);
    expect(index.headers.get('cache-control')).toMatch(/no-store/);
    expect(index.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(await index.text()).toContain('<base href="/demo/flexibles/">');

    const css = await get(['css', 'styles.css']);
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toMatch(/text\/css/);
    const img = await get(['img', 'hero.jpg']);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(10_000);

    expect((await get(['img', 'no-existe.jpg'])).status).toBe(404);
    expect((await get(['..', 'package.json'])).status).toBe(404);
    expect((await get(['tools', 'generate-images.mjs'])).status).toBe(404);
    vi.doUnmock('@/lib/auth/identity');
  });
});
