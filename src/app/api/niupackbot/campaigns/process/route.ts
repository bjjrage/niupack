import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { processQueue } from '@/lib/niupackbot/outreach/campaigns';
import { resolveOrganizationIdStrict } from '@/lib/niupackbot/whatsapp/webhook';

export const maxDuration = 30;

function bearerOk(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  const header = request.headers.get('authorization') || '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Un tick de la cola de campañas. Dos formas de autenticarse (el middleware deja pasar esta ruta):
 *  - Bearer CRON_SECRET (scheduler externo / Vercel Cron) → organización NIUPACK estricta.
 *  - Sesión de usuario → solo su organización (la UI llama esto mientras mira una campaña corriendo).
 */
async function handle(request: Request) {
  try {
    const organizationId = bearerOk(request) ? await resolveOrganizationIdStrict() : (await requireNiuIdentity()).organizationId;
    const campaignId = new URL(request.url).searchParams.get('campaignId') ?? undefined;
    return NextResponse.json(await processQueue(organizationId, { campaignId }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export const POST = handle;
export const GET = handle; // Vercel Cron invoca por GET
