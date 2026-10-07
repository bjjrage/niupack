import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, NiuAuthError } from '@/lib/auth/identity';

export function deletionErrorResponse(error: unknown) {
  if (error instanceof NiuAuthError) return authErrorResponse(error);
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
  return NextResponse.json({ error: 'ACCOUNT_DELETE_FAILED' }, { status: 500 });
}
