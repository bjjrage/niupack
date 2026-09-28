import { NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const providers = await logisticsRepository.listProviders(identity.organizationId);
    return NextResponse.json({ providers });
  } catch (error) {
    return authErrorResponse(error);
  }
}
