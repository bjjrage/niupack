# NIUPACKBOT Outreach — Auditoría de donors, reuse map y arquitectura

Rama: `feature/niupackbot-outreach` (base `51b6411`). Donors usados **solo lectura**; nada de ellos se importa en runtime.

## 1. Donors auditados

Los directorios `AutoLead-donor` / `CRM-AUTOLEAD-donor` no existían. Se auditaron, en solo lectura, los repos reales
(`bjjrage/autolead` → `PORYECTOS/AUTOLEAD`, rama `main`; `bjjrage/crm-autolead` → `Desktop/crm-autolead`, rama
`checkpoint/crm-bridge-ready-before-ui-polish`). Ambos con árbol limpio; no se modificó, commiteó ni pusheó nada.

| Donor | Qué tiene realmente |
|---|---|
| **AutoLead** (`server/routes/sfRoutes.cjs` 1.962 l., `src/components/SFCampanas.jsx` + `sf/*`) | Módulo "SF Campañas": contactos (import CSV, opt-out), **templates vía Twilio Content API** (crear → pedir aprobación WhatsApp → sincronizar estado), borrador de campaña (wizard 3 pasos), **envío single de prueba** con ContentSid. `twilioRoutes.cjs`: inbound + `responder-manual`. |
| **CRM-AUTOLEAD** (`backend/bot/*`) | Copia del bot automotor (router IA, catálogos de vehículos, calendario, financiación) + `BotLeadsPanel`, `NewCampaignModal` (campañas **Meta Ads**, no WhatsApp). Sin cola ni callbacks. |

**Lo que el donor NO tiene** (se implementó nativo): cola de envío masivo, status callbacks (delivered/read/failed),
idempotencia de envío, seguimiento de respuesta por campaña, estados por destinatario, baja por palabra clave.

## 2. Reuse map

| SOURCE | QUÉ HACE | DECISIÓN | TARGET NIUPACK |
|---|---|---|---|
| `sfRoutes.cjs` `twilioContentRequest`, `POST /api/sf/templates`, `…/submit-approval`, `…/sync-status` | Crea Content, pide aprobación WhatsApp, lee estado | **REUSE** (lógica y endpoints de Twilio) | `outreach/twilio-content.ts`, `outreach/templates.ts`, `/api/crm/templates` |
| `sfTemplateState.js` | Estados aprobado/en revisión/rechazado | **ADAPT** (APPROVED/PENDING/REJECTED/PAUSED/DISABLED) | `outreach/types.ts`, `campaigns/labels.ts` |
| `TemplateModal.jsx`, `ManageTemplatesModal.jsx` | Alta y gestión de templates | **ADAPT** (misma composición, primitivas NIUPACK) | `campaigns/TemplatesPanel.tsx` |
| `sfContactImport.js` | Parseo CSV, detección de separador/encabezado, preview válido/inválido/duplicado | **ADAPT** (E.164 BR/AR/BO/PY en vez de solo Paraguay) | `outreach/csv.ts`, `outreach/phone.ts` |
| `ImportContactsModal.jsx`, `ManageContactsModal.jsx` | Importar contactos | **ADAPT** | paso "Audiencia" de `CampaignWizard.tsx` (CRM + CSV) |
| `SFCampaignWizard.jsx`, `WizardSteps.jsx` | Wizard template → audiencia → revisión | **ADAPT** | `campaigns/CampaignWizard.tsx` (Plantilla → Audiencia → Ritmo y revisión) |
| `SFDashboard.jsx`, `SFCampanas.jsx` | Listado y KPIs de campañas | **ADAPT** (sin KPIs vanity) | `views/CampaignsView.tsx`, `campaigns/CampaignDrawer.tsx` |
| `sfRoutes.cjs` single send (ContentSid + ContentVariables, rate-limit, audit) | Envío de prueba a 1 número | **ADAPT** → campaña real con cola | `whatsapp/sender.ts` `sendWhatsappTemplate`, `outreach/campaigns.ts` `processQueue` |
| Opt-out del donor (`estado = opt_out`, `opt_out_at`) | Bloquea envío | **ADAPT** + baja por palabra clave | `niupackbot_opt_outs`, `outreach/signals.ts` |
| `twilioRoutes.cjs` `responder-manual` | Respuesta humana por REST | **ADAPT** (+ ventana 24 h, solo HUMAN, opt-out) | `outreach/manual-reply.ts`, `/api/crm/inbox/[id]/reply` |
| `ChatPrincipal.jsx`, `twilioConversationPresenter/Classifier` | Chat y clasificación (automotor) | **IGNORE**: se conservó `InboxView` y se le transplantó lo que faltaba | `views/InboxView.tsx` |
| `campaignPerformance.js` (atribución de campaña a conversación) | Origen de lead por campaña | **ADAPT** (vínculo exacto destinatario↔conversación) | `outreach/inbound.ts` |
| `aiRouterOpenAI`, catálogos de vehículos, calendario, financiación, `BotLeadsPanel`, `NewCampaignModal` (Meta Ads) | Dominio automotor / Meta | **IGNORE** | — |

