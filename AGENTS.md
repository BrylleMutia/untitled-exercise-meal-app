# Calisthenics and Nutrition Coach Agent Guide

This file contains the repository-wide workflow, safety rules, and
documentation-routing rules for the Calisthenics and Nutrition Coach app. Read
only the task-relevant documents; do not load unrelated documentation or
invent product behavior that is not supported by the product plan and
architecture.

## Documentation Map and Routing

| Document | Use for |
|----------|---------|
| [`FEATURES.md`](FEATURES.md) | Product goal, MVP scope, feature behavior, navigation, data model, and acceptance criteria |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Stack, state/data ownership, persistence, security, testing, delivery, and migration procedures |
| [`DESIGN.md`](DESIGN.md) | Current visual/design decisions, design tokens, UX patterns, responsive/navigation model, and auth-first setup |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Supabase dashboard, environment, auth URL, and cautious CLI setup |
| Source code, tests, migrations, generated types, and deployed configuration | Final truth for current implementation behavior |

When `FEATURES.md` and `ARCHITECTURE.md` conflict, `FEATURES.md` defines
product scope and behavior, while source code and tests define current
implementation behavior. Resolve the documentation conflict before extending
the affected feature.

Task routing:

- **Feature implementation:** Read the relevant section of `FEATURES.md` and only the applicable sections of `ARCHITECTURE.md`.
- **UI, visual, or design-system change:** Read the relevant section of `DESIGN.md` and preserve the styling, accessibility, and motion guidance in `ARCHITECTURE.md`.
- **Workout, nutrition, health, or UX change:** Read the related feature section and preserve the product loop and safety boundaries.
- **State, persistence, local storage, Supabase, auth, AI, security, or delivery work:** Read the relevant architecture sections and the related feature contract.
- **Bug fix or diagnosis:** Inspect current source code and tests first. Consult the feature plan only when behavior is feature-specific.
- **Documentation change:** Update the owning document when behavior, scope, data ownership, security, or verification requirements change.
- Do not create links to roadmap or feature-contract files that do not exist. Add those documents only when the project actually needs them.

## Communication and Confidence

- State the plan and material assumptions before making changes.
- Give concise milestone updates during long tasks.
- Report conclusions, evidence, tradeoffs, verification, limitations, and follow-up work; do not expose private chain-of-thought.
- Inspect discoverable context before asking questions. Do not make changes until the requested outcome is sufficiently clear.
- Preserve unrelated working-tree changes.
- Treat health, nutrition, and exercise recommendations as safety-sensitive behavior. Call out uncertainty instead of presenting assumptions as facts.

## Product Guardrails

The product contract is in [`FEATURES.md`](FEATURES.md). Preserve these invariants:

- Protect the core loop: set a goal -> receive an editable plan -> complete a workout and log food -> review progress -> adjust the next plan.
- The first release is Supabase-backed and requires authenticated identity for durable user data. It has no social features.
- All generated workouts and meal plans remain editable. Users can substitute exercises, change servings, skip meals, and record what actually happened.
- Planned values and actual values are separate. Editing a future plan must never overwrite completed workout or nutrition history.
- Workout progression is deterministic, bounded, and explainable. AI must not choose exercises, calculate progression, or override user changes.
- Every exercise plan must respect equipment, training experience, available days, and expected workout duration.
- Include warm-up, rest guidance, cooldown or mobility work, regressions, progressions, and basic safety guidance where applicable.
- Health metrics, calorie targets, macro targets, and AI nutrition results are estimates. Never present the app as medical, dietary, or exercise care.
- Nutrition uncertainty must be visible, especially for restaurant meals, sauces, oils, and mixed dishes. Never show false precision.
- AI may extract text into structured candidates, but trusted nutrition data and deterministic application code own nutrition calculations. AI must not save entries or mutate user data without confirmation.
- Missing, skipped, partial, or unlogged days must not be represented as zero intake or failed progress without clear labeling.
- Keep the workout logger usable one-handed and with minimal screen reading during exercise.
- Design for non-guilt-based, accessible feedback. Do not shame missed workouts, incomplete logging, weight changes, or targets that need adjustment.

## Engineering Guardrails

The technical contract is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

