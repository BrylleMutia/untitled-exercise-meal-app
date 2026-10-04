# MVP-3 handover — Everyday Usability and Choice

Handover date: **2026-10-04**. Original implementation/release evidence:
**2026-10-01**. Proposal: **2026-09-30**.

## Delivery summary

The requested MVP-3 implementation is complete and locally verified. The shared
Supabase schema rollout is complete. **MVP-3 release sign-off is pending**:
hosted app deployment, staging email evidence, and final hosted acceptance remain
open. Staging SMTP was explicitly deferred by the user; do not treat it as passed.

Source is packaged on `codex/mvp-3-handover`, based on `main` at
`3cdd4d757916f00b2b4750e4e78c027d609c6fba`, for the existing origin repository
[`BrylleMutia/untitled-exercise-meal-app`](https://github.com/BrylleMutia/untitled-exercise-meal-app).
The ordered manifest below identifies each change and its exact files/hunks.
Use `git log --reverse --oneline 3cdd4d7..codex/mvp-3-handover` to inspect the
complete candidate, including the final documentation commit. Packaging/pushing
this branch does not merge `main`, deploy the app, or create a release tag.

**Git delivery status:** the user approved the exact GitHub destination on
2026-10-04. The 35-commit candidate is published to
[`codex/mvp-3-handover`](https://github.com/BrylleMutia/untitled-exercise-meal-app/tree/codex/mvp-3-handover)
at `https://github.com/BrylleMutia/untitled-exercise-meal-app.git`. The initial
automatic approval block was resolved by that explicit approval. Review/CI,
merge, hosted deployment and release sign-off remain pending.

## Document ownership

| Document | Handover responsibility |
|---|---|
| [README.md](./README.md) | Entry point, local commands, current release boundary and demo location |
| [FEATURES.md](./FEATURES.md) | Implemented product behavior, estimates, restrictions and history guarantees |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Typed intents, authoritative writes, versioning, security and read-model contracts |
| [DESIGN.md](./DESIGN.md) | Current surfaces, interaction feedback, accessibility and motion |
| [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) | Applied schema, operational commands, confirmation template and staging procedure |
| [MVP_Priority_Matrix.md](./MVP_Priority_Matrix.md) | Detailed dated tests, schema fingerprints, release gates and historical RC3 evidence |
| [AGENTS.md](./AGENTS.md) | Mandatory workflow and routing to these documents |
| This document | Completed/pending checklist, handover operations and granular commit manifest |

Source, migrations, generated contracts and tests remain implementation truth.
The historical MVP-2/RC3 record is retained; its test counts and release status
must not be substituted for MVP-3 verification.

## Completed implementation

| Change | Delivered behavior | Main implementation locations |
|---|---|---|
| Fresh-browser sign-in | Confirmed auth uses full document navigation; account snapshot loads before onboarding decisions; load failures expose retry | `src/app/auth/`, `src/components/auth/AuthCompletion.tsx`, `src/contexts/AppContext.tsx`, `src/components/layout/AppShell.tsx`, `src/lib/supabase/proxy.ts` |
| Confirmation resend | Existing resend action exercised with actual local signup/resend delivery, fresh-browser confirmation and invalid/reused links; safe return paths | `e2e/confirmation.spec.ts`, `scripts/run-email-confirmation-test.mjs`, `supabase/templates/confirmation.html` |
| Onboarding hierarchy | About you, Movement, Food choices, Your goal, Review; plain explanations and focusable step headings | `src/app/onboarding/page.tsx` |
| Meal-cost labels | Budget-friendly=4, Balanced=7, Flexible=no cap; relative cost, not prices; saved nonstandard numeric values preserved | Onboarding, `src/utility/mealPlan.ts` |
| Final onboarding save | Labeled saving state, duplicate prevention, retained failure draft, confirmed-save navigation | Onboarding and repository/Context intents |
| Manual daily steps | Owned local-date entries, edits/deletion, optional walking minutes, explicit zero distinct from missing, stale/retry protection and offline draft | `src/app/activity/page.tsx`, `src/utility/dailySteps.ts`, daily-activity migrations |
| Walking estimate | Broad 2.8–3.8 MET range only with minutes and eligible profile/weight; outward-rounded uncertainty; ages 19–59; separate from workout energy and food target | `src/utility/walkingEnergy.ts`, Activity |
| Calories remaining | Reducing ring on Home/Nutrition; unlogged, partial, estimated, over-target and unavailable-target states | `src/components/ui/CalorieBudgetRing.tsx`, `src/utility/calorieBudget.ts` |
| Historical target dates | Effective target selected per local date; bounded current-week target versions; future changes do not rewrite earlier summaries | `src/utility/targetHistory.ts`, `src/services/supabaseSnapshot.ts` |
| Home quick actions | Reachable links to log food, steps and activity | `src/app/page.tsx` |
| Pilates | Deterministic foundations program respecting experience, equipment, days/time, warm-up/rest/cooldown and safety; existing media retained | `src/utility/plan.ts`, onboarding and Workouts |
| Custom routines | Catalog or named text-only movements, validated dose/time, reusable immutable versions; named movements have no automatic progression | `src/app/workouts/custom/page.tsx`, `src/utility/customWorkouts.ts` |
| Custom session history | Start/pause/resume, actual reps/holds/sets/RPE/notes, partial completion; copied planned prescription survives edits; export and deletion supported | Custom route, repositories, custom-workout migrations |
| Diet choices | Low-carb ≤130 g/day and Keto-style ≤50 g/day **total carbohydrate**, vegetarian/vegan combinations, deterministic/server enforcement, unresolved infeasible slots | `src/utility/health.ts`, `src/utility/mealPlan.ts`, program/diet migration |
| Trusted meal expansion | Six reviewed USDA foods and four ingredient-based meals, serving/provenance and relative cost/prep assumptions | `src/constants/mvp3Catalog.ts`, `src/constants/mvp3FoodSources.json`, catalog scripts |
| Interaction feedback | Shared pressed/focus/invalid/loading behavior, 44px button targets and brief reduced-motion-safe transitions | `src/components/ui/Button.tsx`, `src/app/globals.css` |
| Optional milestones | Off by default; saved first workout/food/step and distinct-day participation; no rest-day or calorie penalties | `src/utility/milestones.ts`, Home and Settings |
| Durable contracts | Typed intents and semantic events, refreshed state, ownership, idempotency, stale revisions, sanitized stable errors; no silent offline write queue | `src/types/`, `src/services/`, `src/contexts/AppContext.tsx` |
| Shared database rollout | Seven forward migrations applied with authorization; generated types and deployed ownership/RPC behavior verified | `supabase/migrations/20261001*.sql`, matrix evidence |
| Product tour | Reviewed 5:02, 1080p demo with captions, chapters and original quiet background music | `scripts/*demo*`, ignored `demo-video/` |

Health, food targets and energy are estimates. Keto-style is a product planning
label, not a promise of ketosis or dietary care. Unresolved slots mean the day
is not fully planned. Logged history remains independent of future plan edits.

## Pending release work

Owners below are suggested roles for handover; no task has been assigned to an
individual and no external notification has been sent.

| Priority / suggested owner | Remaining task | Acceptance evidence |
|---|---|---|
| P0 / maintainer | Review the granular branch, run CI on the exact candidate, then merge through normal review | Both CI jobs green on the reviewed source; record branch/PR and exact SHA. Feature-branch push alone does not trigger current CI; a PR does |
| P0 / deployment owner | Deploy the reviewed app to staging/hosting with the correct server-only environment | Hosted candidate URL and source SHA; successful authenticated load, no missing RPC/contract errors; secrets remain in environment management |
| P0 / Auth owner | Configure hosted Confirm signup token-hash template, HTTPS Site URL and allowed redirects | Match the reviewed `supabase/templates/confirmation.html`; operational procedure in Supabase setup section 9 |
| P0 / Auth + QA | Resume the deferred staging SMTP delivery check | Actual inbox receipt for signup and resend, confirmation in another browser, safe invalid/reused links and redirects, timestamp/environment/template, disposable-account cleanup; never record live tokens |
| P0 / QA | Recheck hosted mobile/desktop primary loop and MVP-3 states | Fresh-browser existing-account sign-in; onboarding failure/retry; steps/offline draft; calorie ring states; Pilates/custom history; diet infeasible states; keyboard, large text, reduced motion and narrow overflow |
| P0 / release owner | Record final sign-off and release packaging | Link exact candidate/deployed SHA and required evidence, green resulting-main CI, approved tag/version; do not infer release readiness from old RC3 evidence |
| Operational / Auth owner | Review the existing disabled leaked-password protection setting and platform availability | Document the decision/settings; no Auth security setting was changed during this handover |

No additional MVP-3 feature implementation is currently identified as pending.
If hosted checks expose a defect, fix it and add forward migrations only when
needed; follow the existing migration safety procedure.

### Deferred or intentionally excluded

- Automatic step/device sync: manual input ships now; native health integrations
  require a later platform project.
- Automatic progression for named custom movements and Pilates through the
  calisthenics progression engine is excluded from this implementation.
- Walking energy does not increase the calorie budget; custom/Pilates sessions
  do not receive the existing calisthenics energy estimate.
- Service-worker/offline synchronization, richer reminders, voice/barcode/pantry
  features and other broader backlog ideas are outside the MVP-3 sign-off list.
- Hosted SMTP/recovery/provider launch checks are operational gates; local
  mocks and the demonstration video do not establish delivery/provider health.

## Verification and confidence

### Recorded implementation evidence — 2026-10-01

| Check | Recorded result |
|---|---|
| Clean local database reset | All 46 migrations applied in order |
| Database lint | No warnings/errors |
| pgTAP | 11 suites, 475 assertions passed |
| Pure/domain tests | 21 files, 96 tests passed |
| Repository scenarios | 8/8 passed, including real competing step/routine/session edits |
| Typecheck / lint / production build | Passed; build had 21 routes and 21 exercise assets |
| Authenticated browsers | 34/34 at 1440×900 and 390×844, including setup/cleanup |
| Public browsers | 4/4 passed |
| Date/history follow-up | Affected-route browser rerun 10/10 and repository 8/8 |
| Local email | Mailpit delivery/resend/link test 1/1 passed; local config restored |
| Shared schema | 46 local/remote versions and 12 fingerprint categories matched |
| Shared RPC/RLS | 39 rollback-only native assertions passed; zero fixtures remained |
| Demo | Full video decoded; chapter/contact-sheet visuals inspected |

Detailed commands, fingerprints, limitations and advisor findings are in the
matrix. External nutrition providers are mocked in the current browser suite.
Earlier RC3 provider evidence retains its original date. Staging SMTP is unverified.

### Handover checks — 2026-10-04

| Fresh check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test:local` | 21 files / 96 tests passed |
| `npm run build` | Passed, including TypeScript; 21 routes and 21 copied exercise assets |
| `git diff --check` | Passed |
| Commit manifest preflight | All 85 changed/new files classified into 35 groups; four deliberate partial-staging groups validated |
| Artifact exclusions | Environment, demo credentials, raw tooling/test results and generated video confirmed ignored |
| Packaging audit | First 34 commits match all 77 source/test/migration files; working-tree content preserved byte-for-byte, including all seven applied migrations; eight handover documents remain for commit 35 |
| Documentation checks | Local Markdown file links resolve; whitespace checks pass; original historical evidence retained |

The initial sandboxed lint/test attempts hit local filesystem/process `EPERM`
restrictions; both reruns with the necessary execution access passed. There was
no application test failure in those blocked attempts. The October 1 database,
browser and delivery evidence above is not represented as a new run. Hosted CI
on the final candidate remains a separate release gate.

## Operations for the next developer

1. Read README and the owning feature/architecture/design sections, then this
   release checklist. Inspect `git status --short` before changing the checkout.
2. Use `npm ci`, ignored local environment files, Docker and the pinned Supabase
   CLI. The disposable backend is `http://127.0.0.1:56321`; Mailpit is port 56324.
3. Run `npm run supabase:start`. A **local-only**, destructive reset is
   `npm run supabase:reset`; use it only for the disposable local database.
   The shared database already has these migrations. Git push is separate from
   database push; do not run a shared schema push to reproduce this handover.
4. Static gates: `npm run typecheck`, `npm run lint`, `npm run test:local`,
   `npm run build`. Database gates: `npm run supabase:lint`,
   `npm run supabase:test`, RPC and concurrency scripts in README.
5. Run repository, public and authenticated browser tests with the local stack.
   Run `npm run test:email:local` **alone**: it temporarily enables confirmations,
   restores local config, and leaves the reduced stack running.
6. Current CI has `web` and Docker-backed `integration` jobs. It runs on PRs and
   pushes to `main`; the local confirmation runner is a separate manual gate.
7. Under memory pressure retain database/Auth/PostgREST/Kong/Mailpit. The pinned
   local PostgREST 14.5 intermittently reported `JWT issued at future`; restarting
   only the local REST container resolved the recorded runs. Keep JWT checks on.
   Use `npm run supabase:start` to restore optional services as needed.

All seven MVP-3 migration files are already applied. Do not rename, reorder,
delete or edit them. Shared changes require a new forward migration, exact schema
comparison, history/dry-run review and explicit authorization under AGENTS.md.

## Demo handover

The local artifacts are `demo-video/Cali-product-demo.mp4`, its SRT captions,
viewing README and chapter preview. Duration 5:02, 1920×1080, H.264 at 25 fps,
AAC audio, 20 embedded chapters including intro/outro. All data is disposable
local sample data. These generated binaries are intentionally outside Git.

To reproduce on the current Windows tooling:

1. Start disposable local Supabase and install Playwright Chromium with
   `npx playwright install chromium`. Ensure exercise assets exist (normal
   `npm run dev`/`npm run build` copies them).
2. In a dedicated terminal run `node scripts/run-demo-server.mjs` on port 3000.
   It guards the local backend and sets process-scoped public config; no hosted
   account should be used. Do not stop another task's server to claim this port.
3. Run `node scripts/record-demo.mjs --fresh`. Targeted recapture supports
   `--resume=N` / `--only=N`; recordings/manifest go under `test-results/demo/`.
   The demo account is retained locally for viewing; credentials are in ignored
   `playwright/.auth/demo-account.json`. Never commit or share that file.
4. The renderer requires Python with Pillow, `imageio_ffmpeg` importable from
   `test-results/demo-tools/` (or the active Python environment), and Windows
   Segoe UI fonts in `C:/Windows/Fonts`. Install packages in local tooling only;
   they are not application runtime dependencies.
5. Run `python scripts/render-demo.py` with that Python interpreter.
   `--reuse-clips` reuses existing encoded clips. Share the reviewed output video,
   captions and guide separately; review again after any new recording.

Ignored material includes `.env*.local`, credentials/storage states, raw test
artifacts, caches, generated video/media and local render dependencies. The
commit manifest packages only source, tests, forward migrations and docs.

## Ordered commit and impacted-file manifest

There are **35 logical commits**. They are ordered by dependency; the seven
migration commits retain their exact existing order/content. Small calculations,
UI features, tests and demo tooling are independently reviewable. The Context,
repository and required snapshot contracts land together because splitting
their types from their implementations would create inconsistent contracts.

Files listed in multiple commits are deliberately split by hunks: auth versus
MVP-3 Context/AppShell changes, additive domain definitions versus required read
models, daily view versus milestones, and release versus confirmation browser
configuration. The working-tree file content is preserved throughout staging.
The manifest describes logical review boundaries; intermediate commits are not
individually certified release candidates. Verification applies to the complete
candidate and the dated evidence above.

<!-- COMMIT_MANIFEST -->

### 01. fix(auth): hydrate existing accounts after fresh-browser sign-in

Full document navigation, safe return paths, account hydration failure/retry, and the fresh-browser regression. AppContext and AppShell contain only auth hunks here.

Commit: `8da46051b1a6e2251cf2c232380c4f67dcb39ca7`.

Impacted files:

- `src/app/auth/actions.ts`
- `src/app/auth/confirm/route.ts`
- `src/app/auth/sign-in/page.tsx`
- `src/app/auth/sign-up/page.tsx`
- `src/app/auth/update-password/page.tsx`
- `src/components/auth/AuthCompletion.tsx`
- `src/lib/supabase/proxy.ts`
- `e2e/mvp1-release.spec.ts`
- `src/contexts/AppContext.tsx` — selected hunks: auth-context
- `src/components/layout/AppShell.tsx` — selected hunks: auth-shell

### 02. style(ui): standardize pressed and invalid input feedback

Shared button touch targets and brief reduced-motion-safe interaction feedback.

Commit: `46652ca49046ae989445478d649eff3a5519aae8`.

Impacted files:

- `src/app/globals.css`
- `src/components/ui/Button.tsx`

### 03. db: add owned daily steps and celebration preferences

Daily observations, ownership, validation, revisions, retry keys, and export. Already applied and verified on shared Supabase on 2026-10-01; this commit packages the existing file only.

Commit: `e2a29c6ce5cc7733f7576363a59fdbba585f3197`.

Impacted files:

- `supabase/migrations/20261001044833_mvp3_daily_activity.sql`

### 04. db: version program and diet assumptions with trusted meals

Program snapshots, ingredient-based diet/carb enforcement, trusted catalog seeds, and future target assumptions. Already applied and verified on shared Supabase on 2026-10-01; this commit packages the existing file only.

Commit: `a1de134f8478570caff14e3dbcebcba1cab2a14c`.

Impacted files:

- `supabase/migrations/20261001050520_mvp3_program_and_diet.sql`

### 05. db: add versioned custom routines and workout sessions

Immutable routine versions, planned/actual sessions, lifecycle validation, RLS, export and account deletion. Already applied and verified on shared Supabase on 2026-10-01; this commit packages the existing file only.

Commit: `93901307734d4782100dacda4b68e5cef05640c7`.

Impacted files:

- `supabase/migrations/20261001052208_mvp3_custom_workouts.sql`

### 06. db: harden mutation wrappers and custom read models

Authorized wrappers, invoker view, monotonic step revision ledger, retry ordering, and timezone/date bounds. Already applied and verified on shared Supabase on 2026-10-01; this commit packages the existing file only.

Commit: `f44734dc64108d8f553639b85233018ee312c4bc`.

Impacted files:

- `supabase/migrations/20261001053749_mvp3_mutation_wrappers_and_read_models.sql`

### 07. db: index custom session version references

Focused foreign-key lookup index. Already applied and verified on shared Supabase on 2026-10-01; this commit packages the existing file only.

Commit: `839fe80ade5fb715a598b149c5e5d2a531f88ae4`.

Impacted files:

- `supabase/migrations/20261001054937_mvp3_session_version_index.sql`

### 08. db: expose stable sanitized mutation error codes

Stable JSON error details for typed client outcomes. Already applied and verified on shared Supabase on 2026-10-01; this commit packages the existing file only.

Commit: `cfa4b15f9128c3feeca1d5733a006b056f2ad280`.

Impacted files:

- `supabase/migrations/20261001055953_mvp3_stable_mutation_errors.sql`

### 09. db: make custom session JSON variable types explicit

Forward correction for database lint; no edits to earlier applied migrations. Already applied and verified on shared Supabase on 2026-10-01; this commit packages the existing file only.

Commit: `c8d1f4f5d8a6b75ba29b5073552a686cfa0c40e7`.

Impacted files:

- `supabase/migrations/20261001062329_mvp3_explicit_variable_types.sql`

### 10. chore(types): capture deployed MVP-3 database contracts

Generated public schema from the verified shared rollout; retain hosted PostgREST metadata.

Commit: `3ccd731f353fe4c6c940ddc9a64a90266ecccc6c`.

Impacted files:

- `src/types/database.generated.ts`

### 11. feat(domain): define program and custom workout entities

Additive profile/program preferences and step/custom routine/session models. Required snapshot collections and mutation events land atomically in commit 22.

Commit: `ef20791528d9a9a541e1906d1044e4ab30563481`.

Impacted files:

- `src/types/domain.ts` — selected hunks: domain-definitions

### 12. feat(activity): validate daily step observations

Local calendar dates, whole-number ranges, optional walking minutes, and explicit zero tests.

Commit: `f707b50b51cb627ada429c32cff9ff29811e2c35`.

Impacted files:

- `src/utility/dailySteps.ts`
- `src/utility/dailySteps.test.ts`

### 13. feat(activity): estimate walking energy with visible uncertainty

Broad documented MET range and eligibility tests; never modifies the food target.

Commit: `37d4d48ec5430aa9355dc74e7975137358a370fb`.

Impacted files:

- `src/utility/walkingEnergy.ts`
- `src/utility/walkingEnergy.test.ts`

### 14. feat(nutrition): derive calories-remaining display states

Unknown, partial, estimated, over-target and unavailable-target states with tests.

Commit: `509ffd1b2e79d71030e1b16740a744cd3949c77b`.

Impacted files:

- `src/utility/calorieBudget.ts`
- `src/utility/calorieBudget.test.ts`

### 15. feat(ui): add accessible remaining-calorie ring

Reducing ring with text labels, status semantics, and reduced-motion support.

Commit: `4b1842f5491fb7b29161f51d769c7d75927d9ed2`.

Impacted files:

- `src/components/ui/CalorieBudgetRing.tsx`

### 16. fix(nutrition): resolve targets by effective local date

Past/future/same-day target selection and bounded week read-model tests.

Commit: `b57f4aa52cdd980ba8f42572b52715209eb92b85`.

Impacted files:

- `src/utility/targetHistory.ts`
- `src/utility/targetHistory.test.ts`

### 17. feat(catalog): add reviewed foods and lower-carb meal options

Six reviewed USDA foods, four ingredient-based meals, provenance, cost/prep assumptions and reproducible curation/SQL tools. Do not rerun SQL generators to overwrite applied migrations.

Commit: `56b6d7dbedfe1e510eb1c1b4668d069c8bec313f`.

Impacted files:

- `src/constants/mvp3Catalog.ts`
- `src/constants/mvp3FoodSources.json`
- `src/constants/foods.ts`
- `src/constants/meals.ts`
- `scripts/curate-mvp3-foods.mjs`
- `scripts/mvp3-catalog-sql.mjs`

### 18. feat(nutrition): bound low-carb and keto-style macro targets

130 g / 50 g total-carbohydrate product assumptions and target tests.

Commit: `53fa7e68a18bec0020d826e1dad02ff7827e352e`.

Impacted files:

- `src/utility/health.ts`
- `src/utility/health.test.ts`

### 19. feat(meals): enforce carb caps and leave infeasible slots unresolved

Deterministic ingredient/allergy/diet/portion checks and infeasible-plan tests.

Commit: `eb195af810ce6bacb267e25ed860b8e8d0d37268`.

Impacted files:

- `src/utility/mealPlan.ts`
- `src/utility/mealPlan.test.ts`

### 20. feat(workouts): generate deterministic Pilates foundations

Profile-constrained program, schedule, dose, warm-up/rest/cooldown and tests; exclude Pilates from calisthenics energy estimates.

Commit: `500537dec284036f02fb25b4f3cb86d56e22f90f`.

Impacted files:

- `src/utility/plan.ts`
- `src/utility/plan.test.ts`
- `src/utility/workoutEnergy.ts`

### 21. feat(workouts): validate reusable custom routine definitions

Movement identity, dose, equipment, experience and duration validation with tests.

Commit: `39ec6b659a3f8cebd0147bf236157e9fb14edb1b`.

Impacted files:

- `src/utility/customWorkouts.ts`
- `src/utility/customWorkouts.test.ts`

### 22. feat(repository): wire typed MVP-3 mutations and read models

Atomic client contract update: required snapshot/export collections, semantic events, Context intents, authorized RPC calls, retry-safe errors, offline draft behavior and refreshed bounded read models. Remaining AppContext/domain hunks land here.

Commit: `52b8917c9612981f6a3d738fdb28c69a71e2bbfa`.

Impacted files:

- `src/types/domain.ts`
- `src/types/backend.ts`
- `src/services/repository.ts`
- `src/services/supabaseRepository.ts`
- `src/services/supabaseSnapshot.ts`
- `src/contexts/AppContext.tsx`

### 23. feat(activity): add authenticated daily steps screen

Editable observations, deletion, draft/retry and separate walking estimate. Remaining AppShell hunk adds the activity title.

Commit: `7c8ba8f171ab56a23eb23e615651170e712d01b1`.

Impacted files:

- `src/app/activity/page.tsx`
- `src/components/layout/AppShell.tsx`

### 24. feat(workouts): add custom routine editor and session logger

Reusable versions, catalog/text movements, start/pause/resume, actual dose/RPE/notes and history preservation.

Commit: `652f39ba3c45433f8182ac587dd1162458c1625f`.

Impacted files:

- `src/app/workouts/custom/page.tsx`

### 25. feat(workouts): expose program selection and custom routines

Calisthenics/Pilates choice, custom entry point and program-aware progression UI.

Commit: `0d527e03bc3e580a3cf018c8ab589d8482f8ac64`.

Impacted files:

- `src/app/workouts/page.tsx`

### 26. feat(onboarding): group setup and retain final-save drafts

Five focused groups, cost labels preserving numeric preferences, program/diet choices, pending state, duplicate prevention and confirmed-save navigation.

Commit: `4ea5f7e6666bd6f6486cbc36a73d909757edd289`.

Impacted files:

- `src/app/onboarding/page.tsx`

### 27. feat(daily): show calorie budgets and quick logging actions

Home and Nutrition rings, effective dated targets, food/steps/activity quick actions, explicit unresolved diet slots, and Pilates estimate copy. Home milestone hunks are reserved for the next commit.

Commit: `86a821bc665ad1b48c5594d98ea2d2700a661458`.

Impacted files:

- `src/app/page.tsx` — selected hunks: home-without-milestones
- `src/app/nutrition/page.tsx`

### 28. feat(motivation): add optional saved-fact personal milestones

Pure firsts/participation derivation and tests, Settings opt-in and Home display; no calorie rewards or missed-day penalties. Remaining Home hunks land here.

Commit: `53951b6cc067b684d22502a7ff6117cdc08cdd2a`.

Impacted files:

- `src/utility/milestones.ts`
- `src/utility/milestones.test.ts`
- `src/app/settings/page.tsx`
- `src/app/page.tsx`

### 29. test(db): verify MVP-3 ownership retries and version history

New usability assertions and updated schema/grant/RLS catalog expectations for the complete migration set.

Commit: `2b300994823e7f43e4ab2f7278e29a5e16571c82`.

Impacted files:

- `supabase/tests/mvp3_usability_test.sql`
- `supabase/tests/database_test.sql`
- `supabase/tests/privileges_rpc_security_test.sql`
- `supabase/tests/rls_isolation_test.sql`
- `supabase/tests/schema_catalog_test.sql`

### 30. test(repository): cover step and custom workout parity and exports

Authoritative repository replay, competing edits, immutable history, dated targets and new collection export tests.

Commit: `c343b508a6f082b08f20f0586dd807be0eded0fd`.

Impacted files:

- `src/services/supabaseRepository.integration.test.ts`
- `src/utility/exportBundle.test.ts`

### 31. test(e2e): cover MVP-3 mobile and desktop user flows

Serialized MVP-3 browser journeys and updated onboarding fixture; only release project matching hunks in Playwright config.

Commit: `0a44415a93d508e92d75318ca848d993264ed0cf`.

Impacted files:

- `e2e/mvp3-release.spec.ts`
- `e2e/auth.setup.ts`
- `playwright.config.ts` — selected hunks: config-without-confirmation

### 32. test(auth): verify real local signup resend and confirmation links

Reviewed token-hash template, local Mailpit delivery runner, safe/reused/invalid link checks, cleanup and test script. Remaining Playwright hunk disables token-bearing artifacts for confirmation tests.

Commit: `e15a200e8b949b20408afa204383e096c33801c1`.

Impacted files:

- `supabase/templates/confirmation.html`
- `supabase/config.toml`
- `scripts/run-email-confirmation-test.mjs`
- `e2e/confirmation.spec.ts`
- `package.json`
- `playwright.config.ts`

### 33. chore(demo): record a local-only application feature tour

Local backend guarded server and authenticated browser chapter recording. Account credentials and raw recordings remain ignored.

Commit: `f3d224caafd6d6136813221fe1413ebcef231759`.

Impacted files:

- `scripts/run-demo-server.mjs`
- `scripts/record-demo.mjs`

### 34. chore(demo): render captioned product video and ignore outputs

Windows renderer, 1080p composition, embedded chapters, SRT, original music and viewing guide. Generated deliverables are distributed separately.

Commit: `377a8d651f27ea743c93b16a297d079c0eb124e3`.

Impacted files:

- `scripts/render-demo.py`
- `.gitignore`

### 35. docs: hand over completed MVP-3 work and remaining release gates

Update every root owning document, README and routing; preserve dated RC3 evidence, add completed/pending checklist, verification boundaries and this exact commit/file manifest.

Impacted files:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `DESIGN.md`
- `FEATURES.md`
- `MVP_Priority_Matrix.md`
- `README.md`
- `SUPABASE_SETUP.md`
- `MVP3_HANDOVER.md`
