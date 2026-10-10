-- Rollback de 20261011000001_licitaciones_radar.sql y 20261011000002_rfq_intelligence.sql.
-- ATENCIÓN: borra las licitaciones, candidatas, invitaciones, versiones de cotización, documentos, decisiones y eventos
-- cargados con estos módulos. Hacer un respaldo antes. No toca CRM (las empresas/oportunidades ya creadas quedan).
-- Los CHECK/NOT NULL/DEFAULT relajados por la migración 2 se dejan como están (son compatibles con el código anterior).

-- Licitaciones
DROP FUNCTION IF EXISTS public.convert_licitacion_candidate_to_prospect(UUID, UUID, UUID, BOOLEAN, TEXT, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.import_licitacion_atomic(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.licitaciones_normalize_name(TEXT);
DROP TABLE IF EXISTS public.licitaciones_candidates, public.licitaciones_parties, public.licitaciones_items, public.licitaciones_tenders CASCADE;

-- RFQ: funciones
DROP FUNCTION IF EXISTS public.store_rfq_document_atomic(UUID, UUID, UUID, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.record_rfq_decision_atomic(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.validate_quote_atomic(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.register_quote_atomic(UUID, UUID, UUID, UUID, TEXT, TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS public.submit_supplier_quote_atomic(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.rfq_insert_quote(UUID, UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.get_rfq_public_view(TEXT);
DROP FUNCTION IF EXISTS public.rfq_resolve_link(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.revoke_rfq_dispatch(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.finish_rfq_dispatch(UUID, UUID, BOOLEAN, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.claim_rfq_dispatch(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.prepare_rfq_invitations_atomic(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.create_rfq_atomic(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.rfq_recompute_status(UUID);
DROP FUNCTION IF EXISTS public.rfq_log_event(UUID, UUID, TEXT, UUID, UUID, UUID, JSONB, TEXT);

-- RFQ: tablas nuevas (los triggers de historial caen con las tablas)
DROP TABLE IF EXISTS public.rfq_events, public.rfq_decisions, public.rfq_document_blobs, public.rfq_documents CASCADE;
DROP FUNCTION IF EXISTS public.rfq_prevent_history_change();

-- RFQ: columnas agregadas a tablas existentes
ALTER TABLE public.quote_items
    DROP COLUMN IF EXISTS organization_id, DROP COLUMN IF EXISTS rfq_item_id, DROP COLUMN IF EXISTS unit, DROP COLUMN IF EXISTS price_scales,
    DROP COLUMN IF EXISTS specs_offered, DROP COLUMN IF EXISTS technical_compliance, DROP COLUMN IF EXISTS field_states;
ALTER TABLE public.supplier_quotes
    DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS dispatch_id, DROP COLUMN IF EXISTS source_channel, DROP COLUMN IF EXISTS origin_country,
    DROP COLUMN IF EXISTS manufacturer, DROP COLUMN IF EXISTS submitted_by_label, DROP COLUMN IF EXISTS fx_rate_to_usd, DROP COLUMN IF EXISTS fx_rate_source,
    DROP COLUMN IF EXISTS fx_rate_date, DROP COLUMN IF EXISTS logistics_cost_per_unit_usd, DROP COLUMN IF EXISTS logistics_cost_source,
    DROP COLUMN IF EXISTS entered_by_profile_id, DROP COLUMN IF EXISTS validated_by_profile_id, DROP COLUMN IF EXISTS validated_at, DROP COLUMN IF EXISTS field_states;
ALTER TABLE public.rfq_supplier_dispatches
    DROP COLUMN IF EXISTS organization_id, DROP COLUMN IF EXISTS recipient_email, DROP COLUMN IF EXISTS recipient_name, DROP COLUMN IF EXISTS subject,
    DROP COLUMN IF EXISTS body_text, DROP COLUMN IF EXISTS token_hash, DROP COLUMN IF EXISTS token_expires_at, DROP COLUMN IF EXISTS token_revoked_at,
    DROP COLUMN IF EXISTS max_submissions, DROP COLUMN IF EXISTS access_count, DROP COLUMN IF EXISTS last_access_at, DROP COLUMN IF EXISTS prepared_at,
    DROP COLUMN IF EXISTS prepared_by_profile_id, DROP COLUMN IF EXISTS confirmed_by_profile_id, DROP COLUMN IF EXISTS send_attempts,
    DROP COLUMN IF EXISTS last_error, DROP COLUMN IF EXISTS message_id, DROP COLUMN IF EXISTS submitted_at;
ALTER TABLE public.rfq_items
    DROP COLUMN IF EXISTS organization_id, DROP COLUMN IF EXISTS line_no, DROP COLUMN IF EXISTS description, DROP COLUMN IF EXISTS unit,
    DROP COLUMN IF EXISTS technical_conditions, DROP COLUMN IF EXISTS specs;
ALTER TABLE public.rfqs
    DROP COLUMN IF EXISTS deadline_at, DROP COLUMN IF EXISTS technical_conditions, DROP COLUMN IF EXISTS created_by_profile_id;
DROP INDEX IF EXISTS public.uq_rfqs_org_code;

