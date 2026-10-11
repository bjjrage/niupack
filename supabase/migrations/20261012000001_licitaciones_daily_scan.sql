-- Licitaciones: escaneo diario automático de DNCP para detectar las licitaciones con inyectables donde
-- participan los CLIENTES de NIUPACK (empresas del CRM con RUC confirmado). Aditivo: no modifica datos existentes.

ALTER TABLE public.licitaciones_tenders ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

-- Activación por organización: nada se escanea hasta que un administrador lo enciende.
CREATE TABLE IF NOT EXISTS public.licitaciones_scan_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    backfill_pages INTEGER NOT NULL DEFAULT 3 CHECK (backfill_pages BETWEEN 1 AND 10),
    updated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clientes vigilados: salen del CRM (CUSTOMER o con compras) y solo con un RUC cargado en la ficha.
CREATE TABLE IF NOT EXISTS public.licitaciones_watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    ruc_digits TEXT NOT NULL,
    dncp_party_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    backfilled_at TIMESTAMPTZ,
    last_seen_date TIMESTAMPTZ,
    last_scanned_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, company_id)
);

-- Dónde participa cada cliente: una fila por licitación, cliente y rol (con constancia de cuándo se detectó).
CREATE TABLE IF NOT EXISTS public.licitaciones_client_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tender_id UUID NOT NULL REFERENCES public.licitaciones_tenders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    role_confirmed BOOLEAN NOT NULL DEFAULT true,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (organization_id, tender_id, company_id, role)
);

