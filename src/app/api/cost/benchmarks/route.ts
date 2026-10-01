import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { repository } from '@/lib/db/repository';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const prices = await repository.getMarketPrices(identity.organizationId);
    return NextResponse.json({ prices });
  } catch (error) {
    return authErrorResponse(error);
  }
}
