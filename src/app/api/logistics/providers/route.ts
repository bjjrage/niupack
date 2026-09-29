import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logisticsRepository } from '@/lib/logistics/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/db/supabase';

const providerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  country_code: z.enum(['BR', 'AR', 'BO', 'PY', 'OTHER']),
  city: z.string().trim().optional(),
  contact_name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const providers = await logisticsRepository.listProviders(identity.organizationId);
    return NextResponse.json({ providers });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    if (!isSupabaseAdminConfigured || !supabaseAdmin) return NextResponse.json({ error: 'LOGISTICS_PERSISTENCE_NOT_CONFIGURED' }, { status: 503 });
    const input = providerSchema.parse(await request.json());
    const { data: provider, error } = await supabaseAdmin.from('suppliers').insert({
      organization_id: identity.organizationId,
      name: input.name,
      email: input.email,
      country_code: input.country_code,
      city: input.city || null,
      contact_name: input.contact_name || null,
      phone: input.phone || null,
      status: 'APPROVED_FOR_CONTACT',
      discovery_source: 'MANUAL_LOGISTICS',
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_PROVIDER' }, { status: 400 });
    console.error('[logistics/providers] provider creation failed', error);
    return NextResponse.json({ error: 'PROVIDER_CREATION_FAILED' }, { status: 400 });
  }
}
