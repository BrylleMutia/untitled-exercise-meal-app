# MVP Priority Matrix

Audit date: 2026-09-24
Implementation specification revision: 2026-09-24

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

The app is not yet tagged until the final evidence commit is created. The MVP-0
implementation wave
implemented the highest-risk foundation fixes: historical plan hydration,
goal/profile persistence, planned-meal trust metadata, atomic saved-meal
logging, persistent workout overrides, serialized session saves, recoverable
browser drafts, server-backed export/deletion, pending/offline/error UI, and a
forward hardening migrations. The current release gate has code-complete
behavior, a repeatable mobile/desktop browser suite, and deployed protected
provider boundaries. The final post-migration remote provider rerun and all
application/database/browser gates are green; only reviewed commit/tag
packaging remains.

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
  that status was recorded before the 2026-09-21 remote rollout attempt.

The current MVP-1 wave adds the durable workout progression/override loop,
same-slot planned-meal ordering, bounded progress/history reads, canonical
per-100-g nutrition provenance, custom-food/correction mutations, trusted USDA
search, protected DeepSeek extraction and estimate fallback, unified guided meal
review, grouped recipe/history persistence, provider quotas/timeouts, and
recoverable drafts. The unified-meal, grocery-conflict, and owned-food export
migrations and all four protected provider functions are deployed remotely.
The serialized release browser suite and final remote provider rerun are green;
the implementation is now organized into modular commits; final signoff remains
pending on the documentation commit and candidate tag.

## Current release-candidate audit (2026-09-24)

This section supersedes older “open” or “not run” statements below. Historical
checkpoints remain as an audit trail and are not current status.

- Local and linked migration history both contain 39 versions through
  `20260924103000_mvp1_export_owned_foods.sql`; clean reset and linked dry run
  passed.
- Protected functions are active with JWT verification: USDA search v7,
  DeepSeek extraction v7, USDA batch match v2, and macro estimate v1. User B's
  2026-09-24 smoke passed search, batch matching, extraction, one explicit
  low-confidence estimate, and authorized persistence of FDC `2708951`
  (`Survey (FNDDS)`, release `FoodData Central API verified 2026-09-22`,
  preparation `prepared`, revision `Survey (FNDDS):2708951`). The export fix
  now reports one persisted provider food. The final post-window rerun also
  passed the explicit estimate, and anonymous probes for all four functions
  returned `401`.
- The serialized Playwright release suite passed 21 tests across 390×844
  mobile and 1440×900 desktop; the unauthenticated public suite passed 2/2.
  It covers route overflow, simple-food quantity review and focus retention,
  explicit DeepSeek gating, AI estimate range rendering, provider-failure
  retention, JSON/ZIP receipt and contents, offline retry, failed refresh,
  account isolation, reduced motion, and 200% text. The manual evidence below
  covers grouped save/expansion, historical correction, grouped deletion,
  stale reapply/discard, and screen-reader-oriented checks.
- The two confirmed disposable accounts are intentionally retained for later
  testing. Credentials, Playwright auth state, downloads, and traces are
  ignored and excluded from the candidate commit.
- Site URL/redirect allow-list, live SMTP confirmation/recovery verification,
  Free-tier leaked-password protection, and public web deployment remain
  separate production launch gates. Meal photos, voice,
  barcode, reminders, and service-worker synchronization remain outside
  MVP-1.

### Historical remote rollout checkpoint (2026-09-21)

- Before the push, the linked project's 19 applied migrations matched the
  local 19-migration baseline exactly across the full `public` and `private`
  schema dumps (4,384 lines). Authored exercise, food, meal, and ingredient
  content digests also matched. The dry run listed 15 pending migrations.
- The first authorized push applied nine migrations through
  `20260918031759_mvp1_meal_editing_hardening.sql`, then stopped because three
  legacy workouts each had three planned exercises all at `sort_order = 1`.
  One of the nine rows has a completed-log reference; no overrides were found.
- A guarded, forward-only order-repair migration was added before the dependent
  slot-key uniqueness migration. It keeps every exercise and history link,
  assigning insertion-order positions within only all-one legacy workouts.
  After explicit approval, all seven remaining migrations applied. Local and
  remote histories now agree on the reviewed 35-migration baseline; the linked dry run was empty
  and both full `public`/`private` schema dumps match exactly (7,184 lines).
  The nine exercise rows and existing log reference remain; no duplicate slot
  keys remain.
- `nutrition-search`, `nutrition-text-parse`, `nutrition-meal-match`, and
  `nutrition-macro-estimate` are deployed and `ACTIVE` with JWT verification
  enabled. Anonymous POST requests return 401 for all four. The remote quota
  RPC is deployed. Remote read-only checks show zero public tables without RLS,
  zero direct authenticated write grants, and anonymous quota EXECUTE denied.
  Remote lint reports no schema errors. The remote-generated TypeScript
  contract, local 433-assertion database gate, typecheck, lint, tests, and
  production build pass.
 - The security advisor still reports intentional authenticated `SECURITY
   DEFINER` mutation wrappers and a private rate-limit table with no read
   policy; leaked-password protection is disabled in Auth and needs dashboard
   attention. Remote USDA and DeepSeek provider calls now pass authenticated
   smoke verification, including anonymous `401` enforcement.
 - MVP-1 signoff remains open: complete the remaining browser/offline/account
   matrix, obtain action-time confirmation before deleting the temporary browser
   smoke record, confirm the export receipt, create the candidate commit/tag,
   and review the remaining security-advisor findings.

### Exact remote evidence recorded (2026-09-23)

- Target project: `ifunkhvbvkdxolhpxjvk` (`ap-northeast-1`); remote migration
  history contains the reviewed 37-migration set with
  `20260922062833_mvp1_unified_meal_review` as the current MVP-1 schema head.
- Active protected Edge Functions, with JWT verification enabled:
  `nutrition-search` v6
  (`0131ea1fe2c0ea9e030b5d05c51ba5d385e6f3c8ae5a8e7c25ac976b30befd9f`),
  `nutrition-text-parse` v7
  (`fbed0f5b19bee127373919b29ad9882f2524e42d235ae72f35cb948771f3db91`),
  `nutrition-meal-match` v1
  (`1f3818340370a9030dbda6131a14d530dd1e21f6f6f128241ebc87883e6ae85d`), and
  `nutrition-macro-estimate` v1
  (`e02a637c1c6c10fbd74aa16d861540cd3cd84a74a85a8c93a2b42f8841472f0d`).
- Anonymous POST probes returned `401` for each of the four protected provider
  functions.
- Guarded remote grouped-RPC smoke passed with two confirmed disposable
  authenticated users. The runner exercised all 31 public wrappers, including
  grouped-meal same-key replay, stale-version rejection, cross-user ownership
  denial, historical-edit independence, grouped deletion, and authorized
  `delete_account` cleanup for both users. No disposable account remained after
  the run.
- An earlier authenticated provider smoke passed through `nutrition-search` and
  `nutrition-text-parse` v7 for `2 cups fried rice`; the extraction response
  contained a suggested meal label, a stated candidate, and hidden-ingredient
  questions, with no macro fields and no durable save. A fresh browser rerun in
  this audit currently returns sanitized `not_authenticated` for both provider
  actions, so this evidence is retained as historical success but does not close
  the current browser/provider gate.

### Historical browser matrix evidence (2026-09-23)

Viewport checks used 390×844 mobile and 1440×900 desktop layouts.

