import { NextResponse } from 'next/server';
import { GmailClient } from '@/lib/gmail/gmail-client';

export async function GET() {
  const status = GmailClient.getStatus();
  return NextResponse.json({ status });
}
