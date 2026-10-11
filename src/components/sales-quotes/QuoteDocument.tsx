import React from 'react';
import { formatAmount, formatQuantity, longDate } from '@/lib/sales-quotes/domain';

export interface DocQuote {
  code: string; client_name: string; attention: string | null; subject: string | null; intro: string | null; payment_terms: string; delivery_terms: string; notes: string | null;
  quote_date: string; valid_until: string | null; currency: string; signer_name: string | null; signer_title: string | null; signer_company: string | null;
}
export interface DocLine { id: string; item_no: number; description: string; quantity: number | null; unit_price: number; line_total: number | null }

/**
 * El presupuesto tal como se envía al cliente: membrete NIUPACK, fecha, destinatario, tabla de ítems con precios IVA incluido,
 * condiciones y firma. Mismo orden y textos que el formato de referencia (Word) de NIUPACK.
 */
export function QuoteDocument({ quote, lines }: { quote: DocQuote; lines: DocLine[] }) {
  const intro = quote.intro || `Me dirijo a usted a fin de remitir el presupuesto solicitado${quote.subject ? ` para ${quote.subject}` : ''}.`;
  const cell = 'border border-black px-2 py-1';
  return (
    <article className="mx-auto flex min-h-[1000px] w-full max-w-[820px] flex-col bg-white p-10 text-[13px] leading-snug text-black" style={{ fontFamily: 'Montserrat, Arial, sans-serif' }} data-testid="quote-document">
      <header className="flex items-center justify-between border-b border-neutral-300 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/niupack-logo.png" alt="niupack" className="h-20 w-20 object-contain" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/niupack-tagline.png" alt="Marca desde el packaging." className="h-8 object-contain" />
      </header>

      <p className="mt-6 text-right">{longDate(quote.quote_date)}</p>
      <p className="mt-6 font-semibold uppercase">{quote.attention || quote.client_name}</p>
      {quote.attention && quote.attention.toLowerCase() !== quote.client_name.toLowerCase() && <p className="uppercase">{quote.client_name}</p>}
      <p>Presente.</p>

      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#d9d9d9] text-center font-semibold">
            <th className={`${cell} w-12`}>ITEM</th><th className={cell}>DESCRIPCION</th><th className={`${cell} w-24`}>CANTIDAD</th>
            <th className={`${cell} w-28`}>PRECIO UNITARIO C/ IVA</th><th className={`${cell} w-28`}>PRECIO TOTAL C/ IVA</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className={`${cell} text-center`}>{l.item_no}</td>
              <td className={cell}>{l.description}</td>
              <td className={`${cell} text-center`}>{formatQuantity(l.quantity)}</td>
              <td className={`${cell} text-center`}>{formatAmount(l.unit_price, quote.currency)}</td>
              <td className={`${cell} text-center`}>{formatAmount(l.line_total, quote.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {quote.currency === 'USD' && <p className="mt-1 text-[11px]">Importes en dólares americanos (USD).</p>}

      <p className="mt-6">{intro}</p>
      {quote.notes && <p className="mt-3 whitespace-pre-line">{quote.notes}</p>}
      <p className="mt-4"><span className="font-semibold">Condición de pago:</span> {quote.payment_terms}.</p>
      <p><span className="font-semibold">Plazo de entrega:</span> {quote.delivery_terms}.</p>
      {quote.valid_until && <p><span className="font-semibold">Validez de la oferta:</span> hasta el {longDate(quote.valid_until, '').replace(/^,\s*/, '')}.</p>}

      <p className="mt-6">Atentamente,</p>
      <div className="mt-8">
        <p className="font-semibold">{quote.signer_name}</p>
        {quote.signer_title && <p>{quote.signer_title}</p>}
        {quote.signer_company && <p className="font-semibold">{quote.signer_company}</p>}
      </div>

      <footer className="mt-auto flex items-end justify-between gap-4 border-t border-neutral-300 pt-3 text-[10px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/certificaciones.png" alt="FSSC 22000 · FSC" className="h-12 object-contain" />
        <div className="text-right">
          <p>0981 765 840 · www.niupack.com.py · administracion@niupack.com.py</p>
          <p>San Vicente c/ Aca Verá - Lambaré</p>
        </div>
      </footer>
    </article>
  );
}