| Scenario | Result | Evidence / limitation |
|---|---|---|
| Single-food review | Passed | Local Egg selection opened quantity review with unit, preparation basis, source, confidence, and macro preview; no save was performed. |
| Composite meal suggestion | Partial | `2 cups fried rice with 2 eggs` showed the explicit analysis disclosure and did not auto-call DeepSeek; explicit analysis currently returns `not_authenticated`. |
| USDA replacement | Blocked | Current browser USDA action returns `not_authenticated`; earlier authenticated USDA search evidence is recorded above. |
| AI estimate fallback | Blocked | Depends on the blocked authenticated composite/match path; no estimate was accepted in this run. |
| Grouped save and expansion | Passed with temporary test data | Existing Fried Rice recipe logging created one grouped history card with expandable ingredient/source/range details. The temporary grouped record remains pending action-time deletion confirmation. |
| Historical correction | Passed | Changed the historical first ingredient quantity and recalculated the grouped snapshot without changing the reusable recipe. |
| Stale reapply/discard | Passed | Two browser tabs produced a stale response; the editor retained quantity `3`, exposed `Reapply draft`, succeeded with a fresh key, and `Discard changes` closed the editor without another mutation. |
| Failed refresh | Not run | Requires forcing the browser refresh/read path to fail; the available browser control surface has no network interception toggle. |
| Offline retry | Not run | Same browser-control limitation; local offline UI and retry code remain covered by source/tests. |
| Reload draft recovery | Passed | After the IndexedDB reader/write-order fixes, the custom nutrition draft restored its name and displayed `Draft restored from this device.` after full reload. |
| Account switching | Passed (browser isolation) | Signed out User A, manually signed in User B, and verified that User B's nutrition day had no User A standalone USDA entry or grouped meal, the reusable-meal list did not contain User A's `Fried Rice with 2 Eggs` recipe, and the notification preference was independently disabled. A User B-only guided draft restored after reload. |
| Settings/export | Partial | Notification toggle persisted across reload. CSV ZIP packaging tests pass and the browser displayed `CSV bundle download started: cali-exercise-meal-planner-export-2026-09-23.zip`; the in-app browser did not expose a Playwright download event, so OS-level file receipt remains to be confirmed manually. |
| Keyboard/focus/accessibility | Partial pass | Accessible roles, labels, 44px controls, focus movement, one-character input retention, and no fresh-tab console errors were checked. Full screen-reader, large-text, reduced-motion, and narrow-overflow passes remain open. |

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
- Twenty-eight forward-only migrations define 20 public tables, versioned workout
  and meal plans, planned-versus-actual workout history, nutrition and weight
  history, grocery state, idempotency records, indexes, constraints, RLS, and
  explicit grants/revokes.
- Twenty-five public authenticated RPC wrappers cover profile/target/plan
  bundles, workout sessions, nutrition, saved meals/recipes, weight, grocery,
  export, and account deletion.
- `src/types/database.generated.ts`, database-to-domain mappers, authenticated
  repository hydration, typed mutation outcomes, and semantic events exist.
- Static inspection confirms the documented 20 tables, 20 policies, and 25
  authenticated RPC wrappers. The local reset/lint/384-assertion gate,
  27-wrapper client smoke run, concurrency run, typecheck, lint, and production
  build pass. Linked history still covers only the previously deployed
  migrations.

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
| Supabase schema, RLS, RPCs, generated types | Remotely verified; release review open | 37 forward-only migrations deployed, grouped-meal RLS/RPCs, provenance/range constraints, direct writes revoked, linked types regenerated, remote linked lint clean; local reset/lint/433-assertion, 31-wrapper smoke, concurrency, and guarded remote 31-wrapper smoke pass | Review advisor findings, retain exact remote evidence, and complete the browser/provider gate |
| Onboarding and profile | Substantially complete | Four-step flow, core body/training fields, units, dietary pattern, allergy text, primary goal, target weight/date/rate persistence, food preferences, cooking-time ceiling, relative budget, profile hydration/edit action, supported-population screening | Verify unsupported profile-only completion, under-five-minute completion, and authenticated remote persistence |
| Health calculations and safety | Substantially complete | Versioned Mifflin–St Jeor policy, adult boundaries, unit conversions, estimate/disclaimer copy, aggressive-rate UI, explicit below-floor/unsupported outcomes, persisted target assumptions | Preserve assumptions in every historical read model, represent ranges where appropriate, broaden boundary tests, and complete browser verification |
| Goals and target versioning | Substantially complete | Versioned database tables and bundle creation; goal fields now hydrate and persist with target references; expected-version preflight and typed stale errors | Complete feature-wide stale reapply UX and verify historical summaries retain target assumptions |
| Exercise library | Complete for starter scope | 21 exercises, balanced movement coverage, local illustrations, descriptions, equipment, measure type, regression/progression, safety, attribution | Final visual/accessibility review and catalog parity test rerun |
| Weekly workout plan | Substantially complete | Deterministic generator with schedule/equipment/duration constraints, per-slot edit UI, authorized override RPC/table, override hydration and regeneration preservation | Add override removal UI and apply recorded performance to the next plan rather than only showing a suggestion |
| Workout execution and logging | Substantially complete | Start/save/finish/abandon RPCs; actual sets/reps/holds, skip/modify, RPE, manageable, pain, notes; local pause/resume, interrupted-session recovery, serialized saves, stable retry key | Add optional load entry and make warm-up/cooldown/rest guidance usable in-session; test every lifecycle transition and browser failure path |
| Weekly meal plan | Substantially complete | Deterministic seven-day plan with dietary/allergy/preferences/time/relative-budget filtering, custom saved-meal candidates, unresolved-slot output, skip/unskip, versioned rows, trusted server normalization, editable labels, stable same-slot ordering, recoverable planned-meal/recipe drafts, expected-version `edit_meal_plan`, and atomic grocery reconciliation | Add/record multiple same-slot and browser/offline coverage, plus authenticated remote behavior |
| Manual nutrition logging | Substantially complete | Catalog/custom entry, edit/correction, delete, explicit serving quantity/unit, preparation/source/confidence display, per-100-g custom-food persistence, daily totals/completeness labels, atomic `log_saved_meal` RPC, per-entry idempotency, recoverable custom/text drafts | Run duplicate/date/unit/correction tests and browser failure/retry verification |
| Trusted nutrition data | Complete pending candidate evidence | Protected on-demand USDA FDC search plus protected batch `nutrition-meal-match`, with FDC ID/data type, release/source version, canonical per-100-g nutrients, positive-gram serving options only, preparation basis, `<dataType>:<fdcId>` revision, provenance-aware persistence, correction RPC, and exportable owned-food records; remote User B persisted FDC `2708951` with exact provenance on 2026-09-24 | Final post-window provider rerun and candidate evidence commit; do not claim a bulk catalog count |
| AI-assisted unified meal review | Complete pending final remote evidence | Protected DeepSeek extraction plus explicit `nutrition-macro-estimate`, server-side `deepseek-flash` with thinking disabled, candidate-only extraction, low/base/high estimate ranges, hidden-ingredient opt-in, account-scoped guided draft, atomic grouped recipe/history save, and source/confidence labeling; authenticated browser and User B remote extraction/estimate evidence passed, with provider-failure retention covered by Playwright | Final post-window provider rerun and candidate tag |
| Custom meals and recipes | Substantially complete | Tables/hydration, owner-checked save/archive RPCs, Context/repository `saveMeal`/`duplicateMeal`/`archiveMeal` actions, create/edit/duplicate/archive/log UI, canonical ingredient validation, custom-food persistence, explicit serving/preparation contract, atomic saved-meal logging, recipe-save grocery reconciliation, recoverable recipe drafts | Run richer nutrition-preview, browser rollback/offline, and authenticated remote coverage |
| Grocery list | Complete pending integrated gate | Generation, duplicate combination, categories, check/edit/remove/custom/regenerate UI, explicit generated-versus-adjusted values, atomic reconciliation after plan/recipe edits, expected revision checks with parent revision bump, two-client stale/reapply coverage, recoverable custom-item draft, and Playwright offline/failed-refresh coverage | Preserve the repeatable browser command and final evidence commit |
| Calendar and progress | Substantially complete | Calendar, history across plan versions, weight entries/sparkline, planned/completed/partial/skipped/unlogged semantics, range summary, stable cursor pagination, load-more retry state, calorie/protein averages, explicit unlogged labels | Run timezone-boundary, cursor-omission/duplication, large-text, browser, and remote read-model verification |
| Settings and data controls | Complete pending final gate | Units, weight, plan reset, sign-out, disclaimer, persisted opt-in notification preference with no delivery side effect, JSON export, deterministic ZIP CSV bundle including `foods.csv`, authorized deletion, and account-scoped draft cleanup; Playwright opened and inspected both JSON and ZIP downloads at both viewports | Record the final candidate commit/tag; retained accounts are intentionally not deleted |
| Failure, offline, and draft recovery | Complete pending final gate | Onboarding, nutrition custom/text/guided-review, planned-meal, recipe, grocery custom-item, and workout-session recoverable drafts; grouped review drafts retain candidates, exclusions, matches, estimates, and revisions; stable retry/reapply keys; pending/error/offline UI; account-isolated cleanup; reload recovery, stale reapply/discard, provider failure retention, failed refresh, offline retry, and User B isolation are covered by the browser and concurrency evidence | Record final post-window remote provider evidence and candidate tag |
| Testing and release verification | Complete pending final gate | 13 local test files/55 tests; 10 SQL suites/436 pgTAP assertions; local reset/lint, 31-wrapper RPC smoke, concurrency, typecheck, lint, build, serialized 21-test mobile/desktop release suite, public 2-test suite, exact remote function/migration inventory, and retained-account provider evidence | Create the implementation commit, evidence commit, and annotated candidate tag |

