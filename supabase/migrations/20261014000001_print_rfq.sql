-- RFQ a imprentas locales (procesos de impresión).
-- Flujo clonado del RFQ de Control de Facturas: solicitud con SKU y arte -> invitaciones con enlace propio -> presupuesto
-- versionado con documento original -> revisión humana -> asignación -> autorización -> preview exacto -> orden de compra.
-- Todo es aditivo y con prefijo print_: no toca las tablas rfqs / suppliers del RFQ comercial.
-- Acceso solo por service_role desde rutas del servidor que validan sesión, organización y rol.

CREATE TABLE IF NOT EXISTS public.print_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    ruc TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    city TEXT,
    processes TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS print_providers_org_name_idx ON public.print_providers (organization_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.print_rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('COST_DISCOVERY', 'PROCUREMENT')),
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    specifications TEXT,
    required_date DATE,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS', 'AUTORIZADO', 'CANCELADO', 'CERRADO')),
    closed_at TIMESTAMPTZ,
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.print_rfq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.print_rfqs(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    sku TEXT NOT NULL CHECK (btrim(sku) <> ''),
    product_attribute_id UUID REFERENCES public.product_attributes(id) ON DELETE SET NULL,
    description TEXT NOT NULL CHECK (btrim(description) <> ''),
    quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL CHECK (btrim(unit) <> ''),
    print_spec JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(print_spec) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS print_rfq_items_rfq_idx ON public.print_rfq_items (rfq_id, sort_order);

CREATE TABLE IF NOT EXISTS public.print_rfq_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.print_rfqs(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.print_providers(id),
    token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    token_expires_at TIMESTAMPTZ NOT NULL,
    token_revoked_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'INVITADO' CHECK (status IN ('INVITADO', 'ABIERTO', 'RESPONDIDO')),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opened_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    UNIQUE (rfq_id, provider_id)
);

-- Archivos: arte solicitado (ART, por ítem) y presupuesto original de la imprenta (BUDGET, por invitación).
CREATE TABLE IF NOT EXISTS public.print_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.print_rfqs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('ART', 'BUDGET')),
    rfq_item_id UUID REFERENCES public.print_rfq_items(id) ON DELETE CASCADE,
    invitation_id UUID REFERENCES public.print_rfq_invitations(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    uploaded_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_by_provider BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((kind = 'ART' AND rfq_item_id IS NOT NULL AND invitation_id IS NULL)
        OR (kind = 'BUDGET' AND invitation_id IS NOT NULL AND rfq_item_id IS NULL))
);
CREATE INDEX IF NOT EXISTS print_files_rfq_idx ON public.print_files (rfq_id, kind, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS print_files_art_unique ON public.print_files (rfq_item_id, sha256) WHERE kind = 'ART';
CREATE UNIQUE INDEX IF NOT EXISTS print_files_budget_unique ON public.print_files (invitation_id, sha256) WHERE kind = 'BUDGET';

CREATE TABLE IF NOT EXISTS public.print_file_blobs (
    file_id UUID PRIMARY KEY REFERENCES public.print_files(id) ON DELETE CASCADE,
    content BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS public.print_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invitation_id UUID NOT NULL UNIQUE REFERENCES public.print_rfq_invitations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cada envío de la imprenta es una versión inmutable; corregir = enviar una versión nueva.
CREATE TABLE IF NOT EXISTS public.print_quote_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.print_quotes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    budget_number TEXT NOT NULL CHECK (btrim(budget_number) <> ''),
    currency TEXT NOT NULL CHECK (currency IN ('PYG', 'USD', 'EUR', 'BRL', 'ARS')),
    vat_included BOOLEAN NOT NULL,
    invoice_available BOOLEAN NOT NULL DEFAULT false,
    valid_until TIMESTAMPTZ NOT NULL,
    freight NUMERIC(18, 2) NOT NULL CHECK (freight >= 0),
    payment_terms TEXT NOT NULL CHECK (btrim(payment_terms) <> ''),
    delivery_time TEXT,
    observations TEXT,
    total_price NUMERIC(18, 2) NOT NULL CHECK (total_price > 0),
    budget_file_id UUID NOT NULL UNIQUE REFERENCES public.print_files(id),
    art_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    submitted_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (quote_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.print_quote_version_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quote_version_id UUID NOT NULL REFERENCES public.print_quote_versions(id) ON DELETE CASCADE,
    rfq_item_id UUID NOT NULL REFERENCES public.print_rfq_items(id),
    unit_price NUMERIC(18, 4) CHECK (unit_price IS NULL OR unit_price > 0),
    available_quantity NUMERIC(18, 4) NOT NULL CHECK (available_quantity >= 0),
    tax_rate NUMERIC(8, 4) NOT NULL CHECK (tax_rate BETWEEN 0 AND 100),
    lead_time_days INTEGER NOT NULL CHECK (lead_time_days BETWEEN 0 AND 3650),
    observations TEXT,
    UNIQUE (quote_version_id, rfq_item_id),
    CHECK (available_quantity = 0 OR unit_price IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.print_immutable_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    RAISE EXCEPTION 'PRINT_IMMUTABLE_RECORD: % es inmutable; enviar una versión nueva', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS print_quote_versions_immutable ON public.print_quote_versions;
CREATE TRIGGER print_quote_versions_immutable BEFORE UPDATE OR DELETE ON public.print_quote_versions FOR EACH ROW EXECUTE FUNCTION public.print_immutable_guard();
DROP TRIGGER IF EXISTS print_quote_items_immutable ON public.print_quote_version_items;
CREATE TRIGGER print_quote_items_immutable BEFORE UPDATE OR DELETE ON public.print_quote_version_items FOR EACH ROW EXECUTE FUNCTION public.print_immutable_guard();
-- El arte y los presupuestos registrados tampoco se reescriben.
DROP TRIGGER IF EXISTS print_files_immutable ON public.print_files;
CREATE TRIGGER print_files_immutable BEFORE UPDATE ON public.print_files FOR EACH ROW EXECUTE FUNCTION public.print_immutable_guard();

CREATE TABLE IF NOT EXISTS public.print_quote_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quote_version_id UUID NOT NULL REFERENCES public.print_quote_versions(id),
    extraction JSONB NOT NULL,
    comparison JSONB NOT NULL,
    resolution TEXT NOT NULL CHECK (length(btrim(resolution)) >= 10),
    reviewed_by_profile_id UUID NOT NULL REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS print_quote_reviews_version_idx ON public.print_quote_reviews (quote_version_id);

CREATE TABLE IF NOT EXISTS public.print_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.print_rfqs(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
    justification TEXT NOT NULL CHECK (length(btrim(justification)) >= 10),
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    authorized_by_profile_id UUID REFERENCES public.profiles(id),
    authorized_at TIMESTAMPTZ,
    preview JSONB,
    preview_hash TEXT,
    confirmed_by_profile_id UUID REFERENCES public.profiles(id),
    confirmed_at TIMESTAMPTZ,
    UNIQUE (rfq_id, revision),
    CHECK ((authorized_by_profile_id IS NULL) = (authorized_at IS NULL)),
    CHECK ((confirmed_by_profile_id IS NULL) = (confirmed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS public.print_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    rfq_id UUID NOT NULL REFERENCES public.print_rfqs(id),
    allocation_id UUID NOT NULL REFERENCES public.print_allocations(id),
    provider_id UUID NOT NULL REFERENCES public.print_providers(id),
    provider_name TEXT NOT NULL,
    quote_version_id UUID NOT NULL REFERENCES public.print_quote_versions(id),
    currency TEXT NOT NULL,
    vat_included BOOLEAN NOT NULL,
    freight NUMERIC(18, 2) NOT NULL,
    payment_terms TEXT NOT NULL,
    tax_total NUMERIC(18, 2) NOT NULL,
    total NUMERIC(18, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'EMITIDA' CHECK (status IN ('EMITIDA', 'ANULADA')),
    justification TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    authorized_by_profile_id UUID REFERENCES public.profiles(id),
    confirmed_by_profile_id UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code),
    UNIQUE (allocation_id, provider_id, currency)
);

CREATE TABLE IF NOT EXISTS public.print_purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.print_purchase_orders(id) ON DELETE CASCADE,
    rfq_item_id UUID NOT NULL REFERENCES public.print_rfq_items(id),
    quote_version_item_id UUID NOT NULL REFERENCES public.print_quote_version_items(id),
    sku TEXT NOT NULL,
    description TEXT NOT NULL,
    art_file_id UUID REFERENCES public.print_files(id),
    quantity NUMERIC(18, 4) NOT NULL,
    unit TEXT NOT NULL,
    unit_price NUMERIC(18, 4) NOT NULL,
    tax_rate NUMERIC(8, 4) NOT NULL,
    total NUMERIC(18, 2) NOT NULL,
    expected_delivery_date DATE
);

CREATE TABLE IF NOT EXISTS public.print_rfq_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.print_rfqs(id) ON DELETE CASCADE,
    actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('internal', 'provider')),
    event TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS print_rfq_events_rfq_idx ON public.print_rfq_events (rfq_id, created_at DESC);

DO $$
DECLARE v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['print_providers', 'print_rfqs', 'print_rfq_items', 'print_rfq_invitations', 'print_files', 'print_file_blobs',
        'print_quotes', 'print_quote_versions', 'print_quote_version_items', 'print_quote_reviews', 'print_allocations',
        'print_purchase_orders', 'print_purchase_order_items', 'print_rfq_events'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', v_table);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Funciones atómicas. SECURITY INVOKER y solo service_role: la organización y el actor los fija el servidor desde la sesión.
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.print_check_actor(p_org UUID, p_actor UUID, p_admin_only BOOLEAN DEFAULT false) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND organization_id = p_org
                   AND (NOT p_admin_only AND role IN ('admin', 'analyst') OR role = 'admin')) THEN
        RAISE EXCEPTION 'PRINT_ACTOR_NOT_ALLOWED';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.print_log(p_org UUID, p_rfq UUID, p_actor UUID, p_event TEXT, p_detail JSONB) RETURNS void
LANGUAGE sql SET search_path = pg_catalog, public AS $$
    INSERT INTO public.print_rfq_events (organization_id, rfq_id, actor_profile_id, actor_type, event, detail)
    VALUES (p_org, p_rfq, p_actor, CASE WHEN p_actor IS NULL THEN 'provider' ELSE 'internal' END, p_event, COALESCE(p_detail, '{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.print_rfq_create(p_org UUID, p_actor UUID, p_header JSONB, p_items JSONB) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_rfq public.print_rfqs;
    v_item JSONB;
    v_idx INTEGER := 0;
    v_next INTEGER;
    v_expires TIMESTAMPTZ;
    v_attr UUID;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor);
    IF p_header ->> 'purpose' IS NULL OR p_header ->> 'purpose' NOT IN ('COST_DISCOVERY', 'PROCUREMENT') THEN RAISE EXCEPTION 'PRINT_PURPOSE_REQUIRED'; END IF;
    IF NULLIF(btrim(p_header ->> 'title'), '') IS NULL THEN RAISE EXCEPTION 'PRINT_TITLE_REQUIRED'; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PRINT_ITEMS_INVALID'; END IF;
    v_expires := COALESCE(NULLIF(p_header ->> 'expires_at', '')::TIMESTAMPTZ, NOW() + INTERVAL '14 days');
    IF v_expires <= NOW() THEN RAISE EXCEPTION 'PRINT_EXPIRY_INVALID'; END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::TEXT || ':print_rfq_code', 0));
    SELECT COALESCE(MAX(substring(code FROM 5)::INTEGER), 0) + 1 INTO v_next FROM public.print_rfqs WHERE organization_id = p_org AND code ~ '^IMP-[0-9]+$';

    INSERT INTO public.print_rfqs (organization_id, code, purpose, title, specifications, required_date, expires_at, created_by_profile_id)
    VALUES (p_org, 'IMP-' || lpad(v_next::TEXT, 4, '0'), p_header ->> 'purpose', btrim(p_header ->> 'title'), NULLIF(btrim(COALESCE(p_header ->> 'specifications', '')), ''),
            NULLIF(p_header ->> 'required_date', '')::DATE, v_expires, p_actor)
    RETURNING * INTO v_rfq;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        IF NULLIF(btrim(v_item ->> 'sku'), '') IS NULL OR NULLIF(btrim(v_item ->> 'description'), '') IS NULL OR NULLIF(btrim(v_item ->> 'unit'), '') IS NULL
           OR (v_item ->> 'quantity')::NUMERIC IS NULL OR (v_item ->> 'quantity')::NUMERIC NOT BETWEEN 0.0001 AND 9999999999
           OR (v_item ? 'print_spec' AND jsonb_typeof(v_item -> 'print_spec') <> 'object') THEN
            RAISE EXCEPTION 'PRINT_ITEM_INVALID';
        END IF;
        v_attr := NULL;
        IF NULLIF(v_item ->> 'product_attribute_id', '') IS NOT NULL THEN
            SELECT pa.id INTO v_attr FROM public.product_attributes pa JOIN public.products pr ON pr.id = pa.product_id
                WHERE pa.id = (v_item ->> 'product_attribute_id')::UUID AND pr.organization_id = p_org;
            IF v_attr IS NULL THEN RAISE EXCEPTION 'PRINT_SKU_NOT_FOUND'; END IF;
        END IF;
        INSERT INTO public.print_rfq_items (organization_id, rfq_id, sort_order, sku, product_attribute_id, description, quantity, unit, print_spec)
        VALUES (p_org, v_rfq.id, v_idx, btrim(v_item ->> 'sku'), v_attr, btrim(v_item ->> 'description'), (v_item ->> 'quantity')::NUMERIC,
                btrim(v_item ->> 'unit'), COALESCE(v_item -> 'print_spec', '{}'::jsonb));
        v_idx := v_idx + 1;
    END LOOP;

    PERFORM public.print_log(p_org, v_rfq.id, p_actor, 'rfq.created', jsonb_build_object('purpose', v_rfq.purpose, 'items', v_idx));
    RETURN jsonb_build_object('id', v_rfq.id, 'code', v_rfq.code);
END $$;

-- Guarda un archivo (arte o presupuesto) con su huella; idempotente por contenido.
CREATE OR REPLACE FUNCTION public.print_store_file(p_org UUID, p_rfq UUID, p_meta JSONB, p_content_hex TEXT) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_rfq public.print_rfqs;
    v_kind TEXT := p_meta ->> 'kind';
    v_item UUID := NULLIF(p_meta ->> 'rfq_item_id', '')::UUID;
    v_inv public.print_rfq_invitations;
    v_bytes BYTEA;
    v_existing UUID;
    v_id UUID;
    v_actor UUID := NULLIF(p_meta ->> 'uploaded_by', '')::UUID;
BEGIN
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = p_rfq AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_FOUND'; END IF;
    IF v_rfq.status NOT IN ('BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS') OR v_rfq.expires_at <= NOW() THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_OPEN'; END IF;
    IF v_kind NOT IN ('ART', 'BUDGET') THEN RAISE EXCEPTION 'PRINT_FILE_KIND_INVALID'; END IF;
    IF v_actor IS NOT NULL THEN PERFORM public.print_check_actor(p_org, v_actor); END IF;

    v_bytes := decode(p_content_hex, 'hex');
    IF octet_length(v_bytes) <> (p_meta ->> 'size_bytes')::INTEGER OR octet_length(v_bytes) = 0 THEN RAISE EXCEPTION 'PRINT_FILE_SIZE_MISMATCH'; END IF;
    IF encode(sha256(v_bytes), 'hex') <> p_meta ->> 'sha256' THEN RAISE EXCEPTION 'PRINT_FILE_HASH_MISMATCH'; END IF;

    IF v_kind = 'ART' THEN
        IF v_actor IS NULL THEN RAISE EXCEPTION 'PRINT_ACTOR_NOT_ALLOWED'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.print_rfq_items WHERE id = v_item AND rfq_id = p_rfq AND organization_id = p_org) THEN RAISE EXCEPTION 'PRINT_ITEM_NOT_FOUND'; END IF;
        SELECT id INTO v_existing FROM public.print_files WHERE kind = 'ART' AND rfq_item_id = v_item AND sha256 = p_meta ->> 'sha256';
    ELSE
        SELECT * INTO v_inv FROM public.print_rfq_invitations WHERE id = (p_meta ->> 'invitation_id')::UUID AND rfq_id = p_rfq AND organization_id = p_org;
        IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_LINK_INVALID'; END IF;
        IF v_inv.token_revoked_at IS NOT NULL OR v_inv.token_expires_at <= NOW() THEN RAISE EXCEPTION 'PRINT_LINK_CLOSED'; END IF;
        SELECT id INTO v_existing FROM public.print_files WHERE kind = 'BUDGET' AND invitation_id = v_inv.id AND sha256 = p_meta ->> 'sha256';
    END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('file_id', v_existing, 'duplicate', true); END IF;

    INSERT INTO public.print_files (organization_id, rfq_id, kind, rfq_item_id, invitation_id, file_name, content_type, size_bytes, sha256, uploaded_by_profile_id, uploaded_by_provider)
    VALUES (p_org, p_rfq, v_kind, CASE WHEN v_kind = 'ART' THEN v_item END, CASE WHEN v_kind = 'BUDGET' THEN v_inv.id END,
            p_meta ->> 'file_name', p_meta ->> 'content_type', octet_length(v_bytes), p_meta ->> 'sha256', v_actor, v_kind = 'BUDGET' AND v_actor IS NULL)
    RETURNING id INTO v_id;
    INSERT INTO public.print_file_blobs (file_id, content) VALUES (v_id, v_bytes);
    PERFORM public.print_log(p_org, p_rfq, v_actor, CASE WHEN v_kind = 'ART' THEN 'rfq.art.registered' ELSE 'rfq.budget.uploaded' END,
        jsonb_build_object('file_id', v_id, 'file_name', p_meta ->> 'file_name', 'sha256', p_meta ->> 'sha256', 'rfq_item_id', v_item, 'invitation_id', v_inv.id));
    RETURN jsonb_build_object('file_id', v_id, 'duplicate', false);
END $$;

CREATE OR REPLACE FUNCTION public.print_rfq_invite(p_org UUID, p_actor UUID, p_rfq UUID, p_provider_ids UUID[]) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_rfq public.print_rfqs;
    v_provider UUID;
    v_new INTEGER := 0;
    v_rows INTEGER;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor);
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = p_rfq AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_FOUND'; END IF;
    IF v_rfq.status NOT IN ('BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS') OR v_rfq.expires_at <= NOW() THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_OPEN'; END IF;
    IF p_provider_ids IS NULL OR cardinality(p_provider_ids) = 0 THEN RAISE EXCEPTION 'PRINT_PROVIDERS_REQUIRED'; END IF;
    -- El arte a cotizar es parte de la solicitud: ningún ítem sale a una imprenta sin su arte registrado.
    IF EXISTS (SELECT 1 FROM public.print_rfq_items i WHERE i.rfq_id = v_rfq.id
               AND NOT EXISTS (SELECT 1 FROM public.print_files f WHERE f.rfq_item_id = i.id AND f.kind = 'ART')) THEN
        RAISE EXCEPTION 'PRINT_ART_REQUIRED';
    END IF;
    FOREACH v_provider IN ARRAY p_provider_ids LOOP
        IF NOT EXISTS (SELECT 1 FROM public.print_providers WHERE id = v_provider AND organization_id = p_org AND active) THEN RAISE EXCEPTION 'PRINT_PROVIDER_INVALID'; END IF;
        INSERT INTO public.print_rfq_invitations (organization_id, rfq_id, provider_id, token_expires_at)
        VALUES (p_org, v_rfq.id, v_provider, v_rfq.expires_at) ON CONFLICT (rfq_id, provider_id) DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_new := v_new + v_rows;
    END LOOP;
    IF v_rfq.status = 'BORRADOR' THEN UPDATE public.print_rfqs SET status = 'COTIZANDO', updated_at = NOW() WHERE id = v_rfq.id; END IF;
    PERFORM public.print_log(p_org, v_rfq.id, p_actor, 'rfq.invited', jsonb_build_object('provider_ids', to_jsonb(p_provider_ids), 'new', v_new));
    RETURN jsonb_build_object('invited', v_new);
END $$;

CREATE OR REPLACE FUNCTION public.print_rfq_link(p_org UUID, p_actor UUID, p_rfq UUID, p_invitation UUID, p_action TEXT) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_rfq public.print_rfqs;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor);
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = p_rfq AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_FOUND'; END IF;
    IF p_action = 'REVOKE' THEN
        UPDATE public.print_rfq_invitations SET token_revoked_at = NOW() WHERE id = p_invitation AND rfq_id = p_rfq AND organization_id = p_org;
    ELSIF p_action = 'RENEW' THEN
        IF v_rfq.status NOT IN ('BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS') OR v_rfq.expires_at <= NOW() THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_OPEN'; END IF;
        UPDATE public.print_rfq_invitations SET token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
            token_expires_at = v_rfq.expires_at, token_revoked_at = NULL WHERE id = p_invitation AND rfq_id = p_rfq AND organization_id = p_org;
    ELSE
        RAISE EXCEPTION 'PRINT_ACTION_INVALID';
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_INVITATION_NOT_FOUND'; END IF;
    PERFORM public.print_log(p_org, p_rfq, p_actor, CASE WHEN p_action = 'REVOKE' THEN 'rfq.link.revoked' ELSE 'rfq.link.renewed' END, jsonb_build_object('invitation_id', p_invitation));
