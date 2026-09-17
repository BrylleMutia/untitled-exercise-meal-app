# MVP Priority Matrix

Audit date: 2026-09-16
Implementation specification revision: 2026-09-17

This document summarizes the current implementation and the work required to
meet the MVP contract in [`FEATURES.md`](./FEATURES.md), the engineering and
security requirements in [`ARCHITECTURE.md`](./ARCHITECTURE.md), the visual and
interaction guidance in [`DESIGN.md`](./DESIGN.md), and the operational backend
status in [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md). Source code, migrations,
generated types, and tests are treated as the implementation truth.

## Executive Status

The project is an advanced, backend-enabled alpha. It is well beyond a visual
mockup: the responsive application shell, Supabase authentication, normalized
database schema, RLS policies, authenticated RPC boundary, generated database
types, repository hydration, core screens, and substantial database test suites
exist. A user can exercise much of the intended loop in the current UI.

The app is not yet MVP-complete under the current product contract. The MVP-0
implementation wave
implemented the highest-risk foundation fixes: historical plan hydration,
goal/profile persistence, planned-meal trust metadata, atomic saved-meal
logging, persistent workout overrides, serialized session saves, recoverable
browser drafts, server-backed export/deletion, pending/offline/error UI, and a
forward hardening migrations. Remaining release blockers are production
nutrition/AI, complete feature-wide conflict/reapply coverage,
browser/accessibility verification, and guarded remote verification.

Status terms used below:

- **Complete:** implemented for the documented MVP scope, subject to the final
  integrated release gate.
- **Substantially complete:** the main path exists, with bounded hardening or
  production configuration still required.
- **Partial:** useful implementation exists, but one or more acceptance
  criteria or safety/data-integrity requirements are missing.
- **Not implemented:** no compliant end-to-end implementation exists.
- **Verification blocked:** the implementation may exist, but the required
  check could not be rerun in the current audit environment.

## MVP-0 implementation status (2026-09-17)

The following highest-risk items now have implementation coverage:

- Historical sessions hydrate against all user plan versions; Progress and
  weekly workout counts no longer discard completed sessions from superseded
  plans.
- Goal target weight/rate/date and profile preference fields round-trip through
  onboarding/profile editing. Planned meals retain expected macros, source,
  assumptions, confidence, and preparation basis.
- Workout edits are per scheduled exercise slot and persist through the
  `apply_workout_override` RPC/table. Regeneration reapplies active overrides.
- Saved-meal logging is one atomic `log_saved_meal` transaction. Nutrition
  validation accepts legitimate zero-valued nutrients.
- Session saves are serialized, interrupted in-progress sessions are reused,
  and onboarding/session drafts are recoverable from browser storage. Context
  retains the failed mutation key for an explicit retry action and the shell
  exposes pending/error/offline states.
- Settings export now calls `export_account_data`; account deletion calls the
  authorized delete RPC, clears local drafts, and redirects to sign-in.
- Forward-only migrations add catalog non-blank checks, revision/eligibility
  metadata, shared RPC preflight validation, and profile-only unsupported
  onboarding. They are applied and verified against the local Supabase stack;
  the linked remote remains unchanged pending explicit rollout authorization.

Remaining release blockers are complete feature-wide conflict/reapply coverage,
nutrition editing/preparation controls, trusted production nutrition data,
protected AI extraction, browser/accessibility checks, and guarded
staging/remote smoke verification.

## What Is Completed So Far

### Application and design foundation

- Next.js App Router, React, strict TypeScript configuration, Tailwind CSS 4,
  shared design tokens, reusable UI primitives, responsive layouts, mobile
  bottom navigation, desktop navigation, loading/error pages, reduced-motion
  CSS, and accessible labels are present.
- Authenticated product routes and the onboarding, Home, Workouts, workout
  session, Nutrition, Grocery, Progress, and Settings surfaces exist.
- The PWA manifest and SVG icon exist. A service worker and raster install icons
  are not implemented, but these are progressive enhancements rather than core
  MVP requirements.

### Authentication and Supabase foundation

- Supabase browser/server SSR clients, cookie-backed sessions, Proxy session
  refresh, safe protected-route redirects, PKCE confirmation, token-hash
  verification, password recovery, sign-up, sign-in, sign-out, and missing-env
  configuration handling exist.
- Twenty-two forward-only migrations define 20 public tables, versioned workout
  and meal plans, planned-versus-actual workout history, nutrition and weight
  history, grocery state, idempotency records, indexes, constraints, RLS, and
  explicit grants/revokes.
- Twenty-three public authenticated RPC wrappers cover profile/target/plan
  bundles, workout sessions, nutrition, saved meals/recipes, weight, grocery,
  export, and account deletion.
- `src/types/database.generated.ts`, database-to-domain mappers, authenticated
  repository hydration, typed mutation outcomes, and semantic events exist.
- Static inspection confirms the documented 20 tables, 20 policies, and 23
  public RPCs. Fresh local reset/lint, all 377 pgTAP assertions, the 23-RPC
  client smoke run, concurrency run, typecheck, lint, and production build
  now pass; linked history/lint still cover only the previously deployed
  nineteen migrations.

### Domain and feature groundwork

- Health utilities implement metric/imperial conversion, Mifflin-St Jeor BMR,
  BMI, activity factors, TDEE, calorie/macro targets, adult input boundaries,
  and an aggressive-rate warning. Unit tests cover these primary calculations.
- A 21-exercise curated catalog covers push, pull, squat, hinge, core, and
  mobility. Bundled illustrations, accessible descriptions, regressions,
  progressions, safety copy, and CC BY-SA attribution exist.
- Deterministic workout and meal-plan generators exist. Workout generation
  considers available equipment, training days, experience, and requested
  duration; plans include warm-up, ordered exercises, rest, cooldown, and
  estimated duration.
- Workout sessions can be started, paused locally, resumed locally, adjusted,
  skipped, marked manageable, assigned RPE/pain, noted, finished, or abandoned.
  Planned and actual exercise values are stored separately.
- Manual catalog food entry, custom nutrition entry, deletion, daily totals,
  meal-slot completeness labels, starter saved-meal logging, and a temporary
  text-to-review parser exist.
- Grocery generation combines ingredients and the merge utility preserves
  checked state, quantity overrides, removals, and custom items. The UI supports
  checking, quantity changes, removal, custom items, and regeneration.
- Weight logging, calendar/history presentation, logged-day nutrition averages,
  and workout/nutrition summary cards exist.

## MVP Feature Matrix

