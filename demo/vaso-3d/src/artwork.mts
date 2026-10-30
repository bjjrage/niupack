import { t } from '../integration/i18n.js';
export const MAX_BYTES = 12 * 1024 * 1024;
export const MAX_PIXELS = 16_000_000;
export const MAX_EDGE = 8192;
export const MAX_ARTWORK_EDGE = 2048;
export type ImageKind = 'PNG' | 'JPG' | 'SVG' | 'PDF';
export interface Artwork { canvas: HTMLCanvasElement; name: string; width: number; height: number; kind: ImageKind | 'example' }

export function rasterMetadata(bytes: Uint8Array): { kind: 'PNG' | 'JPG'; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) {
    if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('El PNG no tiene una cabecera válida.');
    return { kind: 'PNG', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) break;
        return { kind: 'JPG', height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += length;
    }
    throw new Error('El JPG está incompleto o no tiene dimensiones válidas.');
  }
  throw new Error('Usá un JPG, PNG o SVG simple. El contenido del archivo no coincide con una imagen compatible.');
}

export function checkDimensions(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('La imagen no tiene dimensiones válidas.');
  if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) throw new Error('La imagen supera 16 megapíxeles o 8192 px por lado. Reducí sus dimensiones y volvé a subirla.');
}

function safeSVG(text: string): Blob {
  if (text.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('El SVG es demasiado complejo o contiene declaraciones no admitidas. Exportalo como PNG.');
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = xml.documentElement;
  if (xml.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('El SVG no es válido. Exportalo nuevamente o usá PNG.');
  const allowed = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'desc']);
  const attributes = new Set(['id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'clip-path', 'clip-rule', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'fx', 'fy', 'fr', 'preserveAspectRatio', 'version']);
  const styleProperties = new Set(['fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'clip-path', 'clip-rule', 'stop-color', 'stop-opacity']);
  const elements = Array.from(root.querySelectorAll('*'));
  if (elements.length > 3000) throw new Error('El SVG tiene demasiados elementos. Exportalo como PNG para usarlo aquí.');
  for (const node of [root, ...elements]) {
    if (!allowed.has(node.localName) || node.namespaceURI !== root.namespaceURI) throw new Error('Usá un SVG de formas simples, con textos convertidos a curvas y sin imágenes, filtros ni recursos externos. También podés subir PNG.');
    for (const attribute of Array.from(node.attributes)) {
      const { name, value } = attribute;
      if (name === 'xmlns' || name.startsWith('xmlns:')) { node.removeAttribute(name); continue; }
      if (name === 'style') {
        for (const declaration of value.split(';').filter((entry) => entry.trim())) {
          const colon = declaration.indexOf(':');
          const property = declaration.slice(0, colon).trim();
          if (colon < 1 || !styleProperties.has(property)) throw new Error('Este SVG usa estilos no compatibles. Exportalo como SVG simple o PNG.');
          node.setAttribute(property, declaration.slice(colon + 1).trim());
        }
        node.removeAttribute('style');
      } else if (!attributes.has(name)) {
        throw new Error('Este SVG contiene atributos no compatibles. Exportalo como SVG simple o PNG.');
      }
    }
    // Also check attributes expanded from an inline style. Reject CSS escapes,
    // external URLs and all executable/declarative content; never insert into DOM.
    for (const { value } of Array.from(node.attributes)) {
      if (/[\\<>]|@|javascript:|data:|https?:|file:/i.test(value) || /url\s*\(/i.test(value.replace(/url\(#[a-zA-Z_][\w:.-]*\)/g, ''))) throw new Error('El SVG contiene referencias externas o estilos no admitidos. Usá PNG o un SVG autocontenido.');
    }
  }
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const box = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const numericDimension = (value: string | null) => value && /^\d*\.?\d+(px)?$/.test(value) ? Number.parseFloat(value) : NaN;
  const width = box.length === 4 ? box[2] : numericDimension(root.getAttribute('width'));
  const height = box.length === 4 ? box[3] : numericDimension(root.getAttribute('height'));
  checkDimensions(width, height);
  if (box.length === 4 && box.some((value) => !Number.isFinite(value))) throw new Error('El viewBox del SVG no es válido.');
  if (box.length !== 4) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const factor = Math.min(1, MAX_ARTWORK_EDGE / Math.max(width, height));
  root.setAttribute('width', String(Math.max(1, Math.round(width * factor))));
  root.setAttribute('height', String(Math.max(1, Math.round(height * factor))));
  return new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' });
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  let timer = 0;
  try {
    img.src = url;
    await Promise.race([img.decode(), new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('No se pudo abrir la imagen a tiempo. Probá con una versión más pequeña.')), 10000);
    })]);
    return img;
  } catch {
    img.src = '';
    throw new Error('No se pudo abrir la imagen. Puede estar dañada o usar características incompatibles. Probá exportarla como PNG o JPG.');
  } finally {
    window.clearTimeout(timer);
    URL.revokeObjectURL(url);
  }
}

export async function loadArtwork(file: File): Promise<Artwork> {
  if (!file.size || file.size > MAX_BYTES) throw new Error('Elegí una imagen de hasta 12 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'svg', 'pdf'].includes(extension || '')) throw new Error('Formatos admitidos: JPG, PNG, PDF y SVG simple.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === 'pdf') {
    if (!/%PDF-\d\.\d/.test(new TextDecoder().decode(bytes.subarray(0, 1024)))) throw new Error('El archivo no contiene un PDF válido.');
    // Load the PDF parser only when a customer actually uploads a PDF.
    const { loadPDFArtwork } = await import('./pdf-artwork.mts');
    return loadPDFArtwork(bytes, file.name);
  }
  let blob: Blob;
  let kind: ImageKind;
  if (extension === 'svg') {
    blob = safeSVG(new TextDecoder().decode(bytes));
    kind = 'SVG';
  } else {
    const metadata = rasterMetadata(bytes);
    checkDimensions(metadata.width, metadata.height);
    if ((extension === 'png') !== (metadata.kind === 'PNG')) throw new Error('La extensión no coincide con el contenido del archivo. Exportalo nuevamente como JPG o PNG.');
    kind = metadata.kind;
    blob = new Blob([bytes], { type: kind === 'PNG' ? 'image/png' : 'image/jpeg' });
  }
  const image = await decodeImage(blob);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  checkDimensions(width, height);
  const factor = Math.min(1, MAX_ARTWORK_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * factor));
  canvas.height = Math.max(1, Math.round(height * factor));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador no pudo preparar la imagen.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.src = '';
  return { canvas, name: file.name, width, height, kind };
}

export function exampleArtwork(): Artwork {
  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 1000;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#cc1625';
  ctx.textAlign = 'center';
  ctx.font = '600 28px Arial, sans-serif';
  ctx.fillText(t('HECHO PARA ACOMPAÑARTE'), 500, 174);
  ctx.font = '900 181px Arial, sans-serif';
  ctx.fillText(t('TU'), 500, 400);
  ctx.fillText(t('MARCA.'), 500, 594);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#cc1625';
  ctx.beginPath(); ctx.moveTo(198, 665); ctx.lineTo(802, 665); ctx.stroke();
  ctx.font = '500 35px Arial, sans-serif';
  ctx.fillText(t('EN CADA MOMENTO.'), 500, 746);
  ctx.font = '700 29px Arial, sans-serif';
  ctx.fillText('N I U P A C K', 500, 862);
  return { canvas, name: t('Diseño de ejemplo'), width: 1000, height: 1000, kind: 'example' };
}

export function releaseArtwork(artwork: Artwork | null): void {
  if (artwork) { artwork.canvas.width = 0; artwork.canvas.height = 0; }
}
