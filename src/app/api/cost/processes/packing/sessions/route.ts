import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { PackingSessionStatus } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status') as PackingSessionStatus | null;
    const line_name = searchParams.get('line_name') || undefined;
    const period = searchParams.get('period') || undefined;
    const sku = searchParams.get('sku') || undefined;

    const sessions = await repository.getPackingSessions(
      {
        status: status || undefined,
        line_name,
        period,
        sku,
      },
      identity.organizationId
    );

    return NextResponse.json({
      success: true,
      sessions,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'ACTION_REQUIRED' }, { status: 400 });
    }

    let session;
    switch (action) {
      case 'start': {
        const line_name = body.line_name?.trim() || 'Polipapel';
        const initial_headcount = Number(body.initial_headcount) || 1;
        session = await repository.startPackingSession(
          {
            line_name,
            sku: body.sku?.trim() || undefined,
            production_order: body.production_order?.trim() || undefined,
            initial_headcount,
            reason: body.reason?.trim() || undefined,
            operator_user_id: identity.profileId,
          },
          identity.organizationId
        );
        break;
      }
      case 'change_headcount': {
        if (!body.session_id) return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        const new_headcount = Number(body.new_headcount);
        if (isNaN(new_headcount) || new_headcount <= 0) {
          return NextResponse.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
        }
        session = await repository.changePackingHeadcount(
          body.session_id,
          new_headcount,
          body.reason?.trim() || undefined,
          identity.organizationId
        );
        break;
      }
      case 'stop': {
        if (!body.session_id) return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        session = await repository.stopPackingSession(body.session_id, identity.organizationId);
        break;
      }
      case 'approve': {
        if (!body.session_id) return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        session = await repository.approvePackingSession(
          body.session_id,
          identity.profileId,
          identity.organizationId
        );
        break;
      }
      case 'correct': {
        if (!body.session_id) return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        session = await repository.correctPackingSession(
          body.session_id,
          {
            total_person_hours: body.total_person_hours !== undefined ? Number(body.total_person_hours) : undefined,
            notes: body.notes?.trim() || undefined,
          },
          identity.organizationId
        );
        break;
      }
      case 'void': {
        if (!body.session_id) return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        session = await repository.voidPackingSession(
          body.session_id,
          body.reason?.trim() || undefined,
          identity.organizationId
        );
        break;
      }
      default:
        return NextResponse.json({ error: `UNKNOWN_ACTION_${action}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
