import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, NiuAuthError, requireNiuIdentity, NiuIdentity } from '@/lib/auth/identity';
import { verifyPackingToken } from '@/lib/auth/packing-token';
import { repository } from '@/lib/db/repository';
import { PackingSessionStatus } from '@/types';

type PackingCaller = {
  identity: NiuIdentity;
  isPackingOperator: boolean;
  operatorLine?: string;
  tokenId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveCallerIdentity(req: NextRequest): Promise<PackingCaller> {
  const token = req.headers.get('x-packing-token');
  if (token !== null) {
    const verified = verifyPackingToken(token);
    if (!verified) throw new NiuAuthError('PACKING_TOKEN_INVALID', 401);

    const registered = await repository.getPackingOperatorToken(verified.jti, verified.org);
    const registryExpiry = registered ? Date.parse(registered.expires_at) : Number.NaN;
    if (
      !registered ||
      registered.revoked_at ||
      !Number.isFinite(registryExpiry) ||
      registryExpiry <= Date.now() ||
      registered.organization_id !== verified.org ||
      registered.line_name !== verified.line
    ) {
      throw new NiuAuthError('PACKING_TOKEN_INVALID_EXPIRED_OR_REVOKED', 401);
    }

    return {
      identity: {
        userId: 'packing-operator',
        organizationId: verified.org,
        // Packing links are capabilities, not profiles. Never send this synthetic value to UUID FKs.
        profileId: '',
        email: 'operador@planta.niupack.com',
        role: 'operator',
      },
      isPackingOperator: true,
      operatorLine: verified.line,
      tokenId: verified.jti,
    };
  }

  return { identity: await requireNiuIdentity(), isPackingOperator: false };
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'request_id')
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function resolveRequestId(body: Record<string, unknown>, organizationId: string): string {
  if (body.request_id !== undefined) {
    if (typeof body.request_id !== 'string' || !UUID_PATTERN.test(body.request_id)) {
      throw new Error('INVALID_REQUEST_ID');
    }
    return body.request_id;
  }
  // Compatibility for the existing supervisor allocation UI. Timer clients supply and retain their own key.
  const hex = createHash('sha256')
    .update(`${organizationId}:${canonicalize(body)}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function jsonError(error: unknown) {
  if (error instanceof Error && error.message === 'INVALID_REQUEST_ID') {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return authErrorResponse(error);
}

function requireActionRole(caller: PackingCaller, action: string): void {
  if (caller.identity.role === 'admin' && !caller.isPackingOperator) return;
  if (caller.isPackingOperator && ['start', 'change_headcount', 'stop'].includes(action)) return;
  throw new NiuAuthError('FORBIDDEN_PACKING_ACTION', 403);
}

export async function GET(req: NextRequest) {
  try {
    const caller = await resolveCallerIdentity(req);
    const { identity, isPackingOperator, operatorLine } = caller;
    if (!isPackingOperator && identity.role !== 'admin') {
      throw new NiuAuthError('FORBIDDEN_PACKING_SESSION_READ', 403);
    }
    const { searchParams } = new URL(req.url);
    const requestedStatus = searchParams.get('status') as PackingSessionStatus | null;
    if (isPackingOperator && requestedStatus && requestedStatus !== 'RUNNING') {
      throw new NiuAuthError('PACKING_OPERATOR_RUNNING_SESSION_ONLY', 403);
    }
    // The mobile capability only needs the live session for its bound line.
    // It cannot enumerate historical sessions or request arbitrary SKU/period data.
    const status = isPackingOperator ? 'RUNNING' : requestedStatus;
    const line_name = isPackingOperator ? operatorLine : (searchParams.get('line_name') || undefined);
    const period = isPackingOperator ? undefined : searchParams.get('period') || undefined;
    const sku = isPackingOperator ? undefined : searchParams.get('sku') || undefined;

    const sessions = await repository.getPackingSessions(
      { status: status || undefined, line_name, period, sku },
      identity.organizationId
    );

    return NextResponse.json({ success: true, sessions, server_now: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await resolveCallerIdentity(req);
    const { identity, isPackingOperator, operatorLine, tokenId } = caller;
    const body = await req.json() as Record<string, any>;
    const action = typeof body.action === 'string' ? body.action : '';
    if (!action) return NextResponse.json({ error: 'ACTION_REQUIRED' }, { status: 400 });
    requireActionRole(caller, action);

    if (isPackingOperator && !['start', 'change_headcount', 'stop'].includes(action)) {
      throw new NiuAuthError('FORBIDDEN_OPERATOR_ACTION', 403);
    }
    if (action === 'approve') {
      return NextResponse.json({ error: 'ALLOCATIONS_REQUIRED_USE_ALLOCATE' }, { status: 409 });
    }

    const requestId = resolveRequestId(body, identity.organizationId);
    const context = {
      requestId,
      actorProfileId: isPackingOperator ? undefined : identity.profileId,
      tokenId,
      lineName: isPackingOperator ? operatorLine : undefined,
      shiftCode: typeof body.shift_code === 'string' ? body.shift_code.trim() || undefined : undefined,
      shiftDate: typeof body.shift_date === 'string' ? body.shift_date : undefined,
    };

    let session;
    switch (action) {
      case 'start': {
        const line_name = isPackingOperator ? operatorLine! : (typeof body.line_name === 'string' ? body.line_name.trim() : 'Polipapel');
        const initial_headcount = Number(body.initial_headcount ?? 1);
        if (!Number.isSafeInteger(initial_headcount) || initial_headcount <= 0) {
          return NextResponse.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
        }
        session = await repository.startPackingSession({
          line_name,
          sku: typeof body.sku === 'string' ? body.sku.trim() || undefined : undefined,
          production_order: typeof body.production_order === 'string' ? body.production_order.trim() || undefined : undefined,
          initial_headcount,
          reason: typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined,
          operator_user_id: isPackingOperator ? undefined : identity.profileId,
        }, identity.organizationId, context);
        break;
      }
      case 'change_headcount': {
        if (typeof body.session_id !== 'string' || !UUID_PATTERN.test(body.session_id)) {
          return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        }
        const newHeadcount = Number(body.new_headcount);
        if (!Number.isSafeInteger(newHeadcount) || newHeadcount <= 0) {
          return NextResponse.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
        }
        session = await repository.changePackingHeadcount(
          body.session_id, newHeadcount, typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined,
          identity.organizationId, context
        );
        break;
      }
      case 'stop': {
        if (typeof body.session_id !== 'string' || !UUID_PATTERN.test(body.session_id)) {
          return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        }
        session = await repository.stopPackingSession(body.session_id, identity.organizationId, context);
        break;
      }
      case 'correct': {
        if (typeof body.session_id !== 'string' || !UUID_PATTERN.test(body.session_id)) {
          return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        }
        const hours = body.total_person_hours === undefined ? undefined : Number(body.total_person_hours);
        if (hours !== undefined && (!Number.isFinite(hours) || hours < 0)) {
          return NextResponse.json({ error: 'INVALID_PERSON_HOURS' }, { status: 400 });
        }
        session = await repository.correctPackingSession(body.session_id, {
          total_person_hours: hours,
          notes: typeof body.notes === 'string' ? body.notes.trim() || undefined : undefined,
        }, identity.organizationId, context);
        break;
      }
      case 'void': {
        if (typeof body.session_id !== 'string' || !UUID_PATTERN.test(body.session_id)) {
          return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
        }
        session = await repository.voidPackingSession(
          body.session_id, typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined,
          identity.organizationId, context
        );
        break;
      }
      default:
        return NextResponse.json({ error: `UNKNOWN_ACTION_${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, session, server_now: (session as typeof session & { server_now?: string }).server_now }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return jsonError(error);
  }
}
