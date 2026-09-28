# NIUPACK Security Closure Report

## Executive Summary

The active Logistics surface was hardened against anonymous access, cross-tenant reads and mutations, direct client table access, secret disclosure, and unsafe error responses. Supabase now reports 45 public tables with RLS enabled and at least one policy each; no table grants SELECT to `anon` or `authenticated`, while trusted server operations use `service_role`.

The application is **not eligible for final security certification yet**. The non-Logistics OS still uses `src/lib/db/repository.ts`, an in-process singleton seeded with one organization. Its internal API routes are now session-protected, but that repository is not globally tenant-aware or durable. A second authenticated organization could reach the same legacy in-memory state. This is an active-scope HIGH finding and leaves the final status `BLOCKED`.

## Scope

Audited and hardened:

- Next.js internal pages, route handlers, middleware, authentication boundary, and error responses.
- Supabase public tables, RLS, policies, table grants, the private organization resolver, and critical foreign-key indexes.
- Organizations, profiles, suppliers, audit events, Logistics tables, legacy tables, service-role usage, environment documentation, settings redaction, storage applicability, and secret patterns.
- Real Supabase authentication with the existing certification users and organizations.

Out of scope by instruction: new modules, UI redesign, commercial logic, SeaRates integration, SMTP configuration, destructive data operations, and Product schema changes.

## Architecture

- Public website: static `index.html`, `pt.html`, `en.html` and assets; it does not use the internal Next.js middleware or Supabase session.
- Internal OS: Next.js App Router under `src/app`, with `src/middleware.ts` as the authentication boundary and the `(dashboard)` layout as a second server-side guard.
- Logistics persistence: Supabase-backed repository with organization filters and server-side identity resolution.
- Legacy OS persistence: in-process repository singleton in `src/lib/db/repository.ts`; it is not a Supabase-backed tenant repository.
- Trusted database access: server-only `supabaseAdmin` usage in auth and Logistics server code. No browser module imports the admin client.

## Supabase project

- Project ref: `tviuvfmhkatdplkisnta`.
- Branch: `main`.
- Migrations applied remotely: initial schema, Logistics migrations, six security migrations, and critical FK indexes.
- Public views: none found.
- Storage buckets: none found.

## RLS status

Verified against the real project after migration:

| Metric | Result |
|---|---:|
| Public tables audited | 45 |
| RLS enabled | 45 |
| RLS with policies | 45 |
| RLS without policies | 0 |
| Direct SELECT grants to `anon` | 0 |
| Direct SELECT grants to `authenticated` | 0 |
| `service_role` SELECT grants | 45 |

Every table below was observed with `RLS_ENABLED=true`, `POLICY_COUNT=1`, no direct `anon`/`authenticated` SELECT grant, and server-only access through the trusted server path. The policy semantics are not generic `USING (true)` policies:

| Tables | Classification | Tenant resolution | Runtime status | Risk/action |
|---|---|---|---|---|
| `organizations` | A — TENANT DATA | organization id resolved from profile | ACTIVE | self-select policy; writes remain server-only |
| `profiles` | B — USER PRIVATE DATA | own `auth_user_id`, email fallback only for initial link | ACTIVE | self-select policy; grants removed |
| `suppliers` | A — TENANT DATA | `organization_id = private.current_organization_id()` | ACTIVE | tenant-select policy; server-only writes |
| `audit_events` | F — AUDIT / SECURITY DATA | `organization_id = private.current_organization_id()` | ACTIVE | tenant-select policy; writes service-role/server-side only |
| `logistics_provider_profiles`, `logistics_provider_routes`, `logistics_rfqs`, `logistics_rfq_invitations`, `logistics_rfq_quotes`, `logistics_rates`, `logistics_bookings`, `export_cost_adjustments` | A — TENANT DATA | direct `organization_id` and server-side identity | ACTIVE | existing tenant policies retained; direct client grants closed |
| `actions`, `brands`, `cost_scenarios`, `cost_sheet_versions`, `email_threads`, `job_runs`, `market_price_observations`, `markets`, `process_definitions`, `products`, `queries`, `query_batteries`, `query_competitors`, `query_mentions`, `query_results`, `query_runs`, `query_sources`, `recommendations`, `rfqs`, `strategy_snapshots`, `supplier_quotes`, `system_settings`, `visibility_snapshots` | A — TENANT DATA; G — LEGACY / UNUSED in the current repository | direct `organization_id` | LEGACY / DEFERRED | tenant SELECT policies added; no current Supabase repository consumer |
| `cost_components`, `email_messages`, `process_steps`, `product_attributes`, `quote_items`, `rfq_items`, `rfq_supplier_dispatches`, `scenario_inputs`, `scenario_results`, `supplier_contacts` | A — TENANT DATA; G — LEGACY / UNUSED in the current repository | parent row's `organization_id` via `EXISTS` policy | LEGACY / DEFERRED | parent-scoped SELECT policies added; no current Supabase repository consumer |

No table was classified as shared public-safe data or unknown after schema review. Legacy lifecycle ownership remains deferred; no table was dropped or made public.

## Tenant isolation

- `organizations`: PASS for the database surface; only the current organization is selectable and there are no client grants.
- `profiles`: PASS for self-select and server-side identity linking; no organization-wide profile enumeration is exposed.
- `suppliers`: PASS in real Logistics requests; provider listing is scoped by the authenticated organization.
- `audit_events`: PASS for server-side append and tenant-scoped read; direct client grants are removed.
- `logistics`: PASS in real Supabase E2E, including ORG_A/ORG_B read and mutation isolation.
- Other active domains: **FAIL**. Legacy routes are authenticated but the singleton repository does not resolve or enforce tenant ownership.