MVP-0 reconciliation note: the onboarding screen now captures the supported-
population result, target calculations use the versioned health policy without a
silent calorie floor, and unsupported onboarding persists only a profile for
manual logging. The remaining onboarding work is browser and authenticated
persistence verification, not the screening or preference contract.

## Highest-Risk Findings

The original audit findings were rechecked after the retry implementation.

1. **Historical workout resolution — resolved.** Snapshot hydration now loads
   planned workouts/exercises across every user plan version, and progress
   counts no longer filter completed history to the current plan.
2. **Plan editing and progression — locally resolved.** Authorized, per-slot
   workout overrides, replacement/removal, bounded progression decisions, and
   future-plan cloning now persist safely. Browser and new-migration database
   verification remain release gates; the planned-meal editor is implemented
   under M1.2.
3. **Concurrent writes and retries — partially resolved.** Context guards
   duplicate submissions, retains idempotency keys for retry, serializes session
   saves, refreshes stale snapshots, and exposes typed expected-version conflicts.
   Meal-plan/grocery stale-writer and explicit reapply coverage now pass locally;
   broader browser reapply coverage remains a release check.
4. **Saved-meal logging — resolved.** `log_saved_meal` performs one atomic
   transaction with deterministic per-entry idempotency keys; the 27-wrapper
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
   custom/text, planned meals, recipes, grocery custom items, and workout
   sessions. Failed identity refresh now preserves drafts and routes to sign-in
   with a safe return path. Browser/staging reapplication and production PWA
   behavior remain release checks.
10. **Database gate — previous baseline resolved locally.** The prior
    23-migration gate passed locally. The profile-only/version-validation
    follow-up migrations were rerun against a clean local reset with lint and the
    full 384-assertion gate. Linked rollout and remote Auth smoke remain pending
    explicit authorization and disposable credentials.

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
- **Text extraction:** DeepSeek `deepseek-flash` performs structured extraction through an
  authenticated Supabase Edge Function. AI output is an unconfirmed draft,
  never an authoritative macro source or a direct persistence path.
- **Stale-edit behavior:** preserve the local draft, load current server state,
  explain the conflict, and require explicit reapplication against the latest
  version.
- **Export:** JSON remains available for compatibility; MVP-1 also includes a
  deterministic ZIP of entity CSV files, metadata, manifest, and raw JSON.
- **Deferred platform work:** reminder delivery, service-worker caching,
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

**Status:** Partially implemented — durable decision/override slice complete; catalog and browser coverage remain

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
  retaining the existing retry/draft intent. Reapply now uses a fresh
  idempotency key, while ordinary transport retries reuse the original key;
  onboarding and the shared shell expose explicit reapply controls. Full
  two-client coverage for every aggregate and feature-local discard adapters
  remain follow-up work.

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
  the authenticated wrappers, with private-schema execution revoked from
  client roles.
- Expected-version counters now require integer-shaped values before any
  comparison or cast, preventing decimal rounding from bypassing stale checks.
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
- Name and display-unit changes now use a profile-only mutation path, preserving
  active targets and plan versions while incrementing only the profile revision.
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

**Status:** Substantially complete locally — final database/browser gates pending

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
  expected snapshot after a stale response instead of replaying stale versions;
  the shared shell now offers fresh-key reapplication for retained intents.
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

**Status:** Substantially complete locally — final database/browser gates pending

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

**Implemented in the 2026-09-18 MVP-1 wave**

- `src/utility/progression.ts` now returns a versioned recommendation with
  source-session IDs, bounded reps/holds/sets changes, validated
  progression/regression references, and the documented pain/RPE/partial/
  skipped rules. The Context exposes `getProgressionRecommendations` for this
  deterministic read.
- Migration `20260918033746_mvp1_progression_overrides_and_loads.sql` adds
  durable planned-exercise and override `slot_key` values, clones the current
  workout plan for override/progression changes, persists accepted/rejected
  decisions with rule version and source sessions, and adds optional actual
  load/load-unit fields to exercise logs.
- Authorized `remove_workout_override` and `apply_progression_decision` RPCs,
  repository methods, Context actions, semantic events, and the Workouts UI
  now support accept/keep/remove flows. A cloned plan keeps previous session
  snapshots intact and carries unrelated active overrides forward.
- The active session presents warm-up, current exercise, rest guidance,
  cooldown, one-handed controls, and optional actual load/unit entry.

The deterministic recommendation read is backed by the hydrated owner history,
catalog-specific bounds are present in both the starter catalog and a database
trigger, and the active session exposes load/rest guidance. M1.1 is locally
implemented; migration reset/lint/pgTAP and browser/accessibility verification
are still required before release tagging.

**Implementation and data logic**

1. Replace global progression limits with catalog-defined minimum, maximum, and
   step values for sets, reps, and holds. The starter catalog and database
   trigger now supply/enforce those bounds; actual load remains an optional
   user-recorded value and is never inferred into a planned load.
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
  `removeWorkoutOverride` repository/Context actions and authorized RPCs. The
  deterministic read uses the bounded authenticated snapshot history; the
  latter two durable actions are implemented through authorized RPCs.
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

**Status:** Substantially complete locally — final database/browser gates pending

**Outcome**

Users can replace, resize, add, skip, or regenerate planned meals; create and
reuse recipes; and immediately receive a reconciled grocery list that preserves
their explicit corrections.

**Existing foundation**

- Versioned meal-plan tables, deterministic generation, skip/unskip, saved-meal
  persistence/logging, grocery generation, and merge behavior exist.
- The current nutrition screen now exposes planned-meal replace/serving/add
  editing and saved-meal create/edit/duplicate/archive/log actions.
- `edit_meal_plan` creates a future meal-plan version, recalculates trusted
  nutrition metadata from catalog/owned-meal references, and reconciles the
  active grocery list in the same transaction.
- `save_saved_meal` now accepts the active grocery read model so recipe saves
  and grocery reconciliation commit atomically; archive is a soft-delete that
  preserves historical references.
- Migration `20260918040044_mvp1_planned_meal_slot_order.sql` adds stable
  planned-meal `slot_key` and `sort_order` values, removes the one-row-per-date/
  slot uniqueness restriction, and preserves deterministic ordering for
  multiple same-slot entries.

**Implementation and data logic**

1. Add a stable planned-meal slot key and `sortOrder`. Replace one-row-per-date
   and meal-slot uniqueness with date/slot/order uniqueness so multiple snacks
   or added meals are representable. Implemented in the local schema migration
   and editor; same-slot browser coverage remains a release check.
2. Implement one `editMealPlan` intent boundary: replace reference, change
   serving, add entry, skip/unskip, or regenerate. The UI routes each action
   through the repository, which submits a complete normalized future snapshot
   to the atomic RPC; `resetPlan` is the standalone regenerate command.
3. Every edit creates a new future meal-plan version with a supersedes link. Old
   plan rows and previously logged nutrition remain unchanged.
