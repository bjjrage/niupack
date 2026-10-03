# NIUPACK Commercial CRM V1 — Blueprint congelado

## Objetivo
Convertir consultas entrantes en oportunidades comerciales gestionables dentro de NIUPACK OS, con CRM propio y un NIUPACKBOT nativo dentro del mismo backend y proyecto Supabase.

## Decisiones no negociables
- NIUPACK OS es la fuente de verdad comercial.
- NIUPACKBOT vive inicialmente dentro del mismo deploy de NIUPACK OS.
- NIUPACKBOT usa el mismo proyecto Supabase, con separación lógica por módulos y tablas.
- AutoLeadBot permanece intacto como producto independiente y fuente de patrones/runtime reutilizables.
- NIUPACK OS no depende productivamente de AutoLeadBot.
- Un único login/sesión global de NIUPACK OS.
- No exponer costos industriales internos al bot sin tools/contratos autorizados.
- Diseñar NIUPACKBOT para extracción futura a un worker o servicio separado si la escala lo exige.

## V1 — superficies
1. Dashboard
2. Pipeline
3. Empresas & Leads / Lead 360
4. Inbox
5. Tareas

## Fase actual
### Batch 1 — Shell CRM desacoplado
- [x] Branch aislada
- [x] Shell CRM desacoplado de AutoLeadBot
- [x] Dashboard
- [x] Pipeline visual
- [x] Empresas & Leads
- [x] Inbox + conversación
- [x] Lead 360
- [x] Tareas shell
- [ ] Persistencia CRM propia
- [ ] Mutaciones de pipeline
- [ ] Empresas/contactos normalizados
- [ ] NIUPACKBOT interno
- [ ] WhatsApp/Twilio NIUPACKBOT
- [ ] Integración NIUPACKBOT -> CRM mediante servicios internos
- [ ] Adaptación selectiva de patrones útiles de AutoLead al dominio packaging NIUPACK

## Arquitectura objetivo
NIUPACKBOT y CRM comparten inicialmente el mismo deploy y proyecto Supabase, pero mantienen separación lógica. AutoLeadBot no se modifica ni se usa como dependencia runtime.

NIUPACKBOT debe comunicarse con CRM mediante servicios internos: NIUPACKBOT -> CRM Service -> CRM Repository -> Supabase.

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

Tablas NIUPACKBOT previstas:
- niupackbot_conversations
- niupackbot_messages
- niupackbot_state
- niupackbot_events

AutoLeadBot puede usarse únicamente como referencia/donante tecnológico para webhook Twilio, conversation engine, AI router, contexto, persistencia de mensajes, handoff, seguridad y tests. No copiar su CRM ni su dominio automotriz.

## DONE V1
- Lead del bot ingresa sin duplicarse.
- Conversación visible completa dentro del CRM.
- Lead puede asociarse a empresa/contacto.
- Oportunidad puede moverse entre etapas persistentes.
- Tarea tiene owner, vencimiento y estado.
- Timeline registra bot + humano + cambios de CRM.
- Refresh no pierde estado.
- Aislamiento por organization_id probado.
- NIUPACKBOT puede fallar sin tumbar el CRM.
- No existe dependencia runtime con AutoLeadBot.
- NIUPACKBOT y CRM corren inicialmente en el mismo deploy y Supabase.

## Fuera de alcance
- Salesforce/HubSpot clone.
- Workflows arbitrarios.
- Custom objects.
- Territory management.
- Forecasting empresarial complejo.
- Marketing automation/campañas masivas.
- CPQ generalista.
- Permisos estilo Salesforce.
- Deploy independiente de NIUPACKBOT en V1.
