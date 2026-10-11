-- Licitaciones: escaneo diario automático de DNCP. Baja TODAS las licitaciones con medicamentos inyectables (información
-- pública) y guarda su etapa, los participantes, el ganador y los productos adjudicados. No depende del CRM.
-- Aditivo: no modifica datos existentes.

ALTER TABLE public.licitaciones_tenders
    ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'DESCONOCIDA'
        CHECK (phase IN ('ABIERTA', 'EN_EVALUACION', 'ADJUDICADA', 'CERRADA', 'DESCONOCIDA'));
CREATE INDEX IF NOT EXISTS idx_licitaciones_tenders_phase ON public.licitaciones_tenders (organization_id, phase, source_updated_at DESC);

-- Adjudicaciones tal como las publica DNCP: proveedor, fecha, monto y productos adjudicados.
CREATE TABLE IF NOT EXISTS public.licitaciones_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tender_id UUID NOT NULL REFERENCES public.licitaciones_tenders(id) ON DELETE CASCADE,
    supplier_name TEXT NOT NULL,
    supplier_ruc TEXT,
    awarded_at TIMESTAMPTZ,
    amount NUMERIC,
    currency TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_licitaciones_awards_tender ON public.licitaciones_awards (tender_id);

-- Activación por organización: nada se escanea hasta que un administrador lo enciende.
CREATE TABLE IF NOT EXISTS public.licitaciones_scan_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    backfill_pages INTEGER NOT NULL DEFAULT 5 CHECK (backfill_pages BETWEEN 1 AND 20),
    updated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marca de agua por palabra clave: DNCP ordena por fecha de última modificación, así que cada día solo se leen las novedades.
CREATE TABLE IF NOT EXISTS public.licitaciones_scan_state (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    last_seen_date TIMESTAMPTZ,
    backfilled_at TIMESTAMPTZ,
    last_scanned_at TIMESTAMPTZ,
    last_error TEXT,
    PRIMARY KEY (organization_id, keyword)
);

-- Registro honesto de cada corrida: qué se consultó, qué falló y por qué.
CREATE TABLE IF NOT EXISTS public.licitaciones_scan_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    trigger TEXT NOT NULL CHECK (trigger IN ('CRON', 'MANUAL')),
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'OK', 'PARTIAL', 'FAILED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    tenders_seen INTEGER NOT NULL DEFAULT 0,
    tenders_imported INTEGER NOT NULL DEFAULT 0,
    tenders_new INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_licitaciones_scan_runs_org ON public.licitaciones_scan_runs (organization_id, started_at DESC);

DO $$
DECLARE v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['licitaciones_awards', 'licitaciones_scan_settings', 'licitaciones_scan_state', 'licitaciones_scan_runs'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_tenant_select', v_table);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (organization_id = (SELECT private.current_organization_id()))', v_table || '_tenant_select', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', v_table);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
    END LOOP;
END;
$$;

-- Importación atómica ampliada: conserva la fecha de última modificación de DNCP, la fase y las adjudicaciones.
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
    v_award JSONB;
    v_item_id UUID;
    v_items INTEGER := 0;
    v_parties INTEGER := 0;
    v_phase TEXT := COALESCE(NULLIF(v_tender ->> 'phase', ''), 'DESCONOCIDA');
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
            procurement_object, status, phase, published_at, closing_at, awarded_at, is_test_data, raw_document, imported_by_profile_id, source_updated_at)
        VALUES (p_organization_id, v_tender ->> 'source', v_tender ->> 'external_id', v_tender ->> 'source_url', v_tender ->> 'title',
            v_tender ->> 'convening_entity', v_tender ->> 'procurement_object', v_tender ->> 'status', v_phase,
            NULLIF(v_tender ->> 'published_at', '')::TIMESTAMPTZ, NULLIF(v_tender ->> 'closing_at', '')::TIMESTAMPTZ,
            NULLIF(v_tender ->> 'awarded_at', '')::TIMESTAMPTZ, COALESCE((v_tender ->> 'is_test_data')::BOOLEAN, false),
            v_tender -> 'raw_document', p_actor_profile_id, NULLIF(v_tender ->> 'source_updated_at', '')::TIMESTAMPTZ)
        RETURNING id INTO v_tender_id;
    ELSE
        UPDATE public.licitaciones_tenders SET
            source_url = v_tender ->> 'source_url', title = v_tender ->> 'title', convening_entity = v_tender ->> 'convening_entity',
            procurement_object = v_tender ->> 'procurement_object', status = v_tender ->> 'status', phase = v_phase,
            published_at = NULLIF(v_tender ->> 'published_at', '')::TIMESTAMPTZ,
            closing_at = NULLIF(v_tender ->> 'closing_at', '')::TIMESTAMPTZ,
            awarded_at = NULLIF(v_tender ->> 'awarded_at', '')::TIMESTAMPTZ,
            raw_document = v_tender -> 'raw_document',
            source_updated_at = COALESCE(NULLIF(v_tender ->> 'source_updated_at', '')::TIMESTAMPTZ, source_updated_at),
            updated_at = NOW()
        WHERE id = v_tender_id;
        DELETE FROM public.licitaciones_awards WHERE tender_id = v_tender_id;
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

    FOR v_award IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'awards', '[]'::jsonb)) LOOP
        INSERT INTO public.licitaciones_awards (organization_id, tender_id, supplier_name, supplier_ruc, awarded_at, amount, currency, items)
        VALUES (p_organization_id, v_tender_id, v_award ->> 'supplier_name', NULLIF(v_award ->> 'ruc', ''),
            NULLIF(v_award ->> 'awarded_at', '')::TIMESTAMPTZ, NULLIF(v_award ->> 'amount', '')::NUMERIC, NULLIF(v_award ->> 'currency', ''),
            COALESCE(v_award -> 'items', '[]'::jsonb));
    END LOOP;

    RETURN jsonb_build_object('tender_id', v_tender_id, 'created', v_created, 'items', v_items, 'parties', v_parties);
END;
$$;

REVOKE ALL ON FUNCTION public.import_licitacion_atomic(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_licitacion_atomic(UUID, UUID, JSONB) TO service_role;
