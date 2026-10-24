export type Locale = 'es' | 'en' | 'pt';
export function pageLocale(language?: string): Locale;
export function t(source: string, language?: string): string;
export function translateMarkup(html: string, locale: string): string;
