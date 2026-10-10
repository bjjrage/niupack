import { describe, expect, it } from 'vitest';
import { extractQuoteFromText } from '@/lib/rfq/extractor';
import { extractPdfText, looksLikePdf, sha256Hex } from '@/lib/rfq/pdf';
import { buildSupplierLink, generateLinkToken, hashLinkToken, isPlausibleToken } from '@/lib/rfq/token';
import { makeTextPdf } from './helpers/make-pdf';

const rfqItems = [{ id: 'i1', sku: 'CUNA-AMP-2ML' }, { id: 'i2', sku: 'CUNA-AMP-5ML' }];

describe('extractor de cotizaciones', () => {
  const text = [
    'COTIZACION 2026-114', 'Moneda: USD', 'Incoterm: FOB Santos', 'Condiciones de pago: 30 dias neto',
    'Plazo de entrega: 4 semanas', 'Validez hasta 31/12/2026',
    'CUNA-AMP-2ML precio unitario 0,0485 MOQ 50.000',
    'CUNA-AMP-5ML precio unitario 0,0712',
  ].join('\n');

  it('extrae cada dato con su evidencia y deja todo pendiente de validación humana', () => {
    const r = extractQuoteFromText(text, rfqItems);
    expect(r.currency).toMatchObject({ value: 'USD', state: 'EXTRACTED' });
    expect(r.incoterm.value).toBe('FOB');
    expect(r.lead_time_days.value).toBe(28);
    expect(r.validity_date.value).toBe('2026-12-31');
    expect(r.payment_terms.value).toMatch(/30 dias/);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ rfq_item_id: 'i1', match: 'SKU_EN_LINEA' });
    expect(r.items[0].unit_price.value).toBe(0.0485);
    expect(r.items[0].moq.value).toBe(50000);
    expect(r.items[1].unit_price.value).toBe(0.0712);
    expect(r.needs_human_validation).toBe(true);
    expect(r.items[0].unit_price.evidence).toContain('CUNA-AMP-2ML');
  });

  it('no inventa: sin datos devuelve MISSING y sin ítems, nunca precios ni SKU por defecto', () => {
    const r = extractQuoteFromText('Gracias por su consulta, le responderemos a la brevedad.', rfqItems);
    expect(r.currency.state).toBe('MISSING');
    expect(r.items).toHaveLength(0);
    expect(r.quality).toBe('BAJA');
    expect(r.missing).toEqual(expect.arrayContaining(['currency', 'unit_price:CUNA-AMP-2ML', 'unit_price:CUNA-AMP-5ML']));
  });

  it('con monedas ambiguas no elige una; con un único ítem y un único precio lo marca como inferido', () => {
    const ambiguous = extractQuoteFromText('Precio USD 10 o R$ 50', [rfqItems[0]]);
    expect(ambiguous.currency.state).toBe('MISSING');
    const single = extractQuoteFromText('Oferta en USD. Precio unitario: 0.052', [rfqItems[0]]);
    expect(single.items[0]).toMatchObject({ match: 'UNICO_ITEM_INFERIDO' });
    expect(single.items[0].unit_price.state).toBe('INFERRED');
  });
});

describe('PDF real', () => {
  it('lee el texto de un PDF generado y lo pasa por el extractor', async () => {
    const bytes = makeTextPdf(['Cotizacion 77', 'Moneda: USD', 'Incoterm: CIF', 'CUNA-AMP-2ML precio unitario 0.0490 MOQ 30000']);
    expect(looksLikePdf(bytes)).toBe(true);
    const result = await extractPdfText(bytes);
    expect(result.status).toBe('EXTRACTED');
    const extracted = extractQuoteFromText(result.text!, rfqItems);
    expect(extracted.items[0].unit_price.value).toBe(0.049);
    expect(extracted.incoterm.value).toBe('CIF');
    expect(sha256Hex(bytes)).toHaveLength(64);
  });

  it('rechaza archivos que no son PDF y reporta PDF sin texto sin inventar contenido', async () => {
    expect((await extractPdfText(new Uint8Array(Buffer.from('hola mundo')))).status).toBe('NOT_SUPPORTED');
    const empty = await extractPdfText(makeTextPdf(['']));
    expect(empty.status).toBe('NOT_SUPPORTED');
  });
});

describe('tokens de enlace', () => {
  it('son largos, únicos, se validan por forma y solo se guarda su hash', () => {
    const a = generateLinkToken();
    const b = generateLinkToken();
    expect(a).not.toBe(b);
    expect(isPlausibleToken(a)).toBe(true);
    expect(isPlausibleToken('corto')).toBe(false);
    expect(isPlausibleToken('x'.repeat(43) + '; drop')).toBe(false);
    expect(hashLinkToken(a)).toHaveLength(64);
    expect(hashLinkToken(a)).not.toContain(a);
    expect(buildSupplierLink('https://app.example/', a)).toBe(`https://app.example/rfq/respond/${a}`);
  });
});
