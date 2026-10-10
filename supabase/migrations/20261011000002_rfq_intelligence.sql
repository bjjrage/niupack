-- RFQ Intelligence: completa el módulo existente (rfqs, rfq_items, suppliers, rfq_supplier_dispatches,
-- supplier_quotes, quote_items) sin duplicarlo. Todo lo nuevo es aditivo y por organización.
-- Reglas de negocio embebidas: invitaciones honestas (no hay SENT sin envío), enlace por proveedor con
-- vencimiento y límite, versiones de cotización, decisiones humanas append-only.

-- ---------------------------------------------------------------------------------------------
-- 1. rfqs: código único por organización (antes era global), fecha límite y condiciones técnicas
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.rfqs DROP CONSTRAINT IF EXISTS rfqs_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfqs_org_code ON public.rfqs (organization_id, code);
ALTER TABLE public.rfqs
    ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS technical_conditions TEXT,
    ADD COLUMN IF NOT EXISTS created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.rfqs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
        EXECUTE format('ALTER TABLE public.rfqs DROP CONSTRAINT %I', c.conname);
    END LOOP;
END;
$$;
ALTER TABLE public.rfqs ADD CONSTRAINT rfqs_status_check
    CHECK (status IN ('DRAFT', 'REVIEW_REQUIRED', 'APPROVED', 'SENT', 'REPLIED', 'PARSED', 'BENCHMARKED', 'DECIDED', 'CANCELLED'));

-- ---------------------------------------------------------------------------------------------
-- 2. rfq_items: varios ítems con especificaciones propias; material/impresión dejan de ser obligatorios
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.rfq_items
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS line_no INTEGER,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'UN',
    ADD COLUMN IF NOT EXISTS technical_conditions TEXT,
    ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.rfq_items AS i SET organization_id = r.organization_id FROM public.rfqs AS r WHERE r.id = i.rfq_id AND i.organization_id IS NULL;
UPDATE public.rfq_items SET line_no = numbered.rn
    FROM (SELECT id, row_number() OVER (PARTITION BY rfq_id ORDER BY created_at, id) AS rn FROM public.rfq_items) AS numbered
    WHERE rfq_items.id = numbered.id AND rfq_items.line_no IS NULL;
ALTER TABLE public.rfq_items
    ALTER COLUMN organization_id SET NOT NULL,
    ALTER COLUMN line_no SET NOT NULL,
    ALTER COLUMN material DROP NOT NULL,
    ALTER COLUMN printing_spec DROP NOT NULL,
    ALTER COLUMN color_count DROP NOT NULL,
    ALTER COLUMN color_count DROP DEFAULT;
