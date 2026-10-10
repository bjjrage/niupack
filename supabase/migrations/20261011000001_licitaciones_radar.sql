-- Licitaciones: radar de oportunidades farmacéuticas (empresas privadas que podrían comprar cunas/bandejas de ampollas).
-- NIUPACK no licita al Estado: las licitaciones son una fuente de inteligencia comercial.
-- Aditivo. No toca tablas existentes; la conversión a CRM usa la función atómica del final.

CREATE TABLE IF NOT EXISTS public.licitaciones_tenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('DNCP_OCDS', 'MANUAL_DOCUMENT', 'MANUAL_URL', 'TEST_FIXTURE')),
    external_id TEXT NOT NULL,
    source_url TEXT,
    title TEXT NOT NULL,
    convening_entity TEXT,
    procurement_object TEXT,
    status TEXT,
    published_at TIMESTAMPTZ,
    closing_at TIMESTAMPTZ,
    awarded_at TIMESTAMPTZ,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    raw_document JSONB,
    imported_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.licitaciones_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tender_id UUID NOT NULL REFERENCES public.licitaciones_tenders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    description TEXT NOT NULL,
    classification TEXT,
    quantity NUMERIC,
    unit TEXT,
    presentation TEXT,
    is_injectable BOOLEAN NOT NULL DEFAULT false,
    injectable_evidence TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tender_id, line_no)
);

-- Cada rol es un hecho distinto con su evidencia: un adjudicatario NO es automáticamente el fabricante.
CREATE TABLE IF NOT EXISTS public.licitaciones_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tender_id UUID NOT NULL REFERENCES public.licitaciones_tenders(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.licitaciones_items(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('CONVOCANTE', 'INVITADO', 'OFERENTE', 'ADJUDICATARIO', 'FABRICANTE', 'LABORATORIO', 'IMPORTADOR', 'REPRESENTANTE')),
    name TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    ruc TEXT,
    ruc_digits TEXT,
    role_confirmed BOOLEAN NOT NULL DEFAULT false,
    evidence TEXT NOT NULL,
    evidence_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_licitaciones_parties_fact
    ON public.licitaciones_parties (tender_id, role, name_normalized, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Candidatas del radar: una por empresa (RUC o nombre normalizado) y organización, con trazabilidad a las licitaciones.
CREATE TABLE IF NOT EXISTS public.licitaciones_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    candidate_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    ruc TEXT,
    ruc_digits TEXT,
    potential TEXT NOT NULL DEFAULT 'NO_EVALUADO' CHECK (potential IN ('ALTO', 'MEDIO', 'BAJO', 'NO_EVALUADO')),
    score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
    reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    tender_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    products JSONB NOT NULL DEFAULT '[]'::jsonb,
    review_status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (review_status IN ('PENDIENTE', 'APROBADA', 'DESCARTADA', 'CONVERTIDA')),
    review_note TEXT,
    reviewed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    crm_company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
    crm_opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, candidate_key)
);

CREATE INDEX IF NOT EXISTS idx_licitaciones_tenders_org ON public.licitaciones_tenders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licitaciones_items_tender ON public.licitaciones_items (tender_id);
CREATE INDEX IF NOT EXISTS idx_licitaciones_parties_tender ON public.licitaciones_parties (tender_id);
CREATE INDEX IF NOT EXISTS idx_licitaciones_parties_org_norm ON public.licitaciones_parties (organization_id, name_normalized);
CREATE INDEX IF NOT EXISTS idx_licitaciones_candidates_org ON public.licitaciones_candidates (organization_id, review_status, score DESC);

DO $$
DECLARE v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['licitaciones_tenders', 'licitaciones_items', 'licitaciones_parties', 'licitaciones_candidates'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_tenant_select', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (organization_id = (SELECT private.current_organization_id()))',
            v_table || '_tenant_select', v_table
        );
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', v_table);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', v_table);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
    END LOOP;
END;
$$;

