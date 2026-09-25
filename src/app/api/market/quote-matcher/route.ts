import { NextRequest, NextResponse } from 'next/server';
import { QuoteMatcherEngine } from '@/lib/engines/quote-matcher-engine';
import { repository } from '@/lib/db/repository';

export async function GET() {
  try {
    const matches = await repository.getQuoteMatches();
    return NextResponse.json({ success: true, matches });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch quote matches' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let quoteInput = body.quote_input;
    if (!quoteInput && body.raw_text) {
      quoteInput = QuoteMatcherEngine.parseRawTextToQuote(
        body.raw_text,
        body.supplier_name || 'Competidor Analizado',
        body.country || 'BR',
        body.source_type || 'MANUAL_TEXT'
      );
    }

    if (!quoteInput) {
      return NextResponse.json(
        { success: false, error: 'Provide either raw_text or structured quote_input' },
        { status: 400 }
      );
    }

    const matchResult = await QuoteMatcherEngine.compareQuote(quoteInput, body.override_sku);

    return NextResponse.json({
      success: true,
      match: matchResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to execute quote matcher' },
      { status: 500 }
    );
  }
}