END $$;

CREATE OR REPLACE FUNCTION public.print_rfq_transition(p_org UUID, p_actor UUID, p_rfq UUID, p_action TEXT, p_days INTEGER DEFAULT 14) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_rfq public.print_rfqs;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor);
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = p_rfq AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_FOUND'; END IF;
    IF p_action = 'CANCEL' THEN
        IF v_rfq.status NOT IN ('BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS') THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_OPEN'; END IF;
        UPDATE public.print_rfqs SET status = 'CANCELADO', updated_at = NOW() WHERE id = p_rfq;
    ELSIF p_action = 'REOPEN' THEN
        IF v_rfq.status IN ('AUTORIZADO', 'CERRADO') THEN RAISE EXCEPTION 'PRINT_RFQ_FINAL'; END IF;
        IF p_days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'PRINT_EXPIRY_INVALID'; END IF;
        UPDATE public.print_rfqs SET status = CASE WHEN EXISTS (SELECT 1 FROM public.print_rfq_invitations WHERE rfq_id = p_rfq) THEN
            CASE WHEN EXISTS (SELECT 1 FROM public.print_rfq_invitations WHERE rfq_id = p_rfq AND status = 'RESPONDIDO') THEN 'OFERTAS_RECIBIDAS' ELSE 'COTIZANDO' END
            ELSE 'BORRADOR' END, expires_at = NOW() + make_interval(days => p_days), updated_at = NOW() WHERE id = p_rfq;
        UPDATE public.print_rfq_invitations SET token_expires_at = NOW() + make_interval(days => p_days) WHERE rfq_id = p_rfq AND token_revoked_at IS NULL;
    ELSIF p_action = 'CLOSE_DISCOVERY' THEN
        IF v_rfq.purpose <> 'COST_DISCOVERY' OR v_rfq.closed_at IS NOT NULL OR v_rfq.status = 'AUTORIZADO' THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_OPEN'; END IF;
        UPDATE public.print_rfqs SET status = 'CERRADO', closed_at = NOW(), updated_at = NOW() WHERE id = p_rfq;
    ELSE
        RAISE EXCEPTION 'PRINT_ACTION_INVALID';
    END IF;
    PERFORM public.print_log(p_org, p_rfq, p_actor, 'rfq.' || lower(p_action), jsonb_build_object('days', p_days));
