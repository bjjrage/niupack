# NIUPACKBOT — AutoLead Reuse Map (READ ONLY, sin modificación)

> AutoLead (`bjjrage/AutoLead`) es READ ONLY. No se modificó, no se commiteó, no se cambió infra/Supabase/Railway/Twilio.
> En este entorno el repo es privado/inaccesible (fetch público => 404). Por tanto NO se clonó ni se copió código.
> Este mapa registra patrones probados a reimplementar de forma nativa en dominio packaging NIUPACK.

## Método
- `REUSE`: patrón estándar reimplementado nativo (sin copiar código automotor).
- `ADAPT`: idea útil pero con contrato NIUPACK distinto (CRM Service, packaging, ES/PT-BR).
- `IGNORE`: dominio automotor / enterprise fuera de V1.

## Mapa

| COMPONENT | SOURCE (AutoLead, referencia) | REUSE / ADAPT / IGNORE | WHY | TARGET (NIUPACK) |
|---|---|---|---|---|
| Twilio signature validation (HMAC-SHA1, `X-Twilio-Signature`) | AutoLead webhook (patrón Twilio estándar) | REUSE | Seguridad obligatoria; mismo proveedor | `src/lib/niupackbot/whatsapp/twilio.ts` (`validateTwilioSignature`) |
| Webhook entry + form-urlencoded parse | AutoLead `POST /webhook` | ADAPT | Necesitamos mismo deploy, auth NIUPACK, idempotencia por `MessageSid` | `src/app/api/niupackbot/whatsapp/route.ts` |
| Message normalization (From/To/Body/NumMedia) | AutoLead normalize | REUSE | Twilio envía `application/x-www-form-urlencoded`; normalizar `whatsapp:+` y E.164 | `src/lib/niupackbot/whatsapp/normalize.ts` |
| Conversation persistence (1 row por conversación externa) | AutoLead conversations | ADAPT | En NIUPACK la verdad comercial es `crm_conversations`; runtime en `niupackbot_*` | `crm_conversations` + `niupackbot_messages/state/events` |
| Message persistence + idempotencia por provider SID | AutoLead messages (`external_id` unique) | REUSE | Reintentos Twilio no deben duplicar message/lead/opportunity/task | `niupackbot_messages.external_message_id UNIQUE`, `crm_leads(org,external_source,external_id)` |
| AI router (intent -> handler, fallback humano) | AutoLead AI router | ADAPT | Intents automotrices no sirven; usar intents packaging mínimos (9) | `src/lib/niupackbot/ai/router.ts` |
| Conversation engine (state machine BOT/HUMAN/PAUSED) | AutoLead engine + bot/human control | ADAPT | Mismo control, distinto dominio y sin ML scoring | `src/lib/niupackbot/conversation/engine.ts`, `control_mode` en `crm_conversations` |
| Context handling (ventana de mensajes + resumen) | AutoLead context | ADAPT | Ventana corta + campos comerciales extraídos, ES/PT-BR | `src/lib/niupackbot/conversation/context.ts` |
| Qualification rules (LOW/MEDIUM/HIGH simple) | AutoLead scoring (ignorar ML) | ADAPT | V1 = reglas deterministas: producto+volumen+mercado+destino+intención | `src/lib/niupackbot/qualification/rules.ts` + `extractor.ts` (regex + OpenAI opcional) |
| Bot/human handoff + `requestHumanHandoff()` | AutoLead handoff | ADAPT | Debe crear `crm_activities` + `crm_tasks` vía CRM Service y pausar bot | `src/lib/niupackbot/handoff/service.ts` -> `crmService.requestHumanHandoff` |
| Retry handling (OpenAI/Twilio fail-open para CRM) | AutoLead retry | REUSE | CRM nunca se cae si falla OpenAI/Twilio; estados controlados | Engine con `try/catch`, `NOT_CONFIGURED`/`UNAVAILABLE`, CRM sigue operativo |
| Security (server secrets, no PII en logs, no service_role en frontend) | AutoLead security | REUSE | Mismo estándar NIUPACK (`requireNiuIdentity`, `supabaseAdmin` solo server) | Webhook valida firma, usa `supabaseAdmin`, log mínimo (`conversation_id`, `external_message_id`, `event_type`, `duration`, `error_code`) |
| Tests (webhook válido/duplicado/firma inválida, tenancy, handoff) | AutoLead tests | REUSE | Cobertura mínima V1 sin copiar fixtures automotor | `tests/crm-*.test.ts`, `tests/niupackbot-*.test.ts` |
| Vehículos / concesionarias / financiación | AutoLead dominio automotor | IGNORE | Fuera de dominio packaging | — |
| CRM automotor / inventario automotor / campañas automotor | AutoLead CRM | IGNORE | NIUPACK OS es fuente de verdad; CRM propio packaging | `src/lib/crm/*` |
| UI automotor | AutoLead UI | IGNORE | Autoridad visual = NIUPACK OS actual | Reutilizar `Button/Badge/DataTable/KPICard/Modal`, mismos tokens |

## Confirmación
- [x] AutoLead repo NO clonado localmente (privado/404).
- [x] AutoLead repo NO modificado, NO commiteado, NO infra tocada.
- [x] NIUPACKBOT no depende en runtime de AutoLeadBot.
- [x] Separación lógica `NIUPACKBOT -> CRM Service -> CRM Repository -> Supabase` respetada en diseño.
