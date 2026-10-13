# Supabase Setup and Backend Status

This document is the operational checklist for the app's Supabase boundary.
The repository contains the forward-only domain schema, authored catalog seed
data, and authenticated RPC/repository phase. The current MVP-3 checkpoint is
summarized first; RC3 and RC2 evidence below remains a historical audit trail.

The MVP authority is Supabase Auth plus Postgres. Browser storage may cache
read models or preserve recoverable drafts, but it must not become a
second source of truth. Durable mutations use deliberate authenticated RPC
wrappers backed by private implementations; direct client table writes remain
revoked.

## Saved-recipe authoring rollout — 2026-10-08

With explicit owner authorization, the four recipe migrations from
`20261008074630_recipe_authoring.sql` through
`20261008082400_validate_recipe_instruction_type.sql` were applied to the linked
Cali database. Preflight matched all 52 baseline migration versions and all 12
schema fingerprint categories after excluding only the declared new recipe
objects and three replaced functions. The three deployed baseline function
bodies matched their migration sources exactly. No legacy source URL exceeded
the new 2,000-character reference limit.

After the push, all 56 local/linked migration versions and all 12 complete schema
fingerprint categories matched. The final dry run reports no pending migrations,
seeds, or roles. Linked database lint found no schema errors. Linked database
types were regenerated and TypeScript passed. The complete forward migration
sequence had already passed a clean local reset and all 589 database assertions.

The deployed authoring path passed 23 rollback-only assertions, including
atomic custom-food/recipe saving, required text instructions, reference storage,
invalid-input rollback, duplicate retries, stale revisions, legacy saved-meal
compatibility, cross-owner and anonymous denial, and custom-recipe account
cleanup. Unique disposable identities were used; the transaction rolled back
and no test users remained. The live REST API returns HTTP 200 for the new
reference column and rejects anonymous `save_recipe` execution with code
`42501`. Reference backfill has no unmatched legacy source URLs. The user's
open recipe draft was neither submitted nor cleared during verification.

