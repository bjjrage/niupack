import { createHash } from 'node:crypto';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}

export interface PdfTextResult {
  status: 'EXTRACTED' | 'FAILED' | 'NOT_SUPPORTED';
  text?: string;
  pages?: number;
  error?: string;
}

/** Lee el texto de un PDF. Un PDF escaneado (sin capa de texto) no se "adivina": se reporta NOT_SUPPORTED. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  if (!looksLikePdf(bytes)) return { status: 'NOT_SUPPORTED', error: 'El archivo no es un PDF válido.' };
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const merged = (Array.isArray(text) ? text.join('\n') : text).trim();
    if (merged.length < 10) {
      return { status: 'NOT_SUPPORTED', pages: totalPages, error: 'El PDF no tiene texto legible (¿escaneado?). Cargá los datos manualmente.' };
    }
    return { status: 'EXTRACTED', text: merged, pages: totalPages };
  } catch (error) {
    return { status: 'FAILED', error: error instanceof Error ? error.message : 'No se pudo leer el PDF' };
  }
}
