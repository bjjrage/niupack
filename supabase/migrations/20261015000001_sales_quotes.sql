-- Presupuestos a clientes y Órdenes de Trabajo (OT).
-- Flujo de la función "cotizar" de Control de Facturas (leída en solo lectura), con el formato del presupuesto de NIUPACK:
-- ítems con varias escalas de cantidad, precio con IVA incluido, condiciones y firma. Al aceptarse, el presupuesto genera la OT.
-- Aditivo. Acceso solo por service_role desde rutas del servidor que validan sesión, organización y rol.

CREATE TABLE IF NOT EXISTS public.sales_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL CHECK (btrim(client_name) <> ''),
    attention TEXT,
    subject TEXT,
    intro TEXT,
    payment_terms TEXT NOT NULL DEFAULT 'A convenir',
    delivery_terms TEXT NOT NULL DEFAULT 'A convenir',
    notes TEXT,
    quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    currency TEXT NOT NULL DEFAULT 'PYG' CHECK (currency IN ('PYG', 'USD')),
    signer_name TEXT,
    signer_title TEXT,
    signer_company TEXT,
    status TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO')),
    version INTEGER NOT NULL DEFAULT 1,
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    accepted_by_name TEXT,
    acceptance_note TEXT,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS sales_quotes_org_idx ON public.sales_quotes (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_quote_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    item_no INTEGER NOT NULL CHECK (item_no > 0),
    sort_order INTEGER NOT NULL,
    sku TEXT,
    product_attribute_id UUID REFERENCES public.product_attributes(id) ON DELETE SET NULL,
    description TEXT NOT NULL CHECK (btrim(description) <> ''),
    quantity NUMERIC(18, 4) CHECK (quantity IS NULL OR quantity > 0),
    unit_price NUMERIC(18, 4) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(18, 2)
);
CREATE INDEX IF NOT EXISTS sales_quote_lines_quote_idx ON public.sales_quote_lines (quote_id, sort_order);
-- Un mismo ítem puede repetirse con escalas distintas, pero no con la misma cantidad.
CREATE UNIQUE INDEX IF NOT EXISTS sales_quote_lines_tier_idx ON public.sales_quote_lines (quote_id, item_no, quantity) WHERE quantity IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sales_work_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    quote_id UUID NOT NULL UNIQUE REFERENCES public.sales_quotes(id),
    quote_version INTEGER NOT NULL,
    company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'CANCELADA')),
    notes TEXT,
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.sales_work_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    work_order_id UUID NOT NULL REFERENCES public.sales_work_orders(id) ON DELETE CASCADE,
    quote_line_id UUID NOT NULL REFERENCES public.sales_quote_lines(id),
    item_no INTEGER NOT NULL,
    sku TEXT,
    description TEXT NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL,
    unit_price NUMERIC(18, 4) NOT NULL,
    line_total NUMERIC(18, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sales_quote_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sales_quote_events_quote_idx ON public.sales_quote_events (quote_id, created_at DESC);

DO $$
DECLARE v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['sales_quotes', 'sales_quote_lines', 'sales_work_orders', 'sales_work_order_items', 'sales_quote_events'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', v_table);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sales_quote_log(p_org UUID, p_quote UUID, p_actor UUID, p_event TEXT, p_detail JSONB DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE sql SET search_path = pg_catalog, public AS $$
    INSERT INTO public.sales_quote_events (organization_id, quote_id, actor_profile_id, event, detail) VALUES (p_org, p_quote, p_actor, p_event, COALESCE(p_detail, '{}'::jsonb));
$$;

-- Crea o reemplaza un presupuesto en borrador con todas sus líneas, en una sola transacción.
CREATE OR REPLACE FUNCTION public.sales_quote_save(p_org UUID, p_actor UUID, p_quote UUID, p_header JSONB, p_lines JSONB) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_quote public.sales_quotes;
    v_line JSONB;
    v_idx INTEGER := 0;
    v_next INTEGER;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_attr UUID;
    v_company UUID := NULLIF(p_header ->> 'company_id', '')::UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND organization_id = p_org AND role IN ('admin', 'analyst')) THEN RAISE EXCEPTION 'SQ_ACTOR_NOT_ALLOWED'; END IF;
    IF NULLIF(btrim(p_header ->> 'client_name'), '') IS NULL THEN RAISE EXCEPTION 'SQ_CLIENT_REQUIRED'; END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SQ_LINES_INVALID'; END IF;
    IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crm_companies WHERE id = v_company AND organization_id = p_org) THEN RAISE EXCEPTION 'SQ_COMPANY_NOT_FOUND'; END IF;

    IF p_quote IS NULL THEN
        PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::TEXT || ':sales_quote_code', 0));
        SELECT COALESCE(MAX(substring(code FROM 5)::INTEGER), 0) + 1 INTO v_next FROM public.sales_quotes WHERE organization_id = p_org AND code ~ '^PRE-[0-9]+$';
        INSERT INTO public.sales_quotes (organization_id, code, company_id, client_name, attention, subject, intro, payment_terms, delivery_terms, notes, quote_date, valid_until, currency,
            signer_name, signer_title, signer_company, created_by_profile_id)
        VALUES (p_org, 'PRE-' || lpad(v_next::TEXT, 4, '0'), v_company, btrim(p_header ->> 'client_name'), NULLIF(btrim(COALESCE(p_header ->> 'attention', '')), ''),
            NULLIF(btrim(COALESCE(p_header ->> 'subject', '')), ''), NULLIF(btrim(COALESCE(p_header ->> 'intro', '')), ''),
            COALESCE(NULLIF(btrim(p_header ->> 'payment_terms'), ''), 'A convenir'), COALESCE(NULLIF(btrim(p_header ->> 'delivery_terms'), ''), 'A convenir'),
            NULLIF(btrim(COALESCE(p_header ->> 'notes', '')), ''), COALESCE(NULLIF(p_header ->> 'quote_date', '')::DATE, CURRENT_DATE), NULLIF(p_header ->> 'valid_until', '')::DATE,
            COALESCE(NULLIF(p_header ->> 'currency', ''), 'PYG'), NULLIF(btrim(COALESCE(p_header ->> 'signer_name', '')), ''), NULLIF(btrim(COALESCE(p_header ->> 'signer_title', '')), ''),
            NULLIF(btrim(COALESCE(p_header ->> 'signer_company', '')), ''), p_actor)
        RETURNING * INTO v_quote;
        PERFORM public.sales_quote_log(p_org, v_quote.id, p_actor, 'quote.created');
    ELSE
        SELECT * INTO v_quote FROM public.sales_quotes WHERE id = p_quote AND organization_id = p_org FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'SQ_NOT_FOUND'; END IF;
        IF v_quote.status <> 'BORRADOR' THEN RAISE EXCEPTION 'SQ_NOT_EDITABLE'; END IF;
        UPDATE public.sales_quotes SET company_id = v_company, client_name = btrim(p_header ->> 'client_name'), attention = NULLIF(btrim(COALESCE(p_header ->> 'attention', '')), ''),
            subject = NULLIF(btrim(COALESCE(p_header ->> 'subject', '')), ''), intro = NULLIF(btrim(COALESCE(p_header ->> 'intro', '')), ''),
            payment_terms = COALESCE(NULLIF(btrim(p_header ->> 'payment_terms'), ''), 'A convenir'), delivery_terms = COALESCE(NULLIF(btrim(p_header ->> 'delivery_terms'), ''), 'A convenir'),
            notes = NULLIF(btrim(COALESCE(p_header ->> 'notes', '')), ''), quote_date = COALESCE(NULLIF(p_header ->> 'quote_date', '')::DATE, quote_date), valid_until = NULLIF(p_header ->> 'valid_until', '')::DATE,
            currency = COALESCE(NULLIF(p_header ->> 'currency', ''), 'PYG'), signer_name = NULLIF(btrim(COALESCE(p_header ->> 'signer_name', '')), ''),
            signer_title = NULLIF(btrim(COALESCE(p_header ->> 'signer_title', '')), ''), signer_company = NULLIF(btrim(COALESCE(p_header ->> 'signer_company', '')), ''), updated_at = NOW()
          WHERE id = v_quote.id RETURNING * INTO v_quote;
        DELETE FROM public.sales_quote_lines WHERE quote_id = v_quote.id;
        PERFORM public.sales_quote_log(p_org, v_quote.id, p_actor, 'quote.updated', jsonb_build_object('version', v_quote.version));
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
        v_price := (v_line ->> 'unit_price')::NUMERIC;
        IF NULLIF(btrim(v_line ->> 'description'), '') IS NULL OR v_price IS NULL OR v_price < 0 OR v_price > 9999999999
           OR (v_qty IS NOT NULL AND v_qty NOT BETWEEN 0.0001 AND 9999999999) OR (v_line ->> 'item_no')::INTEGER IS NULL OR (v_line ->> 'item_no')::INTEGER < 1 THEN
            RAISE EXCEPTION 'SQ_LINE_INVALID';
        END IF;
        v_attr := NULL;
        IF NULLIF(v_line ->> 'product_attribute_id', '') IS NOT NULL THEN
            SELECT pa.id INTO v_attr FROM public.product_attributes pa JOIN public.products pr ON pr.id = pa.product_id
                WHERE pa.id = (v_line ->> 'product_attribute_id')::UUID AND pr.organization_id = p_org;
            IF v_attr IS NULL THEN RAISE EXCEPTION 'SQ_SKU_NOT_FOUND'; END IF;
        END IF;
        INSERT INTO public.sales_quote_lines (organization_id, quote_id, item_no, sort_order, sku, product_attribute_id, description, quantity, unit_price, line_total)
        VALUES (p_org, v_quote.id, (v_line ->> 'item_no')::INTEGER, v_idx, NULLIF(btrim(COALESCE(v_line ->> 'sku', '')), ''), v_attr, btrim(v_line ->> 'description'), v_qty, v_price,
                CASE WHEN v_qty IS NULL THEN NULL ELSE round(v_qty * v_price, 2) END);
        v_idx := v_idx + 1;
    END LOOP;
    RETURN jsonb_build_object('id', v_quote.id, 'code', v_quote.code, 'version', v_quote.version);
