import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { fetchDncpTender } from '@/lib/licitaciones/dncp-client';
import { buildManualTender, manualTenderSchema, parseOcdsDocumentText } from '@/lib/licitaciones/manual';
import { importTender } from '@/lib/licitaciones/service';

const bodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('dncp'), identifier: z.string().trim().min(1) }),
  z.object({ mode: z.literal('ocds_document'), document: z.string().min(2).max(5_000_000), is_test_data: z.boolean().default(false) }),
  z.object({ mode: z.literal('manual'), tender: manualTenderSchema }),
]);

export async function POST(request: Request) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const body = bodySchema.parse(await request.json());
    let parsed; let raw: unknown;
    if (body.mode === 'dncp') {
      ({ tender: parsed, rawRelease: raw } = await fetchDncpTender(body.identifier));
    } else if (body.mode === 'ocds_document') {
      ({ tender: parsed, rawRelease: raw } = parseOcdsDocumentText(body.document, body.is_test_data));
    } else {
      parsed = buildManualTender(body.tender);
    }
    const result = await importTender(identity.organizationId, identity.profileId, parsed, raw);
    return NextResponse.json({ ...result, unconfirmed: parsed.unconfirmed, title: parsed.title, external_id: parsed.external_id });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
