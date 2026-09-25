import { NextResponse } from 'next/server';
import { GmailClient } from '@/lib/gmail/gmail-client';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';

export async function POST() {
  try {
    const syncResult = await GmailClient.syncMailbox();
    const org = await repository.getOrganization();

    // Parse each reply and create quote records
    const extractedQuotes = [];
    for (const reply of syncResult.replies) {
      const quote = await OpenAIService.extractQuote({
        supplierId: reply.supplierId,
        supplierName: reply.supplierName,
        emailText: reply.rawText,
      });

      const saved = await repository.addQuote({
        organization_id: org.id,
        supplier_id: reply.supplierId,
        supplier_name: reply.supplierName,
        currency: quote.currency,
        incoterm: quote.incoterm,
        freight_included: quote.freight_included,
        printing_included: quote.printing_included,
        tooling_cost: quote.tooling_cost,
        payment_terms: quote.payment_terms,
        lead_time_days: quote.lead_time_days,
        validity_date: quote.validity_date,
        status: 'EXTRACTED',
        confidence_score: quote.confidence_score,
        operator_notes: quote.operator_notes,
        raw_quote_text: quote.raw_quote_text,
        items: quote.items,
      });

      extractedQuotes.push(saved);
    }

    return NextResponse.json({
      success: true,
      newRepliesCount: syncResult.newRepliesCount,
      extractedQuotes,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
