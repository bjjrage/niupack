import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { scanEnabledOrganizations } from '@/lib/licitaciones/scanner';
import { domainErrorResponse } from '@/lib/auth/role-guard';

export const maxDuration = 60;

function bearerOk(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  const header = request.headers.get('authorization') || '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Escaneo diario automático (Vercel Cron invoca por GET). No usa sesión: se autentica con CRON_SECRET y, si el secreto
 * no está configurado, falla cerrado (503) en lugar de dejar la ruta abierta.
 */
export async function GET(request: Request) {
  try {
    if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_NOT_CONFIGURED', message: 'Falta CRON_SECRET en el entorno.' }, { status: 503 });
    if (!bearerOk(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const results = await scanEnabledOrganizations({ budgetMs: 50_000 });
    return NextResponse.json({
      organizations: results.length,
      results: results.map((r) => ({ run_id: r.run_id, status: r.status, clients_scanned: r.clients_scanned, clients_total: r.clients_total, tenders_imported: r.tenders_imported, matches_created: r.matches_created, errors: r.errors.length })),
    });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
