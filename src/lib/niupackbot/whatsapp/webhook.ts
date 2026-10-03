import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';

export const TEST_ORG = '00000000-0000-0000-0000-000000000001';

/**
 * Tenant resolver estricto V1.
 * - test: organización de test explícita (sin DB).
 * - demás envs: exige NIUPACKBOT_ORGANIZATION_ID y verifica que exista.
 * - NUNCA elige la primera organización.
 */
export async function resolveOrganizationIdStrict(): Promise<string> {
  if (process.env.NODE_ENV === 'test') return TEST_ORG;
  const envId = process.env.NIUPACKBOT_ORGANIZATION_ID || '';
  if (!envId) throw new Error('ORGANIZATION_NOT_CONFIGURED');
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('organizations').select('id').eq('id', envId).maybeSingle();
    if (error || !data) throw new Error('ORGANIZATION_INVALID');
    return envId;
  }
  if (process.env.NODE_ENV === 'development' && envId === TEST_ORG) return envId;
  throw new Error('ORGANIZATION_NOT_VERIFIED');
}

export function twiml(message: string | null): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