END $$;

-- Recibe una versión de presupuesto. Lo usa la imprenta (con su token) o una persona interna cargándola desde el documento.
CREATE OR REPLACE FUNCTION public.print_rfq_submit_version(p_token TEXT, p_offer JSONB, p_items JSONB, p_budget_file_id UUID, p_actor UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_inv public.print_rfq_invitations;
    v_rfq public.print_rfqs;
    v_quote UUID;
    v_version UUID;
    v_number INTEGER;
    v_item JSONB;
    v_ri public.print_rfq_items;
    v_price NUMERIC; v_avail NUMERIC; v_rate NUMERIC; v_lead INTEGER;
    v_total NUMERIC := 0;
    v_until TIMESTAMPTZ;
    v_snapshot JSONB;
BEGIN
    SELECT * INTO v_inv FROM public.print_rfq_invitations WHERE token = p_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_LINK_INVALID'; END IF;
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = v_inv.rfq_id AND organization_id = v_inv.organization_id FOR UPDATE;
    IF NOT FOUND OR v_inv.token_revoked_at IS NOT NULL OR v_inv.token_expires_at <= NOW() OR v_rfq.expires_at <= NOW()
       OR v_rfq.status NOT IN ('BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS') THEN
        RAISE EXCEPTION 'PRINT_LINK_CLOSED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.print_providers WHERE id = v_inv.provider_id AND organization_id = v_rfq.organization_id AND active) THEN RAISE EXCEPTION 'PRINT_PROVIDER_INVALID'; END IF;
    IF p_actor IS NOT NULL THEN PERFORM public.print_check_actor(v_rfq.organization_id, p_actor); END IF;
    IF p_budget_file_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.print_files WHERE id = p_budget_file_id AND kind = 'BUDGET' AND invitation_id = v_inv.id AND organization_id = v_rfq.organization_id)
       OR EXISTS (SELECT 1 FROM public.print_quote_versions WHERE budget_file_id = p_budget_file_id) THEN
        RAISE EXCEPTION 'PRINT_BUDGET_REQUIRED';
    END IF;

    v_until := (p_offer ->> 'valid_until')::TIMESTAMPTZ;
    IF v_until IS NULL OR v_until <= NOW() OR (p_offer ->> 'freight')::NUMERIC IS NULL OR (p_offer ->> 'freight')::NUMERIC NOT BETWEEN 0 AND 9999999999
       OR NULLIF(btrim(p_offer ->> 'payment_terms'), '') IS NULL OR NULLIF(btrim(p_offer ->> 'budget_number'), '') IS NULL
       OR (p_offer ->> 'currency') NOT IN ('PYG', 'USD', 'EUR', 'BRL', 'ARS') OR (p_offer ->> 'vat_included')::BOOLEAN IS NULL THEN
        RAISE EXCEPTION 'PRINT_OFFER_INVALID';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'PRINT_OFFER_INVALID'; END IF;
    IF (SELECT count(DISTINCT value ->> 'rfq_item_id') FROM jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) THEN RAISE EXCEPTION 'PRINT_OFFER_INVALID'; END IF;
    IF (SELECT count(*) FROM public.print_rfq_items WHERE rfq_id = v_rfq.id) <> jsonb_array_length(p_items) THEN RAISE EXCEPTION 'PRINT_OFFER_INCOMPLETE'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO v_ri FROM public.print_rfq_items WHERE id = (v_item ->> 'rfq_item_id')::UUID AND rfq_id = v_rfq.id AND organization_id = v_rfq.organization_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_OFFER_INVALID'; END IF;
        v_price := (v_item ->> 'unit_price')::NUMERIC; v_avail := (v_item ->> 'available_quantity')::NUMERIC;
        v_rate := (v_item ->> 'tax_rate')::NUMERIC; v_lead := (v_item ->> 'lead_time_days')::INTEGER;
        IF v_avail IS NULL OR v_avail NOT BETWEEN 0 AND 9999999999 OR v_rate IS NULL OR v_rate NOT BETWEEN 0 AND 100 OR v_lead IS NULL OR v_lead NOT BETWEEN 0 AND 3650
           OR v_avail <> round(v_avail, 4) OR v_rate <> round(v_rate, 4)
           OR (v_price IS NOT NULL AND (v_price NOT BETWEEN 0.0001 AND 9999999999 OR v_price <> round(v_price, 4)))
           OR (v_avail > 0 AND v_price IS NULL) THEN
            RAISE EXCEPTION 'PRINT_OFFER_INVALID';
        END IF;
        v_total := v_total + COALESCE(v_price, 0) * least(v_avail, v_ri.quantity) * (CASE WHEN (p_offer ->> 'vat_included')::BOOLEAN THEN 1 ELSE 1 + v_rate / 100 END);
    END LOOP;
    v_total := round(v_total + (p_offer ->> 'freight')::NUMERIC, 2);
    IF v_total <= 0 THEN RAISE EXCEPTION 'PRINT_OFFER_ZERO'; END IF;

    -- Qué arte vio la imprenta al cotizar: si el arte cambia después, esta oferta queda desactualizada.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('rfq_item_id', x.rfq_item_id, 'file_id', x.id, 'sha256', x.sha256, 'file_name', x.file_name) ORDER BY x.rfq_item_id), '[]'::jsonb)
      INTO v_snapshot FROM (SELECT DISTINCT ON (f.rfq_item_id) f.rfq_item_id, f.id, f.sha256, f.file_name FROM public.print_files f
        WHERE f.rfq_id = v_rfq.id AND f.kind = 'ART' ORDER BY f.rfq_item_id, f.created_at DESC, f.id DESC) x;

    SELECT id INTO v_quote FROM public.print_quotes WHERE invitation_id = v_inv.id;
    IF v_quote IS NULL THEN INSERT INTO public.print_quotes (organization_id, invitation_id) VALUES (v_rfq.organization_id, v_inv.id) RETURNING id INTO v_quote; END IF;
    SELECT COALESCE(max(version_number), 0) + 1 INTO v_number FROM public.print_quote_versions WHERE quote_id = v_quote;

    INSERT INTO public.print_quote_versions (organization_id, quote_id, version_number, budget_number, currency, vat_included, invoice_available, valid_until, freight,
        payment_terms, delivery_time, observations, total_price, budget_file_id, art_snapshot, submitted_by_profile_id)
    VALUES (v_rfq.organization_id, v_quote, v_number, btrim(p_offer ->> 'budget_number'), p_offer ->> 'currency', (p_offer ->> 'vat_included')::BOOLEAN,
        COALESCE((p_offer ->> 'invoice_available')::BOOLEAN, false), v_until, (p_offer ->> 'freight')::NUMERIC, btrim(p_offer ->> 'payment_terms'),
        NULLIF(btrim(COALESCE(p_offer ->> 'delivery_time', '')), ''), NULLIF(btrim(COALESCE(p_offer ->> 'observations', '')), ''), v_total, p_budget_file_id, v_snapshot, p_actor)
    RETURNING id INTO v_version;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.print_quote_version_items (organization_id, quote_version_id, rfq_item_id, unit_price, available_quantity, tax_rate, lead_time_days, observations)
        VALUES (v_rfq.organization_id, v_version, (v_item ->> 'rfq_item_id')::UUID, (v_item ->> 'unit_price')::NUMERIC, (v_item ->> 'available_quantity')::NUMERIC,
                (v_item ->> 'tax_rate')::NUMERIC, (v_item ->> 'lead_time_days')::INTEGER, NULLIF(btrim(COALESCE(v_item ->> 'observations', '')), ''));
    END LOOP;

    UPDATE public.print_rfq_invitations SET status = 'RESPONDIDO', responded_at = NOW() WHERE id = v_inv.id;
    UPDATE public.print_rfqs SET status = 'OFERTAS_RECIBIDAS', updated_at = NOW() WHERE id = v_rfq.id;
    PERFORM public.print_log(v_rfq.organization_id, v_rfq.id, p_actor, 'rfq.quote.version_submitted',
        jsonb_build_object('version_id', v_version, 'version_number', v_number, 'invitation_id', v_inv.id, 'budget_file_id', p_budget_file_id));
    RETURN jsonb_build_object('version_id', v_version, 'version_number', v_number, 'total_price', v_total);