The security advisor continues to identify the deliberate authenticated
`SECURITY DEFINER` wrappers, the server-only provider quota table with RLS and
no client policies, and the pre-existing disabled leaked-password protection
setting. RPC ownership and grants were verified; this rollout does not change
Auth settings. See the advisor guidance for
[authenticated function execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[RLS without client policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Planned-meal logging rollout — 2026-10-08

With explicit owner authorization, the five forward migrations from
`20261007034332_add_planned_meal_transaction.sql` through
`20261007044520_link_logged_planned_meals.sql` were applied to the linked Cali
database. Before the push, all 47 applied migration versions matched and a
reconstructed local baseline matched the linked `public`/`private` schema in all
12 fingerprint categories, including columns, constraints, indexes, policies,
grants, triggers, and function bodies. The read-only data preview found no
AI-only planned foods or recipe ingredients and identified one unambiguous
standalone log and two unambiguous grouped logs for historical linking.

The full local reset, 566 database assertions, and database lint passed before
the push. Afterward, all 52 local/linked migration versions and all 12 schema
fingerprint categories matched; the linked dry run had no pending migrations,
seeds, or roles, and linked database lint found no schema errors. The linked
type generator confirmed the new planned-meal columns and RPC. The live REST
endpoint rejected anonymous execution with a permission error, while a
rollback-only authenticated call reached `log_planned_meal` validation. No
test data was retained. The security advisor still lists the deliberate
authenticated `SECURITY DEFINER` RPC wrappers and the pre-existing disabled
leaked-password protection setting; these remain separate from this rollout.

## MVP-3 operational handover — 2026-10-04

Shared Cali already received the seven verified MVP-3 forward migrations on
2026-10-01. At that checkpoint all 46 local/remote versions, 12 schema comparison
categories, and 39 rollback-only deployed RPC/RLS assertions matched/passed.
Generated public types reflect that deployed schema. Git commit/push packaging
does not require another database push. Do not edit or replay applied migrations;
perform a fresh preflight before any future database change.

PR #3 merged MVP-3 into `main` on 2026-10-04; candidate and resulting-main CI
passed. CI database checks use a disposable local stack and do not constitute
a new shared-database verification. The handover and matrix link the exact
candidate/merge SHAs and successful runs separately from the October 1 evidence.

Local Mailpit signup/resend and token-hash confirmation passed. Hosted app
deployment, hosted signup template/Site URL/redirect configuration, and staging
SMTP delivery, final hosted acceptance, and release sign-off remain pending;
the user deferred the staging email check.
Section [9](#9-mvp-3-confirmation-and-schema-release-gates) owns the operational
procedure. [`MVP3_HANDOVER.md`](./MVP3_HANDOVER.md) supplies the full checklist
and commit manifest; [`MVP_Priority_Matrix.md`](./MVP_Priority_Matrix.md) preserves
dated fingerprints and test evidence. No shared service settings change is part
of this documentation/Git handover.

## Historical RC3 verification checkpoint — 2026-09-29

- The disposable local Supabase database reset successfully. All 39 repository
  migrations applied in order, including `20260918033000`; applied history has
  39 entries and the database-only `20260918113514` entry is absent.
- Local DB lint passed; all 10 pgTAP suites / 436 assertions passed; all 31 RPC
  wrappers and concurrency checks passed. The repository integration suite
  passed 4 tests for hydration, stale revisions, historical plan preservation,
  idempotent nutrition, history pagination, grocery reconciliation, and account
  isolation.
- Typecheck, lint, all 55 existing unit tests, and the production build passed.
  Authenticated Playwright passed 24/24 across 1440×900 and 390×844, including
  setup/teardown and the fresh-account journey. Public browser tests passed 4/4;
  required tests had no skips, and local accounts/storage states were removed.
- Supabase CLI is pinned to `2.118.0` and is used by the local verification
  scripts and the new CI integration job.
- Candidate source `8414374d45ec33b890860ed2e646bfa68c2ef1f3` is on branch
  `codex/mvp-2-rc3`, based on `main` at
  `a1db26463e87dab1d3da6dc01293423a9be5ae62`. [PR #1](https://github.com/BrylleMutia/untitled-exercise-meal-app/pull/1)
  is open; it includes the release-gate implementation and mobile grocery
  touch-target/grid fixes; remote verification ran against this source commit.
  The existing
  annotated `mvp-1.0.0-rc.2` tag points to `53f1fd9`.
- Linked migration history matches all 39 repository versions. The read-only
  fingerprint from `scripts/release-schema-fingerprint.sql` matches for
  columns, constraints, indexes, RLS policies, relations, routines/bodies,
  grants, schemas, and triggers after normalizing CRLF/LF. The deployed
  `nutrition-search`, `nutrition-text-parse`, `nutrition-meal-match`, and
  `nutrition-macro-estimate` functions are JWT-protected at versions 7, 7, 2,
  and 1; all eight deployed source files match the repository. Remote
  `planned_exercises` contains 93 rows, no duplicate sort groups, no invalid
  order values, and no orphaned exercise-history references.
- On 2026-09-29, from source commit
  `8414374d45ec33b890860ed2e646bfa68c2ef1f3`, the corrected guarded provider smoke passed with a newly
  confirmed disposable account: all four anonymous probes returned 401; USDA
  search, DeepSeek extraction, two-ingredient meal matching, one low-confidence
  estimate, a unique reviewed USDA food save, and authenticated account export
  passed. The export contained one persisted provider food and no nutrition
  logs. The record was FDC `2708951` (`Survey (FNDDS)`), release
  `FoodData Central API verified 2026-09-22`, revision
  `Survey (FNDDS):2708951`, preparation `prepared`, serving 100 g.
- `npm run supabase:test:providers:remote` then
  `npm run supabase:test:rpc:remote`, each with process-scoped exact-project
  confirmation, passed. The RPC smoke exercised all 31 public wrappers with the two
  confirmed disposable accounts. The account deletion flow completed and a
  read-only query found zero matching Auth users. No schema or Edge Function
  deployment occurred.
- Hosted GitHub Actions run 8 passed both `web` and Docker-backed `integration`
  on candidate `2191e52c6bf082b26576cc76b8da53658eb9f85b`. Earlier runs 6 and
  7 caught a mobile grocery control overlap; explicit fixed grid columns
  corrected it. Runs 9 and 10 also passed both jobs on their recorded evidence
  commits. Run 11 passed both jobs on current source commit
  `8414374d45ec33b890860ed2e646bfa68c2ef1f3`. The focused mobile journey
  passed locally. Production Site URL/redirects, live SMTP confirmation/recovery,
  leaked-password protection, and public deployment remain separate launch work.

Candidate verification is complete on the open PR head. The closeout evidence
commit, PR merge, CI on the resulting `main` commit, and annotated RC3 tag remain
pending. Do not tag RC3 until those gates are recorded against the exact release
commit.

## 1. Status at a glance

### Implemented repository capabilities

- [x] Client-safe environment variable names are documented.
- [x] Remote client settings are kept in ignored `.env.rc3.local`; disposable
  credentials are read from ignored `.env.local`. Both files remain
  uncommitted. The confirmed pair used for 2026-09-29 remote verification has
  been deleted and verified absent; use a new disposable pair for any future
  remote smoke.
- [x] The browser Supabase client uses `@supabase/ssr` and the publishable
  key.
- [x] The request-scoped server Supabase client uses cookie-backed SSR
  sessions.
- [x] The session-refresh Proxy refreshes cookies and uses claims-based
  protected-route checks.
- [x] The PKCE confirmation callback exchanges `code` for a session.
- [x] The confirmation callback also supports token-hash verification.
- [x] Password recovery can return to the update-password screen.
- [x] Sign-up, sign-in, sign-out, forgot-password, update-password, and
  check-email surfaces exist.
- [x] Authenticated users are redirected away from guest auth routes, and
  unauthenticated users are redirected to sign-in with a safe `next` path.
- [x] Missing Supabase configuration has a dedicated `/auth/configuration`
  route.
- [x] Product routes are auth-first; they do not silently fall back to dummy
  product data when Supabase configuration is missing.
- [x] The current onboarding, plan, workout, nutrition, grocery, progress,
  and settings UI scaffold exists.
- [x] `supabase/config.toml` has been created with the Supabase CLI.
- [x] The local Supabase stack uses the repository-specific `5632x` ports.
- [x] Forward-only migrations exist under
  `supabase/migrations/`, in dependency order: eleven schema/seed migrations,
  one foreign-key-index correction, authenticated RPC migrations, export-shape
  hardening, MVP integrity hardening, and the MVP-0 foundation hardening
  migration plus the saved-meal ownership/concurrency, profile-only update,
  and integer-version validation follow-up migrations.
- [x] The migration set defines the domain tables, normalized versioned plan
  rows, catalog seed data, ownership indexes, constraints, RLS read policies,
  explicit grants/revokes, and idempotency storage.
- [x] The seed migration contains 21 exercises, 22 starter foods, and 4
  starter meals with the authored application IDs preserved.

### Historical RC2 environment/deployment evidence (not RC3 sign-off)

The checked items below record work completed at the time of the RC2 snapshot.
They do not assert that this workspace currently has remote credentials or
that the linked project has been re-verified for RC3.

- [x] The clean local reset, migration listing, and database lint passed with no
  schema errors, including the current unified-meal migration.
- [x] The remote project is linked to this repository with project ref
  `ifunkhvbvkdxolhpxjvk`.
- [x] The reviewed schema/RLS/catalog and authenticated RPC batches are
  deployed remotely; remote migration history matches the 39-migration
  local set, including `20260924103000_mvp1_export_owned_foods`. The remote
  profile default and authenticated-only execute grant were verified after
  the migration was applied.
- [x] Remote read-only checks confirm 20 expected public tables, 20 RLS-enabled
  tables, 20 policies, four anonymous catalog SELECT grants, 20 authenticated
  SELECT grants, zero direct authenticated/anonymous table-write grants, and
  no unexpected public application tables.
- [x] Remote catalog checks confirm 21 system exercises, 22 system foods, 4
  system meals, and 14 meal ingredients.
- [x] Keep `src/types/database.generated.ts` synchronized with the final local
  and linked schema, including notification, provenance/range, grouped-meal
  columns, and grouped RPC wrappers. Linked regeneration passed after the
  unified migration rollout.
- [x] The first authenticated repository boundary maps normalized database
  rows to the existing domain snapshot, preserves `app_id` values, hides
  internal `row_id` values, loads authenticated state, and refreshes state only
  after an RPC succeeds.
- [x] The initial RPC layer covers onboarding/profile/plan bundles, workout
  sessions, nutrition/meal/weight saves, grocery mutations, export, and
  account deletion with explicit authenticated execute grants.
- [x] `supabase/tests/database_test.sql` provides a local 32-check pgTAP
  baseline for schema presence, catalog counts, RLS coverage, table grants,
  and RPC execute grants.
- [x] Focused local pgTAP suites have been added beside the baseline:
  `schema_catalog_test.sql`, `constraints_test.sql`, `rls_isolation_test.sql`,
  `privileges_rpc_security_test.sql`, and `domain_mutations_test.sql`.
  Together with the baseline they execute 433 assertions covering schema
  contracts, catalog metadata, constraints, ownership isolation, direct-write
  denial, wrapper security, RPC behavior, idempotency, export shape, and
  account deletion, profile-only/version validation, planned-meal editing,
  recipe archiving, and atomic meal/grocery reconciliation.
- [x] `scripts/test-supabase-concurrency.mjs` and the
  `supabase:test:concurrency` package script provide a two-session local
  concurrency lane. The runner refuses non-local URLs, never reads the
  remote `NEXT_PUBLIC_SUPABASE_URL`, uses only the local anon/publishable key,
  and cleans up disposable users through the deletion RPC.
- [x] `supabase/tests/rpc_smoke_test.sql` adds 103 pgTAP assertions that
  invoke the deployed public RPC wrappers, including unit updates,
  plan reset, skipped meals, abandoned sessions, nutrition deletion, and
  recipe saves.
- [x] `scripts/test-supabase-rpc-smoke.mjs` runs the complete 31-wrapper
  matrix through two independent local Auth clients with unique run IDs,
  grouped-meal replay/stale/cross-user/delete checks, and deletion cleanup.
- [x] `scripts/test-supabase-rpc-remote.mjs` provides a separately guarded
  remote runner. It reads only the existing client-safe `.env.local` URL/key,
  requires `SUPABASE_RPC_REMOTE_CONFIRM=ifunkhvbvkdxolhpxjvk`, rejects local
  URLs and service/secret keys, and accepts confirmed disposable credentials
  only through the current process environment.

### Historical “Not completed” checklist — RC2 snapshot, 2026-09-24

- [x] Complete the linked remote schema verification gate for the previously
  applied migrations. The local integrity and MVP-0 hardening migrations are
  pending a guarded dry run,
  so linked history reports no pending migrations and
  `npx supabase@latest db lint --linked` passes with no
  schema errors. Any future lint requiring a database password must continue
  to receive it only through a secure CLI prompt or temporary secret
  mechanism.
- [x] Finish the local database-test gate. The new hardening migration is
  applied locally; baseline/focused suites pass, including non-blank checks for
  the three catalog `app_id` columns and the atomic `log_saved_meal` wrapper.
- [x] Re-run the full test gate after the MVP-0/M1.2/unified-meal migrations. All 433
  pgTAP assertions pass, including anonymous denial, cross-user
  denial, user-ID reassignment protection, invalid inputs, owner-only custom
  catalogs, direct table-write denial, wrapper authorization, controlled
  `SECURITY DEFINER` settings, every ownership/foreign-key index, RPC
   idempotency, export shape, deletion safety, revision triggers, stale-version
   rejection, finite-number/date validation, and unsupported-screening guards.
- [x] Complete the guarded remote grouped-meal RPC smoke flow with two
  confirmed disposable authenticated accounts. On 2026-09-23 the remote
  runner exercised all 31 public wrappers, including grouped-meal replay,
  stale-edit, cross-user ownership, historical-edit independence, and delete
  behavior, then cleaned up both accounts through the authorized deletion RPC.
  Separate sign-up/confirmation UI coverage remains listed under the P0
  browser/Auth checks below.

#### P0 — Complete backend correctness and security

- [x] Add an authorized per-exercise-slot plan-override mutation. The
  `apply_workout_override` RPC ends the prior active override and inserts the
  new bounded replacement/measure values. Override removal UI remains pending.
- [x] Add repository and Context contracts for plan editing, saved meals,
  export, and account deletion. Actions return typed outcomes and semantic
  events; the saved-meal logger is atomic through `log_saved_meal`.
- [x] Add expected-version checks to profile/target/plan/meal-plan edits and
   return `stale_version` rather than silently overwriting a newer version.
- [x] Review and test lock ordering for idempotency rows, active targets,
  current plans, meal plans, and grocery lists. Add concurrency tests for plan
  regeneration, workout completion, grocery regeneration, and repeated saves.
- [x] Validate every RPC payload at the mutation boundary, including finite
  numeric values, date keys, supported enum values, catalog ownership,
  custom-name requirements, serving units, exercise measurement forms,
  session state transitions, and deletion confirmation.
- [ ] Make retry behavior end-to-end reliable. Duplicate UI submissions are
  guarded and session edits are serialized, but a dedicated retry command must
  retain the original idempotency key across a network failure.
- [ ] Verify account deletion revokes or signs out active sessions after the
  server-side delete. Supabase access tokens can remain valid until expiry, so
  deletion must also clear the browser session and local cache.

#### P1 — Finish authenticated application integration

- [x] Wire profile editing, plan editing, saved-meal logging, nutrition
  logging/deletion, weights, grocery changes/regeneration, export, and account
  deletion to the authenticated repository.
- [x] Keep authoritative Context state unchanged until RPC success; expose
  pending/error UI, preserve onboarding/session drafts, and disable duplicate
  submissions. Offline queueing remains intentionally unsupported.
- [ ] Complete focused read models and query bounds for long histories instead
  of expanding the main `AppSnapshot` indefinitely. Add cursor/date filtering
  for sessions, exercise logs, nutrition logs, weights, and export data.
- [ ] Add repository tests against the local Supabase stack for hydration after
  refresh, onboarding persistence, version creation, reset-plan history
  preservation, workout lifecycle, planned-versus-actual values, nutrition
  snapshots, weight history, grocery merge behavior, and retry failure drafts.
- [ ] Add remote manual Auth smoke tests with a disposable test account:
  sign-up, confirmation, sign-in, onboarding, reload, nutrition save, workout
  start/finish, sign-out, and protected-route redirect behavior.
- [x] Persist the opt-in notification preference through the forward-only
  profile migration and authorized RPC. Reminder delivery remains post-MVP-1.
- [x] Package the authorized JSON export as a deterministic ZIP with manifest,
  metadata, and entity CSV files while retaining JSON compatibility.

#### P1 — Nutrition and AI trust boundary

- [x] Implement the local trusted-nutrition contract: canonical per-100-g
  fields, USDA provenance, normalized serving-option rows, owner-controlled
  custom foods, expected-revision correction, and protected USDA search.
- [x] Implement protected server-side AI text-meal extraction. AI returns only
  a schema-validated review candidate; trusted nutrition data, deterministic
  calculations, and explicit user confirmation own persistence.
- [x] Implement the unified “Search or describe a meal” review contract:
  protected batch USDA matching, explicit DeepSeek estimate fallback, hidden
  ingredient opt-in, low/base/high ranges, grouped logged meals, reusable
  recipe creation, and atomic grouped mutations.
- [x] Complete the direct provider smoke gate. The server-only USDA release/API
  and DeepSeek key names are configured remotely, all four functions are
  deployed/JWT-protected, and authenticated USDA search, batch matching,
  DeepSeek extraction, and explicit estimate smoke passed on 2026-09-24. The
  production strategy is on-demand FDC API access; no bulk catalog import is
  part of MVP-1. The authenticated remote provider smoke uses the retained
  account runner; the browser suite verifies the protected UI boundary with
  mocked provider responses and preserves drafts on failures.
- [x] Test raw/cooked/prepared serving assumptions, restaurant uncertainty,
  source/version/confidence display, estimated flags, corrections, and the
  rule that missing days are not represented as zero intake in local handlers,
  database tests, and the unified review implementation. Browser and remote
  evidence remain release gates.

#### P2 — Production configuration and release dependencies

- [ ] Enable Supabase Auth leaked-password protection before production.
- [ ] Configure production Site URL and exact redirect URLs.
- [ ] Configure custom SMTP for production email delivery.
- [ ] Implement and verify full service-worker/offline/PWA behavior without
  presenting unsynchronized mutations as persisted.

The current test implementation is local-first and does not change the linked
remote project. The local verification gate was rerun on 2026-09-22 after the
local Supabase stack became available. The current results are:

- `npx supabase@latest db reset --local`: pass; all 39 migrations applied from
  an empty local database.
- `npx supabase@latest migration list --local`: pass; the local migration
  history is complete.
- `npx supabase@latest db lint --local`: pass with no schema errors.
- `npx supabase@latest db advisors --local --type security --level warn`: pass;
  no issues found.
- `npx supabase@latest test db --local`: 433 assertions passed across ten
  suites.
- `npm run supabase:test:rpc`: pass; all 31 public wrappers were exercised
  through two disposable local Auth users and both accounts were cleaned up
  through `delete_account`.
- `npm run supabase:test:concurrency`: pass against
  `http://127.0.0.1:56321`, including disposable-user cleanup.
- `npm run typecheck` and `npm run lint`: pass.
- `npm run test:local`: pass; 55 tests across 13 files.
- `npm run build`: pass; 19 routes generated and 21 exercise assets copied.
- Local TypeScript generation was run from the final schema; the committed
  contract includes the provider-quota table and final progression-bound/RPC
  definitions.

Remote rollout evidence on 2026-09-24 and provider smoke evidence on 2026-09-24:

- `npx supabase@latest db push --dry-run`: pass; remote database is up to date
  after applying `20260924103000_mvp1_export_owned_foods.sql`.
- Linked database types were regenerated after the remote migration and
  `npm run typecheck` passed.
- Deployed protected functions: `nutrition-search` v7,
  `nutrition-text-parse` v7, `nutrition-meal-match` v2, and
  `nutrition-macro-estimate` v1; JWT verification is enabled for all four.
- Authenticated USDA search and batch matching passed after both functions were
  changed to send `dataType` as the documented JSON array in a POST body. User
  A's batch returned two normalized matches for cooked egg and cooked rice.
- Authenticated DeepSeek extraction passed through `nutrition-text-parse` v7
  for `2 cups fried rice with 2 eggs`; the response included the meal label,
  candidates, and questions. Authenticated macro estimation returned one
  validated estimate. No meal confirmation or durable log save was performed.
- User B's ordinary USDA search returned eight candidates. Anonymous POST
  probes returned 401 for all four provider functions.
- The browser tab used for the earlier local check was unauthenticated after
  the previous session ended and correctly redirected to sign-in. The current
  repeatable browser gate has since passed its mocked protected-provider,
  failure-retention, offline-retry, and account-isolation scenarios.
- No raw meal text, API key, or upstream response was logged.
- Anonymous POST probes returned `401` for all four provider functions.

The remote advisor review found one expected design warning for authenticated
`SECURITY DEFINER` RPC wrappers: the wrappers are deliberately callable by
authenticated clients because direct table writes are revoked, and each
wrapper delegates to a controlled private implementation. Review the warning
before production and keep the explicit `search_path`, ownership checks, and
execute grants intact. The performance advisor reports unused-index INFO
notices because the remote database is still empty; the foreign-key advisor
findings are resolved by the deployed index migration. Supabase Auth's leaked
password protection is still disabled and must be enabled before production.

The auth UI, schema, deployed RPC boundary, initial repository hydration, and
Context integration are implemented and covered by the guarded remote RPC/Auth
smoke flow against confirmed disposable users. Public deployment still needs
the production Site URL/redirect configuration, the live confirmation and
recovery-email check, and an explicit review of the Free-tier security
limitations.

## 2. Client-safe environment

Create `.env.local` in the project root and do not commit it. The app currently
uses these non-secret variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ifunkhvbvkdxolhpxjvk.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing project publishable key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

When configured for local development, place these variables in an ignored
`.env.local`. The guarded RC3 remote smoke uses a separate ignored
`.env.rc3.local` for its project URL and publishable key; neither file belongs
in release evidence.
`NEXT_PUBLIC_SITE_URL` controls the
origin used by sign-up and password-reset redirects; keep it at
`http://localhost:3000` while testing the local app. Never place
a service-role key, secret key, database password, OAuth secret, or nutrition
provider credential in a `NEXT_PUBLIC_*` variable or browser code.

Do not add `SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, a database
password, `SUPABASE_ACCESS_TOKEN`, OAuth secrets, AI provider keys, or
nutrition-provider credentials to `.env.local`. Use `supabase login` for CLI
authentication and provide a database password only through an interactive
prompt or secure temporary secret mechanism when the CLI requires it. The
production deployment must use the same project URL/key with a separate
`NEXT_PUBLIC_SITE_URL=https://<production-domain>` value.

In the Supabase dashboard, open **Project Settings -> Data API** or the
project **Connect** dialog and copy the Project URL and publishable key. Do
not document the actual project values in this file.

## 3. Auth URL configuration

In **Authentication -> URL Configuration**, set:

- Site URL: `http://localhost:3000` for local development.
- Redirect URL: `http://localhost:3000/auth/confirm`.

Before deployment, add the exact production equivalents, for example:

```text
https://your-domain.example
https://your-domain.example/auth/confirm
```

The callback accepts both Supabase SSR PKCE links
(`?code=...&next=...`) and token-hash links
(`?token_hash=...&type=email&next=...`). The default confirmation template
can remain in place if its redirect points to
`/auth/confirm?next=/onboarding`.

If the confirmation template is customized, use:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding">
  Confirm your email address
</a>
```

For password recovery, use the same callback with `type=recovery` and
`next=/auth/update-password`. Brevo custom SMTP is configured for the remote
project; complete a live confirmation and recovery-email test before inviting
anyone beyond the controlled beta. The default Supabase sender remains
rate-limited and intended for testing.

## 4. Local migration set

The original nineteen files were created with the Supabase CLI, so their
timestamps are CLI-generated and must not be manually changed. The twentieth
MVP hardening migration was authored forward-only because the CLI is not
available in this workspace; verify it locally before applying it to staging.
The current order is:

### 4.1 `bootstrap_private_helpers`

- Creates the non-exposed `private` schema.
- Revokes default private-schema access from `anon`, `authenticated`, and
  `public`.
- Adds the controlled `private.set_updated_at()` trigger helper with an
  explicit search path.
- Does not expose mutation RPCs yet.

### 4.2 `create_catalog_tables`

Creates the public read catalogs:

- `exercises`: authored exercise IDs/slugs, descriptions, movement metadata,
  measurement type, illustration alt text, regressions/progressions, safety,
  and source version.
- `foods`: authored food IDs, serving/nutrition values, category, source,
  version, estimate/confidence metadata, preparation basis, and nullable
  ownership for future custom foods.
- `meals`: system starter meals plus future user-owned saved meals.
- `meal_ingredients`: normalized meal-to-food references with stable order
  and serving quantities.

Catalog rows use internal identity keys for joins while preserving the current
string IDs in `app_id`.

### 4.3 `seed_catalog_data`

Seeds the current authored constants exactly at the application boundary:

- 21 exercises, including IDs such as `ex-knee-push-up` and the illustration
  slugs used by the bundled assets.
- 22 starter foods, including `food-egg`, source `Starter Food Catalog`,
  source version `2026.09`, and `estimated = true`.
- 4 starter meals and all current ingredient serving quantities.

This is deterministic seed data for the app's starter catalog. It is not a
claim that these estimated values are the trusted production nutrition source.

### 4.4 `create_profiles_and_goals`

- `profiles` uses `auth.users.id` as its primary identity and stores the
  current onboarding inputs and optional dietary/meal preferences.
- `goals` stores versioned target context, effective dates, goal type,
  optional target/rate/date, weekly workout target, and a temporary JSON
  `skill_targets` object.
- Adult, unit, sex, experience, equipment, height, weight, days/week, and
  session-duration checks match the current health utility boundaries.
- An active primary goal is unique per user.

`profiles.goal` remains the current compatibility preference. Later authorized
profile/goal mutations must update the profile and active goal atomically.

### 4.5 `create_daily_targets`

Creates append-only target versions with the target ID, goal reference,
effective date, calories/macros, BMR/BMI/TDEE, activity factor, formula,
calculation assumptions, and disclaimer. A user cannot reuse a target version
number or application target ID within the same user history.

### 4.6 `create_workout_plans`

Creates normalized, versioned workout prescriptions:

- `workout_plans` links a plan version to a target.
- `planned_workouts` stores day, title, focus, warm-up, cooldown, duration,
  and order.
- `planned_exercises` stores catalog references plus name/measure/source
  snapshots, sets, reps or holds, rest, and progression/regression snapshots.
- `workout_plan_overrides` stores persistent user overrides and replacement
  exercise references for future plan-generation mutations.

Plan and child rows use internal identity keys for joins and preserve current
string IDs in `app_id`. Future plan edits must create new versions and must not
rewrite completed history.

### 4.7 `create_meal_plans`

Creates normalized, versioned weekly meal plans:

- `meal_plans` stores version, Monday `week_of`, and target reference.
- `planned_meals` stores a stable date/slot/order key, optional meal or food
  reference, display label, servings, skipped state, expected nutrition,
  source, assumptions, confidence, and preparation basis.

Constraints enforce Monday week starts, dates within the plan week, valid meal
slots, one reference at most between meal and food, and unique date/slot/order
positions within a plan version.

### 4.8 `create_workout_history`

- `workout_sessions` stores the session date, timestamps, status, planned
  workout/plan references, and retry idempotency key.
- `exercise_logs` stores planned values separately from actual values,
  substitutions, completion status, RPE, manageability, pain/safety flag, and
  notes.
- Constraints bound statuses, RPE, reps, holds, rest, and one in-progress
  session per user/planned workout.

### 4.9 `create_nutrition_and_weight_history`

- `nutrition_logs` stores local date/slot, food or custom-name references,
  servings, serving quantity/unit, saved nutrition snapshots, fiber where
  available, estimate/confidence, source/version, preparation basis,
  assumptions, and an idempotency key.
- `weight_entries` stores immutable user observations in kilograms with local
  dates.

Saved nutrition values remain snapshots; catalog updates must not silently
rewrite past logs. AI candidates are intentionally not persisted by this
schema.

### 4.10 `create_grocery_lists`

- `grocery_lists` stores one user-owned list per week.
- `grocery_items` stores generated quantity separately from the user-adjusted
  quantity, plus checked, custom, removed, category, unit, and optional source
  food reference.

Future regeneration RPCs must preserve explicit quantity edits, checked state,
removed rows, and custom items according to the merge policy in
`ARCHITECTURE.md`.

### 4.11 `create_idempotency_and_harden_privileges`

- `mutation_idempotency` stores a user-scoped operation/key/request-hash
  record, status, minimal result references, sanitized error code, and
  timestamps. A reused key with a different request hash must fail safely.
- Enables RLS on the idempotency table and defines the owner-scoped read
  policies for every durable table.
- Grants catalog `SELECT` to `anon` and `authenticated` where system rows are
  public, and owner-scoped durable `SELECT` to `authenticated`.
- Explicitly revokes direct client table writes and sequence access.
- Leaves the public mutation surface empty until later forward-only RPC
  migrations add deliberate execute grants.

### 4.12 `add_foreign_key_indexes`

Adds the ownership-plus-foreign-key indexes identified by the remote/local
performance review. These indexes support RLS predicates and normalized
parent/child reads without changing the domain model.

### 4.13 Authenticated RPC migrations

The six later migrations are deployed and must remain separate from the
already-applied schema batch:

1. `add_mutation_helpers` adds authenticated-caller assertions, canonical
   request hashing, idempotency claim/replay, and sanitized mutation failure
   helpers in `private`.
2. `add_profile_target_plan_mutations` adds the atomic onboarding/profile
   bundle, target/plan version creation, reset-plan behavior, grocery merge,
   and planned-meal version updates.
3. `add_workout_mutations` adds session start/save/finish/abandon and retains
   planned-versus-actual exercise snapshots.
4. `add_nutrition_meal_weight_mutations` adds nutrition snapshots, saved
   meals/recipes, weight entries, source/confidence/preparation metadata, and
   deletion of nutrition logs.
5. `add_grocery_mutations` adds checked/quantity/remove/custom/regenerate
   operations while preserving explicit user edits.
6. `add_export_delete_mutations` adds owner-scoped JSON export and authorized,
   idempotent account deletion with a cache-clearing signal.

Each public wrapper is `TO authenticated`, has explicit `EXECUTE` granted to
`authenticated`, has `EXECUTE` revoked from `PUBLIC` and `anon`, and delegates
to a fully qualified private implementation with a controlled search path.
The RPC responses contain minimal result references; the repository refetches
the affected read models and returns a typed `MutationOutcome`.

### 4.14 `harden_export_shape`

Replaces the private export builder through a forward-only function migration.
Exports retain application IDs and user data while omitting internal row IDs,
ownership IDs, and normalized foreign-key implementation columns.

### 4.15 `mvp_integrity_hardening`

Adds non-blank checks for catalog application IDs, an atomic
`log_saved_meal` nutrition mutation, and an authorized
`apply_workout_override` mutation. The migration has been applied and verified
locally and through the linked remote rollout.

## 5. Security and ownership contract

All tables in the exposed `public` schema have RLS enabled. Durable read
policies use `TO authenticated` plus
`(select auth.uid()) = user_id` (or the profile `id`). System catalog rows are
publicly readable; custom foods/meals are owner-readable. There are no direct
client INSERT/UPDATE/DELETE grants for durable tables.

For the deployed mutation RPCs:

- Resolve ownership from `auth.uid()`, never from a trusted client user ID.
- Validate ranges, units, IDs, local dates, state transitions, and payloads at
  the mutation boundary.
- Keep related writes atomic and concurrency-safe.
- Use `SECURITY INVOKER` by default. If `SECURITY DEFINER` is genuinely
  required, keep the function in `private`, set an explicit controlled
  `search_path`, fully qualify references, and check `auth.uid()`.
- Add explicit `GRANT EXECUTE` only to the intended client role/function.
- Do not use editable `user_metadata` claims for authorization.
- Keep AI/provider secrets and trusted nutrition credentials server-side.

The remote security advisor's authenticated `SECURITY DEFINER` warning is
reviewed and intentional for this RPC shape. Any future wrapper must preserve
the same controlled path, fully qualified references, explicit `auth.uid()`
check, and narrow grant/revoke policy.

## 6. Required local verification

This repository's local Supabase stack is configured for the `5632x` port
range (`56321` API, `56322` database, `56323` Studio, `56324` email testing,
and `56327` analytics) so it can run alongside the other local Supabase
projects using the default ports. The CLI commands below read those ports from
`supabase/config.toml` automatically.

Run these commands from the repository root after Docker is available:

```bash
npm run supabase:reset
npm run supabase:migrations
npm run supabase:lint
npm run supabase:test
npm run supabase:test:rpc
npm run supabase:test:concurrency
npm run test:repository
npm run typecheck
npm run lint
npm run test:local
npm run build
npm run test:e2e:public
npm run test:e2e:release
```

The local reset must apply every migration from an empty database. The RC3
checkpoint above records the latest local verification. Re-run it after every
migration change and verify at
minimum:

- Seed counts are 21 exercises, 22 foods, 4 meals, and 14 meal ingredients.
- Seed IDs, slugs, food source/version, estimate flags, serving assumptions,
  and confidence values match the authored constants.
- Every public table has RLS enabled and every intended ownership/index
  predicate has an index.
- Anonymous users cannot read durable user data.
- User A cannot read another user's rows or use a user ID reassignment path.
- Direct client writes to durable tables fail because grants are revoked.
- Public system catalog reads work and custom catalog rows remain owner-only.
- Profile, goal, target, plan, meal-plan, session, nutrition, weight, and
  grocery constraints reject invalid values.
- Planned and actual workout values remain separate.
- Nutrition source, version, confidence, serving, preparation, and snapshot
  fields persist.
- Grocery generated and adjusted quantities, checked state, removal, and
  custom state have separate columns.
- Duplicate idempotency keys replay or reject safely, and changed request
  hashes do not replay a different operation.
- A reset from an empty database reproduces the same schema and seed state.
- The focused pgTAP suites and local two-session concurrency lane execute
  without weakening a contract assertion; the full local gate is green.
- The RPC smoke path signs up two disposable local users, exercises all 31
  public wrappers, checks replay/hash-mismatch and cross-user behavior, and
  cleans up through `delete_account`.

If local Docker is unavailable, record that limitation rather than treating
static SQL inspection as equivalent to database verification.

## 7. Linked-project workflow and historical RC2 evidence

The following linked-project and provider results are historical RC2 evidence,
not a fresh RC3 comparison or smoke run:

- Project ref: `ifunkhvbvkdxolhpxjvk`
- Remote region: `ap-northeast-1`
- Remote history: all 39 local migrations, confirmed through the linked project
  migration listing
- Linked dry run: up to date with no pending migrations
- Linked lint: pass; `npx supabase@latest db lint --linked` reports no schema
  errors after the grocery-conflict and export-food migrations. The four
  protected provider functions are deployed with JWT verification. The final
  sanitized User B smoke passed search, batch matching, extraction, one
  explicit low-confidence estimate, weighted USDA persistence, and export;
  separate anonymous probes returned 401 for all four functions. Earlier
  `rate_limited` responses are retained as expected quota evidence, not an
  unhandled provider failure.

For any future linked change, first complete a read-only comparison of linked
migration history and schema against the repository. Only after local
verification and review of that evidence should the following workflow be
considered:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest db push --dry-run
```

The guarded remote smoke uses only newly confirmed disposable identities. The
ignored `.env.rc3.local` contains the exact project URL and publishable key;
ignored `.env.local` contains `USER_A_EMAIL`, `USER_A_PASSWORD`,
`USER_B_EMAIL`, and `USER_B_PASSWORD` entries (the parser accepts `:` or
`=` separators). The pair used on 2026-09-28 and the newly confirmed pair used
on 2026-09-29 were both deleted; a read-only query confirmed the latest pair is
absent. Use a new confirmed disposable pair before any future remote smoke.
Never commit or print credential values:

```powershell
$env:SUPABASE_RPC_REMOTE_CONFIRM = "ifunkhvbvkdxolhpxjvk"
npm run supabase:test:providers:remote
# Run the RPC smoke even if provider persistence fails; it verifies and
# deletes both disposable accounts through the authorized account RPC.
npm run supabase:test:rpc:remote
Remove-Item Env:SUPABASE_RPC_REMOTE_CONFIRM
```

Both runners require the process-scoped confirmation value for
`ifunkhvbvkdxolhpxjvk`, reject any other URL and reject service/secret keys.
The provider smoke defaults to User A, invokes USDA search, DeepSeek extraction,
batch matching, one explicit estimate, one reviewed USDA save, and account
export. Food and idempotency IDs are unique per run to avoid collisions with
other owners. It does not delete accounts. The following RPC smoke exercises
all 31 wrappers and deletes both supplied accounts through `delete_account`;
never use retained or real accounts. Neither runner prints credential values,
meal text, provider payloads, or API keys.

The provider quota is five estimates per ten minutes per user; a later
`rate_limited` response is expected and must be recorded rather than bypassed.

The dry run must be reviewed against the linked migration history before any
future push. Do not use blind pulls, force flags,
`--include-all`, guessed migration repairs, or dashboard-only schema changes.

Historical 2026-09-21 rollout checkpoint (superseded by the current 39-version
inventory above): the linked 19-migration baseline was proven
identical to a local baseline across full `public`/`private` schema dumps and
authored catalog digests. The authorized push applied nine migrations through
`20260918031759_mvp1_meal_editing_hardening.sql` and then stopped on duplicate
legacy planned-exercise `sort_order` values. The repository now includes
`20260918033000_repair_legacy_planned_exercise_order.sql`, a guarded data-only
correction placed before the dependent unique-index migration. Full local reset
and 403 database assertions pass. After explicit approval, the guarded repair
and all six later migrations applied successfully. At that checkpoint, all 35
local/remote migration versions agreed; the current 39-version history also
includes grocery conflict and owned-food export hardening. `db push --dry-run`
is up to date, and the full 7,184-line
local/remote `public`/`private` schema dumps match. The nine planned-exercise
rows and historical log reference remain intact, with no duplicate slot keys.
Remote lint has no schema errors. The security advisor reports expected
authenticated `SECURITY DEFINER` RPC warnings, an intentionally private quota
table with no read policy, and disabled leaked-password protection in Auth.
Do not edit an applied migration; use a new forward migration for corrections.

The remote `nutrition-search`, `nutrition-text-parse`,
`nutrition-meal-match`, and `nutrition-macro-estimate` functions are now
JWT-protected and deployed from the reviewed working tree. Anonymous probes
returned 401 for all four. The user reports that `USDA_FDC_API_KEY` and
`DEEPSEEK_API_KEY` are configured remotely, and the USDA release label is
configured. Authenticated USDA search passed; authenticated DeepSeek extraction
passed the guarded authenticated smoke on User B; later `rate_limited` results
were returned by the documented per-user quota after repeated verification.
Values in `.env` do not configure remote Edge Function secrets. The deployed
text parser uses DeepSeek's Responses API with optional
`DEEPSEEK_NUTRITION_MODEL=deepseek-flash`; `USDA_FDC_RELEASE` must be set as a
server-only value before authenticated USDA verification can be signed off.

Set the DeepSeek key and the USDA API key in the target project's Edge Function
secrets (Dashboard or Supabase CLI) without committing or pasting their values
into a public file. Set `USDA_FDC_RELEASE` as a server-only Edge Function
configuration value; it is not a secret, but it must never be a
`NEXT_PUBLIC_*` variable. The selected rollout evidence is:

- Source: [USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide/)
- Scope: on-demand Foundation, SR Legacy, FNDDS, and Branded search records;
  no full-catalog import is claimed.
- Release label: `FoodData Central API verified 2026-09-22`.
- Official release context checked 2026-09-22: Foundation/Branded April 2026
  downloads, FNDDS 2021–2023 published October 2024, and SR Legacy final April
  2018 release. Branded records continue to receive API updates.
- License/terms: follow USDA FoodData Central attribution and API terms; keep
  the source/version and FDC ID with every persisted selection.

Release evidence procedure: set the release label remotely, run the mocked
handler fixtures, deploy the reviewed provider functions, perform authenticated
simple USDA search and batch matching, save one reviewed FDC record, and record
its FDC ID, data type, source version, provider revision, serving options, save
result, verification date, and number of persisted smoke records. Then run
authenticated DeepSeek extraction and one explicit estimate request, followed
by a confirmation-only grouped save. Record exact deployed function versions,
schema revision, and disposable-user cleanup. Do not report a bulk record
count for the on-demand strategy.

Set the DeepSeek key in the target project's Edge Function secrets (Dashboard
or Supabase CLI) without committing or pasting its value into a public file.
Keep the Supabase Studio `openai_api_key` setting separate: it is not used by
this app's nutrition parser. Photo analysis remains post-MVP-1 and would need
its own privacy and accuracy review before deployment.

If a remote schema already contains equivalent changes, prove equivalence for
columns, constraints, indexes, policies, grants, function bodies, and relevant
data before repairing migration history. Never edit, rename, delete, or
reorder a migration that may already be applied; use a new forward migration.

## 8. Remaining release and launch gates

The MVP-2 RC3 implementation work has added the local repository integration
suite, isolated authenticated browser fixtures with cleanup, the fresh-account
primary journey, and a Docker-backed CI integration job. Local migration,
database, repository, browser, linked schema/source comparison, remote provider
persistence, and two-account RPC checks are recorded in the RC3 checkpoint at
the top of this document.

The RC3 candidate gates are verified on PR #1's current head. Remaining
closeout steps before declaring the tagged release complete:

1. Commit the final remote verification evidence on `codex/mvp-2-rc3` and
   require both hosted CI jobs to pass on that exact PR head.
2. Merge PR #1 only after the evidence commit is green. Require CI on the
   resulting `main` SHA.
3. Create the annotated `mvp-1.0.0-rc.3` tag on that exact verified `main` SHA;
   record the final SHA and evidence links in the annotation. No remote schema
   or function rollout is part of closeout.

Production Site URL/redirects, live SMTP delivery, leaked-password protection,
and public deployment remain post-RC launch gates.

## 9. MVP-3 confirmation and schema release gates

The seven MVP-3 forward migrations were applied to shared Cali on 2026-10-01
after explicit user authorization and verified preflight. The initial comparison
matched all 39 baseline migration versions and all 11 baseline schema fingerprint
categories. The authorized `npx supabase db push --linked --skip-vault --yes`
applied exactly the reviewed set through `20261001062329`.

Post-push verification matched all 46 local/remote migration versions and all 12
schema fingerprint categories, including view definitions. The linked dry run
reports no pending migrations, seeds, or roles. A rollback-only transaction passed
39 deployed RPC/RLS assertions; subsequent queries confirmed no test fixtures
remained. Linked public database types were regenerated and typecheck passed.
The detailed fingerprints and advisor review are in `MVP_Priority_Matrix.md`.
Preserve the RC3 evidence above as historical evidence. Database rollout does not
complete app deployment or the staging email release gate.

The reviewed local confirmation template is
`supabase/templates/confirmation.html`. Configure the staging **Confirm signup**
template with the same token-hash link:
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`.
Keep the app's correct HTTPS Site URL and authorized redirect URLs. Token-hash
verification supports opening the email in another browser without relying on
the signup browser's PKCE verifier. Never record live tokens in release evidence.

`npm run test:email:local` uses Mailpit at `127.0.0.1:56324`, requires the disposable
local project at `127.0.0.1:56321`, temporarily enables confirmations, then restores
the original local auth config. It leaves a reduced test stack running (database,
Auth, PostgREST, Kong, and Mailpit); run `npm run supabase:start` to restore optional
services when needed. Do not run it alongside other local Supabase tests.
The staging gate additionally requires real inbox receipt, resend receipt,
successful confirmation return, safe invalid/reused-link behavior, environment
and template identification, test date, and disposable-user cleanup. Local mail
tests and mocked responses do not satisfy the staging delivery gate.

Staging SMTP delivery is deferred at the user's request on 2026-10-01. This is
an unverified release gate, not a passing test.

The pinned local stack currently runs PostgREST 14.5. After prolonged local
activity/reset, repository tests intermittently returned `JWT issued at future`.
Restarting only `supabase_rest_untitled-exercise-meal-app` cleared the local issue;
the final eight repository scenarios passed without weakening JWT verification.
The [official PostgREST changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md)
records clock-related JWT corrections in later versions. Keep this operational
limitation separate from database migration or application evidence.

## 10. Recipe cards and catalog database release — 2026-10-12

The user explicitly authorized all pending linked migrations. Preflight matched
the 56 deployed migration files against their recorded statements and compared
an isolated reconstruction of that deployed baseline with the shared schema.
There were no table, column, constraint, index, policy or grant differences.
Eighteen function formatting differences were checked against the applied source:
their bodies, language, return types, security mode and search path matched.

The verified push applied these five migrations in order:

1. `20261009065053_recipe_total_time.sql`
2. `20261011080358_recipe_cover_images.sql`
3. `20261012020032_recipe_card_metadata.sql`
4. `20261012021408_harden_recipe_card_rpc.sql`
5. `20261012030943_creamy_lemon_chicken_catalog.sql`

All 61 local/remote migration versions now agree. The linked dry run reports no
pending migrations, seeds or roles. All 12 schema fingerprint groups match a
fresh local replay, including function definitions, grants, policies and triggers.
Linked public database types were regenerated into
`src/types/database.generated.ts`; strict TypeScript, lint and production build
passed. Local and hosted type generators differ in formatting and JSON null
representation, but the public schema fields and RPC arguments match.

Four rolled-back deployed suites passed 135 assertions: recipe time (45),
cover images (30), card metadata/favorites/complexity (45), and catalog (15).
No test users, recipes, image assets or Storage objects remained. Digests confirm
that the existing 62 nutrition entries, 590 planned meals, seven personal recipes,
grouped eaten meals and retired recipe ingredients were preserved.

Creamy Lemon Chicken is the only active system recipe, with Easy complexity,
30 minutes, two servings, six measured ingredients and the registered generated
image. Eight previous system recipes remain archived for history and existing
plan references. The running app at port 3000 was refreshed and verified against
the shared backend, including the overview tabs, source, estimate notes, loaded
image, enabled favorite control, and phone/desktop layout bounds.

The full clean local migration chain passed 19 database suites / 724 assertions.
Database lint has no errors and retains the earlier unused-payload warning in
`public.claim_deleted_recipe_images`. The cleanup worker's production deployment
and scheduling remain separate from this completed database migration release.
Detailed local evidence is in `output/recipe-catalog/verification.md` and the
adjacent schema, history and cleanup comparison records. These raw artifacts
remain local under the Git-ignored `output/` directory; the release summary
above is retained in this document.

## 11. Korean Beef Bowl and personal catalog controls — 2026-10-12

The continuing authorized release adds Korean Beef Bowl alongside Creamy Lemon
Chicken. Korean Beef Bowl yields four servings, has Easy complexity and its own
generated cover, and preserves the supplied per-serving nutrition: approximately
560 kcal, 45 g protein, 58 g carbohydrates and 16 g fat. Cooking time remains
unset because none was supplied. Ingredient records support ingredient information
and grocery quantities; they do not replace supplied recipe macros.

Edit and Archive now apply to active predefined recipes per account. Saving the
first edit creates an owned replacement and hides the original from that account's
Saved meals. Archival hides the catalog recipe for the caller. Shared catalog
records, other accounts, existing plans and saved nutrition history remain intact.
Preferences use authenticated RPCs, ownership RLS, revision checks and idempotency.
The provided-nutrition logger uses authoritative stored values and scales them by
actual portions; retries remain stable across subsequent recipe edits.

The deployed 61-version baseline matched all 12 schema fingerprint groups before
the following verified forward migrations were applied:

1. `20261012041322_korean_beef_and_personal_catalog.sql`
2. `20261012065031_recipe_provided_nutrition.sql`
3. `20261012065733_fix_provided_recipe_portion_unit.sql`
4. `20261012070212_harden_personal_recipe_controls.sql`
5. `20261012070613_serialize_provided_recipe_logs.sql`

All 66 local and linked migration versions agree. The final dry run has no pending
migrations, seeds or roles. All 12 deployed schema fingerprint groups match the
clean local replay. Linked public database types were regenerated and strict
TypeScript passed. Before/after digests are unchanged for 62 nutrition entries,
590 planned meals, 14 grouped eaten meals, seven personal recipes and 57 existing
recipe ingredient rows. Both rolled-back deployed suites passed: 33 personal
catalog checks and 21 provided-nutrition checks. No fixture accounts, recipes or
catalog preferences remained.

Verification passed 295 application tests, 14 authenticated repository scenarios,
21 local database suites / 778 assertions, strict TypeScript, lint and production
build. Ten selected desktop/mobile browser checks passed; the final Korean Beef
Bowl rerun also passed both viewports with supplied-macro required-field validation.
The running port-3000 app was refreshed against the shared backend and verified
for the generated image, four-serving overview, all supplied macros, enabled
favorite control and Edit/Archive actions. Database lint has no errors; the earlier
unused-payload warning in `public.claim_deleted_recipe_images` remains.

Local release evidence and screenshots are in `output/korean-beef-bowl/verification.md`
under the Git-ignored `output/` directory.

## 12. Recipe card metadata and compact actions — 2026-10-12

Saved and Planned cards now separate per-serving calories from whole-recipe
yield. A mint ChartPie pill displays yield, missing time reads Not set, and
missing complexity defaults to Medium. Saved footers use Log +, a 48px Edit
icon and a 48px Archive icon with accessible labels and hover/focus tooltips.
Planned actions retain their existing behavior. Meal duplication has been
removed; existing saved copies remain ordinary recipes. New and restored legacy
drafts default complexity to Medium without making a blank draft recoverable.

The verified 66-version remote baseline had no schema drift. The continuing
authorized release applied these forward migrations after clean local checks:

1. `20261012081211_recipe_complexity_default.sql`
2. `20261012083355_isolate_planned_recipe_log_retries.sql`
3. `20261012083815_qualify_planned_log_operation.sql`

The complexity migration backfills only nulls, sets the medium insert default
and non-null constraint, and uses a private security-invoker trigger to normalize
legacy null writes while preserving configured values. Existing revision and
timestamp triggers record the backfill. The other migrations fix a planned
provided-macro logging retry collision found during browser verification.
Separate original-intent claims preserve atomic linking, stable retries,
existing ownership/validation and older completed linked requests.

All 69 local/linked history versions agree, the final dry run has no pending
changes, and all 12 deployed schema groups match the clean local replay.
Fifteen null recipes became medium; configured rows stayed unchanged. Digests
preserve all 63 nutrition entries, 590 planned meals, 15 grouped eaten meals,
68 ingredient records and other recipe facts. Linked types were regenerated.
Both rolled-back deployed suites passed 36 assertions and left no fixtures.

Verification passed 297 application tests, 14 repository scenarios, 23 local
database suites / 814 assertions, 30 consolidated desktop/mobile browser checks,
strict TypeScript, ESLint and the production build. Browser checks include 320px,
enlarged text, reduced motion, focus return, tooltip dismissal, failed saves,
draft recovery, and planned Korean Beef Bowl logging at exact supplied macros.
Database lint has no errors; the existing image-cleanup unused-payload warning
remains. The running port-3000 client was refreshed against the shared backend.
Local release records are in `output/recipe-card-refinements/verification.md`
under the Git-ignored `output/` directory.


## 13. Supplied recipe macros in planned prescriptions — 2026-10-13

The regression showed half a Korean Beef Bowl planned as about 242 kcal because
`private.normalize_planned_meal_record` summed ingredients despite stored supplied
macros. The forward migration
`20261013020142_prefer_provided_recipe_plan_nutrition.sql` now uses supplied
per-serving calories/protein/carbs/fat, scaling them by the planned quantity and
recording source-provided provenance plus the recipe revision. Unsupplied fiber
remains unknown. Ingredient-based/food-only paths retain their existing behavior,
and the private constraint trigger rejects unverified supplied macros in active
carb-limited plans. Ownership, private privileges, plan concurrency and retries
remain intact. No tables/public RPCs change, and no existing prescriptions or
nutrition history are rewritten.

Preflight was read-only: all 69 local/linked migration versions and all 12 baseline
schema fingerprint groups matched, and the initial linked dry run was up to date.
After explicit authorization, a fresh preflight confirmed exactly this migration
pending, all 12 baseline fingerprint groups equal and all 69 original migration
hashes unchanged. It was deployed with vault updates excluded. Linked/local
history now agrees at **70** versions, the final dry run is up to date and all
12 deployed schema groups match the verified local replay. Before/after digests
are identical for all recipes (including provided nutrition), ingredients, meal
plan snapshots, planned rows, grouped eaten meals and nutrition logs. No data
backfill or permanent shared test fixture was created. Existing incorrect
prescriptions are corrected only through explicit plan editing/saving into a
new version.

Read-only deployed normalization returns exact supplied macros for 0.5, 1 and
1.5 Korean Beef Bowl servings: 280/560/840 kcal, 22.5/45/67.5 g protein,
29/58/87 g carbs and 8/16/24 g fat, labeled source-provided with fiber unknown.
Private client-execute denial and controlled search path were checked. Linked
types were regenerated: public shapes are unchanged; only the current server
PostgREST metadata changed from 14.5 to 14.17. Deployment evidence is retained
under ignored `output/recipe-card-refinements/slot-entry-deploy-*`.

Local validation: 70 migrations, 24 SQL suites / 854 assertions, no DB lint errors
(the existing unused image-cleanup parameter warning remains), 323 application
tests, 14 repository integration tests, TypeScript, lint and production build.
Local public type regeneration confirms unchanged schema/RPC shapes. The local
and linked generators differ for 18 existing non-null JSON columns and formatting;
retain the canonical public contracts; the subsequent linked generation updates only current PostgREST metadata. Raw evidence is
under ignored `output/recipe-card-refinements/planned-macros-*`. The earlier local-only checkpoint is superseded by the authorized rollout above. No Git commit or Git push was performed.

The preceding planning-correction authenticated browser gate passed **30/30** across
desktop/mobile, including the originally failing planned macro assertion,
search-to-plan supplied macros, linked logging/retries, 320px/200% text, reduced
motion and draft recovery. Stable planned-meal selectors avoid ambiguity with
independent same-name logs left by another scenario. Only the routine fingerprint
group differs after the local correction; the other 11 schema groups are unchanged.

The subsequent per-slot meal-entry task reran the application/backend checks and
the affected authenticated browser gate: **323 application tests / 46 files**,
**14 repository integration tests**, **24 SQL suites / 854 assertions**, strict
TypeScript, lint and a production build all pass. Database lint has no errors;
the existing unused image-cleanup parameter warning remains. The final browser
gate passes **50/50** on desktop/mobile, including slot-fixed food/recipe review,
focus and cancellation, provider failures, failed/lost-response retries, original
supplied macros, 320px/200% text and reduced motion. A separate focused rerun
passes 6/6. Narrow review overflow found during testing was corrected before the
final run. This does not replace the earlier clean 70-migration local replay;
the unchanged migration's SQL/security checks were freshly rerun here.

Fresh UI/backend logs and sanitized verification summary are under ignored
`output/recipe-card-refinements/slot-entry-*`. The user's existing dev server was
preserved; browser automation used its disposable local server on port 3030.
Direct inspection of the user's in-app tab was blocked by its URL security policy,
so no live-tab or hosted-client acceptance is claimed. Source changes remain
uncommitted, with no Git repository push or hosted client deployment.
