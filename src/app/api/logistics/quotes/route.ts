import { NextRequest, NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';

export async function GET(request: NextRequest) {
  return NextResponse.json({ quotes: await logisticsRepository.listQuotes(request.nextUrl.searchParams.get('rfqId') || undefined) });
}