-- Sin valores pre-cargados: antes la base inventaba escalas (100k/300k/500k) e impresión '4 colors flexo' si el dato faltaba.
ALTER TABLE public.rfq_items ALTER COLUMN alternative_quantities DROP DEFAULT, ALTER COLUMN printing_spec DROP DEFAULT;
ALTER TABLE public.rfqs ALTER COLUMN payment_terms DROP DEFAULT, ALTER COLUMN target_lead_time_days DROP DEFAULT;
ALTER TABLE public.rfq_items DROP CONSTRAINT IF EXISTS rfq_items_quantity_positive;
ALTER TABLE public.rfq_items ADD CONSTRAINT rfq_items_quantity_positive CHECK (quantity > 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_items_rfq_line ON public.rfq_items (rfq_id, line_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_items_id_rfq ON public.rfq_items (id, rfq_id);

-- ---------------------------------------------------------------------------------------------
-- 3. rfq_supplier_dispatches = invitaciones por proveedor (estado propio, enlace seguro, trazabilidad)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.rfq_supplier_dispatches
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS recipient_email TEXT,
    ADD COLUMN IF NOT EXISTS recipient_name TEXT,
    ADD COLUMN IF NOT EXISTS subject TEXT,
    ADD COLUMN IF NOT EXISTS body_text TEXT,
    ADD COLUMN IF NOT EXISTS token_hash TEXT,
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS token_revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS max_submissions INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_access_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS prepared_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS confirmed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS send_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS message_id TEXT,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
UPDATE public.rfq_supplier_dispatches AS d SET organization_id = r.organization_id FROM public.rfqs AS r WHERE r.id = d.rfq_id AND d.organization_id IS NULL;
ALTER TABLE public.rfq_supplier_dispatches ALTER COLUMN organization_id SET NOT NULL;
DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.rfq_supplier_dispatches'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
        EXECUTE format('ALTER TABLE public.rfq_supplier_dispatches DROP CONSTRAINT %I', c.conname);
    END LOOP;
END;
$$;
-- PENDING → PREPARED → SENDING → SENT | FAILED → REPLIED. Nunca SENT sin envío efectivo.
ALTER TABLE public.rfq_supplier_dispatches ADD CONSTRAINT rfq_supplier_dispatches_status_check
    CHECK (status IN ('PENDING', 'PREPARED', 'SENDING', 'SENT', 'FAILED', 'REPLIED', 'DECLINED', 'REVOKED', 'PENDING_APPROVAL', 'APPROVED'));
ALTER TABLE public.rfq_supplier_dispatches ALTER COLUMN status SET DEFAULT 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_dispatch_token_hash ON public.rfq_supplier_dispatches (token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_dispatch_id_rfq ON public.rfq_supplier_dispatches (id, rfq_id);

-- ---------------------------------------------------------------------------------------------
-- 4. supplier_quotes / quote_items: versiones, origen, procedencia de cada dato, sin confianza inventada
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.supplier_quotes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
        EXECUTE format('ALTER TABLE public.supplier_quotes DROP CONSTRAINT %I', c.conname);
    END LOOP;
END;
$$;
ALTER TABLE public.supplier_quotes
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS dispatch_id UUID REFERENCES public.rfq_supplier_dispatches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS origin_country TEXT,
    ADD COLUMN IF NOT EXISTS manufacturer TEXT,
    ADD COLUMN IF NOT EXISTS submitted_by_label TEXT,
    ADD COLUMN IF NOT EXISTS fx_rate_to_usd NUMERIC(18, 8),
    ADD COLUMN IF NOT EXISTS fx_rate_source TEXT,
    ADD COLUMN IF NOT EXISTS fx_rate_date DATE,
    ADD COLUMN IF NOT EXISTS logistics_cost_per_unit_usd NUMERIC(14, 6),
    ADD COLUMN IF NOT EXISTS logistics_cost_source TEXT,
    ADD COLUMN IF NOT EXISTS entered_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS validated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS field_states JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.supplier_quotes ALTER COLUMN confidence_score DROP NOT NULL, ALTER COLUMN confidence_score DROP DEFAULT;
ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_status_check
    CHECK (status IN ('EXTRACTED', 'SUBMITTED', 'REVIEWED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'));
ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_channel_check
    CHECK (source_channel IN ('LINK', 'MANUAL', 'PDF', 'GMAIL'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_quotes_version ON public.supplier_quotes (rfq_id, supplier_id, version) WHERE rfq_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_quotes_id_rfq ON public.supplier_quotes (id, rfq_id);

ALTER TABLE public.quote_items
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS rfq_item_id UUID REFERENCES public.rfq_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit TEXT,
    ADD COLUMN IF NOT EXISTS price_scales JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS specs_offered TEXT,
    ADD COLUMN IF NOT EXISTS technical_compliance TEXT NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS field_states JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.quote_items AS qi SET organization_id = q.organization_id FROM public.supplier_quotes AS q WHERE q.id = qi.quote_id AND qi.organization_id IS NULL;
ALTER TABLE public.quote_items
    ALTER COLUMN organization_id SET NOT NULL,
    ALTER COLUMN normalized_unit_price_usd DROP NOT NULL;
ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_compliance_check
    CHECK (technical_compliance IN ('COMPLIES', 'PARTIAL', 'NOT_COMPLIES', 'UNKNOWN'));
ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_price_positive CHECK (unit_price > 0);
CREATE INDEX IF NOT EXISTS idx_quote_items_rfq_item ON public.quote_items (rfq_item_id);

-- ---------------------------------------------------------------------------------------------
-- 5. Documentos de origen, decisiones humanas y auditoría
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES public.supplier_quotes(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    sha256 TEXT NOT NULL,
    source_channel TEXT NOT NULL DEFAULT 'PDF' CHECK (source_channel IN ('PDF', 'LINK', 'GMAIL', 'MANUAL')),
    extraction_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (extraction_status IN ('PENDING', 'EXTRACTED', 'FAILED', 'NOT_SUPPORTED')),
    extracted_text TEXT,
    extraction JSONB,
    extraction_error TEXT,
    uploaded_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, rfq_id, sha256)
);
-- El contenido binario vive aparte y solo lo lee el servicio (nunca se expone por PostgREST a usuarios).
CREATE TABLE IF NOT EXISTS public.rfq_document_blobs (
    document_id UUID PRIMARY KEY REFERENCES public.rfq_documents(id) ON DELETE CASCADE,
    content BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rfq_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
    rfq_item_id UUID REFERENCES public.rfq_items(id) ON DELETE SET NULL,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    quote_id UUID NOT NULL REFERENCES public.supplier_quotes(id) ON DELETE RESTRICT,
    decision TEXT NOT NULL CHECK (decision IN ('SELECTED', 'SHORTLISTED', 'REJECTED', 'DEFERRED')),
    rationale TEXT NOT NULL CHECK (length(btrim(rationale)) >= 3),
    comparison_snapshot JSONB NOT NULL,
    decided_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfq_decisions_rfq ON public.rfq_decisions (organization_id, rfq_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS public.rfq_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    dispatch_id UUID REFERENCES public.rfq_supplier_dispatches(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_label TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfq_events_rfq ON public.rfq_events (organization_id, rfq_id, created_at DESC);

-- Historial inmutable: decisiones y eventos no se editan ni se borran.
CREATE OR REPLACE FUNCTION public.rfq_prevent_history_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    -- La eliminación en cascada al borrar la RFQ u organización es la única excepción permitida.
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.rfqs WHERE id = OLD.rfq_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'RFQ_HISTORY_IS_APPEND_ONLY';
END;
$$;
REVOKE ALL ON FUNCTION public.rfq_prevent_history_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_rfq_decisions_append_only ON public.rfq_decisions;
CREATE TRIGGER trg_rfq_decisions_append_only BEFORE UPDATE OR DELETE ON public.rfq_decisions FOR EACH ROW EXECUTE FUNCTION public.rfq_prevent_history_change();
DROP TRIGGER IF EXISTS trg_rfq_events_append_only ON public.rfq_events;
CREATE TRIGGER trg_rfq_events_append_only BEFORE UPDATE OR DELETE ON public.rfq_events FOR EACH ROW EXECUTE FUNCTION public.rfq_prevent_history_change();

-- ---------------------------------------------------------------------------------------------
-- 6. RLS y permisos: igual que el resto de RFQ en producción, solo el rol de servicio accede (las rutas validan sesión, rol y organización).
--    Las políticas de lectura por organización quedan como defensa en profundidad; 'authenticated' no recibe ningún permiso de tabla.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['rfq_documents', 'rfq_decisions', 'rfq_events'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_tenant_select', v_table);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (organization_id = (SELECT private.current_organization_id()))', v_table || '_tenant_select', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', v_table);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
    END LOOP;
END;
$$;
ALTER TABLE public.rfq_document_blobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rfq_document_blobs FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.rfq_document_blobs TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 7. Funciones atómicas
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rfq_log_event(
    p_org UUID, p_rfq UUID, p_type TEXT, p_actor UUID DEFAULT NULL, p_supplier UUID DEFAULT NULL,
    p_dispatch UUID DEFAULT NULL, p_payload JSONB DEFAULT '{}'::jsonb, p_actor_label TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE sql SET search_path = pg_catalog, public AS $$
    INSERT INTO public.rfq_events (organization_id, rfq_id, supplier_id, dispatch_id, event_type, actor_profile_id, actor_label, payload)
    VALUES (p_org, p_rfq, p_supplier, p_dispatch, p_type, p_actor, p_actor_label, COALESCE(p_payload, '{}'::jsonb));
$$;

-- Estado derivado de hechos reales: SENT solo si hubo un envío; REPLIED si hay cotización; DECIDED si hay decisión humana.
CREATE OR REPLACE FUNCTION public.rfq_recompute_status(p_rfq UUID)
RETURNS TEXT LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_status TEXT; v_new TEXT;
BEGIN
    SELECT status INTO v_status FROM public.rfqs WHERE id = p_rfq;
    IF v_status IS NULL OR v_status = 'CANCELLED' THEN RETURN v_status; END IF;
    IF EXISTS (SELECT 1 FROM public.rfq_decisions WHERE rfq_id = p_rfq AND decision = 'SELECTED') THEN v_new := 'DECIDED';
    ELSIF EXISTS (SELECT 1 FROM public.supplier_quotes WHERE rfq_id = p_rfq AND status IN ('SUBMITTED', 'REVIEWED', 'EXTRACTED')) THEN
        v_new := CASE WHEN EXISTS (SELECT 1 FROM public.supplier_quotes WHERE rfq_id = p_rfq AND status IN ('SUBMITTED', 'REVIEWED')) THEN 'REPLIED' ELSE 'PARSED' END;
    ELSIF EXISTS (SELECT 1 FROM public.rfq_supplier_dispatches WHERE rfq_id = p_rfq AND status IN ('SENT', 'REPLIED')) THEN v_new := 'SENT';
    ELSIF EXISTS (SELECT 1 FROM public.rfq_supplier_dispatches WHERE rfq_id = p_rfq AND status IN ('PREPARED', 'SENDING', 'FAILED')) THEN v_new := 'APPROVED';
    ELSE v_new := 'DRAFT';
    END IF;
    UPDATE public.rfqs SET status = v_new, updated_at = NOW() WHERE id = p_rfq AND status <> v_new;
    RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_rfq_atomic(p_org UUID, p_actor UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_rfq_id UUID;
    v_code TEXT := NULLIF(btrim(p_payload ->> 'code'), '');
    v_seq INTEGER;
    v_item JSONB;
    v_line INTEGER := 0;
    v_product UUID;
    v_qty NUMERIC;
BEGIN
    IF p_org IS NULL OR NULLIF(btrim(p_payload ->> 'title'), '') IS NULL
       OR NULLIF(btrim(p_payload ->> 'delivery_destination'), '') IS NULL
       OR jsonb_typeof(p_payload -> 'items') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload -> 'items') = 0 THEN
        RAISE EXCEPTION 'INVALID_RFQ';
    END IF;
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::TEXT || ':rfq-code', 0));
    IF v_code IS NULL THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '^RFQ-' || to_char(NOW(), 'YYYY') || '-', ''), code)::INTEGER), 0) + 1
            INTO v_seq FROM public.rfqs
            WHERE organization_id = p_org AND code ~ ('^RFQ-' || to_char(NOW(), 'YYYY') || '-[0-9]+$');
        v_code := 'RFQ-' || to_char(NOW(), 'YYYY') || '-' || lpad(v_seq::TEXT, 3, '0');
    ELSIF EXISTS (SELECT 1 FROM public.rfqs WHERE organization_id = p_org AND code = v_code) THEN
        RAISE EXCEPTION 'RFQ_CODE_ALREADY_EXISTS';
    END IF;

    INSERT INTO public.rfqs (organization_id, code, title, status, delivery_destination, incoterm, target_lead_time_days, payment_terms,
        validity_date, deadline_at, notes, technical_conditions, created_by_profile_id)
    VALUES (p_org, v_code, btrim(p_payload ->> 'title'), 'DRAFT', btrim(p_payload ->> 'delivery_destination'),
        COALESCE(NULLIF(p_payload ->> 'incoterm', ''), 'FOB'), NULLIF(p_payload ->> 'target_lead_time_days', '')::INTEGER,
        NULLIF(p_payload ->> 'payment_terms', ''), NULLIF(p_payload ->> 'validity_date', '')::DATE,
        NULLIF(p_payload ->> 'deadline_at', '')::TIMESTAMPTZ, NULLIF(p_payload ->> 'notes', ''),
        NULLIF(p_payload ->> 'technical_conditions', ''), p_actor)
    RETURNING id INTO v_rfq_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'items') LOOP
        v_line := v_line + 1;
        v_qty := NULLIF(v_item ->> 'quantity', '')::NUMERIC;
        IF NULLIF(btrim(v_item ->> 'sku'), '') IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty) THEN
            RAISE EXCEPTION 'INVALID_RFQ_ITEM';
        END IF;
        SELECT p.id INTO v_product FROM public.product_attributes pa JOIN public.products p ON p.id = pa.product_id
            WHERE p.organization_id = p_org AND pa.sku = btrim(v_item ->> 'sku') LIMIT 1;
        INSERT INTO public.rfq_items (organization_id, rfq_id, line_no, product_id, sku, description, quantity, unit, alternative_quantities,
            material, printing_spec, packaging_spec, tooling_requirements, technical_conditions, specs, notes)
        VALUES (p_org, v_rfq_id, v_line, v_product, btrim(v_item ->> 'sku'), NULLIF(v_item ->> 'description', ''), v_qty::INTEGER,
            COALESCE(NULLIF(v_item ->> 'unit', ''), 'UN'),
            COALESCE((SELECT array_agg(value::INTEGER) FROM jsonb_array_elements_text(COALESCE(v_item -> 'alternative_quantities', '[]'::jsonb))), ARRAY[]::INTEGER[]),
            NULLIF(v_item ->> 'material', ''), NULLIF(v_item ->> 'printing_spec', ''), NULLIF(v_item ->> 'packaging_spec', ''),
            NULLIF(v_item ->> 'tooling_requirements', ''), NULLIF(v_item ->> 'technical_conditions', ''),
            COALESCE(v_item -> 'specs', '{}'::jsonb), NULLIF(v_item ->> 'notes', ''));
    END LOOP;
    PERFORM public.rfq_log_event(p_org, v_rfq_id, 'RFQ_CREATED', p_actor, NULL, NULL, jsonb_build_object('code', v_code, 'items', v_line));
    RETURN jsonb_build_object('rfq_id', v_rfq_id, 'code', v_code, 'items', v_line);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_rfq_invitations_atomic(p_org UUID, p_rfq UUID, p_actor UUID, p_invitations JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_rfq public.rfqs%ROWTYPE;
    v_inv JSONB;
    v_supplier public.suppliers%ROWTYPE;
    v_existing public.rfq_supplier_dispatches%ROWTYPE;
    v_id UUID;
    v_results JSONB := '[]'::jsonb;
    v_email TEXT;
BEGIN
    SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ_NOT_FOUND'; END IF;
    IF v_rfq.status = 'CANCELLED' THEN RAISE EXCEPTION 'RFQ_CANCELLED'; END IF;
    IF jsonb_typeof(p_invitations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_invitations) = 0 THEN RAISE EXCEPTION 'INVALID_INVITATIONS'; END IF;

    FOR v_inv IN SELECT * FROM jsonb_array_elements(p_invitations) LOOP
        SELECT * INTO v_supplier FROM public.suppliers WHERE id = (v_inv ->> 'supplier_id')::UUID AND organization_id = p_org;
        IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_NOT_FOUND'; END IF;
        v_email := lower(btrim(COALESCE(NULLIF(v_inv ->> 'recipient_email', ''), v_supplier.email, '')));
        IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'SUPPLIER_EMAIL_REQUIRED'; END IF;

        SELECT * INTO v_existing FROM public.rfq_supplier_dispatches WHERE rfq_id = p_rfq AND supplier_id = v_supplier.id FOR UPDATE;
        IF FOUND AND v_existing.status IN ('SENDING', 'SENT', 'REPLIED') THEN
            v_results := v_results || jsonb_build_object('supplier_id', v_supplier.id, 'dispatch_id', v_existing.id, 'status', v_existing.status, 'skipped', true);
            CONTINUE;
        END IF;
        IF FOUND THEN
            UPDATE public.rfq_supplier_dispatches SET status = 'PREPARED', recipient_email = v_email,
                recipient_name = COALESCE(NULLIF(v_inv ->> 'recipient_name', ''), v_supplier.contact_name, v_supplier.name),
                subject = v_inv ->> 'subject', body_text = v_inv ->> 'body_text', token_hash = v_inv ->> 'token_hash',
                token_expires_at = (v_inv ->> 'token_expires_at')::TIMESTAMPTZ, token_revoked_at = NULL, last_error = NULL,
                prepared_at = NOW(), prepared_by_profile_id = p_actor, updated_at = NOW()
            WHERE id = v_existing.id RETURNING id INTO v_id;
        ELSE
            INSERT INTO public.rfq_supplier_dispatches (organization_id, rfq_id, supplier_id, status, recipient_email, recipient_name, subject, body_text,
                token_hash, token_expires_at, prepared_at, prepared_by_profile_id)
            VALUES (p_org, p_rfq, v_supplier.id, 'PREPARED', v_email,
                COALESCE(NULLIF(v_inv ->> 'recipient_name', ''), v_supplier.contact_name, v_supplier.name),
                v_inv ->> 'subject', v_inv ->> 'body_text', v_inv ->> 'token_hash', (v_inv ->> 'token_expires_at')::TIMESTAMPTZ, NOW(), p_actor)
            RETURNING id INTO v_id;
        END IF;
        PERFORM public.rfq_log_event(p_org, p_rfq, 'INVITATION_PREPARED', p_actor, v_supplier.id, v_id, jsonb_build_object('recipient', v_email));
        v_results := v_results || jsonb_build_object('supplier_id', v_supplier.id, 'dispatch_id', v_id, 'status', 'PREPARED', 'skipped', false);
    END LOOP;
    PERFORM public.rfq_recompute_status(p_rfq);
    RETURN v_results;
END;
$$;

-- Reclama una invitación para enviarla: dos clics o dos procesos nunca envían el mismo correo dos veces.
CREATE OR REPLACE FUNCTION public.claim_rfq_dispatch(p_org UUID, p_dispatch UUID, p_actor UUID)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_row public.rfq_supplier_dispatches%ROWTYPE;
BEGIN
    UPDATE public.rfq_supplier_dispatches SET status = 'SENDING', send_attempts = send_attempts + 1, confirmed_by_profile_id = p_actor, updated_at = NOW()
    WHERE id = p_dispatch AND organization_id = p_org AND status IN ('PREPARED', 'FAILED')
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('id', v_row.id, 'rfq_id', v_row.rfq_id, 'supplier_id', v_row.supplier_id, 'recipient_email', v_row.recipient_email,
        'subject', v_row.subject, 'body_text', v_row.body_text, 'send_attempts', v_row.send_attempts);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_rfq_dispatch(p_org UUID, p_dispatch UUID, p_ok BOOLEAN, p_message_id TEXT, p_error TEXT, p_actor UUID)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_row public.rfq_supplier_dispatches%ROWTYPE;
BEGIN
    UPDATE public.rfq_supplier_dispatches SET
        status = CASE WHEN p_ok THEN 'SENT' ELSE 'FAILED' END,
        sent_at = CASE WHEN p_ok THEN NOW() ELSE sent_at END,
        message_id = CASE WHEN p_ok THEN p_message_id ELSE message_id END,
        last_error = CASE WHEN p_ok THEN NULL ELSE COALESCE(NULLIF(p_error, ''), 'SEND_FAILED') END,
        updated_at = NOW()
    WHERE id = p_dispatch AND organization_id = p_org AND status = 'SENDING'
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ_DISPATCH_NOT_SENDING'; END IF;
    PERFORM public.rfq_log_event(p_org, v_row.rfq_id, CASE WHEN p_ok THEN 'INVITATION_SENT' ELSE 'INVITATION_FAILED' END, p_actor, v_row.supplier_id, v_row.id,
        jsonb_build_object('message_id', p_message_id, 'error', p_error, 'attempt', v_row.send_attempts));
    PERFORM public.rfq_recompute_status(v_row.rfq_id);
    RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_rfq_dispatch(p_org UUID, p_dispatch UUID, p_actor UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_row public.rfq_supplier_dispatches%ROWTYPE;
BEGIN
    UPDATE public.rfq_supplier_dispatches SET token_revoked_at = NOW(), updated_at = NOW()
    WHERE id = p_dispatch AND organization_id = p_org RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ_DISPATCH_NOT_FOUND'; END IF;
    PERFORM public.rfq_log_event(p_org, v_row.rfq_id, 'LINK_REVOKED', p_actor, v_row.supplier_id, v_row.id);
END;
$$;

-- Enlace externo: valida el token y devuelve SOLO lo que ese proveedor puede ver (sin costos, sin otros proveedores).
CREATE OR REPLACE FUNCTION public.rfq_resolve_link(p_token_hash TEXT, p_for_submit BOOLEAN)
RETURNS public.rfq_supplier_dispatches LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_d public.rfq_supplier_dispatches%ROWTYPE; v_rfq public.rfqs%ROWTYPE; v_count INTEGER;
BEGIN
    IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN RAISE EXCEPTION 'RFQ_LINK_INVALID'; END IF;
    SELECT * INTO v_d FROM public.rfq_supplier_dispatches WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ_LINK_INVALID'; END IF;
    IF v_d.token_revoked_at IS NOT NULL THEN RAISE EXCEPTION 'RFQ_LINK_REVOKED'; END IF;
    IF v_d.token_expires_at IS NOT NULL AND v_d.token_expires_at < NOW() THEN RAISE EXCEPTION 'RFQ_LINK_EXPIRED'; END IF;
    IF v_d.status NOT IN ('SENT', 'REPLIED') AND v_d.status <> 'PREPARED' THEN RAISE EXCEPTION 'RFQ_LINK_INVALID'; END IF;
    SELECT * INTO v_rfq FROM public.rfqs WHERE id = v_d.rfq_id;
    IF v_rfq.status = 'CANCELLED' THEN RAISE EXCEPTION 'RFQ_CLOSED'; END IF;
    IF p_for_submit THEN
        IF v_rfq.deadline_at IS NOT NULL AND v_rfq.deadline_at < NOW() THEN RAISE EXCEPTION 'RFQ_DEADLINE_PASSED'; END IF;
        SELECT COUNT(*) INTO v_count FROM public.supplier_quotes WHERE dispatch_id = v_d.id AND source_channel = 'LINK';
        IF v_count >= v_d.max_submissions THEN RAISE EXCEPTION 'RFQ_LINK_SUBMISSION_LIMIT'; END IF;
    END IF;
    RETURN v_d;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_rfq_public_view(p_token_hash TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_d public.rfq_supplier_dispatches%ROWTYPE; v_rfq public.rfqs%ROWTYPE; v_supplier_name TEXT; v_items JSONB; v_subs JSONB; v_count INTEGER;
BEGIN
    v_d := public.rfq_resolve_link(p_token_hash, false);
    UPDATE public.rfq_supplier_dispatches SET access_count = access_count + 1, last_access_at = NOW() WHERE id = v_d.id;
    SELECT * INTO v_rfq FROM public.rfqs WHERE id = v_d.rfq_id;
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = v_d.supplier_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'line_no', i.line_no, 'sku', i.sku, 'description', i.description, 'quantity', i.quantity,
        'unit', i.unit, 'alternative_quantities', i.alternative_quantities, 'material', i.material, 'printing_spec', i.printing_spec,
        'packaging_spec', i.packaging_spec, 'tooling_requirements', i.tooling_requirements, 'technical_conditions', i.technical_conditions,
        'specs', i.specs) ORDER BY i.line_no), '[]'::jsonb) INTO v_items FROM public.rfq_items i WHERE i.rfq_id = v_d.rfq_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('version', q.version, 'status', q.status, 'submitted_at', q.created_at) ORDER BY q.version), '[]'::jsonb), COUNT(*)
        INTO v_subs, v_count FROM public.supplier_quotes q WHERE q.dispatch_id = v_d.id AND q.source_channel = 'LINK';
    RETURN jsonb_build_object(
        'rfq', jsonb_build_object('code', v_rfq.code, 'title', v_rfq.title, 'delivery_destination', v_rfq.delivery_destination, 'incoterm', v_rfq.incoterm,
            'payment_terms', v_rfq.payment_terms, 'validity_date', v_rfq.validity_date, 'deadline_at', v_rfq.deadline_at,
            'target_lead_time_days', v_rfq.target_lead_time_days, 'technical_conditions', v_rfq.technical_conditions),
        'supplier', jsonb_build_object('name', v_supplier_name),
        'items', v_items,
        'submissions', v_subs,
        'link', jsonb_build_object('expires_at', v_d.token_expires_at, 'submissions_left', GREATEST(v_d.max_submissions - v_count, 0)));