END $$;

CREATE OR REPLACE FUNCTION public.print_rfq_review_quote(p_org UUID, p_actor UUID, p_version UUID, p_extraction JSONB, p_comparison JSONB, p_resolution TEXT) RETURNS UUID
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_rfq UUID; v_review UUID;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor);
    SELECT inv.rfq_id INTO v_rfq FROM public.print_quote_versions v JOIN public.print_quotes q ON q.id = v.quote_id
        JOIN public.print_rfq_invitations inv ON inv.id = q.invitation_id
        WHERE v.id = p_version AND v.organization_id = p_org AND q.organization_id = p_org AND inv.organization_id = p_org;
    IF v_rfq IS NULL THEN RAISE EXCEPTION 'PRINT_VERSION_NOT_FOUND'; END IF;
    IF length(btrim(COALESCE(p_resolution, ''))) < 10 THEN RAISE EXCEPTION 'PRINT_RESOLUTION_REQUIRED'; END IF;
    PERFORM 1 FROM public.print_rfqs WHERE id = v_rfq FOR UPDATE;
    INSERT INTO public.print_quote_reviews (organization_id, quote_version_id, extraction, comparison, resolution, reviewed_by_profile_id)
    VALUES (p_org, p_version, p_extraction, p_comparison, btrim(p_resolution), p_actor) RETURNING id INTO v_review;
    PERFORM public.print_log(p_org, v_rfq, p_actor, 'rfq.quote.reviewed', jsonb_build_object('review_id', v_review, 'version_id', p_version));
    RETURN v_review;