4. Accept only intent and trusted food/meal IDs from the client. Recalculate
   expected macros, source/version, preparation, assumptions, and confidence
   from persisted catalog data at the trusted boundary. `edit_meal_plan` now
   rejects mixed food/meal references, missing owner/system records, invalid
   dates/slots/servings, and cross-user IDs.
5. Apply dietary pattern, allergies/exclusions, food preferences, cooking-time
   ceiling, budget, and available user meals/recipes during deterministic
   generation. The current generator has dietary/allergy filtering and the
   editor can select trusted foods or saved meals; preference/cooking-time/
   relative-budget selection and explicit unresolved slots are implemented in
   the deterministic generator.
6. Expose reusable meal/recipe behavior:
   - Create and edit through the owner-checked save boundary.
   - Duplicate from an owned/system-visible source into a new owned record.
   - Archive instead of hard-delete so historical references remain valid.
   - Calculate per-serving nutrition from canonical ingredient quantities. The
     current editor validates positive servings and ingredient quantities and
     the trusted save boundary recalculates the stored meal totals.
   - Log all ingredients atomically through the saved-meal transaction. Current
     UI logging is wired to the existing atomic `log_saved_meal` RPC.
7. If an edited recipe is referenced by the active meal plan, regenerate the
   current grocery list in the same transaction. The current `save_saved_meal`
   path reconciles the active grocery list on every recipe save; the active
   plan editor uses the same behavior for replacements and serving changes.
8. Recalculate generated grocery quantities while preserving checked state,
   explicit quantity overrides, removals, and custom items. Surface changed
   generated quantities.

**Public contract changes**

- Implemented `editMealPlan`, `saveMeal`, `duplicateMeal`, `archiveMeal`,
  `logSavedMeal`, and `saveFood` repository/Context intents. Custom-food
  persistence now uses the trusted serving/provenance contract.
- Added authorized `edit_meal_plan` and `archive_saved_meal` RPCs. The existing
  `save_saved_meal` wrapper now accepts an optional grocery payload and keeps
  recipe save plus grocery reconciliation atomic.
- Repository outcomes return refreshed snapshots and meal-plan/grocery semantic
  events; stale responses retain the draft for explicit fresh-key reapply.

**Failure behavior**

- Meal-plan and grocery changes succeed or fail together.
- Stale meal-plan/grocery versions preserve the edit draft for reapplication;
  two-client local coverage now proves exactly one stale writer and an explicit
  refreshed-version reapply.
- Missing or unsafe matches remain unresolved; the generator never substitutes
  a known allergen or fabricates nutrition.

**Verification**

- Test every edit kind, multiple same-slot entries, recipe create/edit/duplicate/
  archive/log, historical resolution, concurrent edits, and rollback. The
  current local gate covers replace/serving/add, archive, duplicate replay,
  historical references, stale meal-plan/grocery writers, and reapply. Multiple
  same-slot, browser rollback/offline, and provider-backed integration checks
  remain release verification work; draft recovery is implemented.
- Test grocery merges after replacement, serving change, add, skip, recipe edit,
  user quantity override, removal, checked item, and custom item.

**Dependencies and exit criteria**

- Depends on M0.1–M0.4 and the M1.3 nutrition/serving contracts.
- Exit when every saved meal/recipe/plan edit updates grocery state atomically
  without rewriting logs or user corrections, including multiple same-slot
  entries, custom foods, preference-aware generation, recoverable recipe drafts,
  and the required browser/accessibility/offline matrix.

### M1.3 — USDA FoodData Central and nutrition correction

**Status:** Implemented and remotely verified for search; grouped save evidence pending

**Outcome**

Planned, manual, recipe, and guided meal-review nutrition derives from versioned
USDA records or is visibly identified as development, user-provided, or
low-confidence AI-estimated data.

**Existing foundation**

- The current catalog, source/version/confidence snapshots, serving fields,
  custom logging, saved meals, totals, and delete behavior provide a usable
  development path.
- The 22 starter foods are estimates and do not define canonical household
  conversions or a production data lifecycle.

**Implemented in the 2026-09-18 MVP-1 wave**

- `src/utility/nutritionCanonical.ts` and its unit tests implement finite,
  non-negative per-100-g scaling from a trusted gram equivalent, preserve
  zero-valued nutrients, and reject missing gram weights instead of guessing.
- `Food` now has optional USDA/source revision, provider import, canonical
  nutrient, and serving-option fields so the domain can accept the trusted
  contract without treating the starter catalog as production USDA data.

The provider-backed USDA Edge Function, batch matching boundary, normalized
serving-option table, provenance-aware custom-food mutation, and
expected-revision correction mutation are implemented and deployed. The
configured release label and authenticated simple USDA search have been
verified remotely; disposable-user batch-match/save provenance evidence remains
open.

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
7. Add protected `nutrition-meal-match` for up to ten reviewed ingredient
   queries, returning at most three normalized candidates per ingredient while
   preserving USDA data type, release, preparation basis, and valid weighted
   serving options.
8. Production system catalog rows use USDA only. User custom foods remain
   distinct, owner-controlled, and labeled `User-provided`; starter fixtures
   remain explicitly `development_catalog`.
9. Default restaurant meals, sauces, oils, and mixed dishes to low confidence
   unless an exact labeled record is selected. Require visible assumptions.
10. Add nutrition correction through an expected-record-revision mutation.
   Preserve the original source snapshot unless the user explicitly selects a
   different record or serving.
11. Expose serving quantity/unit, gram equivalent, source record/version,
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

### M1.4 — Protected DeepSeek text-meal extraction

**Status:** Implemented and deployed — DeepSeek provider verification pending

**Outcome**

A user can describe a meal, review and correct structured catalog matches, opt in
to bounded low-confidence AI ranges only for unresolved ingredients, and
explicitly confirm one atomic grouped save. AI never owns authoritative catalog
calculations or writes.

**Existing foundation**

- The Nutrition page now has one unified search/meal-description entry surface,
  immediate local search, explicit USDA search, an explicit analyze action, and
  a manual custom fallback.
- Manual food/custom entry and atomic multi-entry saved-meal logging exist.

**Implemented locally in the 2026-09-20 completion pass**

- `supabase/functions/nutrition-text-parse` remains authenticated and
  extraction-only. It returns a suggested label, stated/possible-hidden
  ingredients, assumptions, questions, and confidence, but no macro fields.
- `nutrition-meal-match` and `nutrition-macro-estimate` are implemented as
  protected local boundaries. The latter is only called after an explicit
  per-ingredient user action and returns low/base/high ranges with forced
  `ai_estimate`/low-confidence provenance.
- The browser stores the original text, candidates, exclusions, catalog matches,
  accepted estimates, meal name, and base revisions in an account-scoped draft;
  confirmation creates one reusable recipe and one expandable grouped history
  record through `save_reviewed_meal`.
- DeepSeek `deepseek-flash` replaces the OpenAI upstream, with thinking disabled,
  bounded input/output, timeout, durable quotas, and sanitized failures. The
  revised extraction and estimate functions plus grouped migration are now
  deployed remotely; the authenticated extraction smoke currently returns
  sanitized `provider_unavailable` and must be resolved before the AI gate can
  close.

**Implementation and data logic**

1. Use the authenticated `nutrition-text-parse` Supabase Edge Function. Require
   server-side `DEEPSEEK_API_KEY` and optional `DEEPSEEK_NUTRITION_MODEL`; expose neither to browser
   configuration.
2. Accept text up to 1,000 characters, locale, and request ID after explicit user
   action. Send only the meal text and extraction instructions to DeepSeek.
3. Require schema-constrained food names, quantities, units, preparation,
   qualifiers, and uncertainty notes. Reject invalid model output.
4. Match extracted items deterministically against the local catalog and the
   protected USDA search/batch-match path. Re-derive catalog macros at the
   authoritative mutation boundary.
5. Return editable candidates, hidden-ingredient questions, alternative
   matches, serving assumptions, confidence, and visible provenance.
6. Permit a separate explicit estimate request for unresolved reviewed items;
   never silently include hidden ingredients or estimates.
7. Keep the input and complete guided review state in the feature draft store.
   Confirmation uses the atomic grouped recipe/history mutation.
