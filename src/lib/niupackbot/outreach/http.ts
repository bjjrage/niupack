import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse } from '@/lib/auth/identity';
import { ContentApiError } from './twilio-content';

const STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  CROSS_TENANT_REFERENCE: 403,
  TEMPLATE_DUPLICATE: 409,
  TEMPLATE_NOT_APPROVED: 409,
  TEMPLATE_NOT_SUBMITTABLE: 409,
  TEMPLATE_WITHOUT_CONTENT_SID: 409,
  CAMPAIGN_NOT_EDITABLE: 409,
  CAMPAIGN_NOT_LAUNCHABLE: 409,
  CAMPAIGN_NOT_PAUSABLE: 409,
  CAMPAIGN_NOT_RESUMABLE: 409,
  CAMPAIGN_NOT_CANCELLABLE: 409,
  CAMPAIGN_WITHOUT_RECIPIENTS: 409,
  RECIPIENT_LIMIT_EXCEEDED: 413,
  NOT_HUMAN_CONTROL: 409,
  OPTED_OUT: 409,
  OUTSIDE_24H_WINDOW: 409,
  TWILIO_NOT_CONFIGURED: 503,
  SEND_FAILED: 502,
};

/** Mapea errores de dominio a HTTP sin filtrar mensajes internos. */
export function outreachError(error: unknown): NextResponse {
  if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  if (error instanceof ContentApiError) return NextResponse.json({ error: error.code === 'TWILIO_NOT_CONFIGURED' ? 'TWILIO_NOT_CONFIGURED' : 'TWILIO_CONTENT_API_ERROR', detail: error.code }, { status: error.code === 'TWILIO_NOT_CONFIGURED' ? 503 : 502 });
  if (error instanceof Error) {
    if (STATUS[error.message]) return NextResponse.json({ error: error.message }, { status: STATUS[error.message] });
    if (/_NOT_FOUND$/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 404 });
    if (/^(TEMPLATE|CAMPAIGN|SCHEDULE|REPLY)_[A-Z_]+$/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return authErrorResponse(error);
}