- Use strict TypeScript and the existing Context/repository architecture.
- Routes and components express user intent. Repositories and pure domain utilities own persistence, validation, plan generation, calculations, and durable mutations.
- Keep BMR, BMI, TDEE, calorie, macro, serving, progression, trend, and plan-generation logic in pure, testable utilities.
- Keep authoritative durable facts in the repository layer: profile inputs, goals, target versions, workout and meal plan snapshots, workout sessions, exercise logs, nutrition logs, recipes, grocery lists, and weight entries.
- Derive totals, progress, completion status, trend values, and recommendations from durable facts whenever they can be recomputed reliably.
- Return typed outcomes and refreshed state from durable actions. Use semantic events for meaningful feedback instead of diffing arbitrary snapshots in components.
- Supabase Postgres is the MVP authority for durable user data. Browser storage may cache read models and preserve recoverable drafts, but it must not become a competing source of truth.
- All MVP durable mutations must use authorized Supabase RPCs or Edge Functions. Network or provider failures must preserve user input and must not present unsaved mutations as persisted.
- Never put provider secrets, service-role keys, database passwords, OAuth secrets, or nutrition-provider credentials in `NEXT_PUBLIC_*` variables.
- Keep the main application snapshot compact. Use focused, typed read models for history, statistics, catalog data, grocery data, and account export as those surfaces grow.
- Store local calendar dates as `YYYY-MM-DD` keys for daily logs and ISO timestamps for durable events.
- Preserve accessibility, large text, responsive browser layouts, keyboard behavior, loading/error/empty/offline states, and reduced-motion behavior.

## Data Ownership and Plan Versioning

- `UserProfile` owns user inputs and preferences, not derived health values that can be recalculated.
- `Goal` and `DailyTarget` retain the assumptions and effective dates used to create a target. Updating targets must not rewrite historical summaries.
- `WorkoutPlan`, `PlannedWorkout`, and `PlannedExercise` represent a versioned prescription. A generated or edited future plan is a new version or snapshot.
- `MealPlan` and `PlannedMeal` represent versioned planned meals, servings, sources, assumptions, and target references.
- `WorkoutSession` and `ExerciseLog` represent what occurred. They retain the planned value that was shown at the time plus the actual value recorded by the user.
- `Food`, `Meal`, and `RecipeIngredient` distinguish source data, user-entered values, serving units, and estimated values.
- `NutritionLog` stores the saved result and its source, source version, assumptions, confidence, serving basis, and date. It must remain editable and deletable by the owner.
- `WeightEntry` stores a user-entered observation with its date and unit. Trend calculations must not replace the original entry.
- `GroceryList` and `GroceryItem` preserve generated quantities, user overrides, checked, edited, removed, and custom-item state when updated or regenerated according to the documented merge policy.
- Do not place open screens, selected chart ranges, modal visibility, active form drafts, or other presentation-only state in durable domain state.

## Supabase Repository and Cache Boundary

Every durable MVP feature must use the authenticated Supabase path:

1. **Client intent:** a typed Context action validates the request shape and sends it to the repository.
2. **Authoritative mutation:** the repository calls an authorized Supabase RPC or Edge Function, which validates ownership and domain rules before changing Postgres.
3. **Refreshed state:** the repository returns a typed outcome and refreshed read state; browser cache is updated only after the authoritative response.

For every new durable mutation:

- Add a typed intent to the appropriate Context action contract.
- Validate IDs, ranges, units, date keys, state transitions, and payload shapes before persistence.
- Preserve an idempotency strategy for retries, especially session completion, nutrition save, plan generation, grocery regeneration, export, and delete operations.
- Return a typed outcome and refreshed state.
- Define behavior for offline, loading, failure, retry, and partial completion states.
- Add repository and RPC parity tests for the same input sequence when more than one implementation exists.
- Do not silently queue authenticated mutations unless synchronization, conflict resolution, and idempotency are explicitly designed.

## Durable Mutation Standard

A durable mutation must be:

- **Atomic:** related profile, plan, log, history, and target changes succeed or fail together.
- **Authorized:** authenticated ownership is verified from `auth.uid()`, never from a trusted client user ID.
- **Validated:** units, serving quantities, exercise IDs, dates, ranges, and state transitions are checked at the mutation boundary.
- **Idempotent:** retries cannot duplicate workout sessions, nutrition entries, grocery items, exports, or deletes.
- **Concurrency-safe:** concurrent edits and regeneration cannot silently overwrite user corrections or completed history.
- **Observable:** return stable error codes and log only sanitized failure context.
- **Typed:** keep database contracts and client response contracts synchronized.

Prefer natural unique constraints for once-only records where appropriate. Use
a client-generated idempotency key when the same valid intent can be submitted
more than once.

Mutation outcomes that drive UI feedback should expose semantic events, for
example:

```ts
type MutationOutcome = {
  snapshot: AppSnapshot;
  events: Array<
    | { type: "plan-generated"; planId: string }
    | { type: "workout-completed"; sessionId: string }
    | { type: "nutrition-entry-saved"; entryId: string }
    | { type: "target-updated"; targetId: string }
    | { type: "grocery-list-updated"; listId: string }
  >;
};
```