-- Registro honesto de cada corrida: qué se consultó, qué falló y por qué.
CREATE TABLE IF NOT EXISTS public.licitaciones_scan_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    trigger TEXT NOT NULL CHECK (trigger IN ('CRON', 'MANUAL')),
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'OK', 'PARTIAL', 'FAILED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    clients_total INTEGER NOT NULL DEFAULT 0,
    clients_scanned INTEGER NOT NULL DEFAULT 0,
    tenders_seen INTEGER NOT NULL DEFAULT 0,
    tenders_imported INTEGER NOT NULL DEFAULT 0,
    matches_created INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_licitaciones_watchlist_org ON public.licitaciones_watchlist (organization_id, last_scanned_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_licitaciones_matches_org ON public.licitaciones_client_matches (organization_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_licitaciones_scan_runs_org ON public.licitaciones_scan_runs (organization_id, started_at DESC);

DO $$
DECLARE v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['licitaciones_scan_settings', 'licitaciones_watchlist', 'licitaciones_client_matches', 'licitaciones_scan_runs'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_tenant_select', v_table);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (organization_id = (SELECT private.current_organization_id()))', v_table || '_tenant_select', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', v_table);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
    END LOOP;
END;
$$;

-- Importación atómica: ahora también conserva la fecha de última modificación publicada por DNCP,
-- para no volver a descargar lo que no cambió.
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
            procurement_object, status, published_at, closing_at, awarded_at, is_test_data, raw_document, imported_by_profile_id, source_updated_at)
        VALUES (p_organization_id, v_tender ->> 'source', v_tender ->> 'external_id', v_tender ->> 'source_url', v_tender ->> 'title',
            v_tender ->> 'convening_entity', v_tender ->> 'procurement_object', v_tender ->> 'status',
            NULLIF(v_tender ->> 'published_at', '')::TIMESTAMPTZ, NULLIF(v_tender ->> 'closing_at', '')::TIMESTAMPTZ,
            NULLIF(v_tender ->> 'awarded_at', '')::TIMESTAMPTZ, COALESCE((v_tender ->> 'is_test_data')::BOOLEAN, false),
            v_tender -> 'raw_document', p_actor_profile_id, NULLIF(v_tender ->> 'source_updated_at', '')::TIMESTAMPTZ)
        RETURNING id INTO v_tender_id;
    ELSE
        UPDATE public.licitaciones_tenders SET
            source_url = v_tender ->> 'source_url', title = v_tender ->> 'title', convening_entity = v_tender ->> 'convening_entity',
            procurement_object = v_tender ->> 'procurement_object', status = v_tender ->> 'status',
            published_at = NULLIF(v_tender ->> 'published_at', '')::TIMESTAMPTZ,
            closing_at = NULLIF(v_tender ->> 'closing_at', '')::TIMESTAMPTZ,
            awarded_at = NULLIF(v_tender ->> 'awarded_at', '')::TIMESTAMPTZ,
            raw_document = v_tender -> 'raw_document',
            source_updated_at = COALESCE(NULLIF(v_tender ->> 'source_updated_at', '')::TIMESTAMPTZ, source_updated_at),
            updated_at = NOW()
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

-- Sincroniza la lista de vigilados con el CRM. Cliente = CUSTOMER o con compras registradas.
-- Sin RUC no se vigila (la identificación por nombre no es confiable): se informa como "sin RUC".
CREATE OR REPLACE FUNCTION public.licitaciones_sync_watchlist(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_added INTEGER := 0;
    v_changed INTEGER := 0;
    v_removed INTEGER := 0;
BEGIN
    IF p_organization_id IS NULL THEN RAISE EXCEPTION 'INVALID_WATCHLIST_SYNC'; END IF;
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::TEXT || ':licitaciones-watchlist', 0));

    DROP TABLE IF EXISTS pg_temp._clients;
    CREATE TEMP TABLE _clients ON COMMIT DROP AS
    SELECT c.id AS company_id,
           regexp_replace(COALESCE(c.tax_id, ''), '\D', '', 'g') AS digits
    FROM public.crm_companies c
    WHERE c.organization_id = p_organization_id
      AND (c.lifecycle_stage = 'CUSTOMER'
           OR EXISTS (SELECT 1 FROM public.crm_customer_purchases p WHERE p.company_id = c.id AND p.organization_id = p_organization_id));

    INSERT INTO public.licitaciones_watchlist (organization_id, company_id, ruc_digits, dncp_party_id)
    SELECT p_organization_id, company_id, digits, 'PY-RUC-' || left(digits, length(digits) - 1) || '-' || right(digits, 1)
    FROM _clients WHERE length(digits) BETWEEN 6 AND 10
    ON CONFLICT (organization_id, company_id) DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;

    -- Si el RUC de la ficha cambió, la vigilancia arranca de cero con el nuevo.
    UPDATE public.licitaciones_watchlist w
       SET ruc_digits = c.digits, dncp_party_id = 'PY-RUC-' || left(c.digits, length(c.digits) - 1) || '-' || right(c.digits, 1),
           enabled = true, backfilled_at = NULL, last_seen_date = NULL, last_scanned_at = NULL, last_error = NULL
      FROM _clients c
     WHERE w.organization_id = p_organization_id AND w.company_id = c.company_id
       AND length(c.digits) BETWEEN 6 AND 10 AND w.ruc_digits <> c.digits;
    GET DIAGNOSTICS v_changed = ROW_COUNT;

    -- Quien dejó de ser cliente o perdió el RUC sale de la vigilancia (su historial de detecciones se conserva).
    UPDATE public.licitaciones_watchlist w SET enabled = false
     WHERE w.organization_id = p_organization_id AND w.enabled
       AND NOT EXISTS (SELECT 1 FROM _clients c WHERE c.company_id = w.company_id AND length(c.digits) BETWEEN 6 AND 10);
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    RETURN jsonb_build_object('added', v_added, 'changed', v_changed, 'disabled', v_removed,
        'without_ruc', (SELECT COUNT(*) FROM _clients WHERE length(digits) NOT BETWEEN 6 AND 10),
        'watching', (SELECT COUNT(*) FROM public.licitaciones_watchlist WHERE organization_id = p_organization_id AND enabled));
END;
$$;

-- Registra la participación de los clientes vigilados en una licitación con inyectables (idempotente).
CREATE OR REPLACE FUNCTION public.licitaciones_register_client_matches(p_organization_id UUID, p_tender_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE v_new INTEGER := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.licitaciones_items WHERE tender_id = p_tender_id AND organization_id = p_organization_id AND is_injectable) THEN
        RETURN 0;
    END IF;
    INSERT INTO public.licitaciones_client_matches (organization_id, tender_id, company_id, role, role_confirmed)
    SELECT DISTINCT p_organization_id, p_tender_id, w.company_id, pa.role, pa.role_confirmed
    FROM public.licitaciones_parties pa
    JOIN public.licitaciones_watchlist w ON w.organization_id = pa.organization_id AND w.enabled AND w.ruc_digits = pa.ruc_digits
    WHERE pa.organization_id = p_organization_id AND pa.tender_id = p_tender_id AND pa.role <> 'CONVOCANTE' AND pa.ruc_digits IS NOT NULL
    ON CONFLICT (organization_id, tender_id, company_id, role) DO NOTHING;
    GET DIAGNOSTICS v_new = ROW_COUNT;
    RETURN v_new;
END;
$$;

DO $$
DECLARE v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY['import_licitacion_atomic(uuid,uuid,jsonb)', 'licitaciones_sync_watchlist(uuid)', 'licitaciones_register_client_matches(uuid,uuid)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', v_fn);
    END LOOP;
END;
$$;