## Auth

The original root-level `middleware.ts` was not included by Next because the application uses `src/app`. It was moved to `src/middleware.ts`, and the production build now reports `Middleware` in its route output.

- Internal OS auth: PASS for anonymous isolation; unauthenticated APIs return `401`, and internal pages redirect to `/login`.
- Server-side tenant resolution: PASS for Logistics; FAIL globally because legacy repository consumers still use fixed in-memory organization state.
- Anonymous isolation: PASS in real HTTP smoke (`/api/actions` → `401`, internal page → `307` to login).
- Public exception: `/api/logistics/public/[token]` remains reachable without a session and validates one-time magic tokens server-side.

## RPCs / database functions

One database function was found: `private.current_organization_id()`.

- `SECURITY DEFINER`: yes.
- `search_path`: empty (`search_path=""`).
- References: fully qualified `public.profiles` and scoped `auth.uid()` / `auth.email()`.
- Execute grants: `anon=false`, `authenticated=true`, `service_role=true`.
- Dangerous public execute grant: none found.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` is used only by server modules and is not under `NEXT_PUBLIC_*`.
- The public Supabase client now uses only the anon/publishable key and never falls back to the service-role key.
- `/api/settings` no longer returns `openai_api_key` or `smtp_pass`; audit metadata stores only configuration booleans.
- Error responses from internal routes no longer return raw provider, SQL, or repository exception messages.
- Tracked secret-pattern scan: no real committed secret found. The only match was the documented placeholder in `.env.example`.
- Rotation required: none identified by the tracked scan. Existing external credentials were not rotated automatically.

## Storage

Status: `NOT_APPLICABLE`.

No Supabase Storage buckets or file upload/download endpoints were found, so cross-tenant Storage isolation is `NOT_APPLICABLE`.

## Legacy tables

The original 37 no-policy tables were classified by schema instead of receiving a blanket public policy. They now have tenant-aware policies where a direct or parent organization relationship exists, while `anon`, `authenticated`, `PUBLIC` direct grants were removed. They remain `DEFERRED FOR DEPRECATION` because the current OS repository does not use them for persistence.

The more important unresolved legacy issue is in the application layer: `src/lib/db/repository.ts` is a process-local singleton with seeded data. It must be replaced or wrapped by a real tenant-aware persistent repository before the non-Logistics OS can be certified for multiple organizations.

## Issues fixed

- Added policies to the former 37 RLS-without-policy tables, including parent-scoped policies for child tables.
- Added explicit policies for `organizations`, `profiles`, `suppliers`, and `audit_events`.
- Removed direct client table grants; server-role access remains available for trusted server code.
- Hardened `private.current_organization_id()` search path and authorization inputs.
- Activated the global internal authentication boundary in the correct `src/` location.
- Added the dashboard server-side guard.
- Redacted settings secrets and sanitized audit metadata.
- Replaced raw internal errors in API responses with stable error codes.
- Added security headers without an untested CSP.
- Added indexes for `profiles.organization_id`, `suppliers.organization_id`, `audit_events.organization_id`, and `audit_events.actor_id`.

## Issues deferred

- **HIGH / active:** legacy OS repository is in-memory, shared, and not globally tenant-aware. This blocks certification.
- **MANUAL CONFIG REQUIRED:** Supabase Leaked Password Protection remains disabled according to the real Security Advisor.
- 49 legacy/unindexed foreign keys remain after adding four critical indexes; the remaining findings are performance/operability debt, not a demonstrated security exploit.
- Production Logistics invitations require a non-local `NEXT_PUBLIC_BASE_URL`; the runtime correctly fails closed with `PUBLIC_BASE_URL_NOT_CONFIGURED` when absent or local in production.
- Legacy table deprecation and full persistence migration require a separate architecture task.

## External configuration

- SMTP: `NOT_CONFIGURED` — not a security failure for this mission.
- SeaRates: `NOT_CONFIGURED` — not a security failure for this mission.
- Supabase Leaked Password Protection: `MANUAL CONFIG REQUIRED` — not changed automatically.

## Tests

### Automated

- Total: 84
- Passed: 84
- Failed: 0
- Test files: 22 passed
- Lint: PASS
- Typecheck: PASS
- Build: PASS
- `git diff --check`: PASS

### Real cross-tenant E2E

Using the existing certification users and organizations against the real Supabase project:

- A → B read: PASS
- A → B mutation: PASS
- B → A read: PASS
- B → A mutation: PASS
- Direct authenticated client table access: denied (`403`)
- Settings secret redaction: PASS

### Logistics regression

- Auth: PASS
- RFQ: PASS
- Magic link: PASS
- Quote: PASS
- Comparator: PASS
- Selection: PASS

The valid end-to-end run was executed in a controlled development runtime because production intentionally rejects `localhost` as a public base URL. The production guard itself was verified to fail closed when `NEXT_PUBLIC_BASE_URL` is missing/local.

## Residual risk

The remaining HIGH finding is exploitable in the active internal OS surface if two organizations use legacy modules concurrently: authentication prevents anonymous access but does not turn the process-local repository into a tenant-isolated database. This is why the application is not marked certified.

## Final status

`BLOCKED`

The database/RLS and Logistics security baseline is hardened and evidenced, but the global application security baseline cannot be certified until legacy OS persistence and tenant resolution are made real and organization-scoped.

## Commit reference

- Security hardening commit: `2bcdd37` (`fix(security): harden global tenant and database access`)
- Full closure report commit: `7d7c870` (`docs(security): certify NIUPACK security baseline`).
