-- Atomic industrial workflows for packing sessions and cost-intelligence apply.
-- Depends on 20261008, 20261009, 20261010 and 20261010154756 migrations.

-- New organizations start without synthetic staffing or salary assumptions.
-- This changes INSERT defaults only; existing parameter rows are untouched.
ALTER TABLE public.plant_process_parameters
    ALTER COLUMN operator_monthly_salary_pyg SET DEFAULT 0,
    ALTER COLUMN packer_monthly_salary_pyg SET DEFAULT 0,
    ALTER COLUMN quality_monthly_salary_pyg SET DEFAULT 0,
    ALTER COLUMN gen1_operators_count SET DEFAULT 0,
    ALTER COLUMN gen2_operators_count SET DEFAULT 0,
    ALTER COLUMN quality_inspectors_count SET DEFAULT 0;

ALTER TABLE public.packing_sessions
    ADD COLUMN IF NOT EXISTS shift_code TEXT,
    ADD COLUMN IF NOT EXISTS shift_date DATE,
    ADD COLUMN IF NOT EXISTS started_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stopped_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS corrected_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_request_id UUID,
    ADD COLUMN IF NOT EXISTS audit_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.packing_session_segments
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS shift_code TEXT,
    ADD COLUMN IF NOT EXISTS shift_date DATE,
    ADD COLUMN IF NOT EXISTS request_id UUID,
    ADD COLUMN IF NOT EXISTS changed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.packing_session_segments AS segment
SET organization_id = session.organization_id,
    shift_code = COALESCE(segment.shift_code, session.shift_code),
    shift_date = COALESCE(segment.shift_date, session.shift_date)
FROM public.packing_sessions AS session
WHERE session.id = segment.session_id
  AND (segment.organization_id IS NULL OR (segment.shift_code IS NULL AND session.shift_code IS NOT NULL)
       OR (segment.shift_date IS NULL AND session.shift_date IS NOT NULL));

ALTER TABLE public.packing_session_segments
    ALTER COLUMN organization_id SET NOT NULL;
-- The tenant-scoped composite FK below is the single relationship used by
-- PostgREST embeds; retaining the old one-column FK makes the relationship ambiguous.
ALTER TABLE public.packing_session_segments
    DROP CONSTRAINT IF EXISTS packing_session_segments_session_id_fkey;

CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_sessions_id_organization
    ON public.packing_sessions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_sessions_org_session_code
    ON public.packing_sessions (organization_id, session_code);
-- This deliberately fails migration on duplicate live line sessions rather than
-- silently choosing which in-progress timer to keep.
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_sessions_one_running_per_org_line
    ON public.packing_sessions (organization_id, lower(btrim(line_name)))
    WHERE status = 'RUNNING';
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_session_segments_session_order
    ON public.packing_session_segments (session_id, segment_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_session_segments_org_request
    ON public.packing_session_segments (organization_id, request_id)
    WHERE request_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_packing_session_segments_session_org'
          AND conrelid = 'public.packing_session_segments'::regclass
    ) THEN
        ALTER TABLE public.packing_session_segments
            ADD CONSTRAINT fk_packing_session_segments_session_org
            FOREIGN KEY (session_id, organization_id)
            REFERENCES public.packing_sessions (id, organization_id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_packing_session_shift_code'
          AND conrelid = 'public.packing_sessions'::regclass
    ) THEN
        ALTER TABLE public.packing_sessions
            ADD CONSTRAINT chk_packing_session_shift_code
            CHECK (shift_code IS NULL OR length(btrim(shift_code)) > 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_packing_session_segment_shift_code'
          AND conrelid = 'public.packing_session_segments'::regclass
    ) THEN
        ALTER TABLE public.packing_session_segments
            ADD CONSTRAINT chk_packing_session_segment_shift_code
            CHECK (shift_code IS NULL OR length(btrim(shift_code)) > 0);
    END IF;
END $$;

DROP POLICY IF EXISTS packing_session_segments_tenant_isolation
    ON public.packing_session_segments;
CREATE POLICY packing_session_segments_tenant_isolation
    ON public.packing_session_segments
    FOR ALL TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