END $$;

CREATE OR REPLACE FUNCTION public.sales_quote_transition(p_org UUID, p_actor UUID, p_quote UUID, p_action TEXT, p_note TEXT DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_quote public.sales_quotes;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND organization_id = p_org AND role IN ('admin', 'analyst')) THEN RAISE EXCEPTION 'SQ_ACTOR_NOT_ALLOWED'; END IF;
    SELECT * INTO v_quote FROM public.sales_quotes WHERE id = p_quote AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SQ_NOT_FOUND'; END IF;
    IF p_action = 'SEND' THEN
        IF v_quote.status <> 'BORRADOR' THEN RAISE EXCEPTION 'SQ_INVALID_STATE'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sales_quote_lines WHERE quote_id = p_quote) THEN RAISE EXCEPTION 'SQ_LINES_INVALID'; END IF;
        UPDATE public.sales_quotes SET status = 'ENVIADO', sent_at = NOW(), updated_at = NOW() WHERE id = p_quote;
    ELSIF p_action = 'REOPEN' THEN
        IF v_quote.status NOT IN ('ENVIADO', 'RECHAZADO') THEN RAISE EXCEPTION 'SQ_INVALID_STATE'; END IF;
        UPDATE public.sales_quotes SET status = 'BORRADOR', version = version + 1, sent_at = NULL, rejected_at = NULL, rejection_reason = NULL, updated_at = NOW() WHERE id = p_quote;
    ELSIF p_action = 'REJECT' THEN
        IF v_quote.status <> 'ENVIADO' THEN RAISE EXCEPTION 'SQ_INVALID_STATE'; END IF;
        UPDATE public.sales_quotes SET status = 'RECHAZADO', rejected_at = NOW(), rejection_reason = NULLIF(btrim(COALESCE(p_note, '')), ''), updated_at = NOW() WHERE id = p_quote;
    ELSIF p_action = 'VOID' THEN
        IF v_quote.status NOT IN ('BORRADOR', 'ENVIADO', 'RECHAZADO') THEN RAISE EXCEPTION 'SQ_INVALID_STATE'; END IF;
        UPDATE public.sales_quotes SET status = 'ANULADO', updated_at = NOW() WHERE id = p_quote;
    ELSE
        RAISE EXCEPTION 'SQ_ACTION_INVALID';
    END IF;
    PERFORM public.sales_quote_log(p_org, p_quote, p_actor, 'quote.' || lower(p_action), jsonb_build_object('note', p_note));
