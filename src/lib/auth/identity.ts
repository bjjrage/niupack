import { NextResponse } from 'next/server';
import { isSupabaseAdminConfigured, isSupabasePublicConfigured, supabaseAdmin } from '@/lib/db/supabase';
import { createSupabaseServerClient } from './supabase-server';

export interface NiuIdentity {
  userId: string;
  organizationId: string;
  email?: string;
  profileId: string;
  role: 'admin' | 'analyst' | 'operator' | 'executive';
}

export class NiuAuthError extends Error {
  status: 401 | 403 | 503;

  constructor(code: string, status: 401 | 403 | 503) {
    super(code);
    this.name = 'NiuAuthError';
    this.status = status;
  }
}

const testOrganizationId = '00000000-0000-0000-0000-000000000001';

/**
 * Resolves the already authenticated NIUPACK session to its tenant identity.
 * This is shared by server-side OS routes; it does not create or manage a
 * product-specific session.
 */
export async function requireNiuIdentity(): Promise<NiuIdentity> {
  if (process.env.NODE_ENV === 'test' && !isSupabasePublicConfigured) {
    return { userId: 'test-user', organizationId: testOrganizationId, profileId: 'test-profile', email: 'test@niupack.local', role: 'admin' };
  }

  if (!isSupabasePublicConfigured || !isSupabaseAdminConfigured || !supabaseAdmin) {
    throw new NiuAuthError('AUTH_NOT_CONFIGURED', 503);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new NiuAuthError('AUTH_REQUIRED', 401);

  let profileQuery = await supabaseAdmin
    .from('profiles')
    .select('id, organization_id, auth_user_id, email, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!profileQuery.data && !profileQuery.error) {
    profileQuery = await supabaseAdmin
      .from('profiles')
      .select('id, organization_id, auth_user_id, email, role')
      .eq('email', user.email ?? '')
      .maybeSingle();
  }

  if (profileQuery.error || !profileQuery.data) throw new NiuAuthError('AUTH_PROFILE_NOT_LINKED', 403);

  const role = profileQuery.data.role;
  if (!['admin', 'analyst', 'operator', 'executive'].includes(role)) {
    throw new NiuAuthError('AUTH_PROFILE_ROLE_INVALID', 403);
  }

  if (!profileQuery.data.auth_user_id) {
    const { error: linkError } = await supabaseAdmin
      .from('profiles')
      .update({ auth_user_id: user.id })
      .eq('id', profileQuery.data.id)
      .is('auth_user_id', null);
    if (linkError) throw new NiuAuthError('AUTH_PROFILE_LINK_FAILED', 503);
  }

  return {
    userId: user.id,
    organizationId: profileQuery.data.organization_id,
    profileId: profileQuery.data.id,
    email: user.email,
    role,
  };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof NiuAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith('SUPABASE_SCHEMA_NOT_READY:')) {
    return NextResponse.json({
      error: 'SUPABASE_SCHEMA_NOT_READY',
      table: error.message.slice('SUPABASE_SCHEMA_NOT_READY:'.length),
      message: 'La base de datos no está preparada para esta operación. Aplicá las migraciones industriales en un entorno QA.',
    }, { status: 503 });
  }
  if (error instanceof Error && error.message === 'SUPABASE_PERSISTENCE_UNAVAILABLE') {
    return NextResponse.json({
      error: error.message,
      message: 'La persistencia de Supabase no está configurada para esta operación.',
    }, { status: 503 });
  }
  return NextResponse.json({ error: 'AUTH_FAILED' }, { status: 500 });
}
