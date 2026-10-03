# NIUPACK Commercial CRM + NIUPACKBOT V1 — RELEASE CERTIFICATION

> Certificación final de cierre. Branch lista para merge (merge NO ejecutado aquí).

## GIT
- Branch: `feature/commercial-crm-autolead`
- Previous SHA (inicio certificación): `cdd446201725652cab2f8498390c1487dc72cb88`
- Final SHA: (ver `git rev-parse HEAD` tras commit certificación)
- Base original: `4061d1f03ca9f2321b6922057257f52c0b670ba8`
- main: NO TOCADA (`2045ad1`). No merge, no rebase, no force push.

## ARQUITECTURA (congelada, verificada)
- Mismo repo/deploy/Supabase, separación lógica, AutoLead intacto.
- `BOT → CRM Service → Repository → Supabase` (grep: `from('crm_*')` solo en `repository.ts`; `api.twilio.com` solo en `sender.ts` reservado; sin `limit(1)` en resolver).
- NIUPACKBOT sin referencias a true cost (grep vacío en `src/lib/niupackbot`).

## UI (no rediseño)
- Sidebar: UNA entrada (`7. COMMERCIAL CRM → /commercial`). Local: 5 vistas. Detalles contextuales. Sin cambios este batch.

## SUPABASE LIVE
- Proyecto: `tviuvfmhkatdplkisnta` (DNS resuelve: `172.64.149.246`/`104.18.38.10`).
- Tablas CRM/BOT aplicadas en vivo según reporte externo (no re-creadas aquí, no nuevo proyecto).
- Reconciliación: repo contiene `20261003000001_crm_v1`, `20261003000002_niupackbot_v1` (+ nueva perf `20261004000001_crm_v1_perf` solo-índices, pendiente de aplicar por pipeline con credenciales reales).
- Verificación directa con service_role NO posible desde este entorno: `.env.local` trae URL real pero `SUPABASE_SERVICE_ROLE_KEY`/`ANON`/`DATABASE_URL`/`OPENAI` son placeholders y faltan `NIUPACKBOT_ORGANIZATION_ID` + `TWILIO_*` (solo longitudes verificadas, sin exponer valores). Sin `supabase db push` real (dry-run confirma endpoint placeholder). Se reporta como bloqueador externo, no se finge.

## PERFORMANCE SCHEMA
- Nueva migration aditiva `20261004000001_crm_v1_perf.sql`: 10 índices `IF NOT EXISTS` (contacts org+company/owner, opps org+contact, tasks org+company/assignee, activities org+company/contact, conversations org+opp/contact, events org+lead/opp). Sin DROP ni datos.

## ENV
- `.env.example` con sección SERVER ONLY obligatoria en producción (`NIUPACKBOT_ORGANIZATION_ID`, `TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM/WEBHOOK_URL`). Sin secretos reales. Producción sin ellas => webhook fail-closed (testeado).

## SECURITY
- Twilio estricto a nivel ruta, tenant resolver estricto, single TwiML outbound, validación cross-tenant (`CROSS_TENANT_REFERENCE` => 403), RLS `tenant_isolation_*` con `(SELECT private.current_organization_id())`, sin service_role en frontend, sin PII en logs.

## QA
- `npm run test`: 32 files / 128 passed (incluye smoke E2E: ejemplo copos 12oz/500mil/Curitiba, retry, HUMAN, cross-tenant).
- `npm run typecheck`: clean. `npm run build`: OK (13 `/api/crm/*` + `/api/niupackbot/whatsapp` + `/commercial`).

## DEPLOY
- Mismo deploy NIUPACK OS, sin worker/service nuevo. Build verde => listo para deploy estándar. Webhook Twilio real pendiente de credenciales (fail-closed hasta entonces).

## PENDIENTE EXTERNO (post-merge/deploy)
- Setear prod: `NIUPACKBOT_ORGANIZATION_ID` real, `TWILIO_*`, service_role real para aplicar `20261004000001` y verificar tablas/RLS/advisors en vivo.
