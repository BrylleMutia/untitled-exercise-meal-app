# Cali - Exercise and Meal Planner

Authenticated Next.js application for the core exercise, nutrition, meal-plan,
grocery, and progress loop. Supabase is the authoritative store for durable
user data; browser storage is used only for recoverable drafts and read-model
fallbacks.

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

Start the app with `npm run dev`. Port `8081` is reserved for manual Expo
testing in the workspace guide; use an explicit alternate port for automated
browser checks, for example `npm run dev -- --port 8082`.

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
exact production Auth URL still need verification. Public deployment,
Free-tier leaked-password protection, and any custom domain remain separate
launch gates; they are not implied by a release-candidate tag.

Product scope and acceptance criteria live in [`FEATURES.md`](./FEATURES.md);
technical ownership and security rules live in [`ARCHITECTURE.md`](./ARCHITECTURE.md);
visual decisions live in [`DESIGN.md`](./DESIGN.md); and the current package
status is tracked in [`MVP_Priority_Matrix.md`](./MVP_Priority_Matrix.md).
