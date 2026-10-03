# NIUPACK Commercial CRM V1 — Blueprint congelado

## Objetivo
Convertir consultas entrantes, especialmente WhatsApp procesado por AutoLeadBot, en oportunidades comerciales gestionables dentro de NIUPACK OS.

## Decisiones no negociables
- NIUPACK OS es la fuente de verdad comercial.
- AutoLeadBot sigue siendo un servicio/repositorio separado y el motor conversacional.
- Integración exclusivamente service-to-service por contrato HTTP versionable.
- NIUPACK OS no lee tablas internas de AutoLeadBot.
- Un único login/sesión global de NIUPACK OS.
- No exponer costos industriales internos al bot sin tools/contratos autorizados.
- No modificar rutas Twilio ni la operación viva del bot para construir el CRM.

## Contrato AutoLead reutilizado
- GET /api/bot/metrics
- GET /api/bot/leads
- GET /api/bot/conversations/:conversationId
- Authorization: Bearer <AUTOLEADBOT_API_TOKEN>

Variables NIUPACK OS:
- AUTOLEADBOT_API_BASE_URL
- AUTOLEADBOT_API_TOKEN

## V1 — superficies
1. Dashboard
2. Pipeline
3. Empresas & Leads / Lead 360
4. Inbox
5. Tareas

## Fase actual
### Batch 1 — Shell + bridge read-only
- [x] Branch aislada
- [x] Bridge NIUPACK OS -> AutoLeadBot
- [x] Auth NIUPACK delante del bridge
- [x] Dashboard
- [x] Pipeline visual
- [x] Empresas & Leads
- [x] Inbox + conversación
- [x] Lead 360
- [x] Tareas sugeridas
- [ ] Persistencia CRM propia
- [ ] Mutaciones de pipeline
- [ ] Empresas/contactos normalizados
- [ ] Sync idempotente bot -> CRM
- [ ] Adaptación del dominio AutoLead de automotriz a packaging NIUPACK

## Persistencia prevista (NO aplicada todavía)
Tablas previstas:
- crm_companies
- crm_contacts
- crm_leads
- crm_opportunities
- crm_activities
- crm_tasks
- crm_conversations
- crm_pipeline_stages

Todas con organization_id, RLS y auditoría acorde al tenant global NIUPACK.

## DONE V1
- Lead del bot ingresa sin duplicarse.
- Conversación visible completa dentro del CRM.
- Lead puede asociarse a empresa/contacto.
- Oportunidad puede moverse entre etapas persistentes.
- Tarea tiene owner, vencimiento y estado.
- Timeline registra bot + humano + cambios de CRM.
- Refresh no pierde estado.
- Aislamiento por organization_id probado.
- AutoLeadBot puede caer sin tumbar el CRM.
- No existe acceso directo CRM -> Supabase de AutoLeadBot.

## Fuera de alcance
- Salesforce/HubSpot clone.
- Workflows arbitrarios.
- Custom objects.
- Territory management.
- Forecasting empresarial complejo.
- Marketing automation/campañas masivas.
- CPQ generalista.
- Permisos estilo Salesforce.