8. Enforce bounded per-user quotas, a 15-second provider timeout, and
   sanitized logs that omit meal text, health data, keys, and raw provider
   payloads.
9. Return stable `rate_limited`, `provider_unavailable`,
   `provider_invalid_response`, and `validation_failed` outcomes.
   outcomes. Manual logging remains available for every failure.

**Public contract changes**

- Add `TextMealDraft` and an Edge Function client service separate from the
  durable repository mutation interface.
- Add `rate_limited`, `provider_unavailable`, and `invalid_output` to the typed
  feature-level error contract.
- Keep confirmation on the existing atomic log path with trusted source
  snapshots.

**Failure behavior**

- AI/USDA/provider/draft-store failure preserves text, corrections, and the
  guided review draft.
- Hidden or unmatched items remain excluded until corrected, supplied by the
  user, or explicitly accepted as a low-confidence AI estimate.
- Extraction and estimation functions cannot save nutrition; only the separate
  confirmed grouped mutation can create a recipe/history record.

**Verification**

- Mock DeepSeek and USDA for valid extraction, malformed schema, timeout, rate
  limit, partial/unmatched results, hidden ingredients, invalid estimate ranges,
  batch matching, and provider failure.
- Verify authorization, minimal request data, secret isolation, no direct
  mutation, and confirmation-required persistence.

**Dependencies and exit criteria**

- Depends on M0.4 drafts and M1.3 trusted matching/calculation.
- Exit when the browser contains no provider secret, candidates and estimates
  remain reviewable drafts, and only a separate confirmed grouped mutation can
  persist the recipe and historical meal.

### M1.5 — Focused progress and history read models

**Status:** Substantially complete locally — focused read-model adoption and release verification pending

**Outcome**

Initial hydration remains bounded while Progress and history screens accurately
show workout occurrences, nutrition completeness, weight, ranges, and counts.

**Existing foundation**

- Historical plan hydration, calendar/history, weight entries, workout count,
  nutrition averages, and explicit unlogged labels exist.
- `AppSnapshot` still loads growing sessions, nutrition logs, weights, plans,
  and child rows without pagination.

**Implemented in the 2026-09-18 MVP-1 wave**

- `HistoryQuery`/`HistoryReadModel` provide date-bounded (maximum 366 days),
  cursor-based focused reads with a default page size of 50 and maximum of
  100. Session summaries include logged/completed exercise counts; nutrition
  and weight records retain their source values.
- `loadHistoryReadModel` and `SnapshotRepository.loadHistory` use authenticated
  owner-scoped queries. `/progress` requests the focused read model and falls
  back to the hydrated snapshot if the request fails, keeping existing rows
  visible and showing the normal recovery toast.
- Initial snapshot history is capped at 100 records per bounded history type
  and the current 366-day window; export remains the complete-history path.

Cursor UI, summary endpoints for scheduled occurrences/completeness, and
load-more retry behavior are implemented. The main snapshot still retains a
bounded compatibility history window for existing consumers; removing those
legacy arrays is a follow-up optimization, not an MVP correctness gap.

**Implementation and data logic**

1. Keep the main snapshot to the current profile, active goal/target/current
   plans, today's summary, active workout session, current grocery list, and
   compact saved-meal metadata.
2. Add focused repository reads for workout history, nutrition history, weight
   history, catalog search, and progress summaries. The bounded
   workout/nutrition/weight read, trusted catalog search service, aggregate
   summary, and Progress consumer are implemented.
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

- The current `HistoryReadModel` combines the bounded page and summary
  contract; a generic `HistoryPage<T>` abstraction is optional cleanup rather
  than a missing MVP behavior.
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
- Add Edge Function tests with mocked DeepSeek/USDA responses for authentication,
  schema validation, timeout, rate limiting, unmatched items, and secret
  isolation.
- Keep typecheck, lint, unit, build, reset, migration list, database lint, pgTAP,
  RPC smoke, and concurrency gates green after every package.

**Exit criteria**

- Every M0/M1 package links to its passing automated evidence and no known
  contract remains covered only by manual inspection.

### M2.2 — Browser, accessibility, and end-to-end verification

**Status:** In progress — implementation is present; release evidence is still pending

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

**Status:** In progress — CI/documentation scaffolding is present; production configuration remains pending

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
  `SUPABASE_SETUP.md`: JSON plus the CSV ZIP are the MVP export contract;
  persisted notification preference is MVP-1 while delivery/PWA service-worker
  work is deferred; USDA and protected DeepSeek extraction remain MVP work.

**Exit criteria**

- CI runs the local release gate consistently, production Auth configuration is
  recorded, and documentation no longer describes deferred work as a blocker.

### M2.4 — Guarded rollout and release evidence

**Status:** In progress — implementation is present; release evidence is still pending

**Outcome**

Local, staging, and linked states are proven consistent before MVP 1.0 is marked
complete.

**Rollout sequence**

1. Create each schema change through the Supabase migration workflow, apply it
   locally, regenerate database types, and pass the full local gate.
2. Select the official FoodData Central release/source label for rollout,
   configure the protected on-demand API path, and verify its license/terms,
   source identifiers, versions, nutrient bases, and serving metadata. MVP-1
   does not bulk-import the USDA catalog; the release evidence records the
   reviewed records persisted during smoke verification instead.
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
| **High MVP impact** | Stable conflict UI; override removal; profile screening; focused repository tests; production Auth toggles | Expected-version/lock architecture; meal-plan editing; atomic recipe/grocery integration; USDA ingestion and serving rules; nutrition drafts; protected DeepSeek extraction; browser and remote end-to-end verification |
| **Medium MVP impact** | Root README; CI entry point; planned-meal metadata polish; explicit deferral documentation | Paginated progress/history models; complete responsive/accessibility automation |
| **Post-MVP impact** | Raster app icons and manifest polish | Service worker/background sync, reminder delivery, barcode/voice/photo/social/wearable features |

## Post-MVP / Optional Enhancements

- Service worker, raster install icons, richer offline asset caching, background
  synchronization, reminder delivery, and local reminders.
- Barcode/voice input, regional nutrition sources, recipe URL import,
  measurements/photos, advanced skill programs, deload weeks, pantry, and
  grocery budget estimates.
- Photo nutrition, social-media extraction, wearables, social features,
  marketplaces, automated form analysis, ordering, and subscriptions remain
  outside MVP unless `FEATURES.md` is deliberately revised.
  The first photo feature is guided review, not one-tap macro logging:
  `deepseek-flash` suggests visible foods; the user supplies or corrects portions,
  oils, sauces, and hidden ingredients; trusted records provide estimated
  macros; a separate confirmation saves the log. The app discards images after
  analysis and discloses provider-side handling before launch. Photo accuracy
  and usability must be validated before release.

## Verification Record for This Audit

Static inspection completed:

- The working tree contained documented pre-existing implementation changes;
  this wave preserves them and adds only the MVP-0 files listed below.
- 63 source files containing approximately 7,927 lines were inspected by
  inventory and targeted source review.
- 30 migrations (approximately 5,400 lines), eight database test files
  (approximately 1,350 lines), and five scripts (approximately 1,319 lines)
  were inventoried and reviewed at the contract level.
- Static counts match the setup guide: 21 public tables, 21 RLS policies, and
  27 unique public RPC wrappers.

Fresh checks completed in this audit:

- `npm run typecheck` (pass)
- `npm run lint` (pass)
- `npm run test:local` (24/24 tests pass)
- `npm run build` (pass)
- Local Supabase reset/lint/pgTAP/RPC/concurrency tests (30-migration gate
  pass; 384 pgTAP assertions and 27 RPC wrappers).

Not yet run: remote Supabase/Auth smoke tests and browser
viewport/accessibility/offline checks.

## MVP-0 Follow-up Verification — 2026-09-18

Fresh local and authenticated desktop verification completed after the audit
above:

- A clean local Supabase reset applied all 28 migration files.
- `npm run supabase:test` passed 384 pgTAP assertions across eight files.
- `npm run supabase:test:rpc` passed all 27 public-wrapper smoke checks with
  two disposable local users.