The exact union should grow only as implemented behavior requires. Components
must not infer business events by comparing arbitrary snapshots.

## Supabase Security and Database Rules

Supabase is the MVP authority for authenticated identity and durable user data.
Apply these rules to every exposed user-data table and every server mutation:

- Treat migrations in `supabase/migrations/` as the schema source of truth. Avoid unreproducible dashboard-only changes.
- Enable RLS on every exposed user-data table.
- Combine `TO authenticated` with an ownership predicate such as `(select auth.uid()) = user_id`.
- Give update policies both `USING` and `WITH CHECK`; updates also require a usable select policy.
- Prefer `SECURITY INVOKER`.
- If `SECURITY DEFINER` is necessary, use an explicit empty or controlled `search_path`, resolve the caller with `auth.uid()`, fully qualify references, and expose only a deliberate authorized wrapper.
- Do not grant direct client writes that bypass validation for profile targets, plans, workout history, nutrition history, weight entries, grocery state, exports, or deletion workflows.
- Include explicit grants and revokes in every migration.
- Index ownership, date, status, and cursor predicates used by RLS or read models.
- Test cross-user denial, anonymous denial, invalid IDs, duplicate retries, concurrent edits, and direct-table-write denial.
- Regenerate `src/types/database.generated.ts` after schema changes.
- Keep AI and nutrition-provider credentials in server-side secret management only.

## Supabase Migration Safety

Only perform linked-database changes when explicitly authorized. Before
creating, repairing, or pushing migrations:

1. Inspect `git status --short`, the migration list, and `supabase db push --dry-run`.
2. Compare local migrations with the linked schema, including columns, constraints, indexes, policies, grants, function bodies, and relevant data.
3. If exact equivalence cannot be proven, stop. Do not use blind pulls, force flags, `--include-all`, or guessed repairs.
4. For proven equivalence, record the remote/local versions and evidence, repair history in an auditable order, and rerun the dry run.
5. Push only the verified pending set with explicit authorization for the shared remote.

Never edit, rename, delete, or reorder a migration that may already be applied.
Use a forward migration for corrections.

After a repair or push, verify matching local/remote history, an up-to-date dry
run, deployed RLS and RPC behavior, generated types, local reset behavior, and
the applicable database tests.

## External Libraries and Platforms

Use the `context7-mcp` skill and Context7 MCP for library, framework, SDK, API,
CLI, cloud-service, or plugin work, including Next.js, React, Supabase,
`@supabase/ssr`, Tailwind CSS, Serwist, browser storage, Web Push, and related
web APIs.

1. Resolve the library ID with the full task unless an exact `/org/project` ID is supplied.
2. Select the closest official, version-compatible source.
3. Query the focused concept; use separate queries for distinct concepts.
4. Apply current guidance compatible with installed versions.
5. If Context7 is unavailable, use official primary documentation and state the limitation.

Context7 is not required for local business logic, visual design, asset work,
straightforward refactoring, or code review without external API behavior.

## Commands and Next.js Policy

The Next.js project scripts are defined in `package.json` and can be used for
the current app. Supabase CLI scripts are available for the existing backend;
the new hardening migration must still be applied and verified locally before
any linked push.

- `npm run dev` - start the Next.js development server.
- `npm run build` - create a production Next.js build.
- `npm run start` - serve the production Next.js build.
- `npm run typecheck` - strict TypeScript verification.
- `npm run lint` - run the configured ESLint checks.
- `npm run test:local` - local utility, repository, and service tests.
- `npm run supabase:start`, `supabase:reset`, `supabase:test`, `supabase:lint`, and `supabase:types` - local database workflow for the backend.
- `npm run supabase:push:dry` - preview linked-project changes; push only when authorized.

Use an available development-server port for automated browser checks and do
not stop a server that was not started by the current test. Verify PWA behavior
in a production-like HTTPS environment when service workers or web push are
involved.

## Code and File Conventions

- Use Tailwind CSS utilities and shared web design tokens for normal styling.
- Use `lucide-react` or another approved web icon package for suitable interface icons and register reusable assets centrally.
- Use `@bryllim/workout-guide` for exercise illustrations and assets; do not replace or duplicate its catalog media without a documented reason.
- Put App Router routes and layouts in `src/app/`, reusable cross-route UI in `src/components/`, pure domain calculations in `src/utility/`, repositories/remote calls/caches in `src/services/`, Supabase clients in `src/lib/supabase/`, and shared contracts in `src/types/`.
- Keep catalog and authored exercise/nutrition definitions in `src/constants/`.
- Use PascalCase for components, camelCase for values/functions, `.tsx` for JSX, and `.ts` for logic.
- Keep `src/app/layout.tsx` focused on metadata, global styles, and root providers; keep route segments responsible for composition rather than domain calculations.
- Do not add Redux, a second global state library, speculative routing layers, or speculative service abstractions.
- Add comments only for non-obvious invariants or platform constraints, such as plan versioning, date boundaries, retry behavior, storage differences, or privacy requirements.

