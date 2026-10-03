# NIUPACKBOT Architecture V1 (lógica separada, mismo deploy/Supabase)

## Principio
- `NIUPACK OS` = verdad comercial. `NIUPACKBOT` = verdad conversacional/runtime.
- Separación LÓGICA, no infra: mismo deploy Next.js, mismo Supabase. Extraíble a worker sin reescribir dominio (solo inyectar sender + resolver org).

## Flujo
```
WhatsApp (Twilio, form-urlencoded)
  → POST /api/niupackbot/whatsapp (valida firma HMAC-SHA1, normaliza, resuelve org)
  → niupackbotService.handleInbound(org, inbound)
      1. findOrCreate crm_conversations (WHATSAPP, external=whatsapp:+...)
      2. append niupackbot_messages INBOUND (idempotente por external_message_id=MessageSid)
      3. si control HUMAN/PAUSED → persistir, REPLY_SKIPPED_HUMAN, fin
      4. loadContext (últimos 20 msgs + niupackbot_state + lead)
      5. runBotTurn (extractor determinista + OpenAI opcional, reglas LOW/MEDIUM/HIGH, templates ES/PT-BR)
      6. crmTools (SOLO vía crmService):
           upsertInboundLead → lead (field authority: bot solo clues, nunca owner/stage/valor)
           addActivity BOT_MESSAGE
           [si HIGH/RFQ] createOpportunityFromLead (CALIFICADO) + task + handoff
           [si HUMAN_REQUEST] requestHumanHandoff → control HUMAN + activity + task
      7. append niupackbot_messages OUTBOUND (BOT), upsert niupackbot_state, log niupackbot_events
      8. send via Twilio (o STUB si no configurado) + TwiML
  → CRM UI (/commercial): Dashboard, Pipeline, Empresas, Inbox 3-col + Lead360 contextual, Tareas
```

## Tablas
- CRM (verdad comercial): `crm_companies, crm_contacts, crm_leads (uq org+external), crm_opportunities, crm_tasks (uq external_key), crm_activities (uq external_key), crm_conversations (uq org+channel+external)`. RLS `tenant_isolation_*` vía `private.current_organization_id()`.
- BOT (runtime): `niupackbot_messages (uq org+external_message_id)`, `niupackbot_state (PK conversation_id)`, `niupackbot_events`. Reusa `crm_conversations` como ancla (no duplica).

## Reglas duras
- BOT→CRM solo `crmService.*`. Prohibido `supabase.from('crm_*')` fuera de `src/lib/crm/repository.ts`.
- BOT nunca retrocede (`NEGOCIACIÓN→NUEVO` bloqueado), nunca cierra (`GANADO/PERDIDO` solo HUMAN), nunca downgradea qualification, nunca pisa owner/next_action.
- Tools sin fuente => `NOT_CONFIGURED`/`UNAVAILABLE`. Nunca inventar precios/stock/lead times. True cost vetado.
- Idempotencia: MessageSid, `(org,external_source,external_id)`, `external_key`, `(org,channel,external_conversation_id)`.
- Observabilidad: `conversation_id, external_message_id, crm_lead_id, opportunity_id, event_type, duration, error_code`. Sin secretos, PII mínima.
- Failure-open: OpenAI/Twilio caídos => fallback determinista + CRM sigue operativo, sin stack traces al cliente.

## I18N / Dominio
- `es, pt-BR` (respuesta en idioma del cliente). Intents mínimos (9). Qualification `LOW/MEDIUM/HIGH` por reglas.
- Packaging: product_interest, capacity (oz/ml), material, printing, estimated_volume + volume_period, destination_city/state/country, delivery_target.

## Extracción futura
- Para mover a worker: extraer `src/lib/niupackbot/*` + `src/app/api/niupackbot/whatsapp/route.ts` tal cual; inyectar `sender` y `orgResolver`. Dominio y tests no cambian.
