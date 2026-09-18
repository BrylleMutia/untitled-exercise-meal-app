# Supabase Setup and Backend Status

This document is the operational checklist for the app's Supabase boundary.
The repository contains the forward-only domain schema, authored catalog seed
data, and the first authenticated RPC/repository phase. The linked remote
project is `untitled-exercise-meal-app` (`ifunkhvbvkdxolhpxjvk`) in
`ap-northeast-1`; the local database includes the new hardening migration,
while the linked remote remains at the previously applied nineteen migrations.

The MVP authority is Supabase Auth plus Postgres. Browser storage may cache
read models or preserve recoverable drafts later, but it must not become a
second source of truth. Durable mutations use deliberate authenticated RPC
wrappers backed by private implementations; direct client table writes remain
revoked.

## 1. Status at a glance

### Completed

- [x] Client-safe environment variable names are documented.
- [x] `.env.local` contains the current workspace's Supabase URL and
  publishable key. The values are intentionally not documented or committed.
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
- [x] The local Supabase stack uses the repository-specific `5632x` ports and
  has been reset from an empty database successfully.
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
- [x] The previous 23-migration local reset, migration listing, and database
  lint passed with no schema errors; rerun is pending for the new profile-only
  follow-up migration.
- [x] The remote project is linked to this repository with project ref
  `ifunkhvbvkdxolhpxjvk`.
- [x] The schema/RLS/catalog batch and the authenticated RPC batch are deployed
  remotely; remote migration history matches the previously applied nineteen
  migrations. The local integrity and MVP-0 hardening migrations are
  intentionally not remote-applied.
- [x] Remote read-only checks confirm 20 expected public tables, 20 RLS-enabled
  tables, 20 policies, four anonymous catalog SELECT grants, 20 authenticated
  SELECT grants, zero direct authenticated/anonymous table-write grants, and
  no unexpected public application tables.
- [x] Remote catalog checks confirm 21 system exercises, 22 system foods, 4
  system meals, and 14 meal ingredients.
- [x] Keep `src/types/database.generated.ts` synchronized with the local
  hardening columns and RPC wrappers. Regenerate from the linked schema only
  after the pending migrations are explicitly authorized and deployed.
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
  Together with the baseline they execute 384 assertions covering schema
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
- [x] `scripts/test-supabase-rpc-smoke.mjs` runs the complete 27-wrapper
  matrix through two independent local Auth clients with unique run IDs,
  replay/hash-mismatch checks, cross-user checks, and deletion cleanup.
- [x] `scripts/test-supabase-rpc-remote.mjs` provides a separately guarded
  remote runner. It reads only the existing client-safe `.env.local` URL/key,
  requires `SUPABASE_RPC_REMOTE_CONFIRM=ifunkhvbvkdxolhpxjvk`, rejects local
  URLs and service/secret keys, and accepts confirmed disposable credentials
  only through the current process environment.

### Not completed

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
- [x] Re-run the full test gate after the MVP-0/M1.2 migrations. All 384
  pgTAP assertions pass, including anonymous denial, cross-user
  denial, user-ID reassignment protection, invalid inputs, owner-only custom
  catalogs, direct table-write denial, wrapper authorization, controlled
  `SECURITY DEFINER` settings, every ownership/foreign-key index, RPC
   idempotency, export shape, deletion safety, revision triggers, stale-version
   rejection, finite-number/date validation, and unsupported-screening guards.
- [ ] Complete the remote manual RPC/Auth smoke flow with disposable
  authenticated accounts. The local 103-assertion RPC suite and the
  two-client Data API runner exercise all 25 wrappers, including the M1.2
  meal-editing wrappers with duplicate retries and ownership checks. The remote project has
  passed linked migration/dry-run preflight, but remote account creation,
  email confirmation, 27-RPC execution, and cleanup remain pending until two
  confirmed disposable credentials are supplied transiently.

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
- [ ] Add server-side CSV formatting and a cache-clearing workflow around the
  deployed JSON export and account-deletion RPCs.

#### P1 — Nutrition and AI trust boundary

- [ ] Select and load a trusted, versioned production nutrition database. The
  authored starter foods remain estimated seed data and are not production
  nutrition authority.
- [ ] Add protected server-side AI text-meal extraction. AI may produce a
  schema-validated review candidate, but trusted nutrition data, deterministic
  calculations, and explicit user confirmation must own persistence.
- [ ] Test raw/cooked/prepared serving assumptions, restaurant uncertainty,
  source/version/confidence display, estimated flags, corrections, and the
  rule that missing days are not represented as zero intake.

#### P2 — Production configuration and release dependencies

- [ ] Enable Supabase Auth leaked-password protection before production.
- [ ] Configure production Site URL and exact redirect URLs.
- [ ] Configure custom SMTP for production email delivery.
- [ ] Implement and verify full service-worker/offline/PWA behavior without
  presenting unsynchronized mutations as persisted.

The current test implementation is local-first and does not change the linked
remote project. The previous local verification gate is complete; the latest
profile-only/version-validation/M1.2 migrations are applied locally. The last verified
results are:

- `npx supabase@latest db reset --local`: clean 30-file local migration gate
  passed, including the profile-only/version-validation and M1.2 meal-editing
  migrations.
