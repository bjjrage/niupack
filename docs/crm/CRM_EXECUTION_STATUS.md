# NIUPACK Commercial CRM + NIUPACKBOT V1 — Execution Status (HARDENING FINAL)

> Fuente de continuidad multiagente. Estado real final, sin texto viejo de pendientes.

## HEAD
- Branch: `feature/commercial-crm-autolead`
- Previous SHA (pre-hardening): `8dd5baf5ce8540c3e121f460c9e6afa554456a43`
- Final SHA: (ver `git rev-parse HEAD` tras commits hardening)
- Base original: `4061d1f03ca9f2321b6922057257f52c0b670ba8`
- main: NO MODIFICADA. AutoLead: NO TOCADO.

## HARDENING APLICADO (sin features, sin rediseño UI)
1. **Twilio strict (route-level)**: sin `TWILIO_AUTH_TOKEN` => TwiML vacío, cero writes, cero OpenAI. Firma ausente/inválida => TwiML vacío, cero writes. Tests en `tests/niupackbot-webhook-hardening.test.ts` (ruta POST, no solo helper).
2. **Tenant resolver estricto**: eliminado `organizations.select('id').limit(1)`. `resolveOrganizationIdStrict()` en `src/lib/niupackbot/whatsapp/webhook.ts`: test => org test explícita; resto => exige `NIUPACKBOT_ORGANIZATION_ID` y verifica existencia en `organizations`. Sin crear orgs. Tests en `tests/niupackbot-tenant-resolver.test.ts`.
3. **Single outbound**: inbound V1 responde SOLO vía TwiML `<Message>`. Eliminado `sendWhatsapp()` REST del flujo inbound (`src/lib/niupackbot/service.ts`); sender REST movido a `src/lib/niupackbot/whatsapp/sender.ts` reservado, sin ejecutarse. Test espía `fetch` => 0 llamadas a `api.twilio.com`.
4. **Cross-tenant FK validation**: `crmService` valida `company_id/contact_id/lead_id/opportunity_id/conversation_id/assigned_to/owner_profile_id` contra el mismo `organizationId` (`CROSS_TENANT_REFERENCE` => 403). Perfiles: DB en SUPABASE, binding en memoria para tests. Rutas CRM usan `crmService`, no `repository` directo para mutaciones. Tests en `tests/crm-cross-tenant-refs.test.ts` (forged company/contact/lead/opp/owner/assigned).
5. **Migrations**: `20261003000001_crm_v1` + `20261003000002_niupackbot_v1` revisadas (orden FK, `private.current_organization_id()`, RLS, índices, aditivas, sin DROP de datos). **NO aplicadas a Supabase vivo desde este entorno**: `.env.local` tiene URL real pero `SUPABASE_SERVICE_ROLE_KEY`/`DATABASE_URL`/`ANON` placeholders (dry-run falla con `ENOTFOUND db.your-project`). Bloqueador externo, no se finge aplicación.
6. **Env**: `.env.example` con sección SERVER ONLY (`NIUPACKBOT_ORGANIZATION_ID`, `TWILIO_*`, `TWILIO_WEBHOOK_URL`), marcadas obligatorias en producción, sin secretos reales.
7. **QA**: scenarios cubiertos (sin secret/inválida/válida/sin org/org inválida/forged FK/retry/HUMAN/CRM operativo).

## NO CAMBIADO (verificado)
- UI intacta este batch (`CommercialCrmWorkspace`, sidebar 1 entrada, 5 vistas). Cost Intelligence intacto (preview/inactive, sin true cost). Sin pricing/logistics reales. Sin tabs nuevos.

## QA FINAL
- `npm run test`: 32 files / 128 passed
- `npm run typecheck`: clean
- `npm run build`: OK (13 `/api/crm/*` + `/api/niupackbot/whatsapp` + `/commercial`)

## PENDIENTE EXTERNO (no código)
- Setear en producción: `NIUPACKBOT_ORGANIZATION_ID` (UUID real verificado), `TWILIO_*`, `TWILIO_WEBHOOK_URL`, `SUPABASE_SERVICE_ROLE_KEY`/`DATABASE_URL` reales.
- Aplicar migrations aditivas al proyecto NIUPACK existente y verificar tablas/RLS/policies/FK/indexes/history/advisors.