**Decisión sobre la UI:** el donor es JSX con su propio sistema de estilos (`sf-*`). Traerlo tal cual habría metido un
segundo design system. Se portó la **composición y el comportamiento** (pasos, campos, estados, reglas) a TSX con las
primitivas NIUPACK (`Card`, `Drawer`, `Pill`, `Segmented`, `Field`).

**Conversaciones:** se eligió la opción A (conservar `InboxView` y transplantar): sumó respuesta manual desde el CRM,
origen de campaña y mensaje-template como contexto.

## 3. Arquitectura

```
CAMPAÑA (outbound)
  UI Campañas ──► /api/crm/campaigns[/id/action] ──► campaigns.ts ──► outreachRepository ──► Supabase
                                                          │
                                  scheduler: /api/niupackbot/campaigns/process
                                  (Bearer CRON_SECRET | sesión; UI abierta avanza la cola)
                                                          ▼
                        processQueue: claim atómico PENDING→QUEUED → opt-out check → sendWhatsappTemplate
                                                          ▼
                                            Twilio REST (ContentSid + ContentVariables + StatusCallback)
                                                          │
          ┌───────────────────────────────────────────────┴──────────────────────────────┐
          ▼ status                                                                        ▼ respuesta
  /api/niupackbot/whatsapp/status (firma Twilio)                       /api/niupackbot/whatsapp (firma Twilio, TwiML)
  applyStatusCallback: SENT→DELIVERED→READ                             niupackbotService.handleInbound
  idempotente, sin retroceso                                             ├─ onCampaignInbound: baja / no-interés / vínculo
                                                                         │   destinatario→teléfono→conversación→contacto
                                                                         ├─ bot: PRESENT o HANDOFF (nunca precio)
                                                                         └─ CRM: lead · oportunidad (solo señal comercial) · task
```

Regla de oro: **inbound = TwiML; campaña/manual = REST**. Nunca se mezclan, así que nunca hay doble envío por el mismo canal.

## 4. Idempotencia y garantías

- `PENDING→QUEUED` por compare-and-swap (`UPDATE … WHERE status='PENDING'`): tick concurrente, retry de Vercel o refresco de UI no pueden enviar dos veces.
- `UNIQUE (campaign_id, phone_e164)` y `UNIQUE (org, message_sid)`.
- QUEUED viejo sin SID ⇒ `DELIVERY_UNKNOWN` (no se reenvía solo: pudo haber salido).
- Fuera de ventana de 24 h solo template **APPROVED**; sin Twilio configurado la campaña no se lanza ni envía.
- Opt-out verificado al importar **y** justo antes de enviar. Baja entrante cancela pendientes en todas las campañas.

## 5. Cambios de lógica del bot

Antes: bot "comercial" que pedía datos para cotizar y creaba oportunidades por calificación.
Ahora (`ai/router.ts` `decideTurn`, `ai/prompts.ts`):

- Presenta NIUPACK (solo hechos ya documentados: planta Asunción, FSSC 22000, vasos de polipapel/potes/tapas) y pregunta qué necesita.
- **Handoff** (`control_mode → HUMAN`, actividad + tarea, bot deja de responder) por precio, cotización, pedido, muestra, descuento, condiciones, reclamo, humano, ficha técnica, logística, estado de pedido, o tras 2 vueltas sin respuesta confiable.
- **Oportunidad** solo con señal comercial concreta (cotización/compra/muestra/llamada/RFQ con volumen), etapa `NUEVO`. Responder, o calificación MEDIUM/HIGH, **no** crea oportunidad.
- Nunca precio, plazo, stock, descuento ni logística (test sobre todos los textos ES/PT).
- Corregidos dos defectos previos: mensajes cortos en español se contestaban en portugués; "¿cuánto sale el flete?" se trataba como precio.

## 6. Middleware (hallazgo)

El middleware exigía sesión de usuario en todo `/api/*` salvo login y logística pública, así que el **webhook de Twilio recibía 401 en producción**. Se exceptuaron exactamente tres rutas (`/api/niupackbot/whatsapp`, `…/whatsapp/status`, `…/campaigns/process`); cada una se autentica sola (firma / `CRON_SECRET` / sesión). Con test.

## 7. Límites conocidos

- Variables de template: solo `{{1}}` = nombre de pila (evita enviar valores de ejemplo como reales).
- Sin cron automático en `vercel.json`: un cron por minuto falla el deploy en plan Hobby. La cola avanza al lanzar y cada 15–20 s mientras haya una campaña abierta en el CRM; para envío desatendido configurar `CRON_SECRET` y un scheduler (Vercel Cron en plan Pro o externo) que llame `GET /api/niupackbot/campaigns/process`.
- Respuesta manual con texto libre solo dentro de 24 h; fuera de la ventana no hay envío de template a una conversación existente (fuera de alcance).
- Multi-tenant: el webhook resuelve una única organización (`NIUPACKBOT_ORGANIZATION_ID`), igual que el inbound existente.