| MVP area | Current status | Evidence that exists | Required to call it complete |
|---|---|---|---|
| App shell, responsive design, accessibility baseline | Substantially complete | Shared shell/components, mobile and desktop navigation, 44px controls, focus styles, reduced motion, loading/error/empty/pending/offline surfaces | Run mobile, desktop, keyboard, screen-reader-oriented, large-text, reduced-motion, and narrow-overflow checks |
| Supabase authentication | Substantially complete | SSR clients, protected routes, PKCE/token-hash callback, sign-up/sign-in/recovery/sign-out | Configure production URLs, SMTP, leaked-password protection; complete remote disposable-user Auth smoke flow |
| Supabase schema, RLS, RPCs, generated types | Substantially complete | 23 forward-only migrations, 20 RLS tables/policies, 23 authenticated wrappers, direct writes revoked, generated types aligned with the MVP-0 revision/health columns, local reset/lint/377 pgTAP/23-RPC/concurrency checks passing | Apply the hardening migration to staging/remote when authorized, regenerate types from the deployed schema, and run remote RPC/Auth smoke |
| Onboarding and profile | Substantially complete | Four-step flow, core body/training fields, units, dietary pattern, allergy text, primary goal, target weight/date/rate persistence, optional preference fields, profile hydration/edit action, supported-population screening | Add food-preference, cooking-time, and budget controls; verify unsupported profile-only completion and under-five-minute completion |
| Health calculations and safety | Substantially complete | Versioned Mifflin–St Jeor policy, adult boundaries, unit conversions, estimate/disclaimer copy, aggressive-rate UI, explicit below-floor/unsupported outcomes, persisted target assumptions | Preserve assumptions in every historical read model, represent ranges where appropriate, broaden boundary tests, and complete browser verification |
| Goals and target versioning | Substantially complete | Versioned database tables and bundle creation; goal fields now hydrate and persist with target references; expected-version preflight and typed stale errors | Complete feature-wide stale reapply UX and verify historical summaries retain target assumptions |
| Exercise library | Complete for starter scope | 21 exercises, balanced movement coverage, local illustrations, descriptions, equipment, measure type, regression/progression, safety, attribution | Final visual/accessibility review and catalog parity test rerun |
| Weekly workout plan | Substantially complete | Deterministic generator with schedule/equipment/duration constraints, per-slot edit UI, authorized override RPC/table, override hydration and regeneration preservation | Add override removal UI and apply recorded performance to the next plan rather than only showing a suggestion |
| Workout execution and logging | Substantially complete | Start/save/finish/abandon RPCs; actual sets/reps/holds, skip/modify, RPE, manageable, pain, notes; local pause/resume, interrupted-session recovery, serialized saves, stable retry key | Add optional load entry and make warm-up/cooldown/rest guidance usable in-session; test every lifecycle transition and browser failure path |
| Weekly meal plan | Partial | Deterministic seven-day plan, dietary/allergy filtering, skip/unskip, versioned database rows, expected macro/source/version/assumption/confidence metadata | Add replace, serving change, add-meal, and explicit plan-edit flows; account for preferences, cooking time, budget, and user recipes; preserve past logs and user edits across regeneration |
| Manual nutrition logging | Substantially complete | Catalog/custom entry, deletion, non-negative validation, daily totals/completeness labels, source/confidence display, atomic `log_saved_meal` RPC, per-entry idempotency, recoverable custom/text drafts | Add editing/correction and serving-unit/preparation controls; add planned-meal/recipe drafts and run duplicate/date/unit tests |
| Trusted nutrition data | Not implemented | Estimated 22-food starter catalog with source/version labels | Select, license, document, load, and version one production nutrition source; define canonical grams/milliliters, household conversions, branded/raw/cooked behavior, mixed-dish uncertainty, and unmatched fallback |
| AI-assisted text nutrition | Not implemented for MVP | Temporary deterministic browser parser and review UI | Add protected server-side/Edge Function extraction, Zod/schema validation, trusted-record matching, timeouts/rate limits/privacy/error handling, editable candidate review, and separate confirmation/save mutation. The model must never supply authoritative macros or save data directly |
| Custom meals and recipes | Partial backend only | Tables, hydration, save meal/recipe RPCs, repository `saveMeal` method, starter saved-meal display/logging | Expose Context actions and create/duplicate/edit/delete/log UI; calculate per-serving nutrition; validate ingredient ownership/units; make meal logging atomic; update grocery state after recipe edits |
| Grocery list | Partial | Generation, duplicate combination, categories, check/edit/remove/custom/regenerate UI, generated-versus-adjusted values | Connect every meal replacement/serving/recipe change to regeneration; harden concurrent regeneration and lock ordering; expose pending/failure/retry behavior; verify overrides, removals, checked items, and custom items across all edit sequences |
| Calendar and progress | Substantially complete | Calendar, history across plan versions, weight entries/sparkline, workout count, calorie/protein averages, explicit unlogged labels | Show planned/skipped occurrences, add date ranges/data counts, and introduce bounded/paginated read models |
| Settings and data controls | Substantially complete | Unit changes, weight entry, plan reset, sign-out, disclaimer, server JSON export, authorized account deletion, sign-out and local draft clearing | Add full profile/target editing surface; add CSV if retained in scope; add notification preference or explicitly defer it in `FEATURES.md` |
| Failure, offline, and draft recovery | Partial | Onboarding, nutrition custom/text, grocery custom-item, and workout-session recoverable drafts; serialized saves; stable retry key retained in Context; pending/error/offline UI; explicit restore/discard and retry actions; safe re-auth return path | Add planned-meal/recipe drafts and verify all account-switching, stale reapply, and offline paths |
| Testing and release verification | Substantially complete | Health/progression unit tests; eight SQL suites; local reset/lint/377 pgTAP/23-RPC/concurrency runners; typecheck, lint, unit tests, and production build pass | Add plan, meal-plan, nutrition, grocery, mapper/repository, component, and end-to-end tests; add CI; run browser/accessibility/offline and guarded remote gates |

MVP-0 reconciliation note: the onboarding screen now captures the supported-
population result, target calculations use the versioned health policy without a
silent calorie floor, and unsupported onboarding persists only a profile for
manual logging. The remaining onboarding work is preference/budget controls and
browser verification, not the screening contract itself.

## Highest-Risk Findings

The original audit findings were rechecked after the retry implementation.

1. **Historical workout resolution — resolved.** Snapshot hydration now loads
   planned workouts/exercises across every user plan version, and progress
   counts no longer filter completed history to the current plan.
2. **Plan editing and progression — partially resolved.** Authorized,
   per-slot workout overrides and replacement UI now persist safely. Bounded
   progression acceptance/rejection, override removal, and meal-plan editing
   remain open.
3. **Concurrent writes and retries — partially resolved.** Context guards
   duplicate submissions, retains idempotency keys for retry, serializes session
   saves, refreshes stale snapshots, and exposes typed expected-version conflicts.
   Broader repository integration and feature-wide reapply coverage remain open.
4. **Saved-meal logging — resolved.** `log_saved_meal` performs one atomic
   transaction with deterministic per-entry idempotency keys; the 23-wrapper
   local smoke suite covers replay and ownership behavior.
5. **Nutrition zero-value validation — resolved.** Legitimate zero-valued
   nutrients are accepted while servings remain positive and values non-negative.
6. **Planned-meal trust metadata — resolved.** Expected macros, source/version,
   assumptions, confidence, and preparation basis now survive generation and
   hydration.
7. **Profile/goal persistence — resolved.** Target weight/rate/date and profile
   preference fields round-trip through onboarding and profile editing.
8. **Data controls — resolved.** Settings uses server export/deletion RPCs,
   signs out after deletion, clears local drafts, and redirects to sign-in.