## Verification

For every code change:

1. Run `npm run typecheck`.
2. Exercise the affected route at narrow mobile and desktop browser viewports.
3. Check loading, error, disabled, empty, offline, and retry states as applicable.
4. Confirm keyboard navigation, focus behavior, one-handed controls, responsive layouts, and large-text layouts.
5. Confirm accessibility roles, labels, touch targets, and reduced-motion behavior.

For profile, goals, and health calculations:

1. Verify metric and imperial input/output conversions.
2. Verify supported input boundaries and invalid values.
3. Verify calculation assumptions, target updates, and estimate/disclaimer copy.
4. Verify aggressive-target and unsupported-population handling.

For plan generation and progression:

1. Verify new-user state and deterministic output for the same inputs.
2. Verify equipment, training days, experience, and duration constraints.
3. Verify warm-up, rest, cooldown, regressions, progressions, and recovery boundaries.
4. Verify progression and regression thresholds using recorded RPE or difficulty.
5. Verify user overrides and substitutions survive regeneration.
6. Verify plan edits do not change completed history.

For workout logging:

1. Verify start, pause, resume, finish, skip, modification, substitution, and note flows.
2. Verify planned and actual values remain separate.
3. Verify duplicate completion and interrupted-session behavior.
4. Verify actual reps, holds, durations, load, and RPE are validated and retained.

For nutrition, recipes, grocery, and AI:

1. Verify manual food, custom food, saved meal, recipe, serving, correction, deletion, and duplicate-entry behavior.
2. Verify raw/cooked or other serving assumptions are visible and consistently calculated.
3. Verify estimated and user-provided values remain distinguishable.
4. Verify daily totals use the correct local date and do not treat missing data as zero.
5. Verify AI output is schema-validated, matched to trusted records, uncertain when appropriate, and confirmed before saving.
6. Verify AI/provider failure leaves manual logging available and does not lose user input.
7. Verify grocery regeneration preserves explicit edits and checked-state behavior according to the documented policy.

For local persistence and account/data controls:

1. Verify authenticated data remains available after app restart and safe cache/schema migrations.
2. Verify reset-plan retains history.
3. Verify export contains the supported entities and units.
4. Verify account deletion removes server data through the authorized workflow and clears cached browser data.
5. Verify cache corruption, storage failure, network failure, and insufficient-permission states fail safely without silent data loss.

For Supabase changes:

1. Reset/apply migrations locally.
2. Run database lint and pgTAP/RLS tests.
3. Verify cross-user and anonymous denial.
4. Regenerate database types.
5. Run TypeScript verification against generated contracts.
6. Review grants/revokes, RLS, indexes, idempotency, and migration ordering.

## Definition of Done

A feature is complete only when all applicable conditions are met:

1. Product behavior, edge cases, safety copy, uncertainty, and interaction copy are documented.
2. Supabase is the authoritative MVP path; network failures preserve drafts and never misrepresent unsaved mutations.
3. Durable mutations are atomic, authorized, validated, concurrency-safe, and retry-safe.
4. Plan versions and historical logs preserve what was prescribed and what actually happened.
5. Cache and offline behavior are explicit and never misrepresent unsynchronized data.
6. Shared behavior is implemented through focused components, utilities, repositories, and services.
7. Accessibility, reduced motion, large text, keyboard input, responsive behavior, and narrow-screen overflow are verified.
8. Pure calculations, repositories, critical component states, and the primary user flow have appropriate tests.
9. TypeScript, Next.js build checks, Supabase tests, and browser checks pass as applicable.
10. `FEATURES.md`, `ARCHITECTURE.md`, and `DESIGN.md` are updated when the implemented behavior, technical contract, or design decisions change.

## Documentation Ownership

- This file owns mandatory agent workflow, task routing, product guardrails, engineering guardrails, and verification requirements.
- [`FEATURES.md`](FEATURES.md) owns product goals, feature scope, UX behavior, navigation, data-model expectations, and MVP acceptance criteria.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) owns stable client architecture, state/data ownership, security, persistence, testing, and delivery standards.
- [`DESIGN.md`](DESIGN.md) owns current visual/design decisions, tokens, UX patterns, responsive/navigation model, and auth-first setup.
- Source code, tests, migrations, generated types, and deployed configuration remain the final truth for current implementation behavior.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
