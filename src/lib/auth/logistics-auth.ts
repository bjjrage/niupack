import { NextResponse } from 'next/server';
import { isSupabasePublicConfigured, isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/db/supabase';
import { createSupabaseServerClient } from './supabase-server';

export interface LogisticsIdentity {
  userId: string;
  organizationId: string;
  email?: string;
  profileId: string;
}

export class LogisticsAuthError extends Error {
  status: 401 | 403 | 503;
  constructor(code: string, status: 401 | 403 | 503) {
    super(code);
    this.name = 'LogisticsAuthError';
    this.status = status;
  }
}

const testOrganizationId = '00000000-0000-0000-0000-000000000001';

export async function requireLogisticsIdentity(): Promise<LogisticsIdentity> {
  if (process.env.NODE_ENV === 'test' && !isSupabasePublicConfigured) {
    return { userId: 'test-user', organizationId: testOrganizationId, profileId: 'test-profile', email: 'test@niupack.local' };
  }
  if (!isSupabasePublicConfigured || !isSupabaseAdminConfigured || !supabaseAdmin) {
    throw new LogisticsAuthError('AUTH_NOT_CONFIGURED', 503);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new LogisticsAuthError('AUTH_REQUIRED', 401);

  let profileQuery = await supabaseAdmin.from('profiles').select('id, organization_id, auth_user_id, email').eq('auth_user_id', user.id).maybeSingle();
  if (!profileQuery.data && !profileQuery.error) {
    profileQuery = await supabaseAdmin.from('profiles').select('id, organization_id, auth_user_id, email').eq('email', user.email ?? '').maybeSingle();
  }
  if (profileQuery.error || !profileQuery.data) throw new LogisticsAuthError('AUTH_PROFILE_NOT_LINKED', 403);

  if (!profileQuery.data.auth_user_id) {
    const { error: linkError } = await supabaseAdmin.from('profiles').update({ auth_user_id: user.id }).eq('id', profileQuery.data.id).is('auth_user_id', null);
    if (linkError) throw new LogisticsAuthError('AUTH_PROFILE_LINK_FAILED', 503);
  }

  return { userId: user.id, organizationId: profileQuery.data.organization_id, profileId: profileQuery.data.id, email: user.email };
}

export function logisticsAuthErrorResponse(error: unknown) {
  if (error instanceof LogisticsAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : 'AUTH_FAILED' }, { status: 500 });
}