- `npm run supabase:test:concurrency` passed duplicate replay, hash mismatch,
  stale profile and meal-plan conflicts, explicit meal-plan reapply, workout,
  grocery, and cross-user isolation cases.
- `npm run typecheck`, `npm run lint`, `npm run test:local` (24/24), and
  `npm run build` passed. `git diff --check` reported no whitespace errors.
- Authenticated desktop browser checks covered onboarding/save, home, nutrition
  skip/reapply, grocery custom-item add, workout plan/session controls,
  progress, settings unit switching, keyboard focus, and accessibility-tree
  labels. Display-unit changes preserved the target version.
- Verification found and fixed a database-incompatible generated meal metadata
  value, a server/client online-status hydration mismatch, and a missing
  accessible label on the grocery custom-item button.

Still pending or limited:

- The M1.2 implementation below now covers the first planned-meal and recipe
  editor slice. Multiple same-slot entries/order migration, custom-food
  persistence, preference/cooking-time/budget-aware generation, and
  recipe-specific draft recovery remain open.
- The available browser surface did not expose viewport overrides, so the
  required 390px mobile/narrow-overflow matrix, full large-text/reduced-motion
  matrix, and complete offline interaction pass remain unverified.
- `npm run supabase:lint` exits successfully with no schema errors. No linked
  or remote Supabase changes were made.

## MVP-1 M1.2 Implementation Follow-up — 2026-09-18

The remaining planned-meal/recipe limitations are owned by M1.2, not deferred
without an implementation path. The first vertical slice is now implemented:

- `src/app/nutrition/page.tsx` exposes planned-meal replace, serving, add,
  skip/reapply, and saved-meal create/edit/duplicate/archive/log controls.
- `src/contexts/AppContext.tsx`, `src/services/repository.ts`, and
  `src/services/supabaseRepository.ts` carry typed edit/save/archive intents,
  expected versions, idempotency keys, refreshed snapshots, and semantic
  events through the normal authoritative path.
- `supabase/migrations/20260918023343_mvp1_meal_editing.sql` adds the
  owner-checked `edit_meal_plan` and `archive_saved_meal` wrappers and extends
  `save_saved_meal` so active-plan grocery reconciliation is atomic with recipe
  save. Meal-plan edits create a new version and preserve logged history;
  archive is a soft-delete so historical references still resolve.
- Trusted boundary validation rejects invalid dates/slots/servings, mixed food
  and saved-meal references, and records that are neither system-visible nor
  owned by the caller. Grocery regeneration preserves checked state, explicit
  quantity overrides, removals, and custom items.
- Local verification now includes 384 pgTAP assertions, 27 public-wrapper smoke
  calls, and two-client stale meal-plan/grocery conflict plus explicit reapply
  coverage. The application typecheck, lint, 24 local tests, and production
  build pass.

Remaining M1.2 implementation order:

1. Normalize all editor operations behind a discriminated `editMealPlan` intent
   and add standalone regenerate/rollback behavior.
2. Add trusted custom-food persistence and canonical serving/preparation rules
   under M1.3, then use those records in plan and recipe editors.
3. Add deterministic food-preference, cooking-time, and budget constraints with
   an explicit unresolved-slot result when no safe match qualifies.
4. Add recipe/planned-meal draft envelopes and account-scoped restore/discard
   behavior to the existing draft store.
5. Complete narrow mobile, large-text, reduced-motion, keyboard, screen-reader,
   offline, rollback, and authenticated remote verification before closing M1.2.

The empty migration file generated during the first local CLI invocation is
left untouched because migration history is forward-only; no linked or remote
database was changed.

## MVP-1 M1.1/M1.2/M1.5 Implementation Follow-up — 2026-09-18

The second implementation wave is now reflected in source, schema, generated
types, and local verification:

- `20260918033746_mvp1_progression_overrides_and_loads.sql` adds stable workout
  slot keys, versioned plan cloning for apply/remove edits, progression
  decision persistence, actual load/unit logging, and authenticated
  `apply_progression_decision`/`remove_workout_override` wrappers.
- `20260918040044_mvp1_planned_meal_slot_order.sql` adds planned-meal slot keys
  and sort order, removes the one-row-per-date/slot restriction, and keeps
  same-slot ordering deterministic.
- `HistoryQuery`, `HistoryReadModel`, `loadHistoryReadModel`, and the Progress
  route’s focused read path bound history to 366 days and 50/100-row cursors.
- `nutritionCanonical.ts` provides the trusted per-100-g scaling foundation;
  USDA import/search, custom-food persistence, correction, and protected AI
  extraction remain provider-gated follow-up work.

Fresh local evidence for this wave: 30 migrations reset successfully, schema
lint passed, 384 pgTAP assertions passed, all 27 public RPC wrappers passed the
two-user smoke run, typecheck passed, and the load/progression/override paths
were included in the smoke coverage. Browser viewport/accessibility controls
and linked/remote changes remain unavailable or unauthorized.

## MVP-1 Completion Pass — 2026-09-20

This section supersedes the earlier “provider-gated” and “remaining M1.2
implementation order” notes above for the current working tree. The following
code-side gaps from the review are now implemented locally:

- M1.1 onboarding and profile constraints now persist food preferences,
  allergies, cooking-time and budget constraints, and the health-screening
  flow no longer exits before evaluating the screening answer.
- M1.2 meal-plan generation now applies dietary, allergy, preference,
  preparation-time, and budget constraints; it can use owned saved meals and
  recipes; and it returns explicit unresolved slots instead of silently
  choosing an unsafe or infeasible meal. Planned-meal and saved-meal editors
  preserve versioning and completed history.
- M1.3 manual, custom, planned, recipe, USDA-search, and text-assisted
  nutrition paths now share serving quantities/units, preparation basis,
  trusted-source provenance, correction, deletion, recoverable drafts, and
  confirmation-before-save behavior. Catalog-backed values are recalculated at
  the authoritative boundary rather than trusting client-provided macros.
- Trusted USDA search and AI text extraction now have authenticated Edge
  Function boundaries, server-only provider secrets, schema validation,
  request limits, timeouts, opaque pagination, quota enforcement, and stable
  error handling. AI returns candidates only; it does not save or mutate user
  data.
- M1.4 grocery regeneration now preserves checked state, explicit quantity
  overrides, removals, and custom items while reconciling generated items.
- M1.5 progress history now uses bounded, cursor-based reads with stable
  tie-breakers, scheduled/unlogged-day semantics, calendar indicators, and
  load-more/retry handling without duplicate page appends.
- Progression bounds are now persisted and enforced at the database boundary,
  and the client progression lookup uses the catalog exercise identity rather
  than a planned-row identity.
- The repository, generated database contract, README, CI workflow, and
  feature/architecture/setup documentation now describe the current
  implementation and its verification boundaries.

