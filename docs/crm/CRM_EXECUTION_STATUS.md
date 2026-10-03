# NIUPACK Commercial CRM + NIUPACKBOT V1 — RELEASE CERTIFICATION

> Cierre release. Branch lista para merge (merge NO ejecutado aquí).

## GIT (verificado con `git fetch origin`)
- Branch: `feature/commercial-crm-autolead`
- Initial SHA: `3d4e1b7a194a8c5cf94b8a9884416d7807ccec95`
- origin/main SHA: `4061d1f03ca9f2321b6922057257f52c0b670ba8` (autoridad; NO usar `main` local)
- main local: NO TOCADA. No merge, no rebase, no force push.

## LIVE AUTORITATIVO (Supabase `tviuvfmhkatdplkisnta`)
- Migration history LIVE: `20261003163426 crm_v1_additive`, `20261003163446 niupackbot_v1_additive`
- 10 tablas live: 7 CRM (`crm_companies/contacts/leads/opportunities/tasks/activities/conversations`) + 3 BOT (`niupackbot_messages/state/events`)
- RLS live: activo. Policies tenant live: existen.
- Performance migration `20261004000001_crm_v1_perf`: preparada en repo, PENDIENTE de aplicación live (única pendiente; se aplica desde entorno con acceso, NUNCA `supabase db push` desde entorno con placeholders).

## RECONCILIACIÓN REPO == LIVE
- Eliminados: `20261003000001_crm_v1.sql`, `20261003000002_niupackbot_v1.sql` (ya no existen en el branch).
- Actuales: `20261003163426_crm_v1_additive.sql`, `20261003163446_niupackbot_v1_additive.sql` (mismo schema live: tablas, constraints, checks, índices base, RLS, tenant policies sin DROP, grants, FK diferida activities→conversations).
- Sin DROP POLICY en archivos CRM/BOT. Sin destrucción.

## PERF MIGRATION FINAL
- Archivo: `20261004000001_crm_v1_perf.sql` (única pendiente live).
- 25 índices FK-led (`CREATE INDEX IF NOT EXISTS`, FK como LEADING COLUMN):
  companies 1, contacts 1, leads 3, opportunities 4, tasks 4, activities 6, conversations 3, events 3.
- No duplicados: `crm_contacts.company_id` (cubre `idx_crm_contacts_company`) y `niupackbot_messages.conversation_id` (cubre `idx_bot_messages_conv`) ya existían en base; `niupackbot_state.conversation_id` es PK.

## ENV
- `TWILIO_WEBHOOK_URL=https://tu-deploy/api/niupackbot/whatsapp` (ruta correcta con `/api`). Sin secretos reales.

## ARQUITECTURA (revalidada, sin cambios)
- `from('crm_*')` solo en `src/lib/crm/repository.ts`. `api.twilio.com` solo en `sender.ts` reservado (inbound = solo TwiML). Sin fallback a primera organización. Sin true cost en NIUPACKBOT.

## QA REAL
- `npm run test`: 32 files / 128 passed, 0 regresiones.
- `npm run typecheck`: clean.
- `npm run build`: OK (13 `/api/crm/*` + `/api/niupackbot/whatsapp` + `/commercial`).
