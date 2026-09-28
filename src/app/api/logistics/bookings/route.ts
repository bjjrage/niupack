import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logisticsRepository } from '@/lib/logistics/repository';
import { repository } from '@/lib/db/repository';

export async function GET() {
  return NextResponse.json({ bookings: await logisticsRepository.listBookings(), persistence: logisticsRepository.persistenceMode() });
}

export async function POST(request: Request) {
  try {
    const { rate_id } = z.object({ rate_id: z.string().uuid() }).parse(await request.json());
    const booking = await logisticsRepository.createBooking(rate_id);
    await repository.logAuditEvent({ event_type: 'BOOKING_CREATED', target_entity: 'logistics_booking', entity_id: booking.id, metadata: { rate_id } });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, { status: 400 });
  }
}
