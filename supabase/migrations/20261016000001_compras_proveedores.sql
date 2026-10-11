-- Compras: el registro de imprentas pasa a ser un registro de proveedores con tipo, y la solicitud de cotización sirve para
-- cualquier producto o servicio. El SKU y el arte dejan de ser obligatorios: solo se exigen si la solicitud "requiere arte".
-- Aditivo y retrocompatible: lo ya cargado queda como IMPRENTA y con arte requerido, como se creó.

ALTER TABLE public.print_providers
    ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'IMPRENTA'
        CHECK (provider_type IN ('IMPRENTA', 'MATERIA_PRIMA', 'SERVICIO', 'OTRO'));
ALTER TABLE public.print_providers ALTER COLUMN provider_type SET DEFAULT 'OTRO';

ALTER TABLE public.print_rfqs ADD COLUMN IF NOT EXISTS requires_art BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.print_rfqs ALTER COLUMN requires_art SET DEFAULT false;

ALTER TABLE public.print_rfq_items ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE public.print_purchase_order_items ALTER COLUMN sku DROP NOT NULL;

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

    INSERT INTO public.print_rfqs (organization_id, code, purpose, title, specifications, required_date, expires_at, requires_art, created_by_profile_id)
    VALUES (p_org, 'IMP-' || lpad(v_next::TEXT, 4, '0'), p_header ->> 'purpose', btrim(p_header ->> 'title'), NULLIF(btrim(COALESCE(p_header ->> 'specifications', '')), ''),
            NULLIF(p_header ->> 'required_date', '')::DATE, v_expires, COALESCE((p_header ->> 'requires_art')::BOOLEAN, false), p_actor)
    RETURNING * INTO v_rfq;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        IF NULLIF(btrim(v_item ->> 'description'), '') IS NULL OR NULLIF(btrim(v_item ->> 'unit'), '') IS NULL
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
        VALUES (p_org, v_rfq.id, v_idx, NULLIF(btrim(COALESCE(v_item ->> 'sku', '')), ''), v_attr, btrim(v_item ->> 'description'), (v_item ->> 'quantity')::NUMERIC,
                btrim(v_item ->> 'unit'), COALESCE(v_item -> 'print_spec', '{}'::jsonb));
        v_idx := v_idx + 1;
    END LOOP;

    PERFORM public.print_log(p_org, v_rfq.id, p_actor, 'rfq.created', jsonb_build_object('purpose', v_rfq.purpose, 'items', v_idx, 'requires_art', v_rfq.requires_art));
    RETURN jsonb_build_object('id', v_rfq.id, 'code', v_rfq.code);
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
    -- Si la solicitud requiere arte, ningún ítem sale a un proveedor sin su arte registrado.
    IF v_rfq.requires_art AND EXISTS (SELECT 1 FROM public.print_rfq_items i WHERE i.rfq_id = v_rfq.id
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

-- Las funciones reemplazadas conservan sus permisos, pero se reafirman por seguridad.
REVOKE ALL ON FUNCTION public.print_rfq_create(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_rfq_create(uuid, uuid, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.print_rfq_invite(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_rfq_invite(uuid, uuid, uuid, uuid[]) TO service_role;
-- Limpieza: la función del trigger de inmutabilidad no debe poder ejecutarse por roles públicos.
REVOKE ALL ON FUNCTION public.print_immutable_guard() FROM PUBLIC, anon, authenticated;