END $$;

-- Resuelve cada precio, cantidad, proveedor y condición desde la base; nunca desde valores del cliente.
CREATE OR REPLACE FUNCTION public.print_resolve_allocation(p_rfq public.print_rfqs, p_lines JSONB) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_line JSONB;
    v_fact RECORD;
    v_result JSONB := '[]'::jsonb;
    v_qty NUMERIC;
    v_current_art UUID;
    v_snap_art UUID;
BEGIN
    IF p_rfq.purpose IS DISTINCT FROM 'PROCUREMENT' OR p_rfq.status NOT IN ('OFERTAS_RECIBIDAS', 'COTIZANDO') THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_PURCHASABLE'; END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PRINT_ALLOCATION_INVALID'; END IF;
    IF (SELECT count(DISTINCT value ->> 'quote_version_item_id') FROM jsonb_array_elements(p_lines)) <> jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'PRINT_ALLOCATION_DUPLICATE'; END IF;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty := (v_line ->> 'quantity')::NUMERIC;
        SELECT vi.id AS quote_version_item_id, vi.rfq_item_id, vi.unit_price, vi.available_quantity, vi.tax_rate, vi.lead_time_days,
               i.sku, i.description AS product, i.unit, i.quantity AS requested_quantity,
               v.id AS quote_version_id, v.version_number, v.currency, v.vat_included, v.freight, v.payment_terms, v.valid_until, v.budget_file_id, v.art_snapshot,
               inv.id AS invitation_id, inv.provider_id, pr.name AS provider_name,
               (SELECT x.id FROM public.print_quote_reviews x WHERE x.quote_version_id = v.id AND x.organization_id = p_rfq.organization_id ORDER BY x.reviewed_at DESC, x.id LIMIT 1) AS review_id
          INTO v_fact
          FROM public.print_quote_version_items vi
          JOIN public.print_rfq_items i ON i.id = vi.rfq_item_id AND i.rfq_id = p_rfq.id AND i.organization_id = p_rfq.organization_id
          JOIN public.print_quote_versions v ON v.id = vi.quote_version_id AND v.organization_id = p_rfq.organization_id
          JOIN public.print_quotes q ON q.id = v.quote_id AND q.organization_id = p_rfq.organization_id
          JOIN public.print_rfq_invitations inv ON inv.id = q.invitation_id AND inv.rfq_id = p_rfq.id AND inv.organization_id = p_rfq.organization_id
          JOIN public.print_providers pr ON pr.id = inv.provider_id AND pr.organization_id = p_rfq.organization_id AND pr.active
         WHERE vi.id = (v_line ->> 'quote_version_item_id')::UUID AND vi.organization_id = p_rfq.organization_id AND inv.token_revoked_at IS NULL
           AND v.version_number = (SELECT max(version_number) FROM public.print_quote_versions WHERE quote_id = q.id);
        IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_QUOTE_NOT_FOUND'; END IF;
        IF v_qty IS NULL OR v_qty NOT BETWEEN 0.0001 AND 9999999999 OR v_qty <> round(v_qty, 4) OR v_fact.unit_price IS NULL OR v_fact.unit_price <= 0
           OR v_qty > v_fact.available_quantity OR v_fact.valid_until <= NOW() OR v_fact.review_id IS NULL THEN
            RAISE EXCEPTION 'PRINT_QUOTE_NOT_ELIGIBLE';
        END IF;
        -- La imprenta debe haber cotizado el arte vigente.
        SELECT f.id INTO v_current_art FROM public.print_files f WHERE f.rfq_item_id = v_fact.rfq_item_id AND f.kind = 'ART' ORDER BY f.created_at DESC, f.id DESC LIMIT 1;
        SELECT (e ->> 'file_id')::UUID INTO v_snap_art FROM jsonb_array_elements(v_fact.art_snapshot) e WHERE e ->> 'rfq_item_id' = v_fact.rfq_item_id::TEXT;
        IF v_current_art IS DISTINCT FROM v_snap_art THEN RAISE EXCEPTION 'PRINT_QUOTE_ART_STALE'; END IF;
        v_result := v_result || jsonb_build_array(to_jsonb(v_fact) - 'art_snapshot' || jsonb_build_object(
            'art_file_id', v_current_art, 'quantity', v_qty, 'net', round(v_qty * v_fact.unit_price, 2),
            'tax', CASE WHEN v_fact.vat_included THEN round(v_qty * v_fact.unit_price * v_fact.tax_rate / (100 + v_fact.tax_rate), 2) ELSE round(v_qty * v_fact.unit_price * v_fact.tax_rate / 100, 2) END,
            'total', round(v_qty * v_fact.unit_price * (CASE WHEN v_fact.vat_included THEN 1 ELSE 1 + v_fact.tax_rate / 100 END), 2),
            'expected_delivery_date', current_date + v_fact.lead_time_days));
    END LOOP;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_result) l GROUP BY l ->> 'rfq_item_id'
               HAVING sum((l ->> 'quantity')::NUMERIC) > max((l ->> 'requested_quantity')::NUMERIC)) THEN
        RAISE EXCEPTION 'PRINT_ALLOCATION_OVER';
    END IF;
    RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.print_rfq_save_allocation(p_org UUID, p_actor UUID, p_rfq UUID, p_lines JSONB, p_justification TEXT, p_expected_revision INTEGER) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_rfq public.print_rfqs; v_revision INTEGER; v_resolved JSONB; v_id UUID;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor);
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = p_rfq AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_RFQ_NOT_FOUND'; END IF;
    IF length(btrim(COALESCE(p_justification, ''))) < 10 THEN RAISE EXCEPTION 'PRINT_JUSTIFICATION_REQUIRED'; END IF;
    SELECT COALESCE(max(revision), 0) INTO v_revision FROM public.print_allocations WHERE rfq_id = v_rfq.id;
    IF v_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'PRINT_ALLOCATION_CHANGED'; END IF;
    IF EXISTS (SELECT 1 FROM public.print_allocations WHERE rfq_id = v_rfq.id AND confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'PRINT_ALLOCATION_CONFIRMED'; END IF;
    v_resolved := public.print_resolve_allocation(v_rfq, p_lines);
    INSERT INTO public.print_allocations (organization_id, rfq_id, revision, lines, justification, created_by_profile_id)
    VALUES (p_org, v_rfq.id, v_revision + 1, v_resolved, btrim(p_justification), p_actor) RETURNING id INTO v_id;
    PERFORM public.print_log(p_org, v_rfq.id, p_actor, 'rfq.allocation.saved', jsonb_build_object('allocation_id', v_id, 'revision', v_revision + 1));
    RETURN jsonb_build_object('id', v_id, 'revision', v_revision + 1);
END $$;

-- Autorizar y confirmar compromisos de compra es solo de administradores.
CREATE OR REPLACE FUNCTION public.print_rfq_authorize_allocation(p_org UUID, p_actor UUID, p_allocation UUID, p_confirm BOOLEAN) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_a public.print_allocations; v_rfq public.print_rfqs; v_resolved JSONB;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor, true);
    IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'PRINT_CONFIRMATION_REQUIRED'; END IF;
    SELECT * INTO v_a FROM public.print_allocations WHERE id = p_allocation AND organization_id = p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_ALLOCATION_NOT_FOUND'; END IF;
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = v_a.rfq_id AND organization_id = p_org FOR UPDATE;
    IF v_a.revision <> (SELECT max(revision) FROM public.print_allocations WHERE rfq_id = v_rfq.id) THEN RAISE EXCEPTION 'PRINT_ALLOCATION_OBSOLETE'; END IF;
    v_resolved := public.print_resolve_allocation(v_rfq, v_a.lines);
    IF v_resolved IS DISTINCT FROM v_a.lines THEN RAISE EXCEPTION 'PRINT_ALLOCATION_CHANGED'; END IF;
    IF v_a.authorized_at IS NULL THEN
        UPDATE public.print_allocations SET authorized_by_profile_id = p_actor, authorized_at = NOW() WHERE id = v_a.id;
        PERFORM public.print_log(p_org, v_rfq.id, p_actor, 'rfq.allocation.authorized', jsonb_build_object('allocation_id', v_a.id));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.print_rfq_preview_orders(p_org UUID, p_actor UUID, p_allocation UUID) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_a public.print_allocations; v_rfq public.print_rfqs; v_resolved JSONB; v_orders JSONB; v_hash TEXT;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor, true);
    SELECT * INTO v_a FROM public.print_allocations WHERE id = p_allocation AND organization_id = p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_ALLOCATION_NOT_FOUND'; END IF;
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = v_a.rfq_id AND organization_id = p_org FOR UPDATE;
    IF v_a.authorized_at IS NULL OR v_a.confirmed_at IS NOT NULL OR v_a.revision <> (SELECT max(revision) FROM public.print_allocations WHERE rfq_id = v_rfq.id) THEN
        RAISE EXCEPTION 'PRINT_ALLOCATION_NOT_AUTHORIZED';
    END IF;
    v_resolved := public.print_resolve_allocation(v_rfq, v_a.lines);
    IF v_resolved IS DISTINCT FROM v_a.lines THEN RAISE EXCEPTION 'PRINT_ALLOCATION_CHANGED'; END IF;
    SELECT jsonb_agg(x.doc ORDER BY x.doc ->> 'provider_id', x.doc ->> 'currency') INTO v_orders FROM (
        SELECT jsonb_build_object('provider_id', l ->> 'provider_id', 'provider_name', max(l ->> 'provider_name'), 'currency', l ->> 'currency',
            'quote_version_id', max(l ->> 'quote_version_id'), 'vat_included', bool_and((l ->> 'vat_included')::BOOLEAN),
            'freight', max((l ->> 'freight')::NUMERIC), 'payment_terms', max(l ->> 'payment_terms'), 'valid_until', min(l ->> 'valid_until'),
            'rfq_id', v_rfq.id, 'allocation_id', v_a.id,
            'items', jsonb_agg(l ORDER BY l ->> 'rfq_item_id', l ->> 'quote_version_item_id'),
            'line_total', sum((l ->> 'total')::NUMERIC), 'tax_total', sum((l ->> 'tax')::NUMERIC),
            'total', sum((l ->> 'total')::NUMERIC) + max((l ->> 'freight')::NUMERIC)) AS doc
          FROM jsonb_array_elements(v_resolved) l GROUP BY l ->> 'provider_id', l ->> 'currency') x;
    v_hash := encode(sha256(convert_to(v_orders::TEXT, 'UTF8')), 'hex');
    UPDATE public.print_allocations SET preview = v_orders, preview_hash = v_hash WHERE id = v_a.id;
    PERFORM public.print_log(p_org, v_rfq.id, p_actor, 'rfq.orders.previewed', jsonb_build_object('allocation_id', v_a.id, 'hash', v_hash));
    RETURN jsonb_build_object('allocation_id', v_a.id, 'hash', v_hash, 'orders', v_orders);
