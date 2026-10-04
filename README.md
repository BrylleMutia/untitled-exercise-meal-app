# Cali - Exercise and Meal Planner

Authenticated Next.js application for the core exercise, nutrition, meal-plan,
grocery, and progress loop. Supabase is the authoritative store for durable
user data; browser storage is used only for recoverable drafts and read-model
fallbacks.

## MVP-3 handover — 2026-10-04

MVP-3 adds clearer onboarding, reliable fresh-browser sign-in, manual steps,
remaining-calorie rings, Pilates, versioned custom workouts, Low-carb and
Keto-style planning, interaction feedback, and optional personal milestones.
Implementation and local verification are complete; shared database rollout was
verified on 2026-10-01. Hosted app deployment, staging SMTP, and release sign-off
remain pending. Staging email checks were explicitly deferred by the user.

Start with [`MVP3_HANDOVER.md`](./MVP3_HANDOVER.md) for completed/pending work,
verification dates, operational notes, and the granular commit/file manifest.
[`MVP_Priority_Matrix.md`](./MVP_Priority_Matrix.md) retains the detailed evidence
and historical MVP-2 / RC3 record. A Git push does not deploy or approve a release.

## Local setup

Install dependencies with `npm ci`, then create the local environment file from
the variables documented in [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md). Start
the local Supabase stack with `npm run supabase:start` and apply/reset the
migrations with `npm run supabase:reset` when the Docker daemon is available.

Provider-backed nutrition uses protected Supabase Edge Functions. Configure the
server-side `USDA_FDC_API_KEY`, `DEEPSEEK_API_KEY`, and the non-secret release
label `USDA_FDC_RELEASE` (the rollout value is documented in
`SUPABASE_SETUP.md`). `DEEPSEEK_NUTRITION_MODEL` is optional and defaults to
`deepseek-flash`. Never put any of these values in `NEXT_PUBLIC_*` variables.

MVP-1 Settings includes a persisted, opt-in notification preference without
reminder delivery, and a lossless ZIP export containing `manifest.json`,
`export.json`, scalar metadata, and one CSV per exported entity collection.

Start the browser app with `npm run dev`. Use an available port for manual or
automated checks, for example `npm run dev -- --port 3001`. Do not stop a server
started by another task. Point app and test configuration at the same backend.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run test:local`
- `npm run build`
- `npm run supabase:reset`
- `npm run supabase:lint`
- `npm run supabase:test`
- `npm run supabase:test:rpc`
- `npm run supabase:test:concurrency`
- `npm run test:repository` (requires the running disposable local Supabase
  stack; creates and deletes fresh local accounts)
- `npm run test:e2e:public`
- `npm run test:email:local` (actual local Mailpit delivery; run alone because
  it temporarily changes local confirmation settings and restores them)
- `npm run test:e2e:release` (requires the running disposable local Supabase
  stack; creates two fixture accounts, runs 390×844 and 1440×900 scenarios,
  and deletes the accounts through the local account-deletion RPC)
- `npm run supabase:test:providers:remote` (requires a process-scoped exact-
  project confirmation, client-safe project settings in ignored
  `.env.rc3.local`, and confirmed disposable `USER_A_*` / `USER_B_*` values in
  ignored `.env.local`; run the RPC smoke afterward to verify cleanup)

The authenticated release browser suite uses fresh local accounts and serialized
390×844 mobile / 1440×900 desktop projects; CI mocks provider responses and
uses only local Supabase credentials. The linked-project smoke remains a
separately guarded manual gate. Live confirmation/recovery delivery and the
exact hosted Auth URL still need verification. Local signup/resend and
confirmation-link handling passed on 2026-10-01; staging SMTP remains unverified.
Public deployment,
Free-tier leaked-password protection, and any custom domain remain separate
launch gates; they are not implied by a release-candidate tag.

Product scope and acceptance criteria live in [`FEATURES.md`](./FEATURES.md);
technical ownership and security rules live in [`ARCHITECTURE.md`](./ARCHITECTURE.md);
visual decisions live in [`DESIGN.md`](./DESIGN.md); and the current package
status is tracked in [`MVP_Priority_Matrix.md`](./MVP_Priority_Matrix.md).

## Product demo

The local product tour is `demo-video/Cali-product-demo.mp4` (5:02, 1080p), with
captions and a viewing guide in the same directory. Generated media and demo
credentials are ignored by Git; share the reviewed video separately. Reproduction
requirements and local-only recording commands are in
[`MVP3_HANDOVER.md`](./MVP3_HANDOVER.md#demo-handover).