END $$;

-- El cliente aceptó: se eligen las líneas aceptadas (una escala por ítem) y se genera la OT en la misma transacción.
CREATE OR REPLACE FUNCTION public.sales_quote_accept(p_org UUID, p_actor UUID, p_quote UUID, p_line_ids UUID[], p_acceptor TEXT, p_note TEXT DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    v_quote public.sales_quotes;
    v_wo UUID;
    v_next INTEGER;
    v_code TEXT;
    v_count INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND organization_id = p_org AND role IN ('admin', 'analyst')) THEN RAISE EXCEPTION 'SQ_ACTOR_NOT_ALLOWED'; END IF;
    SELECT * INTO v_quote FROM public.sales_quotes WHERE id = p_quote AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SQ_NOT_FOUND'; END IF;
    IF v_quote.status <> 'ENVIADO' THEN RAISE EXCEPTION 'SQ_INVALID_STATE'; END IF;
    IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN RAISE EXCEPTION 'SQ_EXPIRED'; END IF;
    IF NULLIF(btrim(COALESCE(p_acceptor, '')), '') IS NULL THEN RAISE EXCEPTION 'SQ_ACCEPTOR_REQUIRED'; END IF;
    IF p_line_ids IS NULL OR cardinality(p_line_ids) = 0 THEN RAISE EXCEPTION 'SQ_ACCEPT_LINES_REQUIRED'; END IF;
    SELECT count(*) INTO v_count FROM public.sales_quote_lines WHERE quote_id = p_quote AND organization_id = p_org AND id = ANY (p_line_ids) AND quantity IS NOT NULL;
    IF v_count <> cardinality(p_line_ids) THEN RAISE EXCEPTION 'SQ_ACCEPT_LINES_INVALID'; END IF;
    IF EXISTS (SELECT 1 FROM public.sales_quote_lines WHERE id = ANY (p_line_ids) GROUP BY item_no HAVING count(*) > 1) THEN RAISE EXCEPTION 'SQ_ACCEPT_ONE_TIER'; END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::TEXT || ':sales_wo_code', 0));
    SELECT COALESCE(MAX(substring(code FROM 4)::INTEGER), 0) + 1 INTO v_next FROM public.sales_work_orders WHERE organization_id = p_org AND code ~ '^OT-[0-9]+$';
    v_code := 'OT-' || lpad(v_next::TEXT, 4, '0');
    INSERT INTO public.sales_work_orders (organization_id, code, quote_id, quote_version, company_id, client_name, notes, created_by_profile_id)
    VALUES (p_org, v_code, p_quote, v_quote.version, v_quote.company_id, v_quote.client_name, NULLIF(btrim(COALESCE(p_note, '')), ''), p_actor) RETURNING id INTO v_wo;
    INSERT INTO public.sales_work_order_items (organization_id, work_order_id, quote_line_id, item_no, sku, description, quantity, unit_price, line_total)
        SELECT p_org, v_wo, l.id, l.item_no, l.sku, l.description, l.quantity, l.unit_price, l.line_total
          FROM public.sales_quote_lines l WHERE l.quote_id = p_quote AND l.id = ANY (p_line_ids) ORDER BY l.sort_order;
    UPDATE public.sales_quotes SET status = 'ACEPTADO', accepted_at = NOW(), accepted_by_name = btrim(p_acceptor), acceptance_note = NULLIF(btrim(COALESCE(p_note, '')), ''), updated_at = NOW() WHERE id = p_quote;
    PERFORM public.sales_quote_log(p_org, p_quote, p_actor, 'quote.accepted', jsonb_build_object('work_order_id', v_wo, 'work_order_code', v_code, 'lines', to_jsonb(p_line_ids), 'acceptor', p_acceptor));
    RETURN jsonb_build_object('work_order_id', v_wo, 'work_order_code', v_code);