END $$;

CREATE OR REPLACE FUNCTION public.print_rfq_confirm_orders(p_org UUID, p_actor UUID, p_allocation UUID, p_hash TEXT, p_confirm BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_a public.print_allocations; v_rfq public.print_rfqs; v_fresh JSONB; v_doc JSONB; v_item JSONB;
    v_order UUID; v_ids JSONB := '[]'::jsonb; v_next INTEGER;
BEGIN
    PERFORM public.print_check_actor(p_org, p_actor, true);
    IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'PRINT_CONFIRMATION_REQUIRED'; END IF;
    SELECT * INTO v_a FROM public.print_allocations WHERE id = p_allocation AND organization_id = p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRINT_ALLOCATION_NOT_FOUND'; END IF;
    SELECT * INTO v_rfq FROM public.print_rfqs WHERE id = v_a.rfq_id AND organization_id = p_org FOR UPDATE;
    SELECT * INTO v_a FROM public.print_allocations WHERE id = p_allocation;
    IF v_a.preview_hash IS NULL OR v_a.preview_hash IS DISTINCT FROM p_hash OR v_a.authorized_at IS NULL THEN RAISE EXCEPTION 'PRINT_PREVIEW_INVALID'; END IF;
    IF v_a.confirmed_at IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(id ORDER BY code), '[]'::jsonb) INTO v_ids FROM public.print_purchase_orders WHERE allocation_id = v_a.id;
        RETURN jsonb_build_object('order_ids', v_ids, 'already_confirmed', true);
    END IF;
    IF v_a.revision <> (SELECT max(revision) FROM public.print_allocations WHERE rfq_id = v_rfq.id) THEN RAISE EXCEPTION 'PRINT_ALLOCATION_OBSOLETE'; END IF;
    v_fresh := public.print_rfq_preview_orders(p_org, p_actor, v_a.id);
    IF v_fresh ->> 'hash' IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'PRINT_PREVIEW_CHANGED'; END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::TEXT || ':print_po_code', 0));
    SELECT COALESCE(MAX(substring(code FROM 5)::INTEGER), 0) INTO v_next FROM public.print_purchase_orders WHERE organization_id = p_org AND code ~ '^OCI-[0-9]+$';
    FOR v_doc IN SELECT * FROM jsonb_array_elements(v_a.preview) LOOP
        v_next := v_next + 1;
        INSERT INTO public.print_purchase_orders (organization_id, code, rfq_id, allocation_id, provider_id, provider_name, quote_version_id, currency, vat_included, freight,
            payment_terms, tax_total, total, justification, snapshot, authorized_by_profile_id, confirmed_by_profile_id)
        VALUES (p_org, 'OCI-' || lpad(v_next::TEXT, 4, '0'), v_rfq.id, v_a.id, (v_doc ->> 'provider_id')::UUID, v_doc ->> 'provider_name', (v_doc ->> 'quote_version_id')::UUID,
            v_doc ->> 'currency', (v_doc ->> 'vat_included')::BOOLEAN, (v_doc ->> 'freight')::NUMERIC, v_doc ->> 'payment_terms', (v_doc ->> 'tax_total')::NUMERIC,
            (v_doc ->> 'total')::NUMERIC, v_a.justification, v_doc, v_a.authorized_by_profile_id, p_actor)
        RETURNING id INTO v_order;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_doc -> 'items') LOOP
            INSERT INTO public.print_purchase_order_items (organization_id, order_id, rfq_item_id, quote_version_item_id, sku, description, art_file_id, quantity, unit, unit_price,
                tax_rate, total, expected_delivery_date)
            VALUES (p_org, v_order, (v_item ->> 'rfq_item_id')::UUID, (v_item ->> 'quote_version_item_id')::UUID, v_item ->> 'sku', v_item ->> 'product',
                NULLIF(v_item ->> 'art_file_id', '')::UUID, (v_item ->> 'quantity')::NUMERIC, v_item ->> 'unit', (v_item ->> 'unit_price')::NUMERIC,
                (v_item ->> 'tax_rate')::NUMERIC, (v_item ->> 'total')::NUMERIC, NULLIF(v_item ->> 'expected_delivery_date', '')::DATE);
        END LOOP;
        v_ids := v_ids || jsonb_build_array(v_order);
    END LOOP;
    UPDATE public.print_allocations SET confirmed_by_profile_id = p_actor, confirmed_at = NOW() WHERE id = v_a.id;
    UPDATE public.print_rfqs SET status = 'AUTORIZADO', updated_at = NOW() WHERE id = v_rfq.id;
    PERFORM public.print_log(p_org, v_rfq.id, p_actor, 'rfq.orders.confirmed', jsonb_build_object('allocation_id', v_a.id, 'preview_hash', p_hash, 'order_ids', v_ids));
    RETURN jsonb_build_object('order_ids', v_ids, 'already_confirmed', false);
END $$;

DO $$
DECLARE v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'print_check_actor(uuid,uuid,boolean)', 'print_log(uuid,uuid,uuid,text,jsonb)', 'print_rfq_create(uuid,uuid,jsonb,jsonb)',
        'print_store_file(uuid,uuid,jsonb,text)', 'print_rfq_invite(uuid,uuid,uuid,uuid[])', 'print_rfq_link(uuid,uuid,uuid,uuid,text)',
        'print_rfq_transition(uuid,uuid,uuid,text,integer)', 'print_rfq_submit_version(text,jsonb,jsonb,uuid,uuid)',
        'print_rfq_review_quote(uuid,uuid,uuid,jsonb,jsonb,text)', 'print_resolve_allocation(print_rfqs,jsonb)',
        'print_rfq_save_allocation(uuid,uuid,uuid,jsonb,text,integer)', 'print_rfq_authorize_allocation(uuid,uuid,uuid,boolean)',
        'print_rfq_preview_orders(uuid,uuid,uuid)', 'print_rfq_confirm_orders(uuid,uuid,uuid,text,boolean)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', v_sig);
    END LOOP;
END $$;
