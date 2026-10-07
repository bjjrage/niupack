# CRM account deletion

Initial commit: `a78fb821bcdfd1e88d7a5bd530ffa595c3402874`.
The ingestion DELETE is unchanged and is never called by this flow.

## Actual dependency audit

Inspected the linked NIUPACK project's `pg_constraint` and
`information_schema.triggers` before implementation. There are 16 incoming
foreign keys to companies/contacts and no application triggers on those tables.

| Referencing table | Company FK | Contact FK | Existing delete action | New behavior |
| --- | --- | --- | --- | --- |
| crm_contacts | company_id | — | SET NULL | Explicit cleanup only when owned and entirely unreferenced |
| crm_customer_purchases | company_id | contact_id | CASCADE / SET NULL | Block |
| crm_opportunities | company_id | contact_id | SET NULL | Block, including won/lost |
| crm_leads | company_id | contact_id | SET NULL | Block |
| crm_tasks | company_id | — | SET NULL | Block, including done/cancelled |
| crm_activities | company_id | contact_id | SET NULL | Block, including notes/metadata |
| crm_conversations | — | contact_id | SET NULL | Block, including closed/archived |
| crm_customer_aliases | company_id | — | CASCADE | Block: preserve aliases |
| crm_import_rows | company_id | — | SET NULL | Block: preserve ingestion rows |
| niupackbot_campaign_recipients | company_id | contact_id | SET NULL | Block |

Conversations linked through leads/opportunities are protected because those
parent dependencies already block company/contact deletion. Any additional real
FK discovered at runtime also blocks, including composite keys and other schemas.
Counts deduplicate rows referencing both company and contact. References from a
different tenant block cleanup but never permit deleting that tenant's records.

There is no exemption based on `source`, age, lifecycle, task status or activity
type. Contacts are the only metadata cleanup exception: a contact must belong to
the account's tenant and have no incoming FK references. Shared or incorrectly
linked contacts cause the whole account to remain intact.

## Boundaries and transactions

- Routes derive the tenant exclusively from `requireNiuIdentity()`.
- `DELETE /api/crm/accounts/[id]`: 200 deleted, 409
  `ACCOUNT_HAS_BUSINESS_DATA` plus counts, 404 for missing/cross-tenant IDs.
- `POST /api/crm/accounts/bulk-delete/preview`: read-only inspection.
- `POST /api/crm/accounts/bulk-delete`: deletes safe accounts and returns every
  deleted, blocked, missing or failed account. UUID arrays have 1–500 entries;
  duplicates are removed and arbitrary body fields are rejected.
- The service classifies accounts; the repository exclusively invokes SQL RPCs.
- RPCs are `SECURITY INVOKER` with an empty search path. EXECUTE is revoked from
  PUBLIC/anon/authenticated and granted only to the server's service_role.
- Execution locks the company, then its contacts, before repeating all FK
  inspections. PostgreSQL FK key-share locks prevent a concurrent reference
  from slipping between inspection and deletion. No business cascade is used.
- Contacts and company are explicitly deleted in one transaction. Each batch
  account has an exception subtransaction, so a failed company delete rolls back
  its contacts while safe accounts elsewhere in the batch can succeed.
- Batch IDs are processed in deterministic order, with a single database
  roundtrip per inspection/execution rather than hundreds of HTTP requests.

## UI

`Comercial → Cuentas` supports individual checkboxes, visible select-all, a bulk
action bar, and the row menu (`Ver cuenta`, `Eliminar cuenta`). Source filtering
supports MANUAL and the audited IMPORT / IMPORT_CUSTOMER_LIST /
IMPORT_PROSPECT_LIST family. Source filtering itself never deletes anything.

Changing tab, source or search clears selection with an explicit visible notice.
Destructive actions always perform a fresh preview and require a final button
click. Bulk confirmation submits only the IDs shown as safe in that preview;
previously blocked accounts cannot become part of that confirmed deletion.
Server execution repeats safety checks for newly arrived history. Results update
the local rows/counts immediately and invoke `actions.reload()` for the complete
workspace; removed IDs are cleared from selection.

## Verification

Service/route tests use the repository's existing memory guard. React tests render
the actual AccountsView and dialog, interacting through their accessible controls.
SQL tests use isolated PGlite PostgreSQL with the actual CRM/outreach migrations
and uuid-ossp extension; they validate real FK behavior, atomic rollback, new FK
discovery, contact-only history, and RPC privileges. No test connects to live
Supabase or executes a production account deletion.

Deployment adds the two RPC functions only; it does not modify existing FKs,
tables, policies or CRM records. Real CRM/staging/catalog counts and content hashes
are compared before and after development. The user performs any real deletion
manually through the preview UI.