END;
$$;

-- Inserta una cotización (versión nueva) con sus ítems. Reutilizada por el enlace externo y por la carga interna.
CREATE OR REPLACE FUNCTION public.rfq_insert_quote(
    p_org UUID, p_rfq UUID, p_supplier UUID, p_dispatch UUID, p_channel TEXT, p_status TEXT, p_actor UUID, p_label TEXT, p_payload JSONB
) RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_version INTEGER; v_quote UUID; v_item JSONB; v_rfq_item public.rfq_items%ROWTYPE; v_price NUMERIC; v_currency TEXT; v_count INTEGER := 0;
    v_seen UUID[] := ARRAY[]::UUID[]; v_rfq_item_id UUID; v_states JSONB; v_default_state TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::TEXT || ':quote:' || p_rfq::TEXT || ':' || p_supplier::TEXT, 0));
    v_currency := upper(btrim(COALESCE(p_payload ->> 'currency', '')));
    IF v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'INVALID_QUOTE_CURRENCY'; END IF;
    IF jsonb_typeof(p_payload -> 'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload -> 'items') = 0 THEN RAISE EXCEPTION 'INVALID_QUOTE_ITEMS'; END IF;
    v_default_state := CASE WHEN p_status = 'EXTRACTED' THEN 'EXTRACTED' WHEN p_channel = 'LINK' THEN 'SUPPLIER_ENTERED' ELSE 'ENTERED' END;

    SELECT COALESCE(MAX(version), 0) + 1 INTO v_version FROM public.supplier_quotes WHERE rfq_id = p_rfq AND supplier_id = p_supplier;
    UPDATE public.supplier_quotes SET status = 'SUPERSEDED', updated_at = NOW()
        WHERE rfq_id = p_rfq AND supplier_id = p_supplier AND status IN ('EXTRACTED', 'SUBMITTED', 'REVIEWED');

    INSERT INTO public.supplier_quotes (organization_id, rfq_id, supplier_id, dispatch_id, version, source_channel, status, quote_reference, raw_quote_text,
        currency, incoterm, freight_included, printing_included, tooling_cost, payment_terms, lead_time_days, validity_date, origin_country, manufacturer,
        submitted_by_label, fx_rate_to_usd, fx_rate_source, fx_rate_date, logistics_cost_per_unit_usd, logistics_cost_source, operator_notes,
        entered_by_profile_id, confidence_score, field_states)
    VALUES (p_org, p_rfq, p_supplier, p_dispatch, v_version, p_channel, p_status, NULLIF(p_payload ->> 'quote_reference', ''), p_payload ->> 'raw_quote_text',
        v_currency, COALESCE(NULLIF(p_payload ->> 'incoterm', ''), 'FOB'), COALESCE((p_payload ->> 'freight_included')::BOOLEAN, false),
        COALESCE((p_payload ->> 'printing_included')::BOOLEAN, true), COALESCE(NULLIF(p_payload ->> 'tooling_cost', '')::NUMERIC, 0),
        NULLIF(p_payload ->> 'payment_terms', ''), NULLIF(p_payload ->> 'lead_time_days', '')::INTEGER, NULLIF(p_payload ->> 'validity_date', '')::DATE,
        NULLIF(p_payload ->> 'origin_country', ''), NULLIF(p_payload ->> 'manufacturer', ''), COALESCE(p_label, NULLIF(p_payload ->> 'submitted_by_label', '')),
        NULLIF(p_payload ->> 'fx_rate_to_usd', '')::NUMERIC, NULLIF(p_payload ->> 'fx_rate_source', ''), NULLIF(p_payload ->> 'fx_rate_date', '')::DATE,
        NULLIF(p_payload ->> 'logistics_cost_per_unit_usd', '')::NUMERIC, NULLIF(p_payload ->> 'logistics_cost_source', ''), NULLIF(p_payload ->> 'notes', ''),
        p_actor, NULL, COALESCE(p_payload -> 'field_states', '{}'::jsonb))
    RETURNING id INTO v_quote;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'items') LOOP
        v_rfq_item_id := NULLIF(v_item ->> 'rfq_item_id', '')::UUID;
        -- Sin ítem de la RFQ no hay cotización: nunca se asigna un SKU por defecto.
        SELECT * INTO v_rfq_item FROM public.rfq_items WHERE id = v_rfq_item_id AND rfq_id = p_rfq AND organization_id = p_org;
        IF NOT FOUND THEN RAISE EXCEPTION 'RFQ_ITEM_NOT_IN_RFQ'; END IF;
        IF v_rfq_item_id = ANY (v_seen) THEN RAISE EXCEPTION 'DUPLICATE_QUOTE_ITEM'; END IF;
        v_seen := v_seen || v_rfq_item_id;
        v_price := NULLIF(v_item ->> 'unit_price', '')::NUMERIC;
        IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'INVALID_QUOTE_PRICE'; END IF;
        v_states := COALESCE(v_item -> 'field_states', jsonb_build_object('unit_price', v_default_state));
        INSERT INTO public.quote_items (organization_id, quote_id, rfq_item_id, sku, product_id, quantity, unit, unit_price, normalized_unit_price_usd, moq,
            lead_time_days, price_scales, specs_offered, technical_compliance, notes, field_states)
        VALUES (p_org, v_quote, v_rfq_item_id, v_rfq_item.sku, v_rfq_item.product_id,
            COALESCE(NULLIF(v_item ->> 'offered_quantity', '')::INTEGER, v_rfq_item.quantity), COALESCE(NULLIF(v_item ->> 'unit', ''), v_rfq_item.unit),
            v_price, NULL, NULLIF(v_item ->> 'moq', '')::INTEGER, NULLIF(v_item ->> 'lead_time_days', '')::INTEGER,
            COALESCE(v_item -> 'price_scales', '[]'::jsonb), NULLIF(v_item ->> 'specs_offered', ''),
            COALESCE(NULLIF(v_item ->> 'technical_compliance', ''), 'UNKNOWN'), NULLIF(v_item ->> 'notes', ''), v_states);
        v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('quote_id', v_quote, 'version', v_version, 'items', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_supplier_quote_atomic(p_token_hash TEXT, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_d public.rfq_supplier_dispatches%ROWTYPE; v_result JSONB;
BEGIN
    v_d := public.rfq_resolve_link(p_token_hash, true);
    v_result := public.rfq_insert_quote(v_d.organization_id, v_d.rfq_id, v_d.supplier_id, v_d.id, 'LINK', 'SUBMITTED', NULL,
        NULLIF(btrim(p_payload ->> 'submitted_by_label'), ''),
        -- Un proveedor externo nunca fija el tipo de cambio, la logística ni la procedencia de sus datos.
        p_payload - 'fx_rate_to_usd' - 'fx_rate_source' - 'fx_rate_date' - 'logistics_cost_per_unit_usd' - 'logistics_cost_source' - 'field_states');
    UPDATE public.rfq_supplier_dispatches SET status = 'REPLIED', submitted_at = NOW(), updated_at = NOW() WHERE id = v_d.id;
    PERFORM public.rfq_log_event(v_d.organization_id, v_d.rfq_id, 'QUOTE_SUBMITTED_VIA_LINK', NULL, v_d.supplier_id, v_d.id,
        jsonb_build_object('quote_id', v_result ->> 'quote_id', 'version', v_result -> 'version'), 'supplier-link');
    PERFORM public.rfq_recompute_status(v_d.rfq_id);
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_quote_atomic(p_org UUID, p_actor UUID, p_rfq UUID, p_supplier UUID, p_channel TEXT, p_status TEXT, p_document UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_result JSONB; v_dispatch UUID;
BEGIN
    IF p_channel NOT IN ('MANUAL', 'PDF', 'GMAIL') OR p_status NOT IN ('SUBMITTED', 'EXTRACTED') THEN RAISE EXCEPTION 'INVALID_QUOTE_SOURCE'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.rfqs WHERE id = p_rfq AND organization_id = p_org) THEN RAISE EXCEPTION 'RFQ_NOT_FOUND'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier AND organization_id = p_org) THEN RAISE EXCEPTION 'SUPPLIER_NOT_FOUND'; END IF;
    SELECT id INTO v_dispatch FROM public.rfq_supplier_dispatches WHERE rfq_id = p_rfq AND supplier_id = p_supplier;
    v_result := public.rfq_insert_quote(p_org, p_rfq, p_supplier, v_dispatch, p_channel, p_status, p_actor, NULL, p_payload);
    IF p_document IS NOT NULL THEN
        UPDATE public.rfq_documents SET quote_id = (v_result ->> 'quote_id')::UUID, supplier_id = p_supplier
            WHERE id = p_document AND organization_id = p_org AND rfq_id = p_rfq;
    END IF;
    IF v_dispatch IS NOT NULL AND p_status = 'SUBMITTED' THEN
        UPDATE public.rfq_supplier_dispatches SET status = 'REPLIED', submitted_at = NOW(), updated_at = NOW() WHERE id = v_dispatch AND status IN ('SENT', 'REPLIED');
    END IF;
    PERFORM public.rfq_log_event(p_org, p_rfq, 'QUOTE_REGISTERED', p_actor, p_supplier, v_dispatch,
        jsonb_build_object('quote_id', v_result ->> 'quote_id', 'version', v_result -> 'version', 'channel', p_channel, 'status', p_status, 'document_id', p_document));
    PERFORM public.rfq_recompute_status(p_rfq);
    RETURN v_result;
END;
$$;

-- Validación humana: corrige y confirma lo extraído. Registra el estado previo; el dato pasa a VALIDATED.
CREATE OR REPLACE FUNCTION public.validate_quote_atomic(p_org UUID, p_actor UUID, p_quote UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_q public.supplier_quotes%ROWTYPE; v_item JSONB; v_before JSONB;
BEGIN
    SELECT * INTO v_q FROM public.supplier_quotes WHERE id = p_quote AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND'; END IF;
    IF v_q.status = 'SUPERSEDED' THEN RAISE EXCEPTION 'QUOTE_SUPERSEDED'; END IF;
    SELECT jsonb_build_object('quote', to_jsonb(v_q), 'items', COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb)) INTO v_before FROM public.quote_items i WHERE i.quote_id = p_quote;

    UPDATE public.supplier_quotes SET
        currency = COALESCE(NULLIF(upper(btrim(p_payload ->> 'currency')), ''), currency),
        incoterm = COALESCE(NULLIF(p_payload ->> 'incoterm', ''), incoterm),
        payment_terms = COALESCE(NULLIF(p_payload ->> 'payment_terms', ''), payment_terms),
        lead_time_days = COALESCE(NULLIF(p_payload ->> 'lead_time_days', '')::INTEGER, lead_time_days),
        validity_date = COALESCE(NULLIF(p_payload ->> 'validity_date', '')::DATE, validity_date),
        origin_country = COALESCE(NULLIF(p_payload ->> 'origin_country', ''), origin_country),
        manufacturer = COALESCE(NULLIF(p_payload ->> 'manufacturer', ''), manufacturer),
        tooling_cost = COALESCE(NULLIF(p_payload ->> 'tooling_cost', '')::NUMERIC, tooling_cost),
        freight_included = COALESCE((p_payload ->> 'freight_included')::BOOLEAN, freight_included),
        fx_rate_to_usd = COALESCE(NULLIF(p_payload ->> 'fx_rate_to_usd', '')::NUMERIC, fx_rate_to_usd),
        fx_rate_source = COALESCE(NULLIF(p_payload ->> 'fx_rate_source', ''), fx_rate_source),
        fx_rate_date = COALESCE(NULLIF(p_payload ->> 'fx_rate_date', '')::DATE, fx_rate_date),
        logistics_cost_per_unit_usd = COALESCE(NULLIF(p_payload ->> 'logistics_cost_per_unit_usd', '')::NUMERIC, logistics_cost_per_unit_usd),
        logistics_cost_source = COALESCE(NULLIF(p_payload ->> 'logistics_cost_source', ''), logistics_cost_source),
        operator_notes = COALESCE(NULLIF(p_payload ->> 'notes', ''), operator_notes),
        status = 'REVIEWED', validated_by_profile_id = p_actor, validated_at = NOW(), updated_at = NOW(),
        field_states = field_states || jsonb_build_object('header', 'VALIDATED')
    WHERE id = p_quote;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'items', '[]'::jsonb)) LOOP
        UPDATE public.quote_items SET
            unit_price = COALESCE(NULLIF(v_item ->> 'unit_price', '')::NUMERIC, unit_price),
            moq = COALESCE(NULLIF(v_item ->> 'moq', '')::INTEGER, moq),
            lead_time_days = COALESCE(NULLIF(v_item ->> 'lead_time_days', '')::INTEGER, lead_time_days),
            price_scales = COALESCE(v_item -> 'price_scales', price_scales),
            specs_offered = COALESCE(NULLIF(v_item ->> 'specs_offered', ''), specs_offered),
            technical_compliance = COALESCE(NULLIF(v_item ->> 'technical_compliance', ''), technical_compliance),
            field_states = field_states || jsonb_build_object('unit_price', 'VALIDATED', 'validated', true),
            updated_at = NOW()
        WHERE quote_id = p_quote AND rfq_item_id = (v_item ->> 'rfq_item_id')::UUID;
    END LOOP;
    UPDATE public.quote_items SET field_states = field_states || jsonb_build_object('unit_price', 'VALIDATED', 'validated', true), updated_at = NOW() WHERE quote_id = p_quote;

    PERFORM public.rfq_log_event(p_org, v_q.rfq_id, 'QUOTE_VALIDATED', p_actor, v_q.supplier_id, v_q.dispatch_id,
        jsonb_build_object('quote_id', p_quote, 'before', v_before));
    PERFORM public.rfq_recompute_status(v_q.rfq_id);
    RETURN jsonb_build_object('quote_id', p_quote, 'status', 'REVIEWED');
