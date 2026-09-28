# Supabase Setup and Backend Status

This document is the operational checklist for the app's Supabase boundary.
The repository contains the forward-only domain schema, authored catalog seed
data, and authenticated RPC/repository phase. The current RC3 local and
read-only linked-project checks are recorded first; historical RC2 evidence
below remains an audit trail.

The MVP authority is Supabase Auth plus Postgres. Browser storage may cache
read models or preserve recoverable drafts later, but it must not become a
second source of truth. Durable mutations use deliberate authenticated RPC
wrappers backed by private implementations; direct client table writes remain
revoked.

## RC3 verification checkpoint — 2026-09-28

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
- Candidate `2191e52c6bf082b26576cc76b8da53658eb9f85b` is on branch
  `codex/mvp-2-rc3`, based on `main` at
  `a1db26463e87dab1d3da6dc01293423a9be5ae62`. [PR #1](https://github.com/BrylleMutia/untitled-exercise-meal-app/pull/1)
  is open; it includes the release-gate implementation and the mobile grocery
  touch-target/grid fixes. Evidence commit `101c919` passed hosted CI run 9;
  follow-up status commit `7e5f726` passed both hosted jobs in run 10. The
  existing annotated `mvp-1.0.0-rc.2` tag points to `53f1fd9`.
- Linked migration history matches all 39 repository versions. The read-only
  fingerprint from `scripts/release-schema-fingerprint.sql` matches for
  columns, constraints, indexes, RLS policies, relations, routines/bodies,
  grants, schemas, and triggers after normalizing CRLF/LF. The deployed
  `nutrition-search`, `nutrition-text-parse`, `nutrition-meal-match`, and
  `nutrition-macro-estimate` functions are JWT-protected at versions 7, 7, 2,
  and 1; all eight deployed source files match the repository. Remote
  `planned_exercises` contains 93 rows, no duplicate sort groups, no invalid
  order values, and no orphaned exercise-history references.
- The guarded remote RPC smoke passed all 31 public wrappers; both supplied
  disposable accounts were deleted and a follow-up query confirmed neither
  remains. All four anonymous provider probes returned 401; USDA search,
  DeepSeek extraction, meal matching, and one low-confidence estimate passed.
  The USDA persistence check returned `P0001`: its deterministic test food ID
  already belonged to another account. The runner now generates unique IDs per
  run. A fresh confirmed disposable account pair is needed to rerun persistence
  because the supplied pair was deleted. No schema or Edge Function deployment
  occurred.
- Hosted GitHub Actions run 8 passed both `web` and Docker-backed `integration`
  on candidate `2191e52c6bf082b26576cc76b8da53658eb9f85b`. Earlier runs 6 and
  7 caught a mobile grocery control overlap; explicit fixed grid columns
  corrected it. Runs 9 and 10 also passed both jobs on their recorded evidence
  commits. The focused mobile journey passed locally. Production Site URL/redirects,
  live SMTP confirmation/recovery, leaked-password protection, and public
  deployment remain separate launch work.

Hosted CI is green through evidence commit `101c919`. A successful rerun of
remote USDA persistence with a fresh account pair, final remote evidence
supplement, merge, main-branch CI, and the RC3 tag remain pending. Do not tag
RC3 until each gate is recorded.

## 1. Status at a glance

### Implemented repository capabilities

- [x] Client-safe environment variable names are documented.
- [x] Remote client settings are kept in ignored `.env.rc3.local`; disposable
  credentials are read from ignored `.env.local`. Both files remain
  uncommitted. The supplied account pair has been deleted; replace it with a
  newly confirmed disposable pair before rerunning provider persistence.
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
`=` separators). The pair used in the 2026-09-28 RPC smoke was deleted and
verified absent; replace those four entries with a fresh confirmed disposable
pair before retrying remote provider persistence. Never commit or print their
values:

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
database, repository, and focused browser journey checks are recorded in the
RC3 checkpoint at the top of this document.

Still required before calling the RC3 candidate verified:

1. Commit the candidate on `codex/mvp-2-rc3`, open a PR, and record passing
   hosted CI for both jobs.
2. Add two new confirmed disposable accounts to the ignored local config and
   rerun provider persistence followed by the two-account RPC smoke. The
   previous pair is already deleted. The linked history/schema/source
   comparison is complete and matched; stop if it changes or any mismatch
   appears. Do not push remote changes without separate authorization.
3. Record the exact verified commit, migration/function versions, environment,
   commands, browser results, remote results, and limitations. Merge only after
   gates pass; require CI on the resulting `main` SHA and tag that exact
   commit as `mvp-1.0.0-rc.3`.

Production Site URL/redirects, live SMTP delivery, leaked-password protection,
and public deployment remain post-RC launch gates.