CREATE TABLE IF NOT EXISTS public.packing_operator_tokens (
    token_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    line_name TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_packing_operator_token_line CHECK (length(btrim(line_name)) > 0),
    CONSTRAINT chk_packing_operator_token_dates CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_packing_operator_tokens_live
    ON public.packing_operator_tokens (organization_id, token_id, expires_at)
    WHERE revoked_at IS NULL;

ALTER TABLE public.packing_operator_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY packing_operator_tokens_service_role
    ON public.packing_operator_tokens
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.industrial_idempotency_requests (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    request_id UUID NOT NULL,
    request_payload JSONB NOT NULL,
    resource_id UUID,
    response_json JSONB,
    actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    token_id UUID REFERENCES public.packing_operator_tokens(token_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (organization_id, operation, request_id),
    CONSTRAINT chk_industrial_idempotency_operation CHECK (length(btrim(operation)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_industrial_idempotency_resource
    ON public.industrial_idempotency_requests (organization_id, resource_id, created_at DESC);

ALTER TABLE public.industrial_idempotency_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY industrial_idempotency_requests_service_role
    ON public.industrial_idempotency_requests
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.packing_session_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    request_id UUID NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'STARTED', 'HEADCOUNT_CHANGED', 'STOPPED', 'APPROVED', 'CORRECTED', 'VOIDED'
    )),
    actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    token_id UUID REFERENCES public.packing_operator_tokens(token_id) ON DELETE SET NULL,
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT fk_packing_session_events_session_org
        FOREIGN KEY (session_id, organization_id)
        REFERENCES public.packing_sessions (id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_packing_session_events_request
        UNIQUE (organization_id, event_type, request_id)
);

CREATE INDEX IF NOT EXISTS idx_packing_session_events_session_time
    ON public.packing_session_events (organization_id, session_id, event_at DESC);

ALTER TABLE public.packing_session_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY packing_session_events_service_role
    ON public.packing_session_events
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Keep the current snapshot for fast reads while preserving every persisted revision.
ALTER TABLE public.industrial_process_snapshots
    ADD COLUMN IF NOT EXISTS parameters_snapshot JSONB;

CREATE TABLE IF NOT EXISTS public.industrial_process_snapshot_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    period TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    operation TEXT NOT NULL CHECK (operation IN ('SNAPSHOT', 'APPLY')),
    request_id UUID NOT NULL,
    detail_json JSONB NOT NULL,
    parameters_snapshot JSONB NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_industrial_snapshot_revision UNIQUE (organization_id, sku, period, revision),
    CONSTRAINT uq_industrial_snapshot_request UNIQUE (organization_id, operation, request_id)
);

CREATE INDEX IF NOT EXISTS idx_industrial_snapshot_revisions_lookup
    ON public.industrial_process_snapshot_revisions (organization_id, sku, period, revision DESC);

-- Seed revision 1 before the atomic snapshot writer starts appending revisions.
-- The namespace/name pair makes the request ID stable across migration retries.
UPDATE public.industrial_process_snapshots
SET parameters_snapshot = '{}'::jsonb
WHERE parameters_snapshot IS NULL;

INSERT INTO public.industrial_process_snapshot_revisions (
    organization_id, sku, period, revision, operation, request_id,
    detail_json, parameters_snapshot, calculated_at, created_by
)
SELECT snapshot.organization_id,
       snapshot.sku,
       snapshot.period,
       1,
       'SNAPSHOT',
       public.uuid_generate_v5(
           '6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid,
           snapshot.organization_id::text || ':' || snapshot.sku || ':' || snapshot.period || ':revision:1'
       ),
       snapshot.detail_json,
       COALESCE(snapshot.parameters_snapshot, '{}'::jsonb),
       snapshot.calculated_at,
       snapshot.created_by
FROM public.industrial_process_snapshots AS snapshot
ON CONFLICT DO NOTHING;

ALTER TABLE public.industrial_process_snapshot_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY industrial_process_snapshot_revisions_service_role
    ON public.industrial_process_snapshot_revisions
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.industrial_process_snapshot_revisions
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.industrial_process_snapshot_revisions TO service_role;

ALTER TABLE public.cost_sheet_versions
    ADD COLUMN IF NOT EXISTS true_unit_cost_pyg NUMERIC(14, 0),
    ADD COLUMN IF NOT EXISTS fx_rate_used NUMERIC(14, 4);

-- Cost apply creates a new version and archives the previous active version.
-- Reject pre-existing duplicate ACTIVE rows during migration rather than allowing
-- future applies to leave an older active version silently published.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_sheet_versions_one_active_per_org_sku
    ON public.cost_sheet_versions (organization_id, sku)
    WHERE status = 'ACTIVE';

REVOKE ALL ON TABLE public.packing_operator_tokens,
    public.industrial_idempotency_requests, public.packing_session_events,
    public.industrial_process_snapshot_revisions
    FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.packing_operator_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.industrial_idempotency_requests TO service_role;
GRANT SELECT, INSERT ON TABLE public.packing_session_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_industrial_idempotency_request(
    p_organization_id UUID,
    p_operation TEXT,
    p_request_id UUID,
    p_request_payload JSONB,
    p_actor_profile_id UUID DEFAULT NULL,
    p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_payload JSONB;
    v_response JSONB;
    v_inserted INTEGER;
BEGIN
    IF p_organization_id IS NULL OR p_request_id IS NULL OR p_request_payload IS NULL
       OR p_operation IS NULL OR length(btrim(p_operation)) = 0 THEN
        RAISE EXCEPTION 'INVALID_IDEMPOTENCY_REQUEST';
    END IF;
    IF p_actor_profile_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles profile
        WHERE profile.id = p_actor_profile_id AND profile.organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'ACTOR_ORGANIZATION_MISMATCH';
    END IF;

    INSERT INTO public.industrial_idempotency_requests (
        organization_id, operation, request_id, request_payload,
        actor_profile_id, token_id
    ) VALUES (
        p_organization_id, p_operation, p_request_id, p_request_payload,
        p_actor_profile_id, p_token_id
    ) ON CONFLICT (organization_id, operation, request_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    SELECT request.request_payload, request.response_json
    INTO v_payload, v_response
    FROM public.industrial_idempotency_requests AS request
    WHERE request.organization_id = p_organization_id
      AND request.operation = p_operation
      AND request.request_id = p_request_id
    FOR UPDATE;

    IF v_payload IS DISTINCT FROM p_request_payload THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    END IF;
    IF v_inserted = 0 THEN
        IF v_response IS NULL THEN
            RAISE EXCEPTION 'IDEMPOTENCY_REQUEST_INCOMPLETE';
        END IF;
        RETURN (v_response - 'server_now') || jsonb_build_object('server_now', clock_timestamp());
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_industrial_idempotency_request(
    p_organization_id UUID,
    p_operation TEXT,
    p_request_id UUID,
    p_resource_id UUID,
    p_response JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE public.industrial_idempotency_requests
    SET resource_id = p_resource_id,
        response_json = p_response,
        completed_at = clock_timestamp()
    WHERE organization_id = p_organization_id
      AND operation = p_operation
      AND request_id = p_request_id
      AND response_json IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'IDEMPOTENCY_REQUEST_NOT_CLAIMED';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_packing_operator_token(
    p_organization_id UUID,
    p_token_id UUID,
    p_line_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_line TEXT;
BEGIN
    IF p_token_id IS NULL THEN
        RETURN p_line_name;
    END IF;
    SELECT token.line_name INTO v_token_line
    FROM public.packing_operator_tokens AS token
    WHERE token.token_id = p_token_id
      AND token.organization_id = p_organization_id
      AND token.revoked_at IS NULL
      AND token.expires_at > clock_timestamp()
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PACKING_TOKEN_INVALID_EXPIRED_OR_REVOKED';
    END IF;
    IF p_line_name IS NOT NULL AND p_line_name IS DISTINCT FROM v_token_line THEN
        RAISE EXCEPTION 'PACKING_TOKEN_LINE_MISMATCH';
    END IF;
    RETURN v_token_line;
END;
$$;

CREATE OR REPLACE FUNCTION public.packing_session_json(
    p_organization_id UUID,
    p_session_id UUID
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
    SELECT to_jsonb(session) || jsonb_build_object(
        'segments', COALESCE((
            SELECT jsonb_agg(to_jsonb(segment) ORDER BY segment.segment_order)
            FROM public.packing_session_segments AS segment
            WHERE segment.organization_id = session.organization_id
              AND segment.session_id = session.id
        ), '[]'::jsonb),
        'server_now', clock_timestamp()
    )
    FROM public.packing_sessions AS session
    WHERE session.organization_id = p_organization_id
      AND session.id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.write_industrial_process_snapshot(
    p_organization_id UUID,
    p_sku TEXT,
    p_period TEXT,
    p_detail_json JSONB,
    p_parameters_snapshot JSONB,
    p_actor_profile_id UUID,
    p_operation TEXT,
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_snapshot public.industrial_process_snapshots;
    v_revision INTEGER;
    v_calculated_at TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF p_organization_id IS NULL OR NULLIF(btrim(p_sku), '') IS NULL
       OR NULLIF(btrim(p_period), '') IS NULL OR p_detail_json IS NULL
       OR jsonb_typeof(p_detail_json) <> 'object'
       OR p_parameters_snapshot IS NULL OR jsonb_typeof(p_parameters_snapshot) <> 'object'
       OR p_request_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_INDUSTRIAL_PROCESS_SNAPSHOT';
    END IF;
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
        p_organization_id::TEXT || ':' || p_sku || ':' || p_period, 0
    ));

    INSERT INTO public.industrial_process_snapshots (
        organization_id, sku, period, detail_json, parameters_snapshot,
        calculated_at, created_by
    ) VALUES (
        p_organization_id, btrim(p_sku), btrim(p_period), p_detail_json,
        p_parameters_snapshot, v_calculated_at, p_actor_profile_id
    )
    ON CONFLICT (organization_id, period, sku) DO UPDATE
    SET detail_json = EXCLUDED.detail_json,
        parameters_snapshot = EXCLUDED.parameters_snapshot,
        calculated_at = EXCLUDED.calculated_at,
        created_by = EXCLUDED.created_by
    RETURNING * INTO v_snapshot;

    SELECT COALESCE(MAX(revision), 0) + 1 INTO v_revision
    FROM public.industrial_process_snapshot_revisions
    WHERE organization_id = p_organization_id
      AND sku = btrim(p_sku)
      AND period = btrim(p_period);

    INSERT INTO public.industrial_process_snapshot_revisions (
        organization_id, sku, period, revision, operation, request_id,
        detail_json, parameters_snapshot, calculated_at, created_by
    ) VALUES (
        p_organization_id, btrim(p_sku), btrim(p_period), v_revision, p_operation,
        p_request_id, p_detail_json, p_parameters_snapshot, v_calculated_at,
        p_actor_profile_id
    );

    RETURN to_jsonb(v_snapshot) || jsonb_build_object(
        'revision', v_revision,
        'server_now', clock_timestamp()
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_packing_session_atomic(
    p_organization_id UUID,
    p_idempotency_key UUID,
    p_line_name TEXT,
    p_sku TEXT DEFAULT NULL,
    p_production_order TEXT DEFAULT NULL,
    p_initial_headcount INTEGER DEFAULT 1,
    p_reason TEXT DEFAULT NULL,
    p_operator_user_id UUID DEFAULT NULL,
    p_shift_code TEXT DEFAULT NULL,
    p_shift_date DATE DEFAULT NULL,
    p_actor_profile_id UUID DEFAULT NULL,
    p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_line_name TEXT;
    v_cached JSONB;
    v_request_payload JSONB;
    v_session_id UUID := uuid_generate_v4();
    v_now TIMESTAMPTZ := NOW();
    v_session_code TEXT;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_idempotency_key IS NULL
       OR NULLIF(btrim(p_line_name), '') IS NULL
       OR p_initial_headcount IS NULL OR p_initial_headcount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PACKING_SESSION_START';
    END IF;
    v_line_name := public.validate_packing_operator_token(
        p_organization_id, p_token_id, btrim(p_line_name)
    );
    IF p_operator_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles profile
        WHERE profile.id = p_operator_user_id
          AND profile.organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'OPERATOR_ORGANIZATION_MISMATCH';
    END IF;

    v_request_payload := jsonb_build_object(
        'line_name', v_line_name,
        'sku', NULLIF(btrim(p_sku), ''),
        'production_order', NULLIF(btrim(p_production_order), ''),
        'initial_headcount', p_initial_headcount,
        'reason', p_reason,
        'operator_user_id', p_operator_user_id,
        'shift_code', NULLIF(btrim(p_shift_code), ''),
        'shift_date', COALESCE(p_shift_date, (v_now AT TIME ZONE 'America/Asuncion')::DATE),
        'actor_profile_id', p_actor_profile_id,
        'token_id', p_token_id
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PACKING_START', p_idempotency_key,
        v_request_payload, p_actor_profile_id, p_token_id
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
        p_organization_id::TEXT || ':packing-running-line:' || lower(btrim(v_line_name)), 0
    ));
    IF EXISTS (
        SELECT 1 FROM public.packing_sessions AS active_session
        WHERE active_session.organization_id = p_organization_id
          AND lower(btrim(active_session.line_name)) = lower(btrim(v_line_name))
          AND active_session.status = 'RUNNING'
    ) THEN
        RAISE EXCEPTION 'PACKING_LINE_SESSION_ALREADY_RUNNING';
    END IF;

    v_session_code := 'SES-' || to_char(v_now, 'YYYYMMDDHH24MISSMS') || '-' || substr(v_session_id::TEXT, 1, 8);
    INSERT INTO public.packing_sessions (
        id, organization_id, session_code, line_name, sku, production_order,
        operator_user_id, started_at, status, total_person_hours,
        total_duration_minutes, notes, created_at, updated_at,
        shift_code, shift_date, started_by_profile_id, last_request_id, audit_revision
    ) VALUES (
        v_session_id, p_organization_id, v_session_code, v_line_name,
        NULLIF(btrim(p_sku), ''), NULLIF(btrim(p_production_order), ''),
        p_operator_user_id, v_now, 'RUNNING', 0, 0,
        NULLIF(btrim(p_reason), ''), v_now, v_now,
        NULLIF(btrim(p_shift_code), ''),
        COALESCE(p_shift_date, (v_now AT TIME ZONE 'America/Asuncion')::DATE),
        p_actor_profile_id, p_idempotency_key, 1
    );

    INSERT INTO public.packing_session_segments (
        session_id, organization_id, segment_order, headcount, started_at,
        duration_minutes, person_hours, reason, shift_code, shift_date,
        request_id, changed_by_profile_id
    ) VALUES (
        v_session_id, p_organization_id, 1, p_initial_headcount, v_now,
        0, 0, COALESCE(NULLIF(btrim(p_reason), ''), 'Inicio de sesión'),
        NULLIF(btrim(p_shift_code), ''),
        COALESCE(p_shift_date, (v_now AT TIME ZONE 'America/Asuncion')::DATE),
        p_idempotency_key, p_actor_profile_id
    );

    INSERT INTO public.packing_session_events (
        organization_id, session_id, request_id, event_type,
        actor_profile_id, token_id, event_at, payload_json
    ) VALUES (
        p_organization_id, v_session_id, p_idempotency_key, 'STARTED',
        p_actor_profile_id, p_token_id, v_now, v_request_payload
    );

    v_result := public.packing_session_json(p_organization_id, v_session_id);
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PACKING_START', p_idempotency_key,
        v_session_id, v_result
    );
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_packing_headcount_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_idempotency_key UUID,
    p_new_headcount INTEGER,
    p_reason TEXT DEFAULT NULL,
    p_line_name TEXT DEFAULT NULL,
    p_actor_profile_id UUID DEFAULT NULL,
    p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_line_name TEXT;
    v_cached JSONB;
    v_request_payload JSONB;
    v_session public.packing_sessions;
    v_open_segment public.packing_session_segments;
    v_now TIMESTAMPTZ := NOW();
    v_next_order INTEGER;
    v_duration NUMERIC;
    v_total_minutes NUMERIC;
    v_total_hours NUMERIC;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_session_id IS NULL OR p_idempotency_key IS NULL
       OR p_new_headcount IS NULL OR p_new_headcount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PACKING_HEADCOUNT_CHANGE';
    END IF;
    v_line_name := public.validate_packing_operator_token(p_organization_id, p_token_id, p_line_name);
    v_request_payload := jsonb_build_object(
        'session_id', p_session_id, 'new_headcount', p_new_headcount,
        'reason', p_reason, 'line_name', v_line_name, 'actor_profile_id', p_actor_profile_id,
        'token_id', p_token_id
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PACKING_HEADCOUNT_CHANGE', p_idempotency_key,
        v_request_payload, p_actor_profile_id, p_token_id
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

    SELECT * INTO v_session
    FROM public.packing_sessions AS session
    WHERE session.id = p_session_id
      AND session.organization_id = p_organization_id
      AND (v_line_name IS NULL OR session.line_name = v_line_name)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_FOUND'; END IF;
    IF v_session.status <> 'RUNNING' THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_RUNNING'; END IF;

    SELECT * INTO v_open_segment
    FROM public.packing_session_segments AS segment
    WHERE segment.organization_id = p_organization_id
      AND segment.session_id = p_session_id
      AND segment.ended_at IS NULL
    ORDER BY segment.segment_order DESC
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_OPEN_SEGMENT_NOT_FOUND'; END IF;

    v_duration := round(greatest(0, extract(epoch FROM (v_now - v_open_segment.started_at)) / 60), 2);
    UPDATE public.packing_session_segments
    SET ended_at = v_now,
        duration_minutes = v_duration,
        person_hours = round((v_duration / 60) * v_open_segment.headcount, 3)
    WHERE id = v_open_segment.id AND organization_id = p_organization_id;

    SELECT COALESCE(MAX(segment_order), 0) + 1 INTO v_next_order
    FROM public.packing_session_segments
    WHERE organization_id = p_organization_id AND session_id = p_session_id;
    INSERT INTO public.packing_session_segments (
        session_id, organization_id, segment_order, headcount, started_at,
        duration_minutes, person_hours, reason, shift_code, shift_date,
        request_id, changed_by_profile_id
    ) VALUES (
        p_session_id, p_organization_id, v_next_order, p_new_headcount, v_now,
        0, 0, COALESCE(NULLIF(btrim(p_reason), ''), 'Cambio de dotación a ' || p_new_headcount || ' operarios'),
        v_session.shift_code, v_session.shift_date, p_idempotency_key, p_actor_profile_id
    );

    SELECT COALESCE(sum(segment.duration_minutes), 0),
           COALESCE(sum(segment.person_hours), 0)
    INTO v_total_minutes, v_total_hours
    FROM public.packing_session_segments AS segment
    WHERE segment.organization_id = p_organization_id AND segment.session_id = p_session_id;
    UPDATE public.packing_sessions
    SET total_duration_minutes = round(v_total_minutes, 2),
        total_person_hours = round(v_total_hours, 3),
        updated_at = v_now,
        last_request_id = p_idempotency_key,
        audit_revision = audit_revision + 1
    WHERE id = p_session_id AND organization_id = p_organization_id;

    INSERT INTO public.packing_session_events (
        organization_id, session_id, request_id, event_type,
        actor_profile_id, token_id, event_at, payload_json
    ) VALUES (
        p_organization_id, p_session_id, p_idempotency_key, 'HEADCOUNT_CHANGED',
        p_actor_profile_id, p_token_id, v_now, v_request_payload
    );
    v_result := public.packing_session_json(p_organization_id, p_session_id);
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PACKING_HEADCOUNT_CHANGE', p_idempotency_key,
        p_session_id, v_result
    );
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_packing_session_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_idempotency_key UUID,
    p_line_name TEXT DEFAULT NULL,
    p_actor_profile_id UUID DEFAULT NULL,
    p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_line_name TEXT;
    v_cached JSONB;
    v_request_payload JSONB;
    v_session public.packing_sessions;
    v_open_segment public.packing_session_segments;
    v_now TIMESTAMPTZ := NOW();
    v_duration NUMERIC;
    v_total_minutes NUMERIC;
    v_total_hours NUMERIC;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_session_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'INVALID_PACKING_SESSION_STOP';
    END IF;
    v_line_name := public.validate_packing_operator_token(p_organization_id, p_token_id, p_line_name);
    v_request_payload := jsonb_build_object(
        'session_id', p_session_id, 'line_name', v_line_name,
        'actor_profile_id', p_actor_profile_id, 'token_id', p_token_id
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PACKING_STOP', p_idempotency_key,
        v_request_payload, p_actor_profile_id, p_token_id
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

    SELECT * INTO v_session
    FROM public.packing_sessions AS session
    WHERE session.id = p_session_id
      AND session.organization_id = p_organization_id
      AND (v_line_name IS NULL OR session.line_name = v_line_name)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_FOUND'; END IF;
    IF v_session.status NOT IN ('RUNNING', 'STOPPED') THEN
        RAISE EXCEPTION 'PACKING_SESSION_CANNOT_BE_STOPPED_FROM_STATUS_%', v_session.status;
    END IF;

    IF v_session.status = 'RUNNING' THEN
        SELECT * INTO v_open_segment
        FROM public.packing_session_segments AS segment
        WHERE segment.organization_id = p_organization_id
          AND segment.session_id = p_session_id
          AND segment.ended_at IS NULL
        ORDER BY segment.segment_order DESC
        LIMIT 1
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_OPEN_SEGMENT_NOT_FOUND'; END IF;

        v_duration := round(greatest(0, extract(epoch FROM (v_now - v_open_segment.started_at)) / 60), 2);
        UPDATE public.packing_session_segments
        SET ended_at = v_now,
            duration_minutes = v_duration,
            person_hours = round((v_duration / 60) * v_open_segment.headcount, 3)
        WHERE id = v_open_segment.id AND organization_id = p_organization_id;

        SELECT COALESCE(sum(segment.duration_minutes), 0),
               COALESCE(sum(segment.person_hours), 0)
        INTO v_total_minutes, v_total_hours
        FROM public.packing_session_segments AS segment
        WHERE segment.organization_id = p_organization_id AND segment.session_id = p_session_id;
        UPDATE public.packing_sessions
        SET status = 'STOPPED', stopped_at = v_now,
            total_duration_minutes = round(v_total_minutes, 2),
            total_person_hours = round(v_total_hours, 3),
            stopped_by_profile_id = p_actor_profile_id,
            updated_at = v_now, last_request_id = p_idempotency_key,
            audit_revision = audit_revision + 1
        WHERE id = p_session_id AND organization_id = p_organization_id;
    ELSE
        UPDATE public.packing_sessions
        SET last_request_id = p_idempotency_key,
            updated_at = v_now, audit_revision = audit_revision + 1
        WHERE id = p_session_id AND organization_id = p_organization_id;
    END IF;

    INSERT INTO public.packing_session_events (
        organization_id, session_id, request_id, event_type,
        actor_profile_id, token_id, event_at, payload_json
    ) VALUES (
        p_organization_id, p_session_id, p_idempotency_key, 'STOPPED',
        p_actor_profile_id, p_token_id, v_now, v_request_payload
    );
    v_result := public.packing_session_json(p_organization_id, p_session_id);
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PACKING_STOP', p_idempotency_key,
        p_session_id, v_result
    );
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_packing_session_with_labor_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_idempotency_key UUID,
    p_allocations JSONB,
    p_supervisor_id UUID,
    p_line_name TEXT DEFAULT NULL,
    p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_line_name TEXT;
    v_cached JSONB;
    v_request_payload JSONB;
    v_session public.packing_sessions;
    v_segment public.packing_session_segments;
    v_rate public.plant_salary_band_rates;
    v_band public.plant_salary_bands;
    v_parameters public.plant_process_parameters;
    v_allocation JSONB;
    v_segment_id UUID;
    v_band_id UUID;
    v_headcount INTEGER;
    v_hours NUMERIC;
    v_hourly_rate NUMERIC;
    v_cost NUMERIC;
    v_has_segment_allocation BOOLEAN;
    v_segment_allocated INTEGER;
    v_allocated_person_hours NUMERIC := 0;
    v_now TIMESTAMPTZ := NOW();
    v_total_minutes NUMERIC;
    v_total_hours NUMERIC;
    v_inserted JSONB := '[]'::jsonb;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_session_id IS NULL OR p_idempotency_key IS NULL
       OR p_supervisor_id IS NULL OR p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array'
       OR (jsonb_typeof(p_allocations) = 'array' AND jsonb_array_length(p_allocations) = 0) THEN
        RAISE EXCEPTION 'INVALID_PACKING_SESSION_APPROVAL';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles profile
        WHERE profile.id = p_supervisor_id
          AND profile.organization_id = p_organization_id
          AND profile.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'PACKING_APPROVAL_SUPERVISOR_FORBIDDEN';
    END IF;
    v_line_name := public.validate_packing_operator_token(p_organization_id, p_token_id, p_line_name);
    IF p_token_id IS NOT NULL THEN
        RAISE EXCEPTION 'PACKING_OPERATOR_TOKEN_CANNOT_APPROVE';
    END IF;
    v_request_payload := jsonb_build_object(
        'session_id', p_session_id,
        'allocations', p_allocations,
        'supervisor_id', p_supervisor_id,
        'line_name', v_line_name,
        'token_id', p_token_id
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PACKING_APPROVE_WITH_LABOR', p_idempotency_key,
        v_request_payload, p_supervisor_id, p_token_id
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

    SELECT * INTO v_session
    FROM public.packing_sessions AS session
    WHERE session.id = p_session_id
      AND session.organization_id = p_organization_id
      AND (v_line_name IS NULL OR session.line_name = v_line_name)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_FOUND'; END IF;
    IF v_session.status IN ('APPROVED', 'VOIDED') THEN
        RAISE EXCEPTION 'PACKING_SESSION_CANNOT_BE_APPROVED_FROM_STATUS_%', v_session.status;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.packing_labor_allocations allocation
        WHERE allocation.organization_id = p_organization_id AND allocation.session_id = p_session_id
    ) THEN
        RAISE EXCEPTION 'PACKING_SESSION_ALREADY_HAS_LABOR_ALLOCATIONS';
    END IF;

    IF v_session.status = 'RUNNING' THEN
        SELECT * INTO v_segment
        FROM public.packing_session_segments AS segment
        WHERE segment.organization_id = p_organization_id
          AND segment.session_id = p_session_id
          AND segment.ended_at IS NULL
        ORDER BY segment.segment_order DESC
        LIMIT 1
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_OPEN_SEGMENT_NOT_FOUND'; END IF;
        UPDATE public.packing_session_segments
        SET ended_at = v_now,
            duration_minutes = round(greatest(0, extract(epoch FROM (v_now - v_segment.started_at)) / 60), 2),
            person_hours = round((greatest(0, extract(epoch FROM (v_now - v_segment.started_at)) / 3600) * v_segment.headcount), 3)
        WHERE id = v_segment.id AND organization_id = p_organization_id;
    END IF;

    SELECT COALESCE(sum(segment.duration_minutes), 0), COALESCE(sum(segment.person_hours), 0)
    INTO v_total_minutes, v_total_hours
    FROM public.packing_session_segments AS segment
    WHERE segment.organization_id = p_organization_id AND segment.session_id = p_session_id;
    IF v_total_hours <= 0 THEN RAISE EXCEPTION 'PACKING_SESSION_HAS_NO_LABOR_DURATION'; END IF;

    SELECT * INTO v_parameters
    FROM public.plant_process_parameters AS parameters
    WHERE parameters.organization_id = p_organization_id
    FOR SHARE;
    IF NOT FOUND OR v_parameters.monthly_salary_hours IS NULL OR v_parameters.monthly_salary_hours <= 0 THEN
        RAISE EXCEPTION 'PLANT_PROCESS_PARAMETERS_NOT_CONFIGURED';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_allocations) AS item(value)
        WHERE NULLIF(item.value->>'segment_id', '') IS NOT NULL
    ) INTO v_has_segment_allocation;
    IF v_has_segment_allocation AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_allocations) AS item(value)
        WHERE NULLIF(item.value->>'segment_id', '') IS NULL
    ) THEN
        RAISE EXCEPTION 'PACKING_ALLOCATION_SCOPE_MIXED';
    END IF;
    IF v_has_segment_allocation AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_allocations) AS item(value)
        WHERE item.value ? 'duration_hours'
    ) THEN
        RAISE EXCEPTION 'PACKING_SEGMENT_DURATION_OVERRIDE_FORBIDDEN';
    END IF;
    IF v_has_segment_allocation THEN
        FOR v_segment IN
            SELECT segment.*
            FROM public.packing_session_segments AS segment
            WHERE segment.organization_id = p_organization_id AND segment.session_id = p_session_id
            ORDER BY segment.segment_order
            FOR UPDATE
        LOOP
            SELECT COALESCE(sum((item.value->>'headcount')::INTEGER), 0)
            INTO v_segment_allocated
            FROM jsonb_array_elements(p_allocations) AS item(value)
            WHERE item.value->>'segment_id' = v_segment.id::TEXT;
            IF v_segment_allocated <> v_segment.headcount THEN
                RAISE EXCEPTION 'PACKING_SEGMENT_ALLOCATION_HEADCOUNT_MISMATCH:%', v_segment.segment_order;
            END IF;
        END LOOP;
    END IF;

    FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_allocations)
    LOOP
        BEGIN
            IF jsonb_typeof(v_allocation->'headcount') <> 'number'
               OR (v_allocation->>'headcount')::NUMERIC <> trunc((v_allocation->>'headcount')::NUMERIC) THEN
                RAISE EXCEPTION 'headcount must be an integer';
            END IF;
            v_headcount := (v_allocation->>'headcount')::INTEGER;
            v_band_id := (v_allocation->>'salary_band_id')::UUID;
            v_segment_id := NULLIF(v_allocation->>'segment_id', '')::UUID;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_PACKING_LABOR_ALLOCATION';
        END;
        IF v_headcount IS NULL OR v_headcount <= 0 OR v_band_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_PACKING_LABOR_ALLOCATION';
        END IF;

        v_segment := NULL;
        IF v_segment_id IS NOT NULL THEN
            SELECT * INTO v_segment
            FROM public.packing_session_segments AS segment
            WHERE segment.organization_id = p_organization_id
              AND segment.session_id = p_session_id
              AND segment.id = v_segment_id
            FOR SHARE;
            IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_ALLOCATION_SEGMENT_NOT_FOUND'; END IF;
            IF v_headcount > v_segment.headcount THEN
                RAISE EXCEPTION 'PACKING_ALLOCATION_HEADCOUNT_EXCEEDS_SEGMENT';
            END IF;
            IF v_segment.headcount <= 0 OR v_segment.person_hours IS NULL THEN
                RAISE EXCEPTION 'PACKING_SEGMENT_PERSON_HOURS_INVALID';
            END IF;
            v_hours := v_segment.person_hours / v_segment.headcount;
        ELSE
            IF jsonb_typeof(v_allocation->'duration_hours') <> 'number' THEN
                RAISE EXCEPTION 'PACKING_LEGACY_ALLOCATION_DURATION_REQUIRED';
            END IF;
            v_hours := (v_allocation->>'duration_hours')::NUMERIC;
            v_allocated_person_hours := v_allocated_person_hours + (v_headcount * v_hours);
        END IF;
        IF v_hours IS NULL OR v_hours <= 0 THEN
            RAISE EXCEPTION 'PACKING_ALLOCATION_DURATION_INVALID';
        END IF;

        SELECT * INTO v_band
        FROM public.plant_salary_bands AS band
        WHERE band.id = v_band_id
          AND band.organization_id = p_organization_id
          AND band.status = 'ACTIVE'
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_BAND_NOT_FOUND'; END IF;

        SELECT * INTO v_rate
        FROM public.plant_salary_band_rates AS rate
        WHERE rate.organization_id = p_organization_id
          AND rate.band_id = v_band_id
          AND rate.valid_from <= COALESCE(v_segment.shift_date, v_session.shift_date, (v_segment.started_at AT TIME ZONE 'America/Asuncion')::DATE, (v_session.started_at AT TIME ZONE 'America/Asuncion')::DATE)
          AND (rate.valid_to IS NULL OR rate.valid_to >= COALESCE(v_segment.shift_date, v_session.shift_date, (v_segment.started_at AT TIME ZONE 'America/Asuncion')::DATE, (v_session.started_at AT TIME ZONE 'America/Asuncion')::DATE))
        ORDER BY rate.valid_from DESC
        LIMIT 1
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_BAND_RATE_NOT_FOUND'; END IF;

        v_hourly_rate := (v_rate.monthly_salary_pyg * (1 + v_parameters.labor_charges_percent / 100)) / v_parameters.monthly_salary_hours;
        v_cost := v_headcount * v_hours * v_hourly_rate;
        INSERT INTO public.packing_labor_allocations (
            organization_id, session_id, session_segment_id, salary_band_id,
            headcount, hourly_rate_snapshot_pyg, calculated_cost_pyg,
            notes, approved_by, approved_at
        ) VALUES (
            p_organization_id, p_session_id, v_segment_id, v_band_id,
            v_headcount, v_hourly_rate, v_cost,
            format('Duración imputada: %s horas', v_hours), p_supervisor_id, v_now
        ) RETURNING to_jsonb(packing_labor_allocations) INTO v_result;
        v_inserted := v_inserted || jsonb_build_array(v_result);
    END LOOP;

    IF NOT v_has_segment_allocation
       AND abs(v_allocated_person_hours - v_total_hours) > 0.001 THEN
        RAISE EXCEPTION 'PACKING_LEGACY_ALLOCATION_PERSON_HOURS_MISMATCH:%:%',
            v_allocated_person_hours, v_total_hours;
    END IF;

    UPDATE public.packing_sessions
    SET status = 'APPROVED', stopped_at = COALESCE(stopped_at, v_now),
        approved_by = p_supervisor_id, approved_at = v_now,
        stopped_by_profile_id = COALESCE(stopped_by_profile_id, p_supervisor_id),
        total_duration_minutes = round(v_total_minutes, 2),
        total_person_hours = round(v_total_hours, 3),
        updated_at = v_now, last_request_id = p_idempotency_key,
        audit_revision = audit_revision + 1
    WHERE id = p_session_id AND organization_id = p_organization_id
    RETURNING * INTO v_session;
    INSERT INTO public.packing_session_events (
        organization_id, session_id, request_id, event_type,
        actor_profile_id, event_at, payload_json
    ) VALUES (
        p_organization_id, p_session_id, p_idempotency_key, 'APPROVED',
        p_supervisor_id, v_now, v_request_payload || jsonb_build_object('labor_allocations', v_inserted)
    );

    v_result := public.packing_session_json(p_organization_id, p_session_id)
        || jsonb_build_object('labor_allocations', v_inserted);
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PACKING_APPROVE_WITH_LABOR', p_idempotency_key,
        p_session_id, v_result
    );
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_packing_session_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_idempotency_key UUID,
    p_total_person_hours NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_actor_profile_id UUID DEFAULT NULL,
    p_line_name TEXT DEFAULT NULL,
    p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_line_name TEXT;
    v_cached JSONB;
    v_request_payload JSONB;
    v_session public.packing_sessions;
    v_segment public.packing_session_segments;
    v_now TIMESTAMPTZ := NOW();
    v_total_minutes NUMERIC;
    v_total_hours NUMERIC;
    v_original_person_hours NUMERIC;
    v_redistributed_person_hours NUMERIC := 0;
    v_segment_count INTEGER;
    v_last_segment_id UUID;
    v_segment_person_hours NUMERIC;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_session_id IS NULL OR p_idempotency_key IS NULL
       OR (p_total_person_hours IS NOT NULL AND p_total_person_hours < 0) THEN
        RAISE EXCEPTION 'INVALID_PACKING_SESSION_CORRECTION';
    END IF;
    v_line_name := public.validate_packing_operator_token(p_organization_id, p_token_id, p_line_name);
    v_request_payload := jsonb_build_object(
        'session_id', p_session_id, 'total_person_hours', p_total_person_hours,
        'notes', p_notes, 'line_name', v_line_name,
        'actor_profile_id', p_actor_profile_id, 'token_id', p_token_id
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PACKING_CORRECT', p_idempotency_key,
        v_request_payload, p_actor_profile_id, p_token_id
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

    SELECT * INTO v_session
    FROM public.packing_sessions AS session
    WHERE session.id = p_session_id AND session.organization_id = p_organization_id
      AND (v_line_name IS NULL OR session.line_name = v_line_name)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_FOUND'; END IF;
    IF v_session.status IN ('APPROVED', 'VOIDED') THEN
        RAISE EXCEPTION 'PACKING_SESSION_CANNOT_BE_CORRECTED_FROM_STATUS_%', v_session.status;
    END IF;
    IF v_session.status = 'RUNNING' THEN
        SELECT * INTO v_segment
        FROM public.packing_session_segments AS segment
        WHERE segment.organization_id = p_organization_id
          AND segment.session_id = p_session_id AND segment.ended_at IS NULL
        ORDER BY segment.segment_order DESC LIMIT 1 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_OPEN_SEGMENT_NOT_FOUND'; END IF;
        UPDATE public.packing_session_segments
        SET ended_at = v_now,
            duration_minutes = round(greatest(0, extract(epoch FROM (v_now - v_segment.started_at)) / 60), 2),
            person_hours = round((greatest(0, extract(epoch FROM (v_now - v_segment.started_at)) / 3600) * v_segment.headcount), 3)
        WHERE id = v_segment.id AND organization_id = p_organization_id;
    END IF;
    -- Lock the full segment set before computing or correcting aggregate labor.
    FOR v_segment IN
        SELECT segment.*
        FROM public.packing_session_segments AS segment
        WHERE segment.organization_id = p_organization_id
          AND segment.session_id = p_session_id
        ORDER BY segment.segment_order
        FOR UPDATE
    LOOP
        NULL;
    END LOOP;
    SELECT COALESCE(sum(segment.duration_minutes), 0),
           COALESCE(sum(segment.person_hours), 0),
           count(*)::INTEGER,
           (array_agg(segment.id ORDER BY segment.segment_order DESC))[1]
    INTO v_total_minutes, v_original_person_hours, v_segment_count, v_last_segment_id
    FROM public.packing_session_segments AS segment
    WHERE segment.organization_id = p_organization_id AND segment.session_id = p_session_id;
    v_total_hours := v_original_person_hours;
    IF p_total_person_hours IS NOT NULL THEN
        v_total_hours := round(p_total_person_hours, 3);
        IF v_total_hours > 0 AND (v_segment_count = 0 OR v_original_person_hours <= 0) THEN
            RAISE EXCEPTION 'PACKING_CORRECTION_CANNOT_REDISTRIBUTE_PERSON_HOURS';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.packing_session_segments AS segment
            WHERE segment.organization_id = p_organization_id
              AND segment.session_id = p_session_id
              AND segment.person_hours < 0
        ) THEN
            RAISE EXCEPTION 'PACKING_CORRECTION_SOURCE_PERSON_HOURS_INVALID';
        END IF;
        v_redistributed_person_hours := 0;
        FOR v_segment IN
            SELECT segment.*
            FROM public.packing_session_segments AS segment
            WHERE segment.organization_id = p_organization_id
              AND segment.session_id = p_session_id
            ORDER BY segment.segment_order
            FOR UPDATE
        LOOP
            IF v_segment.id = v_last_segment_id THEN
                v_segment_person_hours := v_total_hours - v_redistributed_person_hours;
            ELSIF v_original_person_hours > 0 THEN
                v_segment_person_hours := LEAST(
                    round(v_total_hours * v_segment.person_hours / v_original_person_hours, 3),
                    greatest(0, v_total_hours - v_redistributed_person_hours)
                );
            ELSE
                v_segment_person_hours := 0;
            END IF;
            UPDATE public.packing_session_segments
            SET person_hours = v_segment_person_hours
            WHERE id = v_segment.id AND organization_id = p_organization_id;
            v_redistributed_person_hours := v_redistributed_person_hours + v_segment_person_hours;
        END LOOP;
    END IF;

    UPDATE public.packing_sessions
    SET status = 'CORRECTED', stopped_at = COALESCE(stopped_at, v_now),
        total_duration_minutes = round(v_total_minutes, 2),
        total_person_hours = v_total_hours,
        notes = CASE WHEN NULLIF(btrim(p_notes), '') IS NULL THEN notes
                     ELSE concat_ws(' | ', NULLIF(notes, ''), 'Corrección: ' || btrim(p_notes)) END,
        corrected_by_profile_id = p_actor_profile_id, corrected_at = v_now,
        stopped_by_profile_id = COALESCE(stopped_by_profile_id, p_actor_profile_id),
        updated_at = v_now, last_request_id = p_idempotency_key,
        audit_revision = audit_revision + 1
    WHERE id = p_session_id AND organization_id = p_organization_id;
    INSERT INTO public.packing_session_events (
        organization_id, session_id, request_id, event_type,
        actor_profile_id, token_id, event_at, payload_json
    ) VALUES (
        p_organization_id, p_session_id, p_idempotency_key, 'CORRECTED',
        p_actor_profile_id, p_token_id, v_now,
        v_request_payload || jsonb_build_object('corrected_total_person_hours', v_total_hours)
    );
    v_result := public.packing_session_json(p_organization_id, p_session_id);
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PACKING_CORRECT', p_idempotency_key, p_session_id, v_result
    );
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_packing_session_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_idempotency_key UUID,
    p_reason TEXT DEFAULT NULL,
    p_actor_profile_id UUID DEFAULT NULL,
    p_line_name TEXT DEFAULT NULL,
    p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_line_name TEXT;
    v_cached JSONB;
    v_request_payload JSONB;
    v_session public.packing_sessions;
    v_segment public.packing_session_segments;
    v_now TIMESTAMPTZ := NOW();
    v_total_minutes NUMERIC;
    v_total_hours NUMERIC;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_session_id IS NULL OR p_idempotency_key IS NULL
       THEN
        RAISE EXCEPTION 'INVALID_PACKING_SESSION_VOID';
    END IF;
    v_line_name := public.validate_packing_operator_token(p_organization_id, p_token_id, p_line_name);
    v_request_payload := jsonb_build_object(
        'session_id', p_session_id, 'reason', btrim(p_reason),
        'line_name', v_line_name, 'actor_profile_id', p_actor_profile_id, 'token_id', p_token_id
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PACKING_VOID', p_idempotency_key,
        v_request_payload, p_actor_profile_id, p_token_id
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

    SELECT * INTO v_session
    FROM public.packing_sessions AS session
    WHERE session.id = p_session_id AND session.organization_id = p_organization_id
      AND (v_line_name IS NULL OR session.line_name = v_line_name)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_FOUND'; END IF;
    IF v_session.status = 'APPROVED' THEN
        RAISE EXCEPTION 'PACKING_APPROVED_SESSION_CANNOT_BE_VOIDED';
    END IF;
    IF v_session.status = 'VOIDED' THEN
        RAISE EXCEPTION 'PACKING_SESSION_ALREADY_VOIDED';
    END IF;
    IF v_session.status = 'RUNNING' THEN
        SELECT * INTO v_segment
        FROM public.packing_session_segments AS segment
        WHERE segment.organization_id = p_organization_id
          AND segment.session_id = p_session_id AND segment.ended_at IS NULL
        ORDER BY segment.segment_order DESC LIMIT 1 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PACKING_OPEN_SEGMENT_NOT_FOUND'; END IF;
        UPDATE public.packing_session_segments
        SET ended_at = v_now,
            duration_minutes = round(greatest(0, extract(epoch FROM (v_now - v_segment.started_at)) / 60), 2),
            person_hours = round((greatest(0, extract(epoch FROM (v_now - v_segment.started_at)) / 3600) * v_segment.headcount), 3)
        WHERE id = v_segment.id AND organization_id = p_organization_id;
    END IF;
    SELECT COALESCE(sum(segment.duration_minutes), 0), COALESCE(sum(segment.person_hours), 0)
    INTO v_total_minutes, v_total_hours
    FROM public.packing_session_segments AS segment
    WHERE segment.organization_id = p_organization_id AND segment.session_id = p_session_id;
    UPDATE public.packing_sessions
    SET status = 'VOIDED', stopped_at = COALESCE(stopped_at, v_now),
        total_duration_minutes = round(v_total_minutes, 2),
        total_person_hours = round(v_total_hours, 3),
        notes = CASE WHEN NULLIF(btrim(p_reason), '') IS NULL THEN notes
                     ELSE concat_ws(' | ', NULLIF(notes, ''), 'Anulada: ' || btrim(p_reason)) END,
        voided_by_profile_id = p_actor_profile_id, voided_at = v_now,
        stopped_by_profile_id = COALESCE(stopped_by_profile_id, p_actor_profile_id),
        updated_at = v_now, last_request_id = p_idempotency_key,
        audit_revision = audit_revision + 1
    WHERE id = p_session_id AND organization_id = p_organization_id;
    INSERT INTO public.packing_session_events (
        organization_id, session_id, request_id, event_type,
        actor_profile_id, token_id, event_at, payload_json
    ) VALUES (
        p_organization_id, p_session_id, p_idempotency_key, 'VOIDED',
        p_actor_profile_id, p_token_id, v_now, v_request_payload
    );
    v_result := public.packing_session_json(p_organization_id, p_session_id);
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PACKING_VOID', p_idempotency_key, p_session_id, v_result
    );
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_industrial_production_basis(
    p_organization_id UUID,
    p_sku TEXT,
    p_period TEXT,
    p_calculation JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sku_units NUMERIC;
    v_period_units NUMERIC;
    v_expected_sku_units NUMERIC;
    v_expected_period_units NUMERIC;
BEGIN
    IF p_organization_id IS NULL OR NULLIF(btrim(p_sku), '') IS NULL
       OR p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
       OR p_calculation IS NULL OR jsonb_typeof(p_calculation) <> 'object'
       OR p_calculation->>'status' IS DISTINCT FROM 'COMPLETE' THEN
        RAISE EXCEPTION 'INVALID_INDUSTRIAL_PRODUCTION_BASIS';
    END IF;
    LOCK TABLE public.plant_production_periods IN SHARE MODE;
    SELECT production.good_units_produced
    INTO v_sku_units
    FROM public.plant_production_periods AS production
    WHERE production.organization_id = p_organization_id
      AND production.sku = btrim(p_sku)
      AND production.period = p_period;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_BASE_NOT_CONFIGURED'; END IF;
    SELECT COALESCE(sum(production.good_units_produced), 0)
    INTO v_period_units
    FROM public.plant_production_periods AS production
    WHERE production.organization_id = p_organization_id
      AND production.period = p_period;
    BEGIN
        v_expected_sku_units := NULLIF(p_calculation->>'good_units_basis', '')::NUMERIC;
        v_expected_period_units := NULLIF(p_calculation->>'total_period_units', '')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_INDUSTRIAL_PRODUCTION_BASIS';
    END;
    IF v_sku_units <= 0 OR v_period_units < v_sku_units
       OR v_expected_sku_units IS NULL OR v_expected_period_units IS NULL
       OR v_sku_units IS DISTINCT FROM v_expected_sku_units
       OR v_period_units IS DISTINCT FROM v_expected_period_units THEN
        RAISE EXCEPTION 'PRODUCTION_BASE_CHANGED';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_industrial_process_snapshot_atomic(
    p_organization_id UUID,
    p_idempotency_key UUID,
    p_sku TEXT,
    p_period TEXT,
    p_calculation JSONB,
    p_parameters_snapshot JSONB,
    p_request_fingerprint TEXT,
    p_actor_profile_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_cached JSONB;
    v_request_payload JSONB;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_idempotency_key IS NULL
       OR p_parameters_snapshot IS NULL OR NULLIF(btrim(p_request_fingerprint), '') IS NULL THEN
        RAISE EXCEPTION 'INVALID_INDUSTRIAL_PROCESS_SNAPSHOT';
    END IF;
    v_request_payload := jsonb_build_object(
        'request_fingerprint', btrim(p_request_fingerprint),
        'sku', btrim(p_sku), 'period', p_period
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PROCESS_SNAPSHOT', p_idempotency_key,
        v_request_payload, p_actor_profile_id, NULL
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
    PERFORM public.assert_industrial_production_basis(
        p_organization_id, p_sku, p_period, p_calculation
    );
    v_result := public.write_industrial_process_snapshot(
        p_organization_id, p_sku, p_period, p_calculation,
        p_parameters_snapshot, p_actor_profile_id, 'SNAPSHOT', p_idempotency_key
    );
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PROCESS_SNAPSHOT', p_idempotency_key,
        (v_result->>'id')::UUID, v_result
    );
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_industrial_cost_to_cost_intelligence_atomic(
    p_organization_id UUID,
    p_idempotency_key UUID,
    p_sku TEXT,
    p_period TEXT,
    p_calculation JSONB,
    p_parameters_snapshot JSONB,
    p_input_json JSONB,
    p_expected_configuration_version INTEGER,
    p_true_unit_cost_usd NUMERIC,
    p_minimum_sustainable_price_usd NUMERIC,
    p_break_even_units INTEGER,
    p_batch_size INTEGER,
    p_fx_rate NUMERIC,
    p_sheet_name TEXT,
    p_notes TEXT,
    p_components JSONB,
    p_actor_profile_id UUID,
    p_request_fingerprint TEXT,
    p_persist_snapshot BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_cached JSONB;
    v_request_payload JSONB;
    v_configuration public.cost_v1_configurations;
    v_sheet public.cost_sheet_versions;
    v_product_id UUID;
    v_product_match_count INTEGER;
    v_previous_sheet_id UUID;
    v_next_sheet_version INTEGER;
    v_component JSONB;
    v_component_id UUID;
    v_components_result JSONB := '[]'::jsonb;
    v_snapshot JSONB;
    v_result JSONB;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF p_organization_id IS NULL OR p_idempotency_key IS NULL
       OR NULLIF(btrim(p_sku), '') IS NULL
       OR p_actor_profile_id IS NULL
       OR p_expected_configuration_version IS NULL OR p_expected_configuration_version < 0
       OR NULLIF(btrim(p_request_fingerprint), '') IS NULL
       OR p_true_unit_cost_usd IS NULL OR p_true_unit_cost_usd < 0
       OR p_minimum_sustainable_price_usd IS NULL OR p_minimum_sustainable_price_usd < 0
       OR p_break_even_units IS NULL OR p_break_even_units < 0
       OR p_batch_size IS NULL OR p_batch_size <= 0
       OR p_components IS NULL OR jsonb_typeof(p_components) <> 'array'
       OR (jsonb_typeof(p_components) = 'array' AND jsonb_array_length(p_components) = 0)
       OR p_input_json IS NULL OR jsonb_typeof(p_input_json) <> 'object'
       OR p_calculation IS NULL OR jsonb_typeof(p_calculation) <> 'object'
       OR p_persist_snapshot IS NULL
       OR (p_persist_snapshot AND (p_parameters_snapshot IS NULL OR jsonb_typeof(p_parameters_snapshot) <> 'object')) THEN
        RAISE EXCEPTION 'INVALID_INDUSTRIAL_COST_APPLY';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles AS profile
        WHERE profile.id = p_actor_profile_id
          AND profile.organization_id = p_organization_id
          AND profile.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'INDUSTRIAL_COST_APPLY_FORBIDDEN';
    END IF;
    v_request_payload := jsonb_build_object(
        'request_fingerprint', btrim(p_request_fingerprint),
        'sku', btrim(p_sku), 'period', p_period
    );
    v_cached := public.claim_industrial_idempotency_request(
        p_organization_id, 'PROCESS_APPLY_COST', p_idempotency_key,
        v_request_payload, p_actor_profile_id, NULL
    );
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
    PERFORM public.assert_industrial_production_basis(
        p_organization_id, p_sku, p_period, p_calculation
    );

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
        p_organization_id::TEXT || ':cost-v1:' || btrim(p_sku), 0
    ));
    SELECT * INTO v_configuration
    FROM public.cost_v1_configurations AS configuration
    WHERE configuration.organization_id = p_organization_id
      AND configuration.sku = btrim(p_sku)
    FOR UPDATE;
    IF FOUND THEN
        IF p_expected_configuration_version = 0
           OR v_configuration.version <> p_expected_configuration_version THEN
            RAISE EXCEPTION 'COST_V1_CONFIGURATION_VERSION_CONFLICT';
        END IF;
        IF NOT v_configuration.is_active THEN
            RAISE EXCEPTION 'COST_V1_CONFIGURATION_INACTIVE';
        END IF;
        SELECT product.id INTO v_product_id
        FROM public.products AS product
        JOIN public.product_attributes AS attribute ON attribute.product_id = product.id
        WHERE product.id = v_configuration.product_id
          AND product.organization_id = p_organization_id
          AND product.is_active
          AND attribute.sku = btrim(p_sku)
        FOR SHARE OF product;
        IF NOT FOUND THEN RAISE EXCEPTION 'COST_V1_CONFIGURATION_SKU_ORGANIZATION_MISMATCH'; END IF;
        UPDATE public.cost_v1_configurations
        SET input_json = p_input_json,
            version = version + 1,
            created_by = COALESCE(p_actor_profile_id, created_by),
            updated_at = v_now
        WHERE id = v_configuration.id
        RETURNING * INTO v_configuration;
    ELSE
        IF p_expected_configuration_version <> 0 THEN
            RAISE EXCEPTION 'COST_V1_CONFIGURATION_NOT_FOUND';
        END IF;
        SELECT count(*) INTO v_product_match_count
        FROM public.product_attributes AS attribute
        JOIN public.products AS product ON product.id = attribute.product_id
        WHERE attribute.sku = btrim(p_sku)
          AND product.organization_id = p_organization_id
          AND product.is_active;
        IF v_product_match_count = 0 THEN RAISE EXCEPTION 'SKU_NOT_FOUND_IN_ORGANIZATION'; END IF;
        IF v_product_match_count <> 1 THEN RAISE EXCEPTION 'SKU_AMBIGUOUS_IN_ORGANIZATION'; END IF;
        SELECT product.id INTO v_product_id
        FROM public.product_attributes AS attribute
        JOIN public.products AS product ON product.id = attribute.product_id
        WHERE attribute.sku = btrim(p_sku)
          AND product.organization_id = p_organization_id
          AND product.is_active
        FOR SHARE OF product;
        INSERT INTO public.cost_v1_configurations (
            organization_id, product_id, sku, input_json, version,
            is_active, created_by, created_at, updated_at
        ) VALUES (
            p_organization_id, v_product_id, btrim(p_sku), p_input_json, 1,
            TRUE, p_actor_profile_id, v_now, v_now
        ) RETURNING * INTO v_configuration;
    END IF;

    SELECT sheet.id INTO v_previous_sheet_id
    FROM public.cost_sheet_versions AS sheet
    WHERE sheet.organization_id = p_organization_id
      AND sheet.sku = btrim(p_sku)
      AND sheet.status = 'ACTIVE'
    ORDER BY sheet.version DESC
    LIMIT 1
    FOR UPDATE;
    SELECT COALESCE(MAX(sheet.version), 0) + 1 INTO v_next_sheet_version
    FROM public.cost_sheet_versions AS sheet
    WHERE sheet.organization_id = p_organization_id
      AND sheet.sku = btrim(p_sku);
    IF v_previous_sheet_id IS NOT NULL THEN
        UPDATE public.cost_sheet_versions
        SET status = 'ARCHIVED', updated_at = v_now
        WHERE id = v_previous_sheet_id AND organization_id = p_organization_id;
    END IF;
    INSERT INTO public.cost_sheet_versions (
        organization_id, product_id, sku, version, name, batch_size,
        effective_date, status, true_unit_cost_usd, true_unit_cost_pyg,
        fx_rate_used, minimum_sustainable_price_usd, break_even_units,
        notes, created_at, updated_at
    ) VALUES (
        p_organization_id, v_configuration.product_id, btrim(p_sku),
        v_next_sheet_version,
        concat_ws(' ', NULLIF(btrim(p_sheet_name), ''), format('(v%s)', v_next_sheet_version)),
        p_batch_size, (v_now AT TIME ZONE 'America/Asuncion')::DATE,
        'ACTIVE', p_true_unit_cost_usd,
        CASE WHEN p_fx_rate IS NULL THEN NULL ELSE round(p_true_unit_cost_usd * p_fx_rate, 0) END,
        p_fx_rate, p_minimum_sustainable_price_usd, p_break_even_units,
        p_notes, v_now, v_now
    ) RETURNING * INTO v_sheet;

    FOR v_component IN SELECT value FROM jsonb_array_elements(p_components)
    LOOP
        IF jsonb_typeof(v_component) <> 'object'
           OR NULLIF(btrim(v_component->>'category'), '') IS NULL
           OR NULLIF(btrim(v_component->>'name'), '') IS NULL
           OR v_component->>'component_type' NOT IN ('FIXED', 'VARIABLE')
           OR v_component->>'basis' NOT IN ('PER_UNIT', 'PER_BATCH')
           OR NULLIF(v_component->>'rate_usd', '') IS NULL THEN
            RAISE EXCEPTION 'INVALID_COST_COMPONENT';
        END IF;
        BEGIN
            v_component_id := uuid_generate_v4();
            INSERT INTO public.cost_components (
                id, cost_sheet_id, category, name, component_type, basis,
                rate_usd, quantity, unit_of_measure, effective_date, notes,
                created_at, updated_at
            ) VALUES (
                v_component_id, v_sheet.id, btrim(v_component->>'category'),
                btrim(v_component->>'name'), v_component->>'component_type',
                v_component->>'basis', (v_component->>'rate_usd')::NUMERIC,
                COALESCE(NULLIF(v_component->>'quantity', '')::NUMERIC, 1),
                COALESCE(NULLIF(btrim(v_component->>'unit_of_measure'), ''), 'unit'),
                COALESCE(NULLIF(v_component->>'effective_date', '')::DATE, (v_now AT TIME ZONE 'America/Asuncion')::DATE),
                NULLIF(v_component->>'notes', ''), v_now, v_now
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_COST_COMPONENT: %', SQLERRM;
        END;
    END LOOP;
    SELECT COALESCE(jsonb_agg(to_jsonb(component) ORDER BY component.created_at, component.id), '[]'::jsonb)
    INTO v_components_result
    FROM public.cost_components AS component
    WHERE component.cost_sheet_id = v_sheet.id;

    IF p_persist_snapshot THEN
        v_snapshot := public.write_industrial_process_snapshot(
            p_organization_id, p_sku, p_period, p_calculation,
            p_parameters_snapshot, p_actor_profile_id, 'APPLY', p_idempotency_key
        );
    END IF;
    INSERT INTO public.audit_events (
        organization_id, actor_id, event_type, target_entity,
        entity_id, metadata_json, created_at
    ) VALUES (
        p_organization_id, p_actor_profile_id, 'cost_edit', 'cost_sheet_versions',
        v_sheet.id::TEXT,
        jsonb_build_object(
            'action', 'INDUSTRIAL_PROCESS_APPLY', 'sku', p_sku,
            'period', p_period, 'sheet_version', v_next_sheet_version,
            'configuration_version', v_configuration.version,
            'request_id', p_idempotency_key
        ), v_now
    );

    v_result := jsonb_build_object(
        'applied', TRUE,
        'configuration', to_jsonb(v_configuration),
        'cost_sheet', to_jsonb(v_sheet),
        'components', v_components_result,
        'snapshot', v_snapshot,
        'snapshot_revision', CASE WHEN v_snapshot IS NULL THEN NULL ELSE v_snapshot->'revision' END,
        'server_now', clock_timestamp()
    );
    PERFORM public.finish_industrial_idempotency_request(
        p_organization_id, 'PROCESS_APPLY_COST', p_idempotency_key,
        v_sheet.id, v_result
    );
    RETURN v_result;
END;
$$;

-- Keep the original interval logic while wrapping it with employee/band row locks
-- and a termination-date cap. The original bodies remain private implementation
-- functions callable only by service_role through these wrappers.
ALTER FUNCTION public.save_plant_personnel_salary_assignment(UUID, UUID, UUID, DATE, DATE)
    RENAME TO save_plant_personnel_salary_assignment_unlocked_20261010;
ALTER FUNCTION public.save_plant_personnel_salary_assignment_unlocked_20261010(UUID, UUID, UUID, DATE, DATE)
    SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.save_plant_personnel_salary_assignment(
    p_organization_id UUID,
    p_personnel_id UUID,
    p_salary_band_id UUID,
    p_valid_from DATE,
    p_valid_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_termination_date DATE;
    v_effective_to DATE := p_valid_to;
BEGIN
    IF p_organization_id IS NULL OR p_personnel_id IS NULL OR p_salary_band_id IS NULL
       OR p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from) THEN
        RAISE EXCEPTION 'INVALID_SALARY_ASSIGNMENT_DATES';
    END IF;
    SELECT person.termination_date INTO v_termination_date
    FROM public.plant_personnel AS person
    WHERE person.id = p_personnel_id AND person.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PERSONNEL_NOT_FOUND'; END IF;
    IF v_termination_date IS NOT NULL AND p_valid_from > v_termination_date THEN
        RAISE EXCEPTION 'PERSONNEL_NOT_ACTIVE_ON_DATE';
    END IF;
    PERFORM 1
    FROM public.plant_salary_bands AS band
    WHERE band.id = p_salary_band_id
      AND band.organization_id = p_organization_id
      AND band.status = 'ACTIVE'
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_BAND_NOT_FOUND'; END IF;
    IF v_termination_date IS NOT NULL THEN
        v_effective_to := LEAST(COALESCE(v_effective_to, v_termination_date), v_termination_date);
    END IF;
    RETURN public.save_plant_personnel_salary_assignment_unlocked_20261010(
        p_organization_id, p_personnel_id, p_salary_band_id,
        p_valid_from, v_effective_to
    );
END;
$$;

ALTER FUNCTION public.save_plant_personnel_assignment(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE)
    RENAME TO save_plant_personnel_assignment_unlocked_20261010;
ALTER FUNCTION public.save_plant_personnel_assignment_unlocked_20261010(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE)
    SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.save_plant_personnel_assignment(
    p_organization_id UUID,
    p_personnel_id UUID,
    p_sector TEXT,
    p_machine_generation TEXT,
    p_line_id TEXT,
    p_allocation_percent NUMERIC,
    p_valid_from DATE,
    p_valid_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_termination_date DATE;
    v_effective_to DATE := p_valid_to;
    v_salary_band_id UUID;
BEGIN
    IF p_organization_id IS NULL OR p_personnel_id IS NULL OR p_valid_from IS NULL
       OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from) THEN
        RAISE EXCEPTION 'INVALID_ASSIGNMENT_DATES';
    END IF;
    SELECT person.termination_date INTO v_termination_date
    FROM public.plant_personnel AS person
    WHERE person.id = p_personnel_id AND person.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PERSONNEL_NOT_FOUND'; END IF;
    IF v_termination_date IS NOT NULL AND p_valid_from > v_termination_date THEN
        RAISE EXCEPTION 'PERSONNEL_NOT_ACTIVE_ON_DATE';
    END IF;
    SELECT assignment.salary_band_id INTO v_salary_band_id
    FROM public.plant_personnel_salary_assignments AS assignment
    WHERE assignment.organization_id = p_organization_id
      AND assignment.personnel_id = p_personnel_id
      AND assignment.valid_from <= p_valid_from
      AND (assignment.valid_to IS NULL OR assignment.valid_to >= p_valid_from)
    ORDER BY assignment.valid_from DESC
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'PERSONNEL_SALARY_BAND_REQUIRED'; END IF;
    PERFORM 1
    FROM public.plant_salary_bands AS band
    WHERE band.id = v_salary_band_id
      AND band.organization_id = p_organization_id
      AND band.status = 'ACTIVE'
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_BAND_NOT_FOUND'; END IF;
    IF v_termination_date IS NOT NULL THEN
        v_effective_to := LEAST(COALESCE(v_effective_to, v_termination_date), v_termination_date);
    END IF;
    RETURN public.save_plant_personnel_assignment_unlocked_20261010(
        p_organization_id, p_personnel_id, p_sector, p_machine_generation,
        p_line_id, p_allocation_percent, p_valid_from, v_effective_to
    );
END;
$$;

-- The original update routine performs the profile update and optional salary
-- interval write. Keep that history-preserving implementation behind a locked
-- guard that verifies salary coverage before allowing ACTIVE personnel state.
ALTER FUNCTION public.update_plant_personnel_with_salary(UUID, UUID, JSONB, UUID, DATE)
    RENAME TO update_plant_personnel_with_salary_unlocked_20261010;
ALTER FUNCTION public.update_plant_personnel_with_salary_unlocked_20261010(UUID, UUID, JSONB, UUID, DATE)
    SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.update_plant_personnel_with_salary(
    p_organization_id UUID,
    p_personnel_id UUID,
    p_updates JSONB,
    p_salary_band_id UUID DEFAULT NULL,
    p_salary_valid_from DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_person public.plant_personnel;
    v_salary_band_id UUID;
    v_rate_id UUID;
    v_effective_date DATE;
    v_result JSONB;
BEGIN
    IF p_organization_id IS NULL OR p_personnel_id IS NULL
       OR p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PERSONNEL_UPDATE';
    END IF;
    IF p_salary_band_id IS NULL AND p_salary_valid_from IS NOT NULL THEN
        RAISE EXCEPTION 'INVALID_SALARY_ASSIGNMENT_DATES';
    END IF;
    IF p_salary_band_id IS NOT NULL AND p_salary_valid_from IS NULL THEN
        RAISE EXCEPTION 'INVALID_SALARY_ASSIGNMENT_DATES';
    END IF;

    SELECT * INTO v_person
    FROM public.plant_personnel AS person
    WHERE person.id = p_personnel_id
      AND person.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PERSONNEL_NOT_FOUND'; END IF;

    v_result := public.update_plant_personnel_with_salary_unlocked_20261010(
        p_organization_id, p_personnel_id, p_updates,
        p_salary_band_id, p_salary_valid_from
    );

    SELECT * INTO v_person
    FROM public.plant_personnel AS person
    WHERE person.id = p_personnel_id
      AND person.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PERSONNEL_NOT_FOUND'; END IF;

    IF v_person.status = 'ACTIVE' THEN
        -- An ACTIVE employee must be covered today and at the explicit salary
        -- change date, if that change is historical or future-dated.
        FOR v_effective_date IN
            SELECT DISTINCT effective_date
            FROM (VALUES (CURRENT_DATE), (COALESCE(p_salary_valid_from, CURRENT_DATE))) AS dates(effective_date)
            ORDER BY effective_date
        LOOP
            IF v_person.termination_date IS NOT NULL
               AND v_person.termination_date < v_effective_date THEN
                RAISE EXCEPTION 'PERSONNEL_NOT_ACTIVE_ON_DATE';
            END IF;

            SELECT assignment.salary_band_id INTO v_salary_band_id
            FROM public.plant_personnel_salary_assignments AS assignment
            WHERE assignment.organization_id = p_organization_id
              AND assignment.personnel_id = p_personnel_id
              AND assignment.valid_from <= v_effective_date
              AND (assignment.valid_to IS NULL OR assignment.valid_to >= v_effective_date)
            ORDER BY assignment.valid_from DESC
            LIMIT 1
            FOR SHARE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'PERSONNEL_SALARY_BAND_REQUIRED';
            END IF;

            PERFORM 1
            FROM public.plant_salary_bands AS band
            WHERE band.id = v_salary_band_id
              AND band.organization_id = p_organization_id
              AND band.status = 'ACTIVE'
            FOR SHARE;
            IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_BAND_NOT_FOUND'; END IF;

            SELECT rate.id INTO v_rate_id
            FROM public.plant_salary_band_rates AS rate
            WHERE rate.organization_id = p_organization_id
              AND rate.band_id = v_salary_band_id
              AND rate.valid_from <= v_effective_date
              AND (rate.valid_to IS NULL OR rate.valid_to >= v_effective_date)
            ORDER BY rate.valid_from DESC
            LIMIT 1
            FOR SHARE;
            IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_BAND_RATE_NOT_FOUND'; END IF;
        END LOOP;
    END IF;

    RETURN v_result;
END;
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Restrict every
-- workflow entry point and helper to the trusted server role; callers still run
-- with SECURITY INVOKER privileges and tenant checks in the function bodies.
REVOKE EXECUTE ON FUNCTION public.claim_industrial_idempotency_request(UUID, TEXT, UUID, JSONB, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_industrial_idempotency_request(UUID, TEXT, UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_packing_operator_token(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.packing_session_json(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_industrial_process_snapshot(UUID, TEXT, TEXT, JSONB, JSONB, UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_industrial_production_basis(UUID, TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.start_packing_session_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, DATE, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.change_packing_headcount_atomic(UUID, UUID, UUID, INTEGER, TEXT, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stop_packing_session_atomic(UUID, UUID, UUID, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_packing_session_with_labor_atomic(UUID, UUID, UUID, JSONB, UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.correct_packing_session_atomic(UUID, UUID, UUID, NUMERIC, TEXT, UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.void_packing_session_atomic(UUID, UUID, UUID, TEXT, UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_industrial_process_snapshot_atomic(UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_industrial_cost_to_cost_intelligence_atomic(UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, INTEGER, NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, JSONB, UUID, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.save_plant_personnel_salary_assignment(UUID, UUID, UUID, DATE, DATE)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_plant_personnel_assignment(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_plant_personnel_salary_assignment_unlocked_20261010(UUID, UUID, UUID, DATE, DATE)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_plant_personnel_assignment_unlocked_20261010(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_plant_personnel_with_salary(UUID, UUID, JSONB, UUID, DATE)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_plant_personnel_with_salary_unlocked_20261010(UUID, UUID, JSONB, UUID, DATE)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_industrial_idempotency_request(UUID, TEXT, UUID, JSONB, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_industrial_idempotency_request(UUID, TEXT, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_packing_operator_token(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.packing_session_json(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_industrial_process_snapshot(UUID, TEXT, TEXT, JSONB, JSONB, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_industrial_production_basis(UUID, TEXT, TEXT, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION public.start_packing_session_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, DATE, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_packing_headcount_atomic(UUID, UUID, UUID, INTEGER, TEXT, TEXT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.stop_packing_session_atomic(UUID, UUID, UUID, TEXT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_packing_session_with_labor_atomic(UUID, UUID, UUID, JSONB, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.correct_packing_session_atomic(UUID, UUID, UUID, NUMERIC, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_packing_session_atomic(UUID, UUID, UUID, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_industrial_process_snapshot_atomic(UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_industrial_cost_to_cost_intelligence_atomic(UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, INTEGER, NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, JSONB, UUID, TEXT, BOOLEAN) TO service_role;

GRANT EXECUTE ON FUNCTION public.save_plant_personnel_salary_assignment(UUID, UUID, UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_plant_personnel_assignment(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_plant_personnel_salary_assignment_unlocked_20261010(UUID, UUID, UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_plant_personnel_assignment_unlocked_20261010(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_plant_personnel_with_salary(UUID, UUID, JSONB, UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_plant_personnel_with_salary_unlocked_20261010(UUID, UUID, JSONB, UUID, DATE) TO service_role;
