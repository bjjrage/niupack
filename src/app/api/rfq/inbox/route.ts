import { NextResponse } from 'next/server';
import { GmailClient } from '@/lib/gmail/gmail-client';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';

export async function GET() {
  try {
    await requireIdentityWithRole(READ_ROLES);
    return NextResponse.json({ status: GmailClient.getStatus() });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