9. **Recovery behavior — partially resolved.** Onboarding/session drafts,
   serialized saves, offline detection, pending/error states, explicit
   restore/discard, and retry UI are present for onboarding, nutrition
   custom/text, grocery custom items, and workout sessions. Failed identity
   refresh now preserves drafts and routes to sign-in with a safe return path.
   Planned-meal/recipe drafts, full stale reapplication coverage, and
   production PWA behavior remain open.
10. **Database gate — resolved locally.** The forward hardening migrations are
    applied locally; lint, 377 pgTAP assertions, 23-wrapper smoke, and
    concurrency/isolation checks pass. Linked rollout and remote Auth smoke
    remain pending explicit authorization and disposable credentials.

## Documentation and Guide Review

### Strong points

- Responsibilities are clearly divided: `FEATURES.md` owns product behavior,
  `ARCHITECTURE.md` owns technical and security contracts, `DESIGN.md` owns
  visual decisions, `SUPABASE_SETUP.md` owns operations, and `AGENTS.md` owns
  workflow and safety guardrails.
- Product safety, planned-versus-actual separation, non-guilt language,
  nutrition uncertainty, Supabase authority, RLS, idempotency, migration
  safety, and verification expectations are unusually explicit.
- `SUPABASE_SETUP.md` contains the most accurate current implementation status
  and carefully distinguishes local, linked read-only, and guarded remote
  write verification.

### Documentation drift to correct

- The architecture, design, agent guide, package description, and setup status
  were reconciled during this implementation pass; their remaining open items
  are production configuration and verification rather than missing local
  persistence/RPC infrastructure.
- `FEATURES.md` defines AI-assisted text nutrition as P0 and includes it in the
  MVP acceptance checklist, while `SUPABASE_SETUP.md` groups the AI trust
  boundary under P1. Until `FEATURES.md` is deliberately changed, AI remains an
  MVP requirement.
- The repository has no concise root `README.md` for installation, environment,
  local Supabase startup, verification, and documentation routing. The detailed
  setup guide exists, but a short entry point would reduce onboarding errors.
- The guide requires a `context7-mcp` skill for external platform work, but that
  skill is not available in the current configured skill catalog. Either make
  it available or update the fallback wording so the workflow is actionable.

## MVP 0–2 Agent-Ready Implementation Specification

This section is the implementation contract for the remaining MVP work. It is
intended to be executable by multiple agents without requiring them to make new
product, data-ownership, or security decisions.

### Locked implementation decisions

- **Nutrition authority:** USDA FoodData Central is the only production
  nutrition authority. The existing starter foods remain development fixtures
  and must not be presented as production nutrition records.
- **Text extraction:** OpenAI performs structured extraction through an
  authenticated Supabase Edge Function. AI output is an unconfirmed draft,
  never an authoritative macro source or a direct persistence path.
- **Stale-edit behavior:** preserve the local draft, load current server state,
  explain the conflict, and require explicit reapplication against the latest
  version.
- **Export:** JSON is the MVP export format. CSV is deferred because the product
  contract permits JSON or CSV.
- **Deferred platform work:** notifications, reminders, service-worker caching,
  background mutation sync, and full installable-PWA behavior are post-MVP.
  Explicit offline state and recoverable drafts remain required.
- **Supported population:** the automated target and personalized progression
  path supports eligible adults only. Unsupported cases do not receive
  automated health or progression targets.
- **Migration discipline:** every database correction uses a new forward
  migration. Never edit, rename, delete, or reorder a possibly applied
  migration.
- **Remote safety:** linked, staging, or production changes require explicit
  authorization and the guarded workflow in `SUPABASE_SETUP.md`.

