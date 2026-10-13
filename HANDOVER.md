# Cali — agent handover

Prepared **2026-10-13, Asia/Manila**. This document records the state after the nutrition/recipe branch was pushed and merged into `main`. It is a continuation guide, not release approval.

## 1. Start here

The original nutrition and recipe delivery is complete and merged; the later October 13 UI refinements remain local and uncommitted. The next agent should first review the uncommitted October 13 changes, then continue with **current-main CI and hosted release verification**, then the **recipe-image cleanup worker**, rather than rebuilding recipe cards or applying already-deployed migrations.

| Item | Handover state |
|---|---|
| Repository | [BrylleMutia/untitled-exercise-meal-app](https://github.com/BrylleMutia/untitled-exercise-meal-app) |
| Current checkout | `main` |
| Implementation baseline | `facf324bcc055fffc8021e3b6cfca5b8c9b57f72` — `test(e2e): select active planned recipes in retry scenarios` |
| Previous main | `b53532374c37a1abf732aae61317e2382e01e6ce` |
| Delivery | 70 commits, 129 changed files; feature branch pushed, then fast-forwarded into `main` and pushed after explicit user instructions |
| Feature branch | `codex/nutrition-recipes`, retained locally and on origin at the implementation baseline |
| Latest remote verification in this chat | Remote `main` and feature branch both matched the baseline; local working tree was clean after merge |
| Initial handover inspection | Local `main` and its tracking reference matched the baseline, with 69 migration files and 23 SQL test files. Later local refinements add the 70th migration and 24th SQL suite; working changes are uncommitted |
| Shared database | Authorized October 13 rollout verified: 70 matching local/linked versions through `20261013020142_prefer_provided_recipe_plan_nutrition.sql`, no pending dry run and all 12 schema groups equal; existing data digests unchanged |
| Hosted app / current-main CI | Not inspected after the latest merge. Earlier MVP-3 CI success does not establish success for this baseline |
| Current local delivery | Saved-recipe search/direct logging, compact rows, per-slot Add meal and focused review are implemented locally and uncommitted. Docker/local Supabase are running. The final affected browser gate passes 50/50 on desktop/mobile, including 320px/200% text. The supplied-macro planning correction is deployed and verified on the linked database. No hosted client deployment is part of this task |
| Latest requested backlog | October 13: daily planned-only macro tracking, Saved meals primary action changed to Add to plan, and a separate custom workout library. These requests are documented in section 4; none is implemented by this handover update |

The baseline SHA identifies application source before this handover file. A later documentation commit may move `main`; compare the actual checkout before proceeding. Local tracking references do not prove the remote has remained unchanged since the last network verification.

### Document authority and reading order

1. Read [AGENTS.md](./AGENTS.md) for mandatory workflow, migration safety, verification, and port ownership.
2. Use this file to identify the next task and its evidence boundary.
3. Read the task's owning sections in [FEATURES.md](./FEATURES.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [DESIGN.md](./DESIGN.md). Source, tests, generated types, and migrations define implemented behavior.
4. Read [SUPABASE_SETUP.md](./SUPABASE_SETUP.md), especially sections 10–13 for the latest recipe rollouts and section 9 for hosted Auth/email operations.
5. Use [MVP3_HANDOVER.md](./MVP3_HANDOVER.md) for the earlier everyday-usability implementation and its October 1/4 evidence. Use [MVP_Priority_Matrix.md](./MVP_Priority_Matrix.md) as a dated historical record, not a single current checklist.

This document owns transition status and next actions. It does not replace the product, architecture, or visual contracts. Several old release sections describe superseded candidates; retain their dates and do not resurrect their completed tasks.

## 2. User decisions to preserve

### Post-baseline local refinements — 2026-10-13

The following user-requested refinements are currently uncommitted and supersede
the historical shared Saved/Planned card descriptions below:

- Saved recipe time pills display “X mins” without “total,” while accessible
  labels retain whole-recipe time. Overview wording remains unchanged.
- The Planned section uses a shared compact `MealRow` for Planned, grouped Eaten
  and standalone Eaten entries. No recipe banner, favorite control or recipe
  yield/time/complexity pills appear there. Saved recipes retain their cards.
- Planned macro pills describe the shown planned quantity, prefer stored plan
  fields and fall back to a fully resolved recipe/food for legacy missing fields.
  Unresolved placeholder zeros are unavailable. Eaten values remain saved history.
- Edit, Skip/Plan again, Log, Eaten details/edit/delete and linked Log again remain;
  actions sit beside the summary and wrap below it on narrow screens. Inline
  editors and confirmations follow the row summary.
- Main locations: `src/components/nutrition/MealRow.tsx`, the Nutrition page,
  `src/utility/plannedMealNutrition.ts` and focused tests. Existing browser tests
  were updated to the compact rows and planned-portion basis.
- Local validation: TypeScript, lint, 12 affected tests and production build passed.
  The automated authenticated browser gate could not start because Docker's Linux
  engine was stopped; no test scenarios ran in that attempt. Live browser checks
  cover rendering at 320px/1440px, no horizontal overflow, 44px action targets,
  edit/cancel focus return, log/cancel and Eaten expansion. No
  shared database mutation or deployment is part of these refinements.

- **Saved-recipe search is implemented locally (October 13).** The meal-entry
  field now shows active Saved recipes above Foods and offers a focused inline
  portion review with Log meal / Add to plan / Cancel. Positive fractional
  portions preserve supplied macros and scale ingredient quantities. Logging is
  independent of prescriptions. Fixed log/planning identities and stable planned
  IDs survive failures/reload; changed portions/recipes get fresh identities.
  Changed recipe contents require explicit review; unavailable recipes or
  incomplete ingredients block submission. Guided editor identity is stable
  across Context feedback. No schema, RPC or generated-type change was made.
- New sources/tests: `src/utility/recipeSearch.ts`, `recipePortion.ts`, their unit
  tests, and `src/components/nutrition/RecipePortionReview.tsx` / component tests.
  Integration is in the Nutrition page and Context action contracts; four
  authenticated browser scenarios were added to `e2e/mvp1-release.spec.ts` and
  existing search-label selectors updated. Docker Desktop was started and the
  existing local stack resumed successfully. Fresh checks: TypeScript/lint passed,
  322 application tests across 46 files passed, 14 repository integration tests
  passed, production build passed, and the design layout scan found no issues.
  The new authenticated run passed **10/10** (four scenarios × desktop/mobile,
  plus setup/teardown), including 320px/200% text, no automatic provider calls,
  default/fractional/invalid portions, cancel/focus, reload/day/slot recovery,
  direct grouped logging after a committed-but-lost response and reload, existing
  recipe planning with a stable failed-save key, and stale/unavailable recovery.
  Additional regression run: **20/22 passed**; the card-refinement scenario fails
  on both viewports at its half-serving planned macro assertion. Other food,
  provider, favorites and planned log/delete/retry checks passed. See the defect
  row in Pending work; do not weaken that assertion to match the incorrect value.
  Logs: `output/recipe-card-refinements/saved-recipe-search-browser.log`,
  `saved-recipe-search-repository.log`, `saved-recipe-search-regression.log`.
  Live UI checks also confirmed 320px/1440px, 44–48px controls, default/half
  portions and focus/recovery. Screenshots `saved-recipe-search*.png` remain in
  the same ignored output directory. The app server on 3000 remains running;
  test automation used its separate configured port and removed disposable
  fixture accounts. These changes remain uncommitted.

- **Planning correction (October 13, prior local checkpoint; rollout below supersedes pending status):** new migration
  `20261013020142_prefer_provided_recipe_plan_nutrition.sql` and
  `supabase/tests/provided_recipe_planning_test.sql` (40 checks). Generated plan
  and planned-editor source metadata now describe supplied macros accurately;
  `src/utility/mealPlan.test.ts` covers generated macros/provenance. Existing
  Eaten/plan retry browser tests now identify records by stable planned-meal ID
  instead of recipe-name/last-row matches. All 69 original migration files retain
  their original hashes. A clean 70-migration replay passes 24 SQL suites / 854
  assertions; database lint has only the existing unused image-cleanup parameter
  warning. Application tests pass 323/46 files; repository integration passes
  14; TypeScript/lint/build pass. Regenerated local public types have the same
  schema and RPC shapes, with 18 existing JSON fields represented as
  `NonNullable<Json>` by the local generator; canonical linked types and
  PostgREST-version metadata are preserved. No public API or column changed.
  Final consolidated browser rerun passes **30/30**: 14 scenario groups on both
  desktop/mobile plus setup/teardown. This includes the previously failing
  half-serving plan assertion, new search-to-plan supplied macros, 320px/200%
  text, reduced motion, provider failure, linked logs/deletion and lost-response
  retries. Earlier 26/30 failures were due to recipe-name/last-row selectors
  encountering an independent same-name log; stable planned IDs resolve that
  test ambiguity without reducing assertions. Final log:
  `output/recipe-card-refinements/planned-macros-browser-final.log`.
  Proof rows: `planned-macros-row-desktop.png`, `planned-macros-row-mobile.png`.
  All 11 non-routine schema fingerprint groups remain unchanged; only the two
  intended private routine bodies differ from the linked baseline.
  Applying the migration left local prescription/nutrition/recipe/ingredient
  digests unchanged. The shared database was inspected read-only and remains
  at 69 migrations at that checkpoint. The subsequent authorized rollout below
  supersedes this status. No Git commit/push was performed.

- **Latest meal-entry refinement (October 13):** each Breakfast/Lunch/Dinner/Snack
  heading now has Plus + Add meal and one inline slot-fixed editor. The Planned
  header entry button and editor slot selector are removed; Saved-card logging
  retains its required slot selector. Selecting a food, explicit USDA result or
  saved recipe shows only its quantity/serving review, hiding search, results,
  entry tabs and unrelated description input without deleting them. Cancel
  restores search/results and focus; Close or authoritative success returns focus
  to the originating group button after pending controls re-enable. Drafts stay
  separate by account/date/slot. Food-review saving now disables parent controls
  and waits for queued draft writes before successful cleanup. Empty-group copy
  is exactly “Nothing planned or logged.” Unknown intake remains explicit in the
  daily summary/help. Browser coverage checks provider selection, retained
  description inputs, slot switching, disabled controls, cancel/focus, supplied
  recipe portions, reload/retry and 320px/200% text. An initial 49/50 run exposed
  overflow in restored food review at enlarged text; the draft banner now wraps
  and quantity fields/grid containers can shrink. A subsequent focused run exposed
  narrow recipe source-help overflow; wrapping that row and allowing review fields
  and actions to shrink resolved it without weakening the overflow checks.
  The final focused gate passes 6/6 and the consolidated gate passes **50/50**
  (24 scenario groups on desktop/mobile plus disposable auth setup/teardown).
  Fresh application tests pass **323 in 46 files**, authenticated repository tests
  **14**, and local SQL tests **854 assertions in 24 suites**. TypeScript, lint
  and the production build pass; database lint has no errors and retains the
  known unused image-cleanup parameter warning. The unchanged migration had
  already passed clean local replay at the preceding checkpoint; this task reran
  its applicable SQL/security tests rather than performing another reset.
  Evidence: ignored `output/recipe-card-refinements/slot-entry-verification.md`,
  `slot-entry-browser-final.log` and `slot-entry-recipe-review-*.png`.
  Direct inspection of the user's in-app port-3000 tab was rejected by the
  browser tool's URL security policy; no alternate access to that tab was used.
  Authenticated browser verification used the independently configured disposable
  local test server on port 3030. Hosted acceptance remains unverified.
  No Git commit/push or hosted client deployment is part of this task.

- Use **Option 1: Pastel banner** for Saved recipe cards, with Cali's existing rounded surfaces, typography, colors, and shared controls. Planned/Eaten entries use the compact layout requested on October 13.
- Keep recipes' calories **per serving**, even though the visible `/ serving` suffix is removed. Whole-recipe yield is a separate pill. Changing a planned portion must not change either metadata value.
- Metadata order is **calories → yield → time → complexity**: coral, pale mint, lavender, peach. Yield uses `ChartPie` and preserves fractions. Configured card time reads **X mins**, without “total”; its accessible label retains the whole-recipe basis. Missing time reads **Not set**; explicit zero minutes is valid.
- Missing recipe complexity is **Medium**, including new/legacy drafts, legacy displays, and stored null backfill. Easy/Medium/Hard remain editable. Unsupported values remain invalid.
- Current Saved actions are **Log +**, then **Pencil** and **Archive** icon controls, with 48px secondary controls, descriptive accessible names, and hover/focus tooltips. The latest pending request in section 4 replaces this primary action with **Add to plan**; the source still uses Log until that work is implemented. Retain this distinction when updating tests and owning documentation.
- Planned actions remain **Edit, Skip/Plan again, Log**. Expanded editors and confirmations remain above the footer.
- **Recipe duplication is removed.** Do not add Duplicate buttons, handlers, editor props, or draft-opening paths. Previously saved copies remain normal recipes. Old duplicate drafts expire; they must not overwrite Create/Edit drafts.
- Predefined recipes support per-account **Edit and Archive**. Editing creates a personal replacement; it must not mutate the shared original or another account's catalog.
- When macros are supplied, **use the original macros without re-estimation**. Korean Beef Bowl must retain **560 kcal / 45 g protein / 58 g carbohydrates / 16 g fat per serving**, yield **4**.
- Predefined recipes require macros and a generated recipe image. Generic fallback, uploaded covers, and HTTPS image URLs are supported. Generated covers are illustrative and are not nutrition evidence.
- Preserve planned versus eaten separation, stable retries, existing nutrition history, recipe revisions, and recoverable input on failures.
- Git push and merge were explicitly authorized and completed. They do not establish app deployment, hosted acceptance, or permission for new database/hosting operations in a later task.

## 3. Completed latest work

### Nutrition and recipe behavior

| Feature | Implemented behavior | Primary source / tests |
|---|---|---|
| Shared nutrition styling | Common calorie/protein/carbohydrate/fat tokens and pills, availability/estimate labels, shared ring center styling | `src/app/globals.css`; `src/components/ui/nutritionMetrics.ts`, `NutritionPills.tsx`, `NutritionPills.test.tsx`, `CalorieBudgetRing.tsx`, `ProgressRing.tsx` |
| Modal and secondary controls | Shared modal, keyboard/focus restoration, nested help dismissal/layering, accessible icon buttons and tooltips | `src/components/ui/Modal.tsx`, `HelpPopover.tsx`, `IconButton.tsx`; browser accessibility scenarios |
| Recipe creation/editing | Separate recoverable Create/Edit drafts; trusted search, reviewed description, custom ingredients, fractional yield, live nutrition, required instructions, references, optional total time, complexity, and covers | `src/components/nutrition/RecipeEditor.tsx`; `src/utility/recipeEditor.ts`, `recipeTime.ts`; focused utility/repository tests |
| Recipe overview | Cover and shared tabs for recipe details; ingredients, nutrition, instructions, reference, time, complexity, and Edit behavior | `RecipeOverview.tsx`, `RecipeTabs.tsx`; `e2e/mvp1-release.spec.ts` |
| Shared pastel card | Lavender Saved / blush Planned banner; image/title overview triggers; separate heart; badge; four wrapping metadata pills; contextual planned quantity/status; bottom action area | `RecipeCard.tsx`, `RecipeCard.test.tsx`; Nutrition page |
| Refined Saved actions | Current Log + confirmation flow; Edit/Archive icon buttons; keyboard order and focus return; no Duplicate workflow. Replacement with Add to plan is pending in section 4 | `src/app/nutrition/page.tsx`, `src/contexts/AppContext.tsx`, `src/services/repository.ts` |
| Favorite persistence | Per-user stable recipe identity; desired state, revision, idempotency key; authoritative confirmation; same state in Saved/Planned; retryable error feedback | `useRecipeCardMetadata.ts`; `src/services/recipeCardMetadata.ts`; `set_recipe_favorite`; SQL/repository/browser tests |
| Popular read model | Up to five eligible recipes eaten during the last 30 inclusive local calendar days; grouped eaten record counted once; tie-break by latest date then stable ID | `get_recipe_card_metadata`; `RecipeCardReadModel`; SQL ranking tests |
| Medium complexity | Null-only stored backfill, insert default, non-null supported values, private legacy-write normalization; optional domain field retained for old caches | `src/utility/recipeCard.ts`; complexity migration and `recipe_complexity_default_test.sql` |
| Recipe images | Registered bundled assets; generic fallback; private uploaded WebP; direct HTTPS URL; signed display refresh; upload validation and deferred object cleanup | `RecipeCover.tsx`, `RecipeImagePicker.tsx`; `src/app/api/recipe-images/`; image utilities/services and SQL/handler tests |
| Catalog replacement | Eight previous system recipes retired with their identities/ingredients preserved; two active replacements; eligible personal recipes still participate in planning | `src/constants/meals.ts`, `foods.ts`, recipe definitions; `src/utility/mealPlan.ts` |
| Personal catalog controls | Edit creates owned replacement and caller-only hide preference; Archive hides catalog recipe only for caller; revision/retry/ownership checks | `recipe_catalog_preferences`; authoring/archive RPCs; personal catalog SQL/integration/browser tests |
| Supplied recipe macros | Stored separately from ingredient estimates; displayed and logged from authoritative recipe values; scale by actual servings; existing history unchanged | `providedRecipeNutrition.ts`, `nutrition.ts`; provided-nutrition migrations/tests |
| Add to daily plan | Manual/reviewed candidates add atomically to a selected date/slot, including first plan creation, grocery reconciliation, expected plan versions, and failure retention | Nutrition page; `add_planned_meal`; `AppContext`; `supabaseRepository.ts` |
| Linked planned logging | Plan-aware confirmation; linked Eaten display; independent logs remain separate; deleting last linked log reveals planned row; retries do not duplicate intake | `log_planned_meal`; Nutrition page; linked/planned provided-nutrition SQL/browser tests |
| Retry isolation fix | Separate original planned intent from normalized grouped logger payload; independent planned entries and older completed claims remain retryable | Last two migrations; `planned_provided_recipe_test.sql`; retry browser scenarios |
| Food picker | Plural-aware and close-match ranking; quantity focus and reviewed values retained | `src/utility/foodSearch.ts`, tests; Nutrition page |
| Other shared UI refinements | Dashboard energy/walking displays; Activity/Onboarding/Progress/Settings nutrition styling; wrapping header; Grocery/Workout action labels | Respective route files, `AppShell.tsx`, dashboard/page tests |
| Export/deletion | Recipe metadata, favorites, catalog preferences and owned records included in authoritative account controls; private image deletion jobs queued | Repository/export contracts; SQL and integration tests; image-cleanup deployment remains pending |

Favorite and Popular badge precedence: **Popular** wins when both apply; the filled heart still indicates favorite state. Favorite-only recipes show **Favorite**. Lists retain their existing ordering; no new sort/filter was added.

The metadata hook bases popularity on today's local date, not the selected historical Nutrition day. It refreshes for relevant snapshot changes, focus/online events, explicit retry, and local-day change (minute polling). Historical aggregation stays on the server rather than inflating `AppSnapshot`.

Food-only/unresolved Planned cards use the same shell but omit recipe yield/complexity and the favorite control when no recipe exists. Keep truthful status, available nutrition, and existing logging restrictions.

### Current predefined recipes

| Recipe | Identity / yield / metadata | Nutrition contract |
|---|---|---|
| Creamy Lemon Chicken | `meal-creamy-lemon-chicken`; 2 servings; Easy; 30 minutes; bundled generated cover | Approximately 695 kcal, 39 g protein, 21 g carbohydrates, 50 g fat per serving, estimated from reviewed ingredients. Assumes 400 g raw boneless skin-on thighs, 30 g butter, 300 ml whole milk (~309 g), 8 g flour, 47 g lemon juice, 21 g honey. Counts sauce and rendered fat; excludes unmeasured seasonings and sides |
| Korean Beef Bowl | `meal-korean-beef-bowl`; 4 servings; Easy; time unset; bundled generated cover | Original source-provided 560 kcal, 45 g protein, 58 g carbohydrates, 16 g fat per serving. Do not replace with ingredient-derived values. Raw/uncooked ingredient quantities support groceries; garnish weights are documented assumptions |

Definitions and source notes: `src/constants/creamyLemonChicken.ts`, `creamyLemonChickenFoodSources.json`, `koreanBeefBowl.ts`, `koreanBeefBowlFoodSources.json`. Covers: `public/images/recipes/`. Default: `public/images/recipe-default.png`. Supplied references are retained in the definitions. `scripts/extract-korean-beef-nutrition.mjs` is reusable tooling; raw source downloads are local artifacts.

Source-provided Korean Beef macros are not independently verified. They remain distinguishable from ingredient estimates and cannot establish eligibility for strict carbohydrate-limited planning. Active catalog replacement can leave some meal slots unresolved when no eligible recipe exists; that is intentional, not a reason to restore retired recipes or invent nutrition.

### Earlier completed application scope

The latest branch builds on the existing authenticated MVP. The earlier October 4 handover records: fresh-browser Auth completion, local confirmation/resend handling, revised onboarding, manually logged daily steps/walking minutes, calorie-remaining rings, dated target history, adjustable step target, Pilates, immutable custom routines/session history, low-carb/keto-style and vegetarian/vegan planning, optional milestones, grocery reconciliation, progress/history, account export/deletion, and recoverable drafts.

Do not reopen those as missing features solely because an older matrix section says “pending.” Their hosted release checks may still be open. See `MVP3_HANDOVER.md` and the relevant source/tests for exact completed scope and original evidence dates.

## 4. Pending work and acceptance evidence

These are suggested task boundaries, not assignments to another agent. No message has been sent to a different agent or external service.

| Priority | Next task | Status and acceptance evidence |
|---|---|---|
| User-requested, pending | Daily planned-only macro tracking | Add a way to view calories/protein/carbs/fat for each selected local day from planned meals, separately from Eaten totals. Preserve stored planned portions, supplied macros, unknown values and historical snapshots. Scope and checks are detailed below; no implementation or new verification is claimed |
| User-requested, pending | Saved meals: Add to plan primary action | Replace the Saved card's Log action with Add to plan and connect it to the existing confirmed planning flow, rather than changing only the label. Preserve Edit/Archive and direct logging from meal-entry reviews. Detailed acceptance below; current Saved card source still logs |
| User-requested, pending | Separate custom workout library | Provide a distinct library for user-customized workouts, separate from existing available workout options. Reuse the existing custom routine/version/session infrastructure and preserve built-in options. Detailed scope and decisions below; library implementation is pending |
| P0 | Inspect latest `main` CI | Unverified after this merge. Check both `web` and `integration` for the exact current source SHA. Link run IDs/results. If failing, diagnose the first real failure and reproduce locally; do not substitute older MVP-3 runs |
| P0 | Establish hosted application state | Latest hosting state is unknown. Inspect existing deployment/project association before creating anything. Record URL, source SHA, environment/backend identity, build status and authenticated load. Git pushes may trigger hosting automation; neither success nor absence was checked here |
| P0 | Deploy/verify recipe image cleanup worker | Source and local handler/SQL tests exist; production deployment and recurring invocation remain open. Verify server-only authorization, actual removal through Storage API, lease/retry behavior, acknowledgement, and no exposure of keys/object paths. Record schedule, monitoring and sanitized failure evidence before enabling uploaded covers in production |
| P0 | Hosted Auth/confirmation configuration | Verify exact HTTPS Site URL/allowed redirects and reviewed token-hash confirmation template. Record environment/template identity. Local Mailpit success does not establish hosted Auth configuration |
| P0, explicitly deferred | Staging SMTP delivery | User previously deferred this on 2026-10-01. Resume only when that deferral is lifted or the task explicitly includes it. Require actual signup/resend inbox delivery, cross-browser confirmation, invalid/reused links, safe redirects and disposable-account cleanup. Recovery delivery is also a launch check |
| P0 | Hosted primary-loop acceptance | Recheck mobile/desktop sign-in → onboarding/plan → workout and food logging → progress. Include recipe Create/Edit/overview, favorites, original macros, catalog controls, linked logging/retries, upload/URL fallback, account export/delete, offline draft retention, keyboard, 320px, large text and reduced motion |
| P0 | Current release/provider evidence | Browser tests mock external nutrition providers. If release scope requires live USDA/DeepSeek checks, use the guarded remote procedure and approved disposable accounts. Record source version, anonymous denial and fixture cleanup without credentials/tokens |
| P0 | Release closeout | Record approved deployed source SHA, current CI, hosted acceptance, required email/provider gates and cleanup. Create an approved version/tag only after acceptance. A merged branch is not release sign-off |
| P1 | Clean up stale documentation references | `FEATURES.md` still says instructions/references/time/images copy on recipe duplication (around lines 496–511); `ARCHITECTURE.md` has an old time/duplication sentence (around line 298). Current contracts elsewhere and source remove duplication. Update these passages without removing unrelated duplicate-log/idempotency or grocery ingredient behavior |
| P1 | Refresh navigation/status summaries | README and the owning documents' introductory handover summaries emphasize October 4. Link this handover and update current status separately from dated evidence. Keep old manifests and rollout dates as historical records |
| Completed, shared backend | Supplied-macro planning correction | Applied `20261013020142_prefer_provided_recipe_plan_nutrition.sql` after explicit authorization and a fresh exact-one-migration preflight. All 70 history entries and 12 schema groups agree; no pending dry run. Recipe/ingredient/meal-plan/planned/eaten/nutrition digests stayed unchanged. Supplied macro scaling and private privileges verified. Linked public contracts unchanged; PostgREST metadata regenerated to 14.17. Existing prescriptions need explicit edit/save for corrected new-version totals. Do not reapply or backfill. Evidence: ignored `output/recipe-card-refinements/slot-entry-deploy-*` |
| Operational | Existing database lint warning | `public.claim_deleted_recipe_images` has unused `p_payload`; no lint errors were recorded. Investigate only if warranted; changing an applied function requires a forward migration and preservation of its public contract |
| Operational | Auth/security advisor decisions | Earlier documentation records disabled leaked-password protection/platform limitations and advisor follow-ups. Reinspect current settings/advisors before stating their current condition; retain the owner's decision and platform constraints |

The provided-macro planning mismatch is corrected on the linked backend for new and explicitly edited plans by the verified authorized migration. Previously saved prescriptions and eaten history were not recalculated. The initial combined browser run also exposed name-based selectors choosing an independent log from another scenario; tests now target the stable planned-meal link. Hosted acceptance remains unverified.

### Latest user-requested features — 2026-10-13

These three items were explicitly requested as additions to this handover, not as
an instruction to implement them in this task. They are pending product work.
The implementation notes and acceptance checks below guide the next agent;
unsettled presentation and workflow choices are identified rather than recorded
as already-approved behavior. Read the relevant owning feature/design/architecture
sections and inspect current source before implementation. Update those documents
when the final behavior is implemented.

**Daily macros from planned meals, separate from Eaten**

- User request: provide a way to track or see macros for each day from planned
  meals only, separately from actual Eaten nutrition. Show a clearly labeled daily
  planned summary for the selected local date, using the existing date navigation
  and shared calorie/protein/carbohydrate/fat styling where suitable.
- Use authoritative stored plan nutrition and each planned portion. Reuse
  `src/utility/plannedMealNutrition.ts` and the current plan/version contracts;
  recipe-level supplied macros must remain source-provided. Do not derive a past
  plan from today's recipe contents or ingredient estimates when its snapshot
  already contains the prescribed values.
- Keep this summary independent of Eaten totals, calorie-remaining calculations
  and actual progress. Rendering a summary must not log intake, mutate groceries,
  regenerate plans or rewrite historical prescriptions. Planned entries hidden
  from the compact list after linked logging must not silently disappear from a
  prescription-based daily summary simply because their display row is hidden.
- Define and document whether the summary represents the complete daily
  prescription or remaining active meals before finalizing it. Specify skipped,
  logged, unresolved and missing-nutrition treatment explicitly. Missing values
  must remain visibly unknown/partial; never present an incomplete sum as a
  complete total or treat an absent plan as zero intake.
- Acceptance: navigate between days and accounts; verify fractional portions,
  skipped/unresolved/missing entries, linked versus independent Eaten records,
  and edited plan versions. Half a Korean Beef Bowl contributes 280 kcal,
  22.5 g protein, 29 g carbs and 8 g fat when those values are stored in the plan.
  Old prescriptions retain their historical values until explicitly edited.
  Confirm planned and Eaten summaries cannot double-count one another and that
  changes to a plan do not alter saved Eaten history. Cover calculations with
  focused utility tests and the date/status behavior with page/browser tests.
- Starting points: `src/app/nutrition/page.tsx`,
  `src/components/nutrition/MealRow.tsx`, shared `NutritionPills`,
  `src/utility/plannedMealNutrition.ts` and existing plan snapshot mapping/tests.

**Saved meals primary action: Add to plan**

- User request: change the Saved meals card's primary **Log** action to
  **Add to plan**. This supersedes the previously selected Log + card footer for
  this location. Keep the Pencil/Archive controls and their permissions, focus
  behavior and touch targets; duplication remains removed.
- Wire the new action through the existing atomic planning intent and
  authenticated repository path. Review the chosen recipe, positive serving
  quantity, selected local date and intended meal slot before confirmation.
  Saved cards are outside a fixed-slot group, so reuse an appropriate slot
  selection/review rather than guessing the destination. The exact confirmation
  presentation remains to be designed consistently with existing reviews.
- Retain goal/diet/trusted-nutrition restrictions, supplied macro scaling,
  plan-version checks, stable retries and grocery reconciliation owned by the
  current planning transaction. Disable pending controls, preserve failed input,
  and report success only after the authoritative response.
- Acceptance: the Saved primary action creates a planned recipe/portion on the
  chosen day/slot and creates no Eaten intake. Test cancel, invalid/fractional
  quantities, planning ineligibility, stale recipes/plans, failed or lost-response
  retries, focus return and narrow layouts. Verify Korean Beef Bowl's supplied
  macros, and preserve direct **Log meal** in meal-entry reviews plus **Log** on
  planned rows. Update tests that currently expect Saved-card Log confirmation;
  do not remove independent logging actions globally.
- Starting points: Saved footer and confirmation state in
  `src/app/nutrition/page.tsx`, `RecipeCard.tsx`, `RecipePortionReview.tsx`,
  `src/contexts/AppContext.tsx`, existing `add_planned_meal` bindings and the
  authenticated browser scenarios in `e2e/mvp1-release.spec.ts`.

**Custom workout libraries separate from existing options**

- User request: add customized workout libraries separate from the currently
  available workout options. Existing custom routine authoring, immutable
  versions and completed sessions are already implemented; inspect and reuse
  those capabilities instead of treating all custom workout support as missing.
- Provide a distinct area/group for the signed-in user's custom workouts while
  preserving access to the existing built-in options. Reuse the current design,
  navigation, routine editor, exercise catalog and workout assets. No social,
  public sharing or third-party library functionality was requested.
- Resolve the library organization before adding storage: one custom library
  versus multiple named collections, how existing custom routines appear, and
  whether creation, editing, removal or selection/scheduling need new entry
  points. These choices are not yet specified by the user. Prefer reuse of
  existing records and authorized actions; add schema/RPC work only if the
  chosen behavior requires it and follow the migration authorization gate.
- Preserve owner-only persistence, authoritative confirmation, failed-save draft
  recovery and immutable routine/session versions. Editing a library routine
  must not rewrite completed workout history or silently change existing plan
  prescriptions. Retain equipment, duration and experience safeguards wherever
  the custom routine participates in planning.
- Acceptance: built-in and custom options are clearly separated; existing custom
  routines remain available after reload; accounts cannot read or edit one
  another's library. Exercise the supported create/edit/select/start and any
  approved archive/remove flows, pending/failure recovery, keyboard/focus,
  320px/large text and reduced motion. Verify an edited routine starts with the
  intended version while past sessions retain their original contents.
- Starting points: `src/app/workouts/page.tsx`,
  `src/app/workouts/custom/page.tsx`,
  `src/app/workouts/session/[id]/page.tsx`, workout domain/repository contracts,
  and the existing custom routine/session coverage described in `MVP3_HANDOVER.md`.

### Deferred scope, not active defects

- Automatic native health/device step sync; manual steps are implemented.
- Reminder delivery beyond the persisted opt-in preference; richer reminders remain later work.
- Service-worker/offline mutation synchronization; offline input recovery does not silently queue durable writes.
- Voice, barcode, pantry and other broader backlog features.
- Automatic calisthenics progression for named custom movements/Pilates, and energy estimates for those sessions.
- Walking energy increasing calorie targets; it remains a separate uncertain estimate.
- Broader optimization of legacy read-model adoption; keep focused history/export boundaries and avoid unbounded snapshot growth.

## 5. Architecture and persistence invariants

### Ownership boundaries

- Components/routes express intent; Context actions and typed repositories own persistence. Pure utilities own calculations, conversions, plan selection and validation.
- Supabase is the durable authority. Only confirmed repository/RPC results update persisted UI/cache state. Offline or provider failures must retain input and display that it is unsaved.
- Recipes are `Meal` records with ingredients, instruction text in `notes`, reference, optional `totalTimeMinutes`, complexity, image and optional `providedNutrition`.
- Generated contracts are in `src/types/database.generated.ts`; domain contracts in `domain.ts`; focused RPC/read contracts in `backend.ts`. Image clients use `recipeImageDatabase.ts`.
- Main state/persistence locations: `src/contexts/AppContext.tsx`, `src/services/repository.ts`, `supabaseRepository.ts`, `supabaseSnapshot.ts`.
- Eaten nutrition is a saved snapshot. Future recipe, target, portion, catalog, plan or grocery changes must not rewrite it.
- Local-date keys are `YYYY-MM-DD`; events use ISO timestamps. Missing intake is unknown, not zero.

### Mutation and retry boundaries

- Authoring uses `saveRecipe` → `save_recipe`, not an ad hoc table write. Pending foods, ingredients, metadata and applicable grocery reconciliation commit atomically.
- Keep expected recipe/grocery/plan/catalog-preference revisions. Stale saves preserve the draft and require review/refresh/reapply rather than a silent overwrite.
- `add_planned_meal` adds prescriptions; `log_planned_meal` records actual intake and links it. Retry keys belong to the original intent, not a newly normalized ingredient payload.
- Supplied-macro logging reads stored per-serving values on the server. Retries replay authoritative results even when recipe metadata changes later.
- Favorites have their own revision and retained false rows. Their desired-state writes must not regenerate plans, rebuild groceries, edit recipes or increment counts twice.
- RLS and authorized wrappers enforce caller ownership; direct-table writes remain denied. Preserve explicit grants/revokes, controlled search paths, input validation and anonymous/cross-user denial tests.

### Draft compatibility

`src/services/draftStore.ts` uses account-scoped IndexedDB/local-storage envelopes. Recipe drafts use `recipe:new` or `recipe:<meal ID>` and a seven-day expiry. Drafts retain invalid text, selections, source/review state, base versions and pending retry identity. Missing/blank legacy complexity becomes Medium; supported values stay; unsupported values fail validation. Medium alone must not make a blank creation form recoverable. Do not migrate obsolete duplicate drafts into Create or Edit. Confirmed sign-out/account deletion clears only the intended account's cache/drafts.

### Image lifecycle

- Image variants: registered `asset`, validated HTTPS `url`, private `upload` path, or null/default. Persist stable paths/IDs, never signed URLs.
- Still JPEG/PNG/WebP input: up to 5 MB and 25 million pixels. Authenticated same-origin upload handling sanitizes/re-encodes via pinned Sharp to at most 1600px WebP with metadata removed.
- `recipe-covers` is private. Owner-scoped signed GET URLs last one hour; cover refresh occurs after 45 minutes or retry. External URLs load directly without referrer data; failure returns to fallback.
- Unattached registrations older than eight days are eligible for cleanup during subsequent uploads; referenced/archived covers are protected.
- Account deletion queues private deleted-image jobs atomically. The separate worker drains at most 100 leased jobs, removes actual objects through Storage API, then acknowledges. Failure keeps work retryable after the ten-minute lease.
- Entry points: `src/app/api/recipe-images/route.ts`; `src/services/recipeImages.ts`, `recipeImageServer.ts`; `supabase/functions/recipe-image-cleanup/{index,handler,handler.test}.ts`.
- The cleanup entry point currently accepts POST with exact service-role bearer authorization. Confirm gateway authentication compatibility and secret scheduling using current platform guidance before deployment. Do not expose the key to clients or put it in a public environment variable. No cleanup-worker configuration stanza/schedule is present in the inspected local configuration.

## 6. Database history and migration handover

The recipe delivery committed **22 existing forward migration files**, added to the previous 47-file baseline. It did not reapply them while organizing Git. Names, ordering and original migration content were preserved; correction files remain in sequence. That original release contained **69** versions. The later authorized October 13 correction brings linked/local history to **70**; preserve the original files.

| Migration stage | Files in chronological order |
|---|---|
| Atomic planning | `20261007034332_add_planned_meal_transaction.sql`; `20261007035159_fix_add_planned_meal_date_binding.sql`; `20261007035326_fix_add_planned_meal_column_binding.sql`; `20261007040232_reject_ai_only_planned_foods.sql` |
| Plan-linked intake | `20261007044520_link_logged_planned_meals.sql` |
| Authoring and corrections | `20261008074630_recipe_authoring.sql`; `20261008075514_fix_recipe_food_validation.sql`; `20261008080508_fix_recipe_account_cleanup.sql`; `20261008082400_validate_recipe_instruction_type.sql` |
| Time/images/card metadata | `20261009065053_recipe_total_time.sql`; `20261011080358_recipe_cover_images.sql`; `20261012020032_recipe_card_metadata.sql`; `20261012021408_harden_recipe_card_rpc.sql` |
| Catalog and supplied values | `20261012030943_creamy_lemon_chicken_catalog.sql`; `20261012041322_korean_beef_and_personal_catalog.sql`; `20261012065031_recipe_provided_nutrition.sql`; `20261012065733_fix_provided_recipe_portion_unit.sql`; `20261012070212_harden_personal_recipe_controls.sql`; `20261012070613_serialize_provided_recipe_logs.sql` |
| Final defaults/retry isolation | `20261012081211_recipe_complexity_default.sql`; `20261012083355_isolate_planned_recipe_log_retries.sql`; `20261012083815_qualify_planned_log_operation.sql` |

Do not edit, rename, squash, delete or reorder an applied migration to fix formatting or history. A diff whitespace check reports trailing blank lines in four existing migration files; preserve them. Corrections require new forward migrations.

Before any new linked change, follow `AGENTS.md` and `ARCHITECTURE.md`: inspect status/history/dry-run; prove schema equivalence including data, function bodies, constraints, indexes, policies, grants and triggers; stop if equivalence is uncertain; record any justified repair; rerun dry-run; apply only the verified authorized pending set. Never use blind pulls, force flags, `--include-all` or guessed repairs. Recheck deployed RLS/RPCs, types, replay and history afterward. Prior authorization covered the completed rollout, not arbitrary future migration work.

Reusable read-only evidence scripts: `scripts/release-schema-fingerprint.sql` and `scripts/recipe-release-history.sql`. The history script compares counts/digests with deliberate field/catalog exclusions; read the query before interpreting equivalence and add a purpose-specific check when changing excluded facts. Aggregate results and before/after comparison are evidence; raw query/account output stays local.

### Recorded remote rollout evidence

`SUPABASE_SETUP.md` sections 10–12 record 61 → 66 → 69 history agreement, matching 12 schema fingerprint groups, no pending dry-run changes, regenerated linked types and rolled-back deployed test suites. The final release records 15 null complexities backfilled to Medium while configured choices stayed, and unchanged historical nutrition/plan/ingredient digests. Account-record counts are dated release evidence, not expected live totals. That was the handover-preparation checkpoint. Section 13 records the later explicitly authorized October 13 linked correction; no history repair or hosted client deployment was performed.

## 7. Verification evidence and limits

The following results are from the latest commit-organization/verification task, **not rerun on October 13 solely to write this file**.

| Gate | Recorded result and qualification |
|---|---|
| TypeScript | Passed at committed checkpoints and again after final test-only correction |
| ESLint | Passed for final application source and after test correction |
| Application tests | 297 tests across 42 files passed on final production source checkpoint |
| Repository integration | 14 authenticated local Supabase scenarios passed |
| Clean local replay | 69 migrations applied in order |
| Database tests | 23 SQL suites / 814 assertions passed |
| Database lint | No errors; existing unused `p_payload` warning in `claim_deleted_recipe_images` |
| Generated types | Public schema/RPC contract agreement after normalizing generator formatting/null representation |
| Production build | Passed in the clean normal branch checkout |
| Browser regression | 56 distinct recipe/nutrition scenario executions passed across desktop/mobile: 28 scenarios × 2 projects, including 320px checks, enlarged text, focus/tooltips, reduced motion, draft recovery and retries |
| Content/delivery audit | 70 commits covered the 76-entry plan; 129 changed files; 22 migration files preserved; zero tracked `output/` files; no added environment files or secret-pattern findings |
| Merge verification | Fast-forward required no conflict resolution or source changes; local/remote main and feature branch matched the reviewed baseline |

Browser result interpretation: the initial broader run had **52 passes and 4 failures** (two outdated retry scenarios on both viewports). The scenarios selected a retired catalog recipe. The final commit selects the active planned recipe instead. Focused rerun passed **8/8**, comprising six scenario executions (the two retry scenarios and Korean Beef personal controls/macros on both viewports) plus setup/teardown. Thus the 56 distinct scenarios passed across the original and correction runs; do not claim a single uninterrupted 56-pass final run.

The correction commit changed only browser-test selectors. Production code remained identical to the passing 297-test/build checkpoint. The complete public browser suite, local email delivery, generic RPC/concurrency scripts, every older feature scenario, live providers and hosted acceptance were not all freshly rerun during that packaging task. Full current-main CI/release coverage remains a next action.

### Tooling/environment issues already understood

- An isolated Git export with a junction to dependencies outside its root could not build because Turbopack rejected the external junction. Building from the clean normal checkout passed. Use a normal checkout with its own dependencies for build validation.
- Earlier sandboxed filesystem/process operations sometimes needed execution access. Distinguish `EPERM`/environment failures from application test failures; record the actual blocker and rerun safely.
- CLI 2.118 status may omit `API_URL`; the local test runner falls back to the storage URL's origin while retaining the exact local-backend check. Do not remove that guard or copy raw CLI status into documentation because it contains keys.
- Nutrition tests must select active planned recipes, not retired “Chicken & Rice Plate” fixtures. Retired IDs still resolve where historical references require them.

## 8. Local setup and repeatable checks

### Environment

Workspace used here: `C:\Users\Brylle\Documents\01 Mobile Development\untitled-exercise-meal-app`; shell PowerShell. This is a responsive **Next.js web app**, not an Expo project. Package versions at baseline: Next `^16.3.4`, React `^19.2.8`, TypeScript `^6.0.3`, Supabase CLI `2.118.0`, Playwright `1.58.2`, Sharp `0.35.4`. Use the lockfile and CI's Node 22 baseline; avoid opportunistic dependency upgrades.

Use `.env.example` for names only. Real values belong in ignored local/server secret management. Client-safe variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`. Server-only provider values include `USDA_FDC_API_KEY`, `DEEPSEEK_API_KEY`, `USDA_FDC_RELEASE`, optional `DEEPSEEK_NUTRITION_MODEL`; worker credentials remain server-only. Never print credentials, read private environment contents into reports, or add provider/service-role keys to `NEXT_PUBLIC_*`.

The user's app historically used port **3000** with the shared backend. Do not assume it or Docker is still running. Preserve any server another task started. Automated authenticated browser checks use **3030** and disposable local Supabase at **127.0.0.1:56321**. Local database port is **56322**, Studio **56323**, Mailpit **56324**. The runner rejects port 3000 and non-local backends for release browser tests. If future Expo work is requested, reserve 8081 for the user's manual server and use an explicit automation port such as 8082.

### Command sequence

Inspect state first; do not discard changes from the user or another agent:

```powershell
git status --short --branch
git log -5 --oneline
git rev-parse HEAD
```

On a fresh checkout install dependencies with `npm ci`. Read the relevant installed `node_modules/next/dist/docs/` guide before changing Next-specific behavior. For library/API/CLI work use the repository's Context7 resolve/query workflow; straightforward local refactoring or handover review does not require inventing new external API behavior.

Application gates:

```powershell
npm run typecheck
npm run lint
npm run test:local
npm run build
```

Local backend gates (Docker required). **Reset is destructive to the disposable local stack**; ensure local test data may be replaced. Never direct it to the shared project:

```powershell
npm run supabase:start
npm run supabase:reset
npm run supabase:migrations
npm run supabase:lint
npm run supabase:test
npm run supabase:test:rpc
npm run supabase:test:concurrency
npm run test:repository
```

`npm run supabase:types` targets the **linked** backend and overwrites tracked generated types. For local schema comparison, generate to a temporary ignored file using the pinned CLI's documented local options, then compare public contracts. Check command help/current guidance before use; do not replace linked-generated contracts blindly because formatting and JSON null representation can differ.

Browser gates:

```powershell
npm run test:e2e:release
npm run test:e2e:public
npm run test:email:local
```

The release runner selects desktop/mobile, injects local client-safe configuration, defaults to 3030, disables reuse of an existing server and serializes account scenarios. It forwards test arguments for focused reruns. `playwright.config.ts` uses one worker, 1440×900 desktop / 390×844 mobile, auth setup/teardown and a no-skips reporter. Dedicated scenarios temporarily exercise 320px/large-text/reduced-motion settings. Provider responses are mocked. Public tests default to port 3000 unless configured separately: choose an available dedicated `PLAYWRIGHT_BASE_URL` when needed. Run the email gate alone because it temporarily changes local confirmation configuration and restores it.

The CI workflow `.github/workflows/ci.yml` runs on main pushes and pull requests. `web` includes typecheck/lint/local tests/build/public browsers; `integration` includes disposable database reset/history/lint/SQL/RPC/concurrency/repository/authenticated browsers. Read workflow results for the exact SHA rather than assuming that its presence means success.

Remote RPC/provider smoke scripts have exact-project/account guards. Inspect `scripts/remote-test-env.mjs`, the respective runner and setup documentation before use. They can write disposable fixtures and need the authorized target/accounts; do not run them just to create this handover or substitute a retained real account.

### Minimum scenario checklist for future recipe changes

- Saved/Planned, personal/predefined, long titles, fractional yields, missing image/time, zero time, Easy/Medium/Hard, archived reference, food-only/unresolved/skipped cases.
- Korean Beef card stays approximately 560 kcal and yield 4 while planned/logging quantity varies; actual logs scale all four provided macros exactly.
- Overview open/close, edit focus return, Log confirmation/cancel/failure, archival, tooltips, favorite pending/error/retry, Favorite/Popular precedence, no Duplicate control.
- Create/Edit restored drafts, invalid/blank fields, failed/stale saves and refresh/reapply, blank Medium-default draft, ingredient-method switching, provider failure retaining input.
- Popular boundaries, ties, grouped ingredients, serving changes, planned-only exclusion, deleted logs, archives and retry counts.
- Upload/URL/reset/fallback, reload/signed URL refresh, ownership denial, pending attachment and cleanup lease/removal failures.
- 320px and desktop, enlarged text, no horizontal overflow, keyboard order/focus, touch targets, reduced motion.
- Cross-user/anonymous/direct-write denial, expected revisions, stable retry keys, export/deletion, unchanged historical nutrition/plans/groceries where applicable.

## 9. Evidence and Git navigation

Reconstruct the complete latest source delivery from any clone:

```powershell
git log --reverse --oneline b53532374c37a1abf732aae61317e2382e01e6ce..facf324bcc055fffc8021e3b6cfca5b8c9b57f72
git diff --stat b53532374c37a1abf732aae61317e2382e01e6ce facf324bcc055fffc8021e3b6cfca5b8c9b57f72
```

The approved target was 76 commits. Catalog definitions/registration/plan rules (entries 42–44) were consolidated to avoid broken dependencies; Nutrition page integration (56–61) was consolidated because its state/controller/render paths are intertwined. That produced 69 commits, plus the isolated retry-test correction = 70. Intermediate superseded designs or temporary duplication were not reintroduced for commit granularity.

| Local evidence path | Contents / caveat |
|---|---|
| `output/commit-review/COMMIT_REVIEW.md` | All 70 hashes/subjects, per-commit files/stats, final file summary and verification details. Its “no push” header is historical pre-review status; the later push/merge supersedes it |
| `output/commit-review/commits.json` | Machine-readable ordered commit manifest, including plan-entry consolidation |
| `output/commit-review/final-verification.json` | Final browser correction/coverage interpretation and verification qualifications |
| `output/commit-review/audit.json` and adjacent logs | Input/content audit, migration preservation records, type agreement, database/build/repository/browser results; pre-push timestamps/status are historical |
| `output/recipe-catalog/verification.md` | Earlier recipe time/image/favorite/catalog rollout evidence |
| `output/korean-beef-bowl/verification.md` | Korean Beef/source-macro/personal controls rollout evidence |
| `output/recipe-card-refinements/verification.md` | Medium-default/card footer/planned retry rollout evidence |

`output/` is Git-ignored and not present in a fresh clone. Sanitized release summaries are committed in `SUPABASE_SETUP.md`; commit history/source/tests remain available remotely. Do not add local screenshots, downloaded datasets, database query output, account records, auth state, generated scratch files or raw logs to Git. Production covers, curated ingredient JSON, reusable scripts and supplied design references under `assets/` are intentionally tracked.

## 10. Suggested next-agent opening and completion discipline

1. State the selected pending task and assumptions; inspect actual branch/status and relevant source before editing.
2. Check current-main CI and hosting state read-only. Record evidence with exact SHA and client-facing date/time in Asia/Manila.
3. If continuing release work, determine whether existing user authorization covers the concrete deployment, linked mutation or email check. The explicit SMTP deferral remains meaningful. Prepare reviewable work before any required final approval.
4. If fixing a defect, use a `codex/` feature branch, preserve unrelated work, implement the final supported behavior, add focused regression coverage, and update the owning documents.
5. For database work, complete local replay/security/type verification and migration-equivalence preflight before any approved linked change. Preserve all applied history.
6. Report changed files, actual commands/results, remaining limitations, fixture cleanup, and what was committed/pushed/deployed separately. Never promote historical evidence into a fresh passing result.
7. Update this handover's pending table and dated evidence when a task finishes. Keep the earlier results identifiable rather than replacing them with an undated “all tests pass.”

No commit, push, migration, deployment, external message, or release tag is requested merely by creating this guide. This handover file is prepared for review in the current workspace.
