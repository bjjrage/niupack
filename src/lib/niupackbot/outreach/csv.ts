// Importación de contactos por CSV. Función pura: la usa la UI (preview) y el servidor (validación final).
// Adaptado de utils/sfContactImport.js (AutoLead); teléfonos E.164 multi-país en vez de solo Paraguay.

import { normalizePhone } from './phone';

const HEADER_NOMBRE = ['nombre', 'name', 'contacto', 'cliente', 'empresa', 'nome'];
const HEADER_TELEFONO = ['telefono', 'celular', 'whatsapp', 'phone', 'mobile', 'numero', 'telefone'];

export interface CsvRow {
  nombre: string;
  telefono: string;
}

export interface PreviewRow {
  nombre: string;
  telefonoOriginal: string;
  phone_e164: string;
  estado: 'valido' | 'invalido' | 'duplicado';
  motivo: string;
}

const clean = (v: unknown) => String(v ?? '').trim();

const normHeader = (v: unknown) =>
  clean(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function parseLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseContactsCsv(text: string): CsvRow[] {
  const lines = String(text ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const sample = lines.slice(0, 3).join('\n');
  const delimiter = (sample.match(/;/g) ?? []).length > (sample.match(/,/g) ?? []).length ? ';' : (sample.includes('\t') ? '\t' : ',');
  const first = parseLine(lines[0], delimiter);
  const headers = first.map(normHeader);
  const nameIdx = headers.findIndex((h) => HEADER_NOMBRE.includes(h));
  const phoneIdx = headers.findIndex((h) => HEADER_TELEFONO.includes(h));
  const hasHeader = nameIdx >= 0 || phoneIdx >= 0;
  const ni = hasHeader ? nameIdx : 0;
  const pi = hasHeader ? phoneIdx : first.length > 1 ? 1 : 0;
  return (hasHeader ? lines.slice(1) : lines).map((line, i) => {
    const cells = parseLine(line, delimiter);
    const telefono = clean(cells[pi]);
    const nombre = ni >= 0 && ni !== pi ? clean(cells[ni]) : '';
    return { nombre: nombre || `Contacto ${i + 1}`, telefono };
  });
}

/** Valida y deduplica por teléfono normalizado. Primer ocurrencia gana. */
export function previewContacts(rows: CsvRow[]): { rows: PreviewRow[]; resumen: { total: number; validos: number; invalidos: number; duplicados: number } } {
  const seen = new Set<string>();
  const out: PreviewRow[] = rows.map((r) => {
    const nombre = clean(r.nombre);
    const original = clean(r.telefono);
    const p = normalizePhone(original);
    if (!p.ok) return { nombre, telefonoOriginal: original, phone_e164: '', estado: 'invalido', motivo: p.reason };
    if (seen.has(p.e164)) return { nombre, telefonoOriginal: original, phone_e164: p.e164, estado: 'duplicado', motivo: 'Repetido en la lista' };
    seen.add(p.e164);
    return { nombre, telefonoOriginal: original, phone_e164: p.e164, estado: 'valido', motivo: '' };
  });
  return {
    rows: out,
    resumen: {
      total: out.length,
      validos: out.filter((r) => r.estado === 'valido').length,
      invalidos: out.filter((r) => r.estado === 'invalido').length,
      duplicados: out.filter((r) => r.estado === 'duplicado').length,
    },
  };
}