Local application evidence for this completion pass:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test:local` — passed: 10 test files, 47 tests.
- `npm run build` — passed: Next.js production build with 19 routes and 21
  copied assets.
- `git diff --check` — passed.
- Unauthenticated browser smoke on automation port 8082 — sign-in,
  sign-up, forgot-password, protected-route redirect, and console-error checks
  passed.

MVP-1 is intentionally not tagged “complete” yet. The remaining release gates
are environmental or deployment evidence, not silently deferred product logic:

- The two new migrations must be applied and verified through a clean local
  Supabase reset, database lint, pgTAP, RPC smoke, and concurrency run. The
  current environment has no usable Supabase CLI package cache and no running
  Docker daemon, so those commands could not be rerun for this completion pass.
- The `nutrition-search` and `nutrition-text-parse` Edge Functions must be
  verified with `USDA_FDC_API_KEY` and `DEEPSEEK_API_KEY` held server-side, then
  verified against a disposable authenticated environment. No remote or linked
  Supabase changes were made.
- Authenticated end-to-end verification still requires a configured test
  account and provider-backed environment. The browser surface used here did
  not expose viewport overrides, so explicit 390px mobile, large-text,
  reduced-motion, keyboard/screen-reader, offline, and remote failure matrices
  remain release evidence to collect.
- A candidate commit/tag and the remaining release-evidence fields below are
  still pending.

## Historical MVP-1 Local Verification Update — 2026-09-21

The local Supabase stack is now available and the previously pending local
database gates have been completed against a clean reset. This update
supersedes the local-environment limitation recorded above; the subsequent
remote rollout is recorded in the checkpoint near the top of this document.

- `npm run supabase:reset` — passed; all 34 then-current forward-only migration files
  applied from an empty local database, including the idempotency and editable
  meal-label corrections.
- `npx supabase@latest migration list --local` — passed; the local migration
  history is complete.
- `npm run supabase:lint` — passed; no schema errors found.
- `npx supabase@latest db advisors --local --type security --level warn` —
  passed; no issues found.
- `npm run supabase:test` — passed; 433 assertions across 10 SQL suites.
- `npm run supabase:test:rpc` — passed; all 27 public wrappers exercised
  through two disposable local Auth users, including meal-label preservation,
  nutrition provenance, replay, ownership, and cleanup behavior.
- `npm run supabase:test:concurrency` — passed; duplicate replay, request-hash
  mismatch, stale profile and meal-plan conflicts, explicit reapply, workout,
  grocery, and isolation checks passed.
- Local TypeScript generation was run from the final schema and the committed
  contract includes the provider-quota table and final progression-bound/RPC
  definitions; `npm run typecheck` passed against it.

The remaining release evidence includes provider choice/credentials, a recorded
USDA catalog release, authenticated remote smoke with disposable users, the
mobile/desktop/accessibility/offline browser matrix, and the feature gaps listed
above. Create the candidate commit/tag only after those results are recorded.

## Historical MVP-1 Unified Meal Review Implementation Update — 2026-09-22

This update supersedes older rows that described text review as a separate
parser-only surface. The current MVP-1 contract is one unified search/meal
description flow with an explicit analyze action, optional low-confidence AI
macro ranges, and one grouped recipe/history confirmation. It does not add
photo capture or image upload.

Local implementation evidence:

- Migration `20260922062833_mvp1_unified_meal_review.sql` applies from a clean
  local reset and adds provenance/range constraints, grouped history, and the
  authorized grouped save/update/delete RPCs.
- `nutrition-text-parse`, `nutrition-meal-match`, and
  `nutrition-macro-estimate` have mocked handler coverage for authentication,
  validation, quotas, timeout/upstream failure, malformed output, USDA
  normalization, explicit estimate invocation, and sanitized responses.
- `npm run typecheck`, `npm run lint`, `npm run test:local`, `npm run build`,
  `npm run supabase:reset`, `npm run supabase:lint`, `npm run supabase:test`,
  `npm run supabase:test:rpc`, and `npm run supabase:test:concurrency` pass
  locally. The current local suite is 13 test files/55 tests and 10 SQL
  suites/433 pgTAP assertions.
- Account export includes grouped meal data and range/provenance fields. JSON
  remains available, and the deterministic ZIP contains `manifest.json`,
  `export.json`, metadata, and entity CSV files.

Historical release blockers at that checkpoint (superseded by the current
release-candidate audit above):

- The new migration and all four protected Edge Functions are now deployed to
  the remote project. The linked dry run is up to date, and anonymous probes
  return 401 for all four functions.
- Authenticated USDA search passed with the configured release label and
  weighted serving records. Authenticated DeepSeek extraction reached the
  deployed function but returned sanitized `provider_unavailable`; provider
  access/model/billing verification and explicit estimate evidence remain
  pending. The guarded remote grouped-meal RPC smoke passed on 2026-09-23
  with two confirmed disposable users, including replay, stale-edit,
  cross-user, historical-edit independence, delete, and cleanup checks.
- Browser verification still needs the full mobile/desktop, keyboard,
  screen-reader-oriented, large-text, reduced-motion, offline, provider
  failure, stale reapply, account-switch, and reload-restoration matrix. The
  deployed browser smoke already verified that analysis is never called merely
  because text was entered, USDA quantity review shows nutrition before
  confirmation, and the provider failure retains the original text.
- Do not tag MVP-1 complete until these local, browser, migration, protected
  function, remote smoke, privacy-disclosure, and USDA provenance gates are
  recorded for one candidate commit.

## Historical MVP-1 Retry Evidence — 2026-09-23

The retry used the two confirmed User A/User B credentials already present in
the local environment without recording either address or password. Both
remote sign-ins succeeded. Direct authenticated provider calls produced the
following sanitized results:

- User A: `nutrition-text-parse` accepted `2 cups fried rice with 2 eggs` and
  returned `suggestedMealName`, `candidates`, and `questions`.
- User B: `nutrition-search` returned `candidates` and `nextCursor` for `rice`;
  `nutrition-text-parse` returned the same validated extraction shape; and
  `nutrition-macro-estimate` returned `estimates` for a reviewed cooking-oil
  ingredient.
- User B: `nutrition-meal-match` returned the stable
  `provider_unavailable` result. This is still an open USDA batch-match gate;
  no raw upstream response or provider credential was logged.
- The active browser session was rechecked against the local app. Its
  composite analysis action still returned the sanitized
  `not_authenticated` error, so the browser provider gate is not green even
  though direct authenticated function calls pass.

The existing guarded 31-wrapper remote RPC smoke remains valid evidence from
the earlier disposable-user run, including grouped replay, stale-edit,
cross-user ownership, historical-edit independence, grouped delete, and
authorized cleanup. The newly supplied accounts were not deleted during this
retry because the runner's cleanup path deletes the complete Supabase account,
not only test rows; explicit confirmation is required before rerunning that
destructive cleanup-enabled command.

## MVP-1 Provider Fix Evidence — 2026-09-24

The USDA provider correction changed both protected USDA search boundaries to
the documented FoodData Central JSON POST contract: `dataType` is now sent as
an array, with an explicit first page, instead of as a comma-separated query
parameter. Local handler tests cover the request shape and normalization.

## Historical remote/browser checkpoint — 2026-09-24

The manual browser session below predates the repeatable Playwright release
suite and is retained as supplemental evidence. Current automated results are
recorded in the release-candidate audit above.

Remote verification after deployment to project `ifunkhvbvkdxolhpxjvk`:

- User A authenticated `nutrition-meal-match` successfully for cooked egg and
  cooked rice; the response contained two normalized matches.
- User B authenticated `nutrition-search` successfully for `rice` with eight
  candidates, `nutrition-text-parse` successfully with five extracted
  candidates, and `nutrition-macro-estimate` successfully with one estimate.
- Anonymous calls to `nutrition-search`, `nutrition-text-parse`,
  `nutrition-meal-match`, and `nutrition-macro-estimate` all returned
  `401 not_authenticated`.
- Deployed versions are `nutrition-search` v7,
  `nutrition-text-parse` v7, `nutrition-meal-match` v2, and
  `nutrition-macro-estimate` v1; JWT verification is enabled for all four.
- The local browser tab was unauthenticated after the previous session ended;
  navigating to `/nutrition` correctly redirected to
  `/auth/sign-in?next=%2Fnutrition`. An authenticated browser provider smoke
  still needs to be run after signing in again; this is an environment/session
  gate, not evidence of a provider failure.
- The final application gate passed: typecheck, lint, 55 local tests, build,
  and the linked migration dry run were green. The local Supabase lint rerun
  was blocked because the Docker Desktop Linux daemon was not running; the
  earlier clean local reset/lint/pgTAP/RPC/concurrency gate remains valid and
  no database migration changed in this fix.

The two new confirmed test accounts were not deleted. No database migration was
needed for this provider fix.

## MVP-1 Authenticated Browser Evidence — 2026-09-24

The local authenticated browser run used the signed-in disposable account at
`http://localhost:3000` after completing onboarding with synthetic values only
(`MVP Test`, age 30, metric 170 cm/70 kg, no health-screening condition). The
account remains intact pending explicit deletion confirmation.