- `npx supabase@latest migration list --local`: pass; the local migration
  history is complete.
- `npx supabase@latest db lint --local`: pass with no schema errors.
- `npx supabase@latest test db --local`: 384/384 assertions passed across eight
  suites.
- `npm run supabase:test:rpc`: pass; all 27 public wrappers were exercised
  through two disposable local Auth users and both accounts were cleaned up
  through `delete_account`.
- `npm run supabase:test:concurrency`: pass against
  `http://127.0.0.1:56321`, including disposable-user cleanup.
- `npm run typecheck` and `npm run lint`: pass.
- `npm run build`: pass; the configured Google-hosted Nunito font was fetched
  with network access (the initial sandbox attempt was blocked only by that
  external font fetch).

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
Context integration are implemented. The backend is not production-ready
until the P0 correctness/security work and P1 authenticated integration work
are complete and the guarded remote RPC/Auth smoke flow is verified against
confirmed disposable users.

## 2. Client-safe environment

Create `.env.local` in the project root and do not commit it. The app currently
uses these non-secret variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ifunkhvbvkdxolhpxjvk.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing project publishable key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The current workspace `.env.local` contains these three variables and points
at the remote project. The publishable key is intentionally redacted here and
must not be copied into documentation. `NEXT_PUBLIC_SITE_URL` controls the
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
`next=/auth/update-password`. Configure custom SMTP before production email
delivery; the default Supabase sender is rate-limited and intended for
testing.

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
locally; it remains pending on the linked remote until an explicitly authorized
staging/remote rollout.

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
npx supabase@latest db reset --local
npx supabase@latest migration list --local
npx supabase@latest db lint --local
npx supabase@latest test db --local
npm run supabase:test:rpc
npm run supabase:test:concurrency
npm run typecheck
npm run lint
npm run build
```

The local reset must apply every migration from an empty database. The current
workspace has completed this verification. Re-run it after every migration
change and verify at
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
- The RPC smoke path signs up two disposable local users, exercises all 23
  public wrappers, checks replay/hash-mismatch and cross-user behavior, and
  cleans up through `delete_account`.

If local Docker is unavailable, record that limitation rather than treating
static SQL inspection as equivalent to database verification.

## 7. Linked-project workflow

The current linked-project rollout has completed the reviewed dry run and push:

- Project ref: `ifunkhvbvkdxolhpxjvk`
- Remote region: `ap-northeast-1`
- Remote history: all nineteen local migrations, confirmed through the linked
  project migration listing
- Linked dry run: up to date with no pending migrations
- Linked lint: pass; `npx supabase@latest db lint --linked` reports no schema
  errors after the RPC batch and export-shape hardening migration.

For future changes, only after local verification and review of the migration
list:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest db push --dry-run
```

After creating and confirming two disposable remote Auth accounts through
the existing sign-up flow, the complete remote RPC matrix can be run with the
guarded client-only harness. Supply the two confirmed account credentials
only in the current process environment; do not add them to `.env.local`, a
committed file, or shell-history-backed configuration:

```powershell
$env:SUPABASE_RPC_REMOTE_CONFIRM = "ifunkhvbvkdxolhpxjvk"
# Inject the four SUPABASE_RPC_REMOTE_USER_* values through an approved
# temporary secret mechanism; do not paste account passwords into history.
npm run supabase:test:rpc:remote
```

The remote runner reads only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the existing `.env.local`, refuses
any project other than `ifunkhvbvkdxolhpxjvk`, and performs all writes through
authenticated RPCs. It deletes both disposable accounts through
`delete_account` at the end. Do not run it until the accounts are confirmed,
and do not mark remote RPC verification complete until the command succeeds
and cleanup is confirmed.

The dry run must be reviewed against the linked migration history before any
future push. Do not use blind pulls, force flags,
`--include-all`, guessed migration repairs, or dashboard-only schema changes.

If a remote schema already contains equivalent changes, prove equivalence for
columns, constraints, indexes, policies, grants, function bodies, and relevant
data before repairing migration history. Never edit, rename, delete, or
reorder a migration that may already be applied; use a new forward migration.

## 8. Next backend phase

The initial backend implementation has completed these steps:

1. Generate `src/types/database.generated.ts` from the linked public schema.
2. Add typed domain/database mappers that preserve application string IDs and
   hide internal `row_id` values from the UI boundary.
3. Implement authorized RPCs for profile setup, target
   creation, plan generation/editing, session completion, nutrition saves,
   meal/recipe changes, grocery regeneration, export, and account deletion.
4. Replace the in-memory repository path with authenticated Supabase reads and
   mutation outcomes that include refreshed read models and semantic events.
5. Add the focused database/security tests, local concurrency runner, and
   complete local 27-RPC smoke runner. These test assets are present and the
   local RPC/database sweeps are passing; remote disposable-user exercise and
   remaining product integration work are still separate release dependencies.

The next backend work should be test-first hardening and product integration:

1. Add repository tests against the local stack and keep input drafts intact
   across transient failures.
2. Wire the remaining UI actions to the repository and expose typed loading,
   error, retry, and empty states.
3. Regenerate database types after every schema/function migration and run
   local reset, lint, tests, typecheck, lint, and build.
4. Run remote manual Auth smoke tests with disposable accounts before treating
   the project as production-ready.
