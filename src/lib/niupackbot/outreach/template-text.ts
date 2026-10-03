// Funciones PURAS de texto de templates: se usan en servidor y en el cliente (preview).
// No importar nada de servidor acá.

/** Números de variable usados en el cuerpo: "Hola {{1}}" → [1]. */
export function placeholders(body: string): number[] {
  return [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** Reemplaza {{1}} por su valor. Variables faltantes quedan vacías (el caller valida antes de enviar). */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => variables[n] ?? '');
}

export const TEMPLATE_NAME_RE = /^[a-z0-9_]{3,64}$/;
export const TEMPLATE_BODY_MAX = 1024;
