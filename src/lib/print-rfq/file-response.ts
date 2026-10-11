const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg']);

/** Respuesta segura para un archivo subido por terceros: sin ejecución de contenido y solo PDF/imágenes se muestran en línea. */
export function fileResponse(file: { meta: { file_name: string; content_type: string }; content: Buffer }) {
  const inline = INLINE.has(file.meta.content_type);
  const name = encodeURIComponent(file.meta.file_name);
  return new Response(new Uint8Array(file.content), {
    headers: {
      'Content-Type': file.meta.content_type,
      'Content-Length': String(file.content.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