-- Misma normalización que src/lib/crm/purchase-import.ts normalizeName (parity probada en tests de PostgreSQL real).
CREATE OR REPLACE FUNCTION public.licitaciones_normalize_name(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT btrim(regexp_replace(
        regexp_replace(
            regexp_replace(
                lower(translate(COALESCE(p_input, ''), 'áàäâéèëêíìïîóòöôúùûüñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÛÜÑ', 'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN')),
                '[.,;:"''“”‘’()\-_/\\|@#]', ' ', 'g'),
            '\m(s ?a|s ?r ?l|ltda|ltd|cia|s ?a ?s|eireli|sas|inc|corp|gmbh|pty)\M', ' ', 'g'),
        '\s+', ' ', 'g'))
$$;

-- Importación atómica: una licitación con sus ítems y partes (con rol y evidencia) en una sola transacción.
-- Re-importar la misma licitación la actualiza, no la duplica.
CREATE OR REPLACE FUNCTION public.import_licitacion_atomic(
    p_organization_id UUID,
    p_actor_profile_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tender JSONB := p_payload -> 'tender';
    v_tender_id UUID;
    v_created BOOLEAN := false;
    v_item JSONB;
    v_party JSONB;
    v_item_id UUID;
    v_items INTEGER := 0;
    v_parties INTEGER := 0;
BEGIN
    IF p_organization_id IS NULL OR v_tender IS NULL
       OR NULLIF(btrim(v_tender ->> 'external_id'), '') IS NULL
       OR NULLIF(btrim(v_tender ->> 'title'), '') IS NULL THEN
        RAISE EXCEPTION 'INVALID_LICITACION_IMPORT';
    END IF;
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::TEXT || ':licitacion:' || (v_tender ->> 'external_id'), 0));

    SELECT id INTO v_tender_id FROM public.licitaciones_tenders
        WHERE organization_id = p_organization_id AND external_id = v_tender ->> 'external_id';
    IF v_tender_id IS NULL THEN
        v_created := true;
        INSERT INTO public.licitaciones_tenders (organization_id, source, external_id, source_url, title, convening_entity,
            procurement_object, status, published_at, closing_at, awarded_at, is_test_data, raw_document, imported_by_profile_id)
        VALUES (p_organization_id, v_tender ->> 'source', v_tender ->> 'external_id', v_tender ->> 'source_url', v_tender ->> 'title',
            v_tender ->> 'convening_entity', v_tender ->> 'procurement_object', v_tender ->> 'status',
            NULLIF(v_tender ->> 'published_at', '')::TIMESTAMPTZ, NULLIF(v_tender ->> 'closing_at', '')::TIMESTAMPTZ,
            NULLIF(v_tender ->> 'awarded_at', '')::TIMESTAMPTZ, COALESCE((v_tender ->> 'is_test_data')::BOOLEAN, false),
            v_tender -> 'raw_document', p_actor_profile_id)
        RETURNING id INTO v_tender_id;
    ELSE
        UPDATE public.licitaciones_tenders SET
            source_url = v_tender ->> 'source_url', title = v_tender ->> 'title', convening_entity = v_tender ->> 'convening_entity',
            procurement_object = v_tender ->> 'procurement_object', status = v_tender ->> 'status',
            published_at = NULLIF(v_tender ->> 'published_at', '')::TIMESTAMPTZ,
            closing_at = NULLIF(v_tender ->> 'closing_at', '')::TIMESTAMPTZ,
            awarded_at = NULLIF(v_tender ->> 'awarded_at', '')::TIMESTAMPTZ,
            raw_document = v_tender -> 'raw_document', updated_at = NOW()
        WHERE id = v_tender_id;
        DELETE FROM public.licitaciones_parties WHERE tender_id = v_tender_id;
        DELETE FROM public.licitaciones_items WHERE tender_id = v_tender_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'items', '[]'::jsonb)) LOOP
        INSERT INTO public.licitaciones_items (organization_id, tender_id, line_no, description, classification, quantity, unit,
            presentation, is_injectable, injectable_evidence)
        VALUES (p_organization_id, v_tender_id, (v_item ->> 'line_no')::INTEGER, v_item ->> 'description', v_item ->> 'classification',
            NULLIF(v_item ->> 'quantity', '')::NUMERIC, v_item ->> 'unit', v_item ->> 'presentation',
            COALESCE((v_item ->> 'is_injectable')::BOOLEAN, false), v_item ->> 'injectable_evidence');
        v_items := v_items + 1;
    END LOOP;

    FOR v_party IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'parties', '[]'::jsonb)) LOOP
        v_item_id := NULL;
        IF NULLIF(v_party ->> 'item_line_no', '') IS NOT NULL THEN
            SELECT id INTO v_item_id FROM public.licitaciones_items
                WHERE tender_id = v_tender_id AND line_no = (v_party ->> 'item_line_no')::INTEGER;
        END IF;
        INSERT INTO public.licitaciones_parties (organization_id, tender_id, item_id, role, name, name_normalized, ruc, ruc_digits,
            role_confirmed, evidence, evidence_url)
        VALUES (p_organization_id, v_tender_id, v_item_id, v_party ->> 'role', v_party ->> 'name',
            public.licitaciones_normalize_name(v_party ->> 'name'), NULLIF(v_party ->> 'ruc', ''),
            NULLIF(regexp_replace(COALESCE(v_party ->> 'ruc', ''), '\D', '', 'g'), ''),
            COALESCE((v_party ->> 'role_confirmed')::BOOLEAN, false), v_party ->> 'evidence', v_party ->> 'evidence_url')
        ON CONFLICT DO NOTHING;
        v_parties := v_parties + 1;
    END LOOP;

    RETURN jsonb_build_object('tender_id', v_tender_id, 'created', v_created, 'items', v_items, 'parties', v_parties);
