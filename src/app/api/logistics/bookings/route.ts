import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logisticsRepository } from '@/lib/logistics/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

export async function GET() {
  try { const identity = await requireNiuIdentity(); return NextResponse.json({ bookings: await logisticsRepository.listBookings(identity.organizationId), persistence: logisticsRepository.persistenceMode() }); }
  catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const { rate_id } = z.object({ rate_id: z.string().uuid() }).parse(await request.json());
    const booking = await logisticsRepository.createBooking(rate_id, identity.organizationId);
    await logisticsRepository.logAuditEvent({ organization_id: identity.organizationId, actor_id: identity.profileId, event_type: 'BOOKING_CREATED', target_entity: 'logistics_booking', entity_id: booking.id, metadata: { rate_id } });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const code = error instanceof Error ? error.message : '';
    const safeCode = ['RATE_NOT_FOUND', 'RATE_NOT_BOOKABLE', 'RATE_EXPIRED'].includes(code) ? code : 'BOOKING_FAILED';
    return NextResponse.json({ error: safeCode }, { status: 400 });
  }
}