- Plain food search and USDA quantity review passed for `egg`. The protected
  USDA action returned weighted candidates, including `EGG` with a
  `31.200000762939453 g` serving and `as_labeled` preparation. Quantity review
  showed `160.1 kcal`, `2 g` protein, `18 g` carbohydrate, and `9 g` fat with
  `Trusted catalog nutrition` and `high confidence`. Confirmation logged one
  grouped-independent food entry.
- Composite analysis passed for `2 cups fried rice with 2 eggs`. The UI first
  showed the explicit disclosure that no DeepSeek request occurs until
  `Analyze this meal` is selected. The authenticated DeepSeek review returned
  `Fried Rice with 2 Eggs`, stated rice and egg ingredients, and possible hidden
  cooking oil, soy sauce, and vegetables excluded by default. Extraction did
  not supply authoritative macro fields.
- Catalog replacement and preparation review passed by selecting `White rice ·
  cooked` for the rice ingredient. The review retained the cooked preparation
  basis and recalculated the combined total.
- Explicit AI estimate fallback passed for included cooking oil. The UI showed
  `AI estimate · low confidence · range 90–130 kcal`; the meal total displayed
  an approximate base and a combined low/high range. Confirmation produced one
  reusable recipe and one grouped history card with three expandable ingredient
  snapshots.
- Grouped history expansion passed. The card displayed rice, eggs, and cooking
  oil with quantities, preparation/source labels, and the AI-estimate marker.
  Historical correction changed rice from one to three servings in one browser
  tab and recalculated only the logged snapshot; the reusable recipe remained a
  three-ingredient recipe.
- Confirmed grouped deletion passed. The `Fried Rice with 2 Eggs` history
  parent and child nutrition entries disappeared, daily totals returned to the
  standalone egg entry, and the reusable `Fried Rice with 2 Eggs` recipe
  remained available with three ingredients.
- Two-tab stale recovery passed. The second tab saved a competing historical
  quantity, the first tab received `logged meal changed; refresh before editing`,
  retained its draft, exposed `Reapply draft`, and succeeded after an explicit
  reapply with a fresh mutation key. The corrected discard path was then
  re-tested: discarding closed the editor, and reopening it showed a blank
  editor with no restored draft.
- Notification preference and export passed after onboarding. The opt-in
  preference changed from disabled to enabled and remained enabled after a full
  settings reload. The browser displayed `CSV bundle download started:
  cali-exercise-meal-planner-export-2026-09-24.zip` and also started JSON export
  `cali-exercise-meal-planner-export-527618f9-2d84-4b90-9d67-cd2ee4ab6ada.json`. The in-app
  browser still does not expose an OS-level download receipt for ZIP-content
  inspection.
- Keyboard/focus checks passed for the unified meal input: focus remained on
  the field while appending text, and subsequent Tab navigation reached
  `Search trusted USDA` and `Enter nutrition manually`. The accessibility tree
  exposed labels, roles, disclosure state, and 44-pixel controls. The earlier
  duplicate toast-key warning was fixed and no Next.js issue overlay remained
  after reload.
- Reload draft recovery passed for an `oatmeal with banana` guided-review
  draft. Reopening the snack editor after a full reload showed `Meal review
  draft restored.` with the original text; explicit discard removed it and the
  next reopen was blank.

Second-account browser isolation also passed in this run. After signing out the
onboarded User A session, a manually authenticated User B session showed an
empty nutrition day with none of User A's standalone USDA or grouped meal
history, no User A reusable recipe, and an independently disabled notification
preference. A User B-only guided draft (`User B private oatmeal draft`) restored
after reload. The later Playwright run closed the failed-refresh, offline,
large-text, reduced-motion, download-receipt, and narrow-overflow checks; the
manual screen-reader pass remains supplemental evidence, and screen-reader
verification should still be repeated before a public launch.

## MVP 1.0 Release Evidence

Complete this section during M2.4. Do not replace the audit record above; add
new evidence for the exact candidate being released.

| Evidence | Required value | Current value |
|---|---|---|
| Candidate implementation commits | Full Git commit SHAs for the tested modular series | `dc4d9976684627b75c7e696e778c8d61f379de7d`, `8024cc78574f81b226b132db9d2cf518ccee9836`, `4f440cc75b3117c95e6c3735250a1edd4baf9ee8`, `78720e9491b0ff56ddbe41b4b7d31603ca980325`, `052faf1565bdd0584459bf7f7f951d30ca6457db`, and `5c2dc2040db5d075a4628a5c25d4e24e0edf23cb` |
| Candidate tag | Annotated release-candidate tag | `mvp-1.0.0-rc.2` will point to the final documentation/evidence commit; local `mvp-1.0.0-rc.1` is preserved as historical reference |
| Local migrations | Ordered versions applied from a clean reset | 39-file reset passed on 2026-09-24; head `20260924103000_mvp1_export_owned_foods.sql`; 436 pgTAP assertions pass |
| Staging/linked history | Matches the authorized pending migration set | Linked history matches all 39 local versions; `npm run supabase:push:dry` is up to date after the authorized export fix |
| Generated database types | Regenerated from the deployed schema and typechecked | Generated public schema contract remains current; typecheck passes after the final migration set (the export function change adds no table type) |
| USDA catalog release | Source, release label, data-type scope, provenance evidence, and on-demand smoke record count (no bulk count) | USDA FDC API, on-demand Foundation/SR Legacy/Survey (FNDDS)/Branded scope, release `FoodData Central API verified 2026-09-22`; User B persisted 1 reviewed record: FDC `2708951`, `Survey (FNDDS)`, `prepared`, revision `Survey (FNDDS):2708951`; no bulk count claimed |
| Edge Functions | Deployed versions for all protected nutrition functions | `nutrition-search` v7 (`558cf028946eb1d01da80db041c270e2654cac605a9ea7745704cb0f26244dc8`), `nutrition-text-parse` v7 (`fbed0f5b19bee127373919b29ad9882f2524e42d235ae72f35cb948771f3db91`), `nutrition-meal-match` v2 (`9cb4d41644c4dbb4f02323e1cf44bcfbd3811088811537d3a4b1fa7e98674b31`), and `nutrition-macro-estimate` v1 (`e02a637c1c6c10fbd74aa16d861540cd3cd84a74a85a8c93a2b42f8841472f0d`); JWT enforced; anonymous 401 evidence is recorded |
| App checks | Typecheck, lint, unit tests, and production build | `npm run typecheck`, `npm run lint`, `npm run test:local` (13 files/55 tests), and `npm run build` pass on 2026-09-24; build generated 19 routes and copied 21 assets |
| Database checks | Reset, list, lint, pgTAP, RPC smoke, and concurrency | `supabase:reset`, `supabase:lint`, `supabase:test` (10 files/436 tests), `supabase:test:rpc` (31 wrappers), and `supabase:test:concurrency` pass on 2026-09-24 |
| Browser matrix | Mobile, desktop, keyboard, large text, reduced motion, and network failure | `npm run test:e2e:release`: 21/21 (serialized 390×844 mobile and 1440×900 desktop); `npm run test:e2e:public`: 2/2. Automated checks cover provider gate, failure retention, offline retry, failed refresh, export ZIP contents, focus, overflow, reduced motion, 200% text, and account isolation; manual evidence below covers grouped save/expansion, historical correction, grouped deletion, stale reapply/discard, and screen-reader-oriented checks |
| Remote smoke | Retained-account Auth/provider/RPC result and account-retention evidence | Final User B smoke passed USDA search, DeepSeek extraction, batch matching, one explicit low-confidence estimate, weighted USDA save, and authenticated export on 2026-09-24; FDC `2708951`, `Survey (FNDDS)`, release `FoodData Central API verified 2026-09-22`, `prepared`, `Survey (FNDDS):2708951`, persisted provider count 1. All four anonymous probes returned 401. Both confirmed accounts are intentionally retained |
| Known limitations | Only explicitly accepted post-MVP or operational limitations | Final documentation commit and `mvp-1.0.0-rc.2` tag remain to be created. Production Site URL/redirects, live SMTP confirmation/recovery verification, Free-tier leaked-password protection, and public deployment are separate launch gates. Meal photos, voice, barcode, reminders, and service-worker synchronization remain outside MVP-1 |

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