END;
$$;

-- Decisión humana append-only. No adjudica automáticamente, no emite órdenes de compra, no toca precios oficiales.
CREATE OR REPLACE FUNCTION public.record_rfq_decision_atomic(p_org UUID, p_actor UUID, p_rfq UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_q public.supplier_quotes%ROWTYPE; v_id UUID; v_item UUID := NULLIF(p_payload ->> 'rfq_item_id', '')::UUID; v_decision TEXT := p_payload ->> 'decision';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.rfqs WHERE id = p_rfq AND organization_id = p_org AND status <> 'CANCELLED') THEN RAISE EXCEPTION 'RFQ_NOT_FOUND'; END IF;
    SELECT * INTO v_q FROM public.supplier_quotes WHERE id = (p_payload ->> 'quote_id')::UUID AND rfq_id = p_rfq AND organization_id = p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND'; END IF;
    IF v_q.status NOT IN ('SUBMITTED', 'REVIEWED') THEN RAISE EXCEPTION 'QUOTE_NOT_VALIDATED'; END IF;
    IF v_decision = 'SELECTED' AND v_q.status <> 'REVIEWED' AND v_q.source_channel IN ('PDF', 'GMAIL') THEN RAISE EXCEPTION 'QUOTE_NOT_VALIDATED'; END IF;
    IF v_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.quote_items WHERE quote_id = v_q.id AND rfq_item_id = v_item) THEN RAISE EXCEPTION 'RFQ_ITEM_NOT_IN_QUOTE'; END IF;
    INSERT INTO public.rfq_decisions (organization_id, rfq_id, rfq_item_id, supplier_id, quote_id, decision, rationale, comparison_snapshot, decided_by_profile_id)
    VALUES (p_org, p_rfq, v_item, v_q.supplier_id, v_q.id, v_decision, p_payload ->> 'rationale', COALESCE(p_payload -> 'snapshot', '{}'::jsonb), p_actor)
    RETURNING id INTO v_id;
    PERFORM public.rfq_log_event(p_org, p_rfq, 'DECISION_RECORDED', p_actor, v_q.supplier_id, v_q.dispatch_id,
        jsonb_build_object('decision_id', v_id, 'decision', v_decision, 'quote_id', v_q.id, 'rfq_item_id', v_item));
    PERFORM public.rfq_recompute_status(p_rfq);
    RETURN jsonb_build_object('decision_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.store_rfq_document_atomic(p_org UUID, p_actor UUID, p_rfq UUID, p_meta JSONB, p_content_hex TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_existing UUID; v_id UUID; v_bytes BYTEA := decode(p_content_hex, 'hex');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.rfqs WHERE id = p_rfq AND organization_id = p_org) THEN RAISE EXCEPTION 'RFQ_NOT_FOUND'; END IF;
    IF length(v_bytes) = 0 OR length(v_bytes) > 10485760 THEN RAISE EXCEPTION 'INVALID_DOCUMENT_SIZE'; END IF;
    SELECT id INTO v_existing FROM public.rfq_documents WHERE organization_id = p_org AND rfq_id = p_rfq AND sha256 = p_meta ->> 'sha256';
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('document_id', v_existing, 'duplicate', true); END IF;
    INSERT INTO public.rfq_documents (organization_id, rfq_id, supplier_id, file_name, content_type, size_bytes, sha256, source_channel,
        extraction_status, extracted_text, extraction, extraction_error, uploaded_by_profile_id)
    VALUES (p_org, p_rfq, NULLIF(p_meta ->> 'supplier_id', '')::UUID, p_meta ->> 'file_name', p_meta ->> 'content_type', length(v_bytes), p_meta ->> 'sha256',
        COALESCE(NULLIF(p_meta ->> 'source_channel', ''), 'PDF'), COALESCE(NULLIF(p_meta ->> 'extraction_status', ''), 'PENDING'),
        p_meta ->> 'extracted_text', p_meta -> 'extraction', p_meta ->> 'extraction_error', p_actor)
    RETURNING id INTO v_id;
    INSERT INTO public.rfq_document_blobs (document_id, content) VALUES (v_id, v_bytes);
    PERFORM public.rfq_log_event(p_org, p_rfq, 'DOCUMENT_STORED', p_actor, NULLIF(p_meta ->> 'supplier_id', '')::UUID, NULL,
        jsonb_build_object('document_id', v_id, 'file_name', p_meta ->> 'file_name', 'sha256', p_meta ->> 'sha256'));
    RETURN jsonb_build_object('document_id', v_id, 'duplicate', false);
END;
$$;

DO $$
DECLARE v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'rfq_log_event(uuid,uuid,text,uuid,uuid,uuid,jsonb,text)', 'rfq_recompute_status(uuid)', 'create_rfq_atomic(uuid,uuid,jsonb)',
        'prepare_rfq_invitations_atomic(uuid,uuid,uuid,jsonb)', 'claim_rfq_dispatch(uuid,uuid,uuid)', 'finish_rfq_dispatch(uuid,uuid,boolean,text,text,uuid)',
        'revoke_rfq_dispatch(uuid,uuid,uuid)', 'rfq_resolve_link(text,boolean)', 'get_rfq_public_view(text)',
        'rfq_insert_quote(uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)', 'submit_supplier_quote_atomic(text,jsonb)',
        'register_quote_atomic(uuid,uuid,uuid,uuid,text,text,uuid,jsonb)', 'validate_quote_atomic(uuid,uuid,uuid,jsonb)',
        'record_rfq_decision_atomic(uuid,uuid,uuid,jsonb)', 'store_rfq_document_atomic(uuid,uuid,uuid,jsonb,text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', v_fn);
    END LOOP;
END;
$$;
