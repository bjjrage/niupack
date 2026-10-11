import path from 'node:path';

/** Carpeta del demo: fuera de /public a propósito, para que solo se sirva con sesión iniciada. */
export const FLEXIBLES_ROOT = path.join(process.cwd(), 'private', 'efp');
export const FLEXIBLES_BASE_HREF = '/demo/flexibles/';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export interface DemoFile { absolutePath: string; contentType: string; isIndex: boolean }

/**
 * Convierte la ruta pedida en un archivo del demo. Solo acepta nombres simples y extensiones conocidas;
 * cualquier intento de salir de la carpeta (.., rutas absolutas, barras invertidas) devuelve null.
 */
export function resolveDemoFile(segments: string[] | undefined, root: string = FLEXIBLES_ROOT): DemoFile | null {
  const parts = segments && segments.length > 0 ? segments : ['index.html'];
  if (parts.length > 4 || parts.some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) || part.includes('..'))) return null;
  const extension = path.extname(parts[parts.length - 1]).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return null;
  const base = path.resolve(root);
  const absolutePath = path.resolve(base, ...parts);
  if (!absolutePath.startsWith(base + path.sep)) return null;
  return { absolutePath, contentType, isIndex: parts.length === 1 && parts[0] === 'index.html' };
}

/** El HTML usa rutas relativas (css/, img/, js/): se fija la base para que funcionen bajo /demo/flexibles. */
export function withBaseHref(html: string): string {
  if (/<base\s/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>\n    <base href="${FLEXIBLES_BASE_HREF}">`);
}