END;
$$;

REVOKE ALL ON FUNCTION public.import_licitacion_atomic(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_licitacion_atomic(UUID, UUID, JSONB) TO service_role;

-- "Agregar a prospectos": atómico e idempotente. Empareja por RUC (dígitos) y luego por nombre normalizado exacto.
-- Ante ambigüedad (varias empresas, o mismo nombre con RUC distinto) exige resolución humana (p_link_company_id / p_force_create).
-- Crea la empresa como PROSPECT; nunca convierte a CUSTOMER ni envía mensajes.
CREATE OR REPLACE FUNCTION public.convert_licitacion_candidate_to_prospect(
    p_organization_id UUID,
    p_candidate_id UUID,
    p_actor_profile_id UUID DEFAULT NULL,
    p_create_opportunity BOOLEAN DEFAULT false,
    p_opportunity_title TEXT DEFAULT NULL,
    p_link_company_id UUID DEFAULT NULL,
    p_force_create BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_candidate public.licitaciones_candidates%ROWTYPE;
    v_company_id UUID;
    v_company_created BOOLEAN := false;
    v_opportunity_id UUID;
    v_norm TEXT;
    v_name_matches UUID[];
    v_conflicting_tax BOOLEAN := false;
BEGIN
    IF p_organization_id IS NULL OR p_candidate_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_LICITACION_CONVERSION';
    END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::TEXT || ':licitaciones-convert:' || p_candidate_id::TEXT, 0));
    SELECT * INTO v_candidate FROM public.licitaciones_candidates
        WHERE id = p_candidate_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LICITACION_CANDIDATE_NOT_FOUND'; END IF;
    IF v_candidate.review_status = 'DESCARTADA' THEN RAISE EXCEPTION 'LICITACION_CANDIDATE_DISCARDED'; END IF;
    IF v_candidate.review_status = 'PENDIENTE' THEN RAISE EXCEPTION 'LICITACION_CANDIDATE_NOT_REVIEWED'; END IF;

    IF v_candidate.crm_company_id IS NOT NULL THEN
        RETURN jsonb_build_object('company_id', v_candidate.crm_company_id, 'company_created', false,
            'opportunity_id', v_candidate.crm_opportunity_id, 'already_converted', true);
    END IF;

    v_norm := public.licitaciones_normalize_name(v_candidate.display_name);
    -- Serializa por empresa para que dos candidatas equivalentes no creen duplicados.
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::TEXT || ':crm-company:' ||
        COALESCE(NULLIF(v_candidate.ruc_digits, ''), v_norm), 0));

    IF p_link_company_id IS NOT NULL THEN
        SELECT id INTO v_company_id FROM public.crm_companies WHERE id = p_link_company_id AND organization_id = p_organization_id;
        IF v_company_id IS NULL THEN RAISE EXCEPTION 'LICITACION_LINK_COMPANY_NOT_FOUND'; END IF;
    ELSE
        IF COALESCE(v_candidate.ruc_digits, '') <> '' THEN
            SELECT c.id INTO v_company_id FROM public.crm_companies c
                WHERE c.organization_id = p_organization_id
                  AND regexp_replace(COALESCE(c.tax_id, ''), '\D', '', 'g') = v_candidate.ruc_digits
                ORDER BY c.created_at LIMIT 1;
        END IF;
        IF v_company_id IS NULL AND v_norm <> '' THEN
            SELECT array_agg(c.id ORDER BY c.created_at) INTO v_name_matches FROM public.crm_companies c
                WHERE c.organization_id = p_organization_id
                  AND (public.licitaciones_normalize_name(c.name) = v_norm OR public.licitaciones_normalize_name(c.legal_name) = v_norm);
            IF COALESCE(array_length(v_name_matches, 1), 0) > 1 AND NOT p_force_create THEN
                RAISE EXCEPTION 'LICITACION_AMBIGUOUS_COMPANY';
            END IF;
            IF COALESCE(array_length(v_name_matches, 1), 0) = 1 THEN
                SELECT (COALESCE(regexp_replace(c.tax_id, '\D', '', 'g'), '') <> ''
                        AND COALESCE(v_candidate.ruc_digits, '') <> ''
                        AND regexp_replace(c.tax_id, '\D', '', 'g') <> v_candidate.ruc_digits)
                  INTO v_conflicting_tax FROM public.crm_companies c WHERE c.id = v_name_matches[1];
                IF v_conflicting_tax AND NOT p_force_create THEN RAISE EXCEPTION 'LICITACION_AMBIGUOUS_COMPANY'; END IF;
                IF NOT v_conflicting_tax THEN v_company_id := v_name_matches[1]; END IF;
            END IF;
        END IF;
    END IF;

    IF v_company_id IS NULL THEN
        INSERT INTO public.crm_companies (organization_id, name, tax_id, country_code, source, lifecycle_stage, notes, owner_profile_id)
        VALUES (p_organization_id, v_candidate.display_name, NULLIF(v_candidate.ruc, ''), 'PY', 'LICITACIONES', 'PROSPECT',
                'Origen: radar de Licitaciones. Licitaciones: ' || (v_candidate.tender_ids)::TEXT, p_actor_profile_id)
        RETURNING id INTO v_company_id;
        v_company_created := true;
    END IF;

    IF p_create_opportunity THEN
        INSERT INTO public.crm_opportunities (organization_id, company_id, title, stage, product_interest, owner_profile_id)
        VALUES (p_organization_id, v_company_id,
                COALESCE(NULLIF(btrim(p_opportunity_title), ''), 'Cunas para ampollas - ' || v_candidate.display_name),
                'NUEVO', 'Cunas/bandejas plásticas para ampollas inyectables', p_actor_profile_id)
        RETURNING id INTO v_opportunity_id;
    END IF;

    INSERT INTO public.crm_activities (organization_id, company_id, opportunity_id, type, source, actor_profile_id, title, body, metadata, external_key)
    VALUES (p_organization_id, v_company_id, v_opportunity_id, 'NOTE', 'LICITACIONES', p_actor_profile_id,
            'Agregado a prospectos desde Licitaciones',
            'Razones: ' || (v_candidate.reasons)::TEXT,
            jsonb_build_object('candidate_id', v_candidate.id, 'tender_ids', v_candidate.tender_ids, 'products', v_candidate.products, 'roles', v_candidate.roles),
            'licitaciones-candidate:' || v_candidate.id::TEXT)
    ON CONFLICT DO NOTHING;

    UPDATE public.licitaciones_candidates
        SET crm_company_id = v_company_id, crm_opportunity_id = v_opportunity_id,
            review_status = 'CONVERTIDA', converted_at = NOW(), updated_at = NOW()
        WHERE id = v_candidate.id;

    RETURN jsonb_build_object('company_id', v_company_id, 'company_created', v_company_created,
        'opportunity_id', v_opportunity_id, 'already_converted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_licitacion_candidate_to_prospect(UUID, UUID, UUID, BOOLEAN, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_licitacion_candidate_to_prospect(UUID, UUID, UUID, BOOLEAN, TEXT, UUID, BOOLEAN) TO service_role;