END $$;

CREATE OR REPLACE FUNCTION public.sales_work_order_status(p_org UUID, p_actor UUID, p_id UUID, p_status TEXT) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_wo public.sales_work_orders;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND organization_id = p_org AND role IN ('admin', 'analyst')) THEN RAISE EXCEPTION 'SQ_ACTOR_NOT_ALLOWED'; END IF;
    SELECT * INTO v_wo FROM public.sales_work_orders WHERE id = p_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SQ_WORK_ORDER_NOT_FOUND'; END IF;
    IF p_status NOT IN ('PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'CANCELADA') OR v_wo.status IN ('COMPLETADA', 'CANCELADA') THEN RAISE EXCEPTION 'SQ_INVALID_STATE'; END IF;
    UPDATE public.sales_work_orders SET status = p_status, updated_at = NOW() WHERE id = p_id;
    PERFORM public.sales_quote_log(p_org, v_wo.quote_id, p_actor, 'work_order.status', jsonb_build_object('status', p_status, 'code', v_wo.code));
END $$;

DO $$
DECLARE v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY['sales_quote_log(uuid,uuid,uuid,text,jsonb)', 'sales_quote_save(uuid,uuid,uuid,jsonb,jsonb)', 'sales_quote_transition(uuid,uuid,uuid,text,text)',
        'sales_quote_accept(uuid,uuid,uuid,uuid[],text,text)', 'sales_work_order_status(uuid,uuid,uuid,text)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', v_sig);
    END LOOP;
END $$;