Current Supabase implementation work must continue to follow the official
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[database function](https://supabase.com/docs/guides/database/functions), and
[Edge Function](https://supabase.com/docs/guides/functions) guidance. In
particular, grants and RLS are separate controls, privileged functions require
controlled execution and search paths, and provider credentials remain
server-side.

### Work-package format and status vocabulary

Each work package below records:

1. Outcome and user-visible behavior.
2. Existing implementation to extend.
3. Domain and persistence logic.
4. Public contracts and integration points.
5. Failure, offline, stale, retry, and discard behavior.
6. Automated and manual verification.
7. Dependencies, completion evidence, and exit criteria.

Allowed work-package statuses:

- **Not started:** the compliant end-to-end behavior does not exist.
- **In progress:** code or migrations exist, but the package exit criteria are
  not green.
- **Locally verified:** implementation and all applicable local gates pass.
- **Remotely verified:** guarded staging or linked verification also passes.
- **Complete:** required local, remote, browser, accessibility, documentation,
  and release evidence is recorded.

### Shared contracts required before feature work

Add these contracts to the existing domain/backend/repository boundary before
implementing dependent screens:

- `ExpectedVersions`: optional `profileRevision`, `goalVersion`,
  `targetVersion`, `workoutPlanVersion`, `mealPlanVersion`, `groceryRevision`,
  and `recordRevision`. Send only the fields relevant to the requested intent.
- `RepositoryError.conflict`: the affected entity, expected version, current
  version, and whether Context successfully refreshed the authoritative
  snapshot. `stale_version` is not an automatic retry.
- `DraftEnvelope<T>`: schema version, authenticated user ID, draft kind, base
  versions, updated timestamp, expiry timestamp, and payload.
- `FoodServingOption`: quantity, unit, gram equivalent, label, source, and source
  version. Only trusted provider conversions may be used for catalog foods.
- `FoodSearchPage`: normalized USDA results, bounded result count, and opaque
  continuation cursor. It must not contain model-authored nutrition values.
- `TextMealDraft`: extracted food descriptions, quantities, units,
  preparations, uncertainties, trusted matches, and deterministic calculations.
- `ProgressionRecommendation` and `ProgressionDecision`: rule version, source
  session IDs, current prescription, proposed bounded change, explanation, and
  pending/accepted/rejected state.
- `HistoryPage<T>` and `ProgressSummary`: explicit date range, data count,
  completeness metadata, and opaque cursor.

Extend semantic events only when their behaviors are implemented:

- `meal-plan-edited`
- `nutrition-entry-corrected`
- `recipe-changed`
- `progression-accepted`
- `progression-rejected`
- `workout-override-removed`
- `draft-restored`

Do not infer these events by diffing arbitrary snapshots.

## MVP-0 — Correctness, Safety, and Contract Blockers

MVP-0 is serialized foundation work. Later packages must not invent their own
version, validation, draft, or retry conventions.

### M0.1 — Optimistic concurrency and stale-edit recovery

**Status:** In progress

**Outcome**

Two tabs or devices cannot silently overwrite each other. A stale edit keeps the
user's input, refreshes current server state, and offers an explicit reapply or
discard decision.

**Existing foundation**

- Goals, targets, workout plans, and meal plans already have immutable version
  numbers.
- Profiles, grocery lists, meals, and nutrition logs already expose update
  timestamps but do not provide a uniform expected-version contract.
- `MutationErrorCode` already includes `stale_version`, Context already retains
  retry intents, and durable mutations already require idempotency keys.

**Implementation and data logic**

1. Add integer `revision` columns to mutable aggregate roots that need editing:
   profiles, grocery lists, saved meals/recipes, and nutrition logs. Start at
   `1` and increment on every successful mutation affecting the aggregate.
2. Continue using existing immutable versions for goals, targets, workout
   plans, and meal plans. Do not add mutable revisions to immutable snapshots.
3. Add `ExpectedVersions` to every applicable repository intent. Complete
   onboarding is the only bundle creation that does not require prior versions.
4. Use one lock order in every multi-aggregate RPC: idempotency record, profile,
   active goal/target, current workout plan, current meal plan, grocery list,
   then child rows.
5. After acquiring locks, compare expected and actual values. A mismatch raises
   `stale_version` with stable entity/expected/actual details before any domain
   row changes.
6. On a stale response, Context reloads the authoritative snapshot while
   retaining the `DraftEnvelope`. Reapplication uses the refreshed base
   versions and a new idempotency key.
7. A network retry of an unchanged payload reuses its original idempotency key.
   Any changed or reapplied payload receives a new key.
8. Apply expected versions to profile/target edits, plan regeneration, workout
   override apply/remove, meal-plan edits, saved-meal/recipe edits, nutrition
   corrections, and grocery regeneration.

**Public contract changes**

- Extend repository inputs with `expectedVersions`.
- Extend `RepositoryError` with typed conflict details.
- Update Context mutation state to distinguish retryable transport failure from
  a stale edit requiring review.
- Return refreshed current versions in the normal `MutationOutcome.snapshot`.

**Implemented in the current MVP-0 wave**

- Added `revision` fields for profiles, meals, nutrition logs, and grocery lists;
  revision triggers increment them on updates.
- Added typed `ExpectedVersions`, conflict details, repository payloads, and a
  shared database preflight that locks aggregates in a consistent order and
  raises `stale_version` before durable changes.
- Context refreshes the authoritative snapshot on a stale response while
  retaining the existing retry/draft intent. Onboarding now offers explicit
  reapply/discard controls; full two-client coverage for every aggregate and
  feature-local reapply UI remain follow-up work.

**Failure behavior**

- Never auto-merge or auto-retry a stale write.
- Never discard the user's draft on reload or conflict.
- If snapshot refresh fails, keep the draft and show that the newest server
  state could not yet be loaded.
- A reused idempotency key with a changed payload remains
  `idempotency_key_reused`, not `stale_version`.

**Verification**

- Two-client tests: the first edit succeeds and the second returns typed stale
  details with no overwritten row.
- Same-key/same-payload replay returns the original result.
- Same-key/different-payload returns `idempotency_key_reused`.
- Browser test confirms draft preservation, authoritative refresh, reapply, and
  discard behavior.

**Dependencies and exit criteria**

- Depends on a forward migration and regenerated database types.
- Exit when every editable aggregate participates in the shared protocol and
  the two-client test matrix is green.

### M0.2 — RPC validation and transaction hardening

**Status:** Locally verified

**Outcome**

Every durable mutation rejects malformed, unsupported, or cross-owner data at
the server boundary and either commits its complete result or changes nothing.

**Existing foundation**

- The schema has extensive constraints, RLS, direct-write revocation,
  idempotency helpers, and 23 deliberate authenticated wrappers.
- Current pgTAP, two-user smoke, and concurrency runners are green locally.
- Validation is uneven across RPC bodies and several casts can currently rely
  on generic Postgres errors rather than stable application codes.

**Implementation and data logic**

1. Add private reusable validators for nonblank application IDs, strict local
   `YYYY-MM-DD` values, JSON object/array shapes, finite numeric values, positive
   quantities, supported enums, and bounded string lengths.
2. Reject `NaN`, positive/negative infinity, malformed dates, unsupported units,
   mismatched reps/hold forms, invalid session state transitions, blank custom
   names, duplicate slot keys, and impossible quantities before mutation.
3. Resolve every catalog reference server-side and verify system visibility or
   authenticated ownership. Never trust a client-provided user ID or internal
   row ID.
4. Retain database constraints as the final defense and translate expected
   domain failures into stable error codes.
5. Keep private helpers inaccessible to `PUBLIC`, `anon`, and `authenticated`.
   Public wrappers revoke default execution and grant only the intended role.
6. Preserve RLS on every exposed user-data table, ownership predicates for
   reads, and both `USING` and `WITH CHECK` on any update policy.
7. Extend concurrency coverage to profile updates, plan regeneration, workout
   completion, nutrition correction, recipe edits, and grocery regeneration
   using the shared lock order.

**Public contract changes**

- No generic raw SQL errors may reach components. Map failures to the existing
  `RepositoryError` shape plus the new conflict details.
- Keep public RPC payloads JSON-based for compatibility, but validate each
  operation's exact shape and reject unknown/invalid domain values.

**Implemented in the current MVP-0 wave**

- Added private finite-number/date/payload validators and applied them through
  all 23 authenticated wrappers, with private-schema execution revoked from
  client roles.
- Added local pgTAP coverage for malformed values, unsupported health payloads,
  stale grocery writes, revision triggers, and no-mutation-on-conflict behavior.

**Failure behavior**

- Validation failure is non-retryable until input changes.
- Transaction or network failure keeps the original draft and retry key.
- Ownership failure is reported as `not_found` or an authorization failure
  without revealing another user's resource.

**Verification**

- Add pgTAP cases for every validator and state transition.
- Test anonymous denial, cross-user denial, reassignment attempts, direct writes,
  grants/revokes, function settings, indexes, and atomic rollback.
- Run concurrent valid and invalid mutations and assert no partial bundles or
  deadlocks.

**Dependencies and exit criteria**

- M0.1 and M0.2 share the mutation helper migration and must be reviewed
  together before later RPCs are added.
- Exit when every public mutation has explicit validation coverage and the
  complete database gate remains green.

### M0.3 — Health eligibility and versioned calculation assumptions

**Status:** Locally verified

**Outcome**

Only supported adults receive automated health targets. Every target explains
and preserves the policy used to create it, without silent clamps or formula
changes.

**Existing foundation**

- Input boundary validation, Mifflin-St Jeor, activity factors, goal
  adjustments, estimates/disclaimers, unit conversion, and aggressive-rate
  warnings exist.
- The UI currently displays unsupported-population copy but does not collect a
  required eligibility answer.
- The target utility silently applies a 1,200-kcal floor and does not persist a
  complete assumption version.

**Implementation and data logic**

1. Add a required screening result: `eligible`, `unsupported`, or
   `not_answered`. Persist only the outcome and screening-version identifier,
   not a sensitive free-text reason.
2. Age below 18, pregnancy/postpartum, eating-disorder recovery, or a condition
   requiring individualized care blocks automated calories, macros, and
   personalized progression. Show supportive guidance and do not create target
   or plan rows.
3. Version the current policy as `calicoach-health-v1`: Mifflin-St Jeor, the
   documented activity table, and the current fixed goal adjustments.
4. Treat desired rate and target date as validation and warning inputs. Do not
   use them as a hidden calorie formula.
5. Remove the silent calorie floor. If the raw result falls below the supported
   floor, return an unsupported-target outcome instead of substituting a value.
6. Persist formula, calculation version, activity factor, goal adjustment, raw
   result, effective date, safety outcome, and disclaimer in the target
   assumptions retained by historical plans and summaries.
7. Apply an explicit change-impact policy:
   - Name or display units: update the profile revision only.
   - Body or goal inputs: create a new goal/target version and affected future
     plans.
   - Equipment, experience, days, or duration: create a future workout-plan
     version.
   - Dietary pattern, allergies, preferences, cooking time, or budget: create a
     future meal-plan version and regenerate grocery data.
8. Keep weight entries as observations. Logging weight does not silently change
   the profile or target.

**Public contract changes**

- Add eligibility and screening version to `UserProfile` and onboarding input.
- Add calculation policy/assumption data and safety outcome to `DailyTarget`.
- Return a typed unsupported result rather than a partially populated target.

**Implemented in the current MVP-0 wave**

- Added required onboarding screening choices, eligibility metadata, policy
  version `calicoach-health-v1`, raw-calorie/safety fields, and typed
  `UnsupportedTargetError` handling.
- Unsupported onboarding can persist a profile-only result for manual logging;
  no automated target or plan rows are created.
- Removed the silent 1,200-kcal clamp; below-floor and unsupported-screening
  outcomes now stop target preview/persistence and retain the user’s inputs.

**Failure behavior**

- No preview or persistence occurs while screening is unanswered.
- Unsupported cases remain able to review the explanation and edit their input,
  but cannot bypass the gate with a generic confirmation checkbox.
- Invalid metric/imperial values remain in the form for correction.

**Verification**

- Test all supported input boundaries, unsupported cases, unit conversions,
  policy serialization, aggressive-rate confirmation, and raw results below the
  supported floor.
- Verify an old target retains its policy after a new profile/target version.
- Verify profile-only changes do not create unrelated plan versions.

**Dependencies and exit criteria**

- Depends on M0.1 expected versions and M0.2 server validation.
- Exit when unsupported inputs cannot create targets and all historical targets
  identify their calculation policy.

### M0.4 — Draft recovery, reauthentication, and retry behavior

**Status:** In progress

**Outcome**

Reloads, offline periods, expired sessions, provider failures, and stale writes
do not lose active input or misrepresent an unsaved operation as persisted.

**Existing foundation**

- Onboarding and workout-session drafts exist in browser storage.
- Context serializes mutations, retains a retry intent/key, and exposes pending,
  error, retry, and offline state.
- Nutrition, meal-plan, and recipe form drafts are not consistently recoverable;
  grocery custom-item drafts still need broader conflict/offline coverage.

**Implementation and data logic**

1. Add one versioned draft repository using native IndexedDB. Key every draft by
   authenticated user ID and draft kind.
2. Store `DraftEnvelope<T>` values for profile edits, nutrition
   entry/correction, text-meal input/review, planned-meal edits, recipes, grocery
   custom items, and workout sessions.
3. Retain nutrition/meal/recipe drafts for seven days, onboarding/profile drafts
   for thirty days, and workout-session drafts until completion or abandonment.
4. Include base versions in each draft so stale reapplication can use current
   server state intentionally.
5. Clear a draft only after confirmed authoritative success or an explicit
   discard. Cache/draft write failure must not delete server data.
6. On `not_authenticated`, preserve the draft and attempt one session refresh.
   Retry the unchanged mutation with the same key only if the authenticated user
   remains the same; otherwise redirect to sign-in with a safe return path.
7. Isolate drafts between accounts. Sign-out and deletion clear or isolate all
   application drafts and cached read models before another account is shown.
8. Never queue durable mutations offline. Mark them unsaved and allow explicit
   retry after reconnection.

**Public contract changes**

- Add a typed draft service independent of `AppSnapshot`.
- Add Context actions to restore, discard, and inspect feature-local drafts.
- Keep unconfirmed AI candidates and presentation state out of durable domain
  state.

**Implemented in the current MVP-0 wave**

- Added the versioned `draftStore` service with IndexedDB-first storage,
  localStorage fallback, user/draft-type isolation, schema envelopes, TTLs,
  corruption/expiry fail-closed behavior, and account cleanup.
- Onboarding, nutrition custom/text entry, grocery custom-item entry, and
  workout sessions now use the shared draft envelope with restore/discard
  controls. Context preserves drafts across stale responses and attempts one
  authenticated session refresh before replay; failed identity refresh
  redirects to sign-in with a safe return path. Grocery retries rebuild their
  expected snapshot after a stale response instead of replaying stale versions.
  Planned-meal and recipe-specific adapters, plus browser coverage for account
  switching and stale reapplication, remain pending.

**Failure behavior**

- Corrupt, expired, or schema-incompatible drafts fail closed and offer discard;
  they never overwrite authoritative state.
- A failed draft-store write leaves the form open and warns that recovery is not
  available.
- A retryable network error retains both payload and idempotency key.

**Verification**

- Test refresh/restart restoration, expiry, corruption, account switching,
  explicit discard, sign-out/deletion cleanup, offline retry, expired sessions,
  and stale reapplication.

**Dependencies and exit criteria**

- Depends on M0.1 conflict semantics.
- Exit when every MVP edit surface has defined save, retry, restore, and discard
  behavior with no silent local-to-server divergence.

## MVP-1 — Complete the Core Product Loop

MVP-1 work may start only after the shared MVP-0 contracts are stable.

### M1.1 — Workout progression, overrides, and session completion

**Status:** In progress

**Outcome**

Recorded performance produces a bounded, explainable next-plan recommendation.
Users can accept, reject, override, or remove it without changing completed
history.

**Existing foundation**

- Deterministic workout generation, workout snapshots, actual exercise logs,
  basic progression suggestions, persistent overrides, and session recovery
  exist.
- The current progression utility uses global bounds, the UI only shows a
  suggestion, and an override cannot be removed.

**Implementation and data logic**

1. Replace global progression limits with catalog-defined minimum, maximum, and
   step values for sets, reps, holds, and optional load. Replace free-text
   progression links with validated nullable exercise references.
2. Persist a stable `slotKey` on planned exercises and overrides. Overrides
   follow the scheduled slot, not a generated exercise ID or internal row ID.
3. Evaluate the latest two applicable exposures with the documented rules:
   - Two safe qualifying exposures propose one bounded increase.
   - RPE 8, partial, skipped, or modified holds the prescription.
   - Two non-qualifying exposures may propose the catalog regression.
   - Pain, safety concern, or RPE 9–10 never progresses and proposes recovery or
     regression.
4. Apply precedence in this order: active explicit user override, accepted
   progression decision, deterministic base prescription.
5. Persist progression decisions with rule version and source-session IDs.
   Accepting creates a new future workout-plan version; rejecting prevents the
   same evidence from being offered repeatedly.
6. Upgrade `apply_workout_override` so applying/changing an override also creates
   a new future plan version. Add `remove_workout_override`, which ends the
   override and creates a new version from deterministic rules plus remaining
   overrides.
7. Add optional actual load and load unit to exercise logs. Never infer planned
   load from actual load.
8. Present warm-up, current exercise, rest guidance, and cooldown in the active
   session flow with large one-handed controls and minimal required reading.

**Public contract changes**

- Add `getProgressionRecommendations`, `applyProgressionDecision`, and
  `removeWorkoutOverride` repository/Context actions and authorized RPCs.
- Add load/unit snapshots and progression decision types.
- Add semantic events for accepted/rejected progression and removed overrides.

**Failure behavior**

- No progression is applied without confirmed RPC success.
- A stale plan keeps the decision draft and reloads the latest plan.
- An unavailable catalog progression produces a hold/recovery result rather
  than an invalid substitution.

**Verification**

- Test every RPE/manageable/pain/partial/skipped sequence, catalog bounds,
  exercise-variant transition, override precedence, removal, replay, and stale
  plan.
- Verify identical inputs produce identical results.
- Verify completed planned/actual snapshots do not change after any future-plan
  edit.

**Dependencies and exit criteria**

- Depends on M0.1–M0.3 and the stable exercise catalog migration.
- Exit when the accepted/rejected/override/remove loop is durable, deterministic,
  explainable, and history-safe.

### M1.2 — Editable meal plans, recipes, and atomic grocery updates

**Status:** In progress

**Outcome**

Users can replace, resize, add, skip, or regenerate planned meals; create and
reuse recipes; and immediately receive a reconciled grocery list that preserves
their explicit corrections.

**Existing foundation**

- Versioned meal-plan tables, deterministic generation, skip/unskip, saved-meal
  persistence/logging, grocery generation, and merge behavior exist.
- Replace/add/serving flows and recipe CRUD UI are missing, and recipe changes do
  not yet participate in grocery regeneration.

**Implementation and data logic**

1. Add a stable planned-meal slot key and `sortOrder`. Replace one-row-per-date
   and meal-slot uniqueness with date/slot/order uniqueness so multiple snacks
   or added meals are representable.
2. Implement one `editMealPlan` intent union: replace reference, change serving,
   add entry, skip/unskip, or regenerate.
3. Every edit creates a new future meal-plan version with a supersedes link. Old
   plan rows and previously logged nutrition remain unchanged.
4. Accept only intent and trusted food/meal IDs from the client. Recalculate
   expected macros, source/version, preparation, assumptions, and confidence
   from persisted catalog data at the trusted boundary.
5. Apply dietary pattern, allergies/exclusions, food preferences, cooking-time
   ceiling, budget, and available user meals/recipes during deterministic
   generation. If nothing qualifies, create an explicit unresolved slot.
6. Expose reusable meal/recipe behavior:
   - Create and edit through the owner-checked save boundary.
   - Duplicate from an owned/system-visible source into a new owned record.
   - Archive instead of hard-delete so historical references remain valid.
   - Calculate per-serving nutrition from canonical ingredient quantities.
   - Log all ingredients atomically through the saved-meal transaction.
7. If an edited recipe is referenced by the active meal plan, regenerate the
   current grocery list in the same transaction.
8. Recalculate generated grocery quantities while preserving checked state,
   explicit quantity overrides, removals, and custom items. Surface changed
   generated quantities.

**Public contract changes**

- Add `editMealPlan`, `saveCustomFood`, `saveMeal`, `duplicateMeal`,
  `archiveMeal`, and `logSavedMeal` repository/Context intents.
- Add authorized RPCs for behaviors not covered by existing wrappers.
- Return meal-plan and grocery semantic events from combined mutations.

**Failure behavior**

- Meal-plan and grocery changes succeed or fail together.
- Stale meal-plan/grocery versions preserve the edit draft for reapplication.
- Missing or unsafe matches remain unresolved; the generator never substitutes
  a known allergen or fabricates nutrition.

**Verification**

- Test every edit kind, multiple same-slot entries, recipe create/edit/duplicate/
  archive/log, historical resolution, concurrent edits, and rollback.
- Test grocery merges after replacement, serving change, add, skip, recipe edit,
  user quantity override, removal, checked item, and custom item.

**Dependencies and exit criteria**

- Depends on M0.1–M0.4 and the M1.3 nutrition/serving contracts.
- Exit when every saved meal/recipe/plan edit updates grocery state atomically
  without rewriting logs or user corrections.

### M1.3 — USDA FoodData Central and nutrition correction

**Status:** Not started

**Outcome**

Planned, manual, recipe, and text-assisted nutrition derives from versioned
USDA records or is visibly identified as user-provided/uncertain.

**Existing foundation**

- The current catalog, source/version/confidence snapshots, serving fields,
  custom logging, saved meals, totals, and delete behavior provide a usable
  development path.
- The 22 starter foods are estimates and do not define canonical household
  conversions or a production data lifecycle.

**Implementation and data logic**

1. Add nutrition-source release metadata, stable USDA `fdcId`, record/data type,
   provider revision/date, import timestamp, description, optional brand data,
   preparation basis, and confidence to trusted food records.
2. Add a serving-options table containing only USDA-backed quantity/unit/gram
   conversions. Enable RLS and explicit grants appropriate to public system
   catalog reads and owner-only custom rows.
3. Store canonical nutrients per 100 g. Calculate nutrients as
   `quantity × grams-per-unit × nutrient-per-100g / 100` in a pure utility.
4. Treat raw and cooked records as different foods. Never infer a conversion
   between preparation states.
5. Allow household units only when USDA supplies a gram weight. Otherwise
   require grams or an explicitly user-provided custom value.
6. Add an authenticated `nutrition-search` Edge Function that validates and
   bounds queries, calls USDA with a server secret, normalizes results, supports
   opaque pagination, and caches a selected record through an authorized server
   path.
7. Production system catalog rows use USDA only. User custom foods remain
   distinct, owner-controlled, and labeled `User-provided`.
8. Default restaurant meals, sauces, oils, and mixed dishes to low confidence
   unless an exact labeled record is selected. Require visible assumptions.
9. Add nutrition correction through an expected-record-revision mutation.
   Preserve the original source snapshot unless the user explicitly selects a
   different record or serving.
10. Expose serving quantity/unit, gram equivalent, source record/version,
    preparation basis, assumptions, confidence, and estimated/user-provided
    status in domain models and UI.

**Public contract changes**

- Add `FoodServingOption`, USDA source metadata, and the `FoodSearchPage`
  contract.
- Add focused food search/import repository services rather than expanding the
  main snapshot.
- Add `updateNutrition` and `saveCustomFood` mutations.

**Failure behavior**

- USDA/network failure keeps search or entry drafts and leaves manual custom
  logging available.
- No match produces an uncertain custom-entry path, not fabricated precision.
- A source update never rewrites old plan or log snapshots.

**Verification**

- Test per-100-g scaling, every supported serving unit, raw/cooked separation,
  branded servings, missing portion weights, zero-valued nutrients, source
  revisions, correction, and duplicate retries.
- Verify starter fixture data is clearly non-production and cannot be confused
  with USDA records in production configuration.

**Dependencies and exit criteria**

- Depends on M0.1, M0.2, Edge Function authentication, and a reproducible USDA
  import/cache contract.
- Exit when every persisted nutrition value has a trusted snapshot or explicit
  user-provided/uncertain provenance.

### M1.4 — Protected OpenAI text-meal extraction

**Status:** Not started

**Outcome**

A user can describe a meal, review and correct structured USDA-backed matches,
and explicitly confirm an atomic save. AI never owns calculations or writes.

**Existing foundation**

- The Nutrition page has a temporary deterministic browser parser and review
  UI.
- Manual food/custom entry and atomic multi-entry saved-meal logging exist.

**Implementation and data logic**

1. Create an authenticated `extract-text-meal` Supabase Edge Function. Require
   server-side `OPENAI_API_KEY` and `OPENAI_MODEL`; expose neither to browser
   configuration.
2. Accept text up to 1,000 characters, locale, and request ID after explicit user
   action. Send only the meal text and extraction instructions to OpenAI.
3. Require schema-constrained food names, quantities, units, preparation,
   qualifiers, and uncertainty notes. Reject invalid model output.
4. Match extracted items deterministically against cached USDA records and use
   the server-side USDA search path when needed. Ignore model-generated macro
   values.
5. Return editable candidates, alternative trusted matches, serving
   assumptions, confidence, and deterministic nutrition calculations.
6. Keep the input and candidates in the feature draft store. Confirmation uses
   the separate atomic nutrition logging mutation.
7. Enforce per-user limits of 10 requests per 10 minutes and 50 per day, a
   15-second provider timeout, and sanitized logs that omit meal text and health
   data.
8. Return stable `rate_limited`, `provider_unavailable`, and `invalid_output`
   outcomes. Manual logging remains available for every failure.

**Public contract changes**

- Add `TextMealDraft` and an Edge Function client service separate from the
  durable repository mutation interface.
- Add `rate_limited`, `provider_unavailable`, and `invalid_output` to the typed
  feature-level error contract.
- Keep confirmation on the existing atomic log path with trusted source
  snapshots.

**Failure behavior**

- AI/USDA failure preserves text and corrections.
- Unmatched items require a corrected match or explicit uncertain custom entry.
- The function cannot save nutrition, and its response is never presented as a
  completed log.

**Verification**

- Mock OpenAI and USDA for valid extraction, malformed schema, timeout, rate
  limit, partial/unmatched results, hidden ingredients, and provider failure.
- Verify authorization, minimal request data, secret isolation, no direct
  mutation, and confirmation-required persistence.

**Dependencies and exit criteria**

- Depends on M0.4 drafts and M1.3 trusted matching/calculation.
- Exit when the browser contains no provider secret, candidates remain drafts,
  and only a separate confirmed mutation can persist them.

### M1.5 — Focused progress and history read models

**Status:** Not started

**Outcome**

Initial hydration remains bounded while Progress and history screens accurately
show workout occurrences, nutrition completeness, weight, ranges, and counts.

**Existing foundation**

- Historical plan hydration, calendar/history, weight entries, workout count,
  nutrition averages, and explicit unlogged labels exist.
- `AppSnapshot` still loads growing sessions, nutrition logs, weights, plans,
  and child rows without pagination.

**Implementation and data logic**

1. Keep the main snapshot to the current profile, active goal/target/current
   plans, today's summary, active workout session, current grocery list, and
   compact saved-meal metadata.
2. Add focused repository reads for workout history, nutrition history, weight
   history, catalog search, and progress summaries.
3. Use cursor pagination with a default page size of 50 and maximum of 100.
   Bound aggregate summary requests to 366 calendar days.
4. Return date range, data count, scheduled/completed/skipped/planned workout
   occurrences, logged nutrition days, all calendar days, completeness status,
   and estimated-data labels.
5. Exclude unscheduled rest gaps from workout completion. Include every calendar
   day in nutrition completeness and never treat unlogged days as zero intake.
6. Add ownership/date/status/cursor indexes and select only fields rendered by
   each consumer.

**Public contract changes**

- Add `HistoryPage<T>` and `ProgressSummary` repository queries.
- Migrate Progress and history consumers before removing unbounded arrays from
  `AppSnapshot`.

**Failure behavior**

- A failed next page leaves existing rows visible and offers retry.
- Invalid or excessive date ranges return validation feedback.
- Empty ranges identify no data rather than reporting zero intake or failure.

**Verification**

- Test stable ordering, no duplicate/omitted rows across cursors, maximum limits,
  historical plan resolution, scheduled occurrence denominators, logged-day
  averages, and timezone boundaries.

**Dependencies and exit criteria**

- Can proceed in parallel with M1.1 and M1.3 after MVP-0 contracts stabilize.
- Exit when initial hydration no longer grows with full history and all progress
  semantics match `FEATURES.md`.

## MVP-2 — Verification and Production Readiness

### M2.1 — Automated test completion

**Status:** In progress

**Outcome**

Every safety, persistence, versioning, and primary-loop contract has repeatable
automated evidence.

**Implementation and verification logic**

- Add pure utility tests for health policy versions, progression boundaries,
  plan determinism, meal edits, serving conversions, correction, grocery merge,
  dates, and completeness.
- Add local Supabase repository tests for hydration, expected-version conflicts,
  retry replay, historical resolution, recipe lifecycle, atomic meal logging,
  grocery regeneration, drafts, and reauthentication.
- Add pgTAP/RLS cases for every new table/function: anonymous and cross-user
  denial, direct-write denial, invalid inputs, stale versions, grants/revokes,
  function settings, indexes, and rollback.
- Add Edge Function tests with mocked OpenAI/USDA responses for authentication,
  schema validation, timeout, rate limiting, unmatched items, and secret
  isolation.
- Keep typecheck, lint, unit, build, reset, migration list, database lint, pgTAP,
  RPC smoke, and concurrency gates green after every package.

**Exit criteria**

- Every M0/M1 package links to its passing automated evidence and no known
  contract remains covered only by manual inspection.

### M2.2 — Browser, accessibility, and end-to-end verification

**Status:** Not started

**Outcome**

The complete authenticated loop works at mobile and desktop sizes with keyboard,
large text, reduced motion, failure recovery, and accessible feedback.

**Implementation and verification logic**

1. Add Playwright and accessibility coverage for Auth, onboarding, profile
   changes, progression, meal edits, recipes, nutrition correction, AI review,
   grocery preservation, progress pagination, export, deletion, offline drafts,
   retry, and stale conflicts.
2. Run the primary loop at 390×844 and 1440×900.
3. Verify keyboard-only use, focus restoration, 200% text, reduced motion,
   touch-target sizes, one-handed workout controls, and screen-reader-oriented
   names/roles/status messages.
4. Simulate offline, request timeout, expired authentication, stale versions,
   provider failure, and failed pagination without losing drafts or existing
   content.

**Exit criteria**

- Viewports, assistive settings, scenarios, date, commit, and results are
  recorded in the release evidence section with no unresolved blocker.

### M2.3 — CI, documentation, and production configuration

**Status:** Not started

**Outcome**

Verification is repeatable and production configuration is documented without
placing secrets or unsafe write steps in the repository.

**Implementation and configuration logic**

- Add GitHub Actions gates for dependency install, typecheck, lint, unit tests,
  build, local Supabase reset/lint/pgTAP/RPC/concurrency, Edge Function tests,
  and the primary Playwright flow.
- Keep remote smoke manual or staging-secret gated and use only disposable
  accounts.
- Configure exact production Site URL/redirects, custom SMTP, leaked-password
  protection, and separate development/staging/production secrets.
- Add a root `README.md` covering installation, environment variables, local
  Supabase, verification commands, documentation routing, and remote-change
  safety.
- Reconcile `FEATURES.md`, `ARCHITECTURE.md`, `DESIGN.md`, and
  `SUPABASE_SETUP.md`: JSON is the MVP export; notification/PWA service-worker
  work is deferred; USDA and protected OpenAI extraction remain MVP work.

**Exit criteria**

- CI runs the local release gate consistently, production Auth configuration is
  recorded, and documentation no longer describes deferred work as a blocker.

### M2.4 — Guarded rollout and release evidence

**Status:** Not started

**Outcome**

Local, staging, and linked states are proven consistent before MVP 1.0 is marked
complete.

**Rollout sequence**

1. Create each schema change through the Supabase migration workflow, apply it
   locally, regenerate database types, and pass the full local gate.
2. Import a reproducible USDA production starter subset and verify its license,
   source identifiers, versions, nutrient bases, and serving metadata.
3. Deploy backward-compatible schema/RPC changes first, then Edge Functions,
   then clients that require them.
4. Run guarded staging Auth/RPC and end-to-end smoke tests with two disposable
   users and clean both accounts afterward.
5. Verify matching migration history, deployed grants/RLS/function settings,
   generated types, dry-run status, and local reset reproducibility.
6. Record commit, migration versions, backend reference, commands, browser
   matrix, results, known limitations, and cleanup evidence below.
7. Mark MVP complete only when every required M0, M1, and M2 package has evidence
   and the end-to-end loop passes.

**Remote guardrails**

- Do not push, repair, or change a linked project without explicit authorization.
- Stop if local/remote equivalence cannot be proven.
- Never use blind pulls, guessed repair versions, force flags, or service-role
  credentials in a browser or stored command history.

## Agent Execution Order and Ownership

Use these waves to minimize merge conflicts and ensure dependent agents build
on stable contracts:

1. **Wave 1 — serialized foundation:** shared contracts, revisions,
   expected-version helpers, validation, health policy, and draft repository.
2. **Wave 2 — parallel domain work:** workout progression; USDA catalog and
   serving logic; focused read models.
3. **Wave 3 — dependent features:** meal plans/recipes/grocery after nutrition
   contracts; AI extraction after USDA search/matching; route integration after
   each repository contract.
4. **Wave 4 — release proof:** cross-feature tests, accessibility/E2E, CI,
   documentation reconciliation, staging rollout, and evidence.

Agent coordination rules:

- Do not have multiple agents edit the same migration or shared contract file.
- Land schema and generated types before dependent repository/UI work.
- Preserve unrelated working-tree changes.
- Every handoff records changed contracts, migration/type version, commands run,
  failures or limitations, and the next unblocked package.
- A package remains incomplete until its documented exit criteria are green.

## Impact / Effort Priority Matrix

| | Lower effort | Higher effort |
|---|---|---|
| **High MVP impact** | Stable conflict UI; override removal; profile screening; focused repository tests; production Auth toggles | Expected-version/lock architecture; meal-plan editing; atomic recipe/grocery integration; USDA ingestion and serving rules; nutrition drafts; protected OpenAI extraction; browser and remote end-to-end verification |
| **Medium MVP impact** | Root README; CI entry point; planned-meal metadata polish; explicit deferral documentation | Paginated progress/history models; complete responsive/accessibility automation |
| **Post-MVP impact** | Raster app icons and manifest polish | Service worker/background sync, notifications/reminders, CSV export, barcode/voice/photo/social/wearable features |

## Post-MVP / Optional Enhancements

- Service worker, raster install icons, richer offline asset caching, background
  synchronization, notifications, and local reminders.
- CSV export, barcode/voice input, regional nutrition sources, recipe URL import,
  measurements/photos, advanced skill programs, deload weeks, pantry, and
  grocery budget estimates.
- Photo nutrition, social-media extraction, wearables, social features,
  marketplaces, automated form analysis, ordering, and subscriptions remain
  outside MVP unless `FEATURES.md` is deliberately revised.

## Verification Record for This Audit

Static inspection completed:

- The working tree contained documented pre-existing implementation changes;
  this wave preserves them and adds only the MVP-0 files listed below.
- 63 source files containing approximately 7,927 lines were inspected by
  inventory and targeted source review.
- 23 migrations (approximately 4,150 lines), eight database test files
  (approximately 1,350 lines), and five scripts (approximately 1,319 lines)
  were inventoried and reviewed at the contract level.
- Static counts match the setup guide: 20 public tables, 20 RLS policies, and
  23 unique public RPC wrappers.

Fresh checks completed in this audit:

- `npm run typecheck` (pass)
- `npm run lint` (pass)
- `npm run test:local` (20/20 tests pass)
- `npm run build` (pass)
- Local Supabase reset/lint/pgTAP/RPC/concurrency tests (pass; 377 pgTAP
  assertions and 23 RPC wrappers)

Not yet run: remote Supabase/Auth smoke tests and browser
viewport/accessibility/offline checks.

## MVP 1.0 Release Evidence

Complete this section during M2.4. Do not replace the audit record above; add
new evidence for the exact candidate being released.

| Evidence | Required value | Current value |
|---|---|---|
| Candidate commit | Full Git commit SHA | Pending |
| Local migrations | Ordered versions applied from a clean reset | Pending |
| Staging/linked history | Matches the authorized pending migration set | Pending |
| Generated database types | Regenerated from the deployed schema and typechecked | Pending |
| USDA catalog release | Source, license, import version/date, and record count | Pending |
| Edge Functions | Deployed versions for nutrition search and text extraction | Pending |
| App checks | Typecheck, lint, unit tests, and production build | Pending |
| Database checks | Reset, list, lint, pgTAP, RPC smoke, and concurrency | Pending |
| Browser matrix | Mobile, desktop, keyboard, large text, reduced motion, and network failure | Pending |
| Remote smoke | Disposable-user Auth/RPC/end-to-end result and cleanup evidence | Pending |
| Known limitations | Only explicitly accepted post-MVP or operational limitations | Pending |

Release sign-off rules:

- Evidence must name the command or scenario, date, environment, and result.
- A failure cannot be replaced by “not applicable” unless the owning product or
  architecture document explicitly removed that requirement.
- Never paste passwords, access tokens, provider keys, or disposable-user
  credentials into this document.
- A local pass does not imply remote verification, and a remote pass does not
  replace clean local reset reproducibility.

## MVP Completion Gate

The MVP is ready only when all current `FEATURES.md` acceptance items are
demonstrably complete and the following are true:

- All generated workout and meal plans are editable, and edits create future
  versions without changing completed history.
- Recorded workout performance deterministically affects the next applicable
  plan within bounded, explainable rules and persistent user overrides.
- Manual, planned, recipe, custom, and text-assisted nutrition flows use trusted
  source data, visible uncertainty, correction before save, and atomic durable
  mutations.
- Supabase remains the authority; failures preserve drafts and never report an
  unconfirmed write as saved.
- Export, reset, and deletion use authorized server workflows and preserve or
  remove history exactly as documented.
- The known database assertion is green, local and remote security/Auth flows
  pass, all application checks pass, and the primary loop is verified at mobile
  and desktop viewports with keyboard, large text, reduced motion, and network
  failure scenarios.
- Every required M0, M1, and M2 work package is marked complete and links to its
  implementation and verification evidence for the candidate commit.
