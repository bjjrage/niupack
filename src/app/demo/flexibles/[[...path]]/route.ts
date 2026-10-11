import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { resolveDemoFile, withBaseHref } from '@/lib/demo/static-site';

/**
 * Demo del sitio de Envases Flexibles dentro del OS. Requiere sesión: los archivos viven en /private, no en /public,
 * y esta ruta valida la sesión por sí misma (el middleware no cubre las rutas que terminan en .css/.js/.png).
 */
export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    await requireNiuIdentity();
  } catch (error) {
    return authErrorResponse(error);
  }

  const { path: segments } = await context.params;
  const file = resolveDemoFile(segments);
  if (!file) return new NextResponse('No encontrado', { status: 404 });

  let content: Buffer;
  try {
    content = await readFile(file.absolutePath);
  } catch {
    return new NextResponse('No encontrado', { status: 404 });
  }

  const body = file.isIndex ? Buffer.from(withBaseHref(content.toString('utf8')), 'utf8') : content;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
