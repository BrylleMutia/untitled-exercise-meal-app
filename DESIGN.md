# Calisthenics and Nutrition Coach — Design Decisions

> **Purpose:** Record the current visual direction, design tokens, UX patterns,
> responsive/navigation model, and auth-first setup for the app. This file is
> the owner of DESIGN.md-owned visual and component detail.
>
> **Product contract:** [`FEATURES.md`](./FEATURES.md)
> **Engineering contract:** [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> **Agent workflow:** [`AGENTS.md`](./AGENTS.md)
> **Supabase setup:** [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)

## Table of Contents

1. [Purpose and Scope](#purpose-and-scope)
2. [Product Snapshot and Current Status](#product-snapshot-and-current-status)
3. [Visual Direction and Reference](#visual-direction-and-reference)
4. [Design Tokens](#design-tokens)
5. [Typography](#typography)
6. [Shape, Elevation, and Motion](#shape-elevation-and-motion)
7. [Background and Surfaces](#background-and-surfaces)
8. [Layout and Navigation](#layout-and-navigation)
9. [Shared UI Component Inventory](#shared-ui-component-inventory)
10. [Accessibility and Interaction](#accessibility-and-interaction)
11. [Exercise Media and Attribution](#exercise-media-and-attribution)
12. [Icons and Catalog Constants](#icons-and-catalog-constants)
13. [Domain, State, and Setup Architecture](#domain-state-and-setup-architecture)
14. [PWA and Metadata](#pwa-and-metadata)
15. [Supabase and Environment Setup](#supabase-and-environment-setup)
16. [Scripts and Verification Commands](#scripts-and-verification-commands)
17. [Implemented vs. Planned](#implemented-vs-planned)
18. [Documentation Map Note and Resolved Contradictions](#documentation-map-note-and-resolved-contradictions)

## Purpose and Scope

`DESIGN.md` records the current visual, UX, and setup decisions for the
Calisthenics and Nutrition Coach app as it is implemented today. It reconciles
wording with the canonical plans and architecture documents rather than
inventing product behavior.

- [`FEATURES.md`](./FEATURES.md) owns product goals, feature scope, UX
  behavior, navigation, data-model expectations, and MVP acceptance criteria.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) owns stable client architecture,
  state/data ownership, security, persistence, testing, and delivery standards.
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) owns the Supabase dashboard,
  environment, auth URL, and cautious CLI setup.
- This file owns the design system, component conventions, and auth-first setup
  as they exist in source code, styles, and configuration.

Where `DESIGN.md` is more specific than `ARCHITECTURE.md` (for example, exact
tokens, radii, and component conventions), that specificity is DESIGN.md-owned
detail and does not change architecture authority. Source code, tests,
migrations, generated types, and deployed configuration remain the final truth
for current implementation behavior.

## Product Snapshot and Current Status

The current scaffold is a **responsive Next.js auth-first application** with a
pastel, mobile-first interface. Authenticated users can set a profile and goal,
receive an editable weekly workout and meal plan, complete a workout and log
food, review progress, and adjust the next plan. Product persistence is waiting
for the Supabase schema and authenticated repository; the app does not seed or
fall back to dummy product data.

- **Visual reference:** pastel palette and stat-focused, card-based mobile
  screens inspired by [`assets/ui_reference_01.jpg`](./assets/ui_reference_01.jpg).
- **Repository boundary:** the current Context holds an empty, in-memory
  snapshot until the authenticated Supabase repository is implemented. See
  [Domain, State, and Setup Architecture](#domain-state-and-setup-architecture).
- **Supabase SSR boundary:** browser/server clients, session-refresh Proxy, PKCE
  callback, auth pages, and auth actions are implemented. The durable MVP
  schema, authenticated mutations, RLS/RPCs, migrations, and profile/plan/log
  repository remain pending per [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md). See
  [Implemented vs. Planned](#implemented-vs-planned).

> **Boundary label:** Product routes require an authenticated Supabase session.
> Without Supabase configuration, the app routes to the auth setup page instead
> of showing dummy data. The footer keeps the health/nutrition estimate
> disclaimer without claiming server persistence before the repository exists.

## Visual Direction and Reference

The interface is a friendly, calm, non-clinical pastel design. Cards use soft
tints and rounded corners; screens are stat-focused and mobile-first.

- **Reference influence:** `assets/ui_reference_01.jpg` shows pastel hero
  cards with a greeting, stat grids, and quick-link cards. The Home screen
  follows this shape: a blush "Today's meals" hero, a lavender "Your progress"
  card, a four-tile quick-links grid, a "Today's workout" card, and a
  "Daily targets" card.
- **Tone:** warm greetings ("Hello, {name}!" / "Welcome back"), encouraging,
  non-guilt-based feedback ("Rest days are part of the plan, not a failure",
  "Unlogged day — no entries, that is fine"), and explicit estimate/disclaimer
  copy throughout.

## Design Tokens

Tokens are defined in the `@theme` block of
[`src/app/globals.css`](./src/app/globals.css). Utilities reference these token
names directly (for example `bg-cream`, `text-ink`, `bg-lav-100`).

### Core neutrals

| Token | Hex | Purpose |
|-------|-----|---------|
| `cream` | `#f6f5fa` | Page background base and neutral light surface |
| `ink` | `#262836` | Primary text and solid button fill |
| `ink-soft` | `#4a4d61` | Secondary text and muted emphasis |
| `muted` | `#82869c` | Tertiary, helper, and placeholder text |

### Pastel tints

| Hue | 50 | 100 | 200 | 300 | 500 |
|-----|----|----|----|----|-----|
| `blush` | `#fdf0f1` | `#f9dde0` | `#f4c6cc` | `#eda9b2` | — |
| `lav` (lavender) | `#f1effb` | `#e2def6` | `#cbc3ee` | `#aa9ce0` | `#7c6fd0` |
| `peach` | `#fef4e9` | `#fce7d1` | `#f8d3ac` | — | — |
| `mint` | `#edf8f5` | `#d7efe9` | `#b5e2d8` | — | — |
| `coral` | — | `#ffc9ce` | `#ffabb3` | `#ff8d98` | — |

### Token usage conventions

- **Card tones** map to `50`–`100` tints (`Card.tsx`): white, blush, lavender,
  peach, mint, coral.
- **Progress bars** use stronger tints for legibility: calories `bg-blush-300`,
  protein `bg-lav-300`, carbs `bg-peach-200`, fat `bg-mint-200`.
- **Confidence chips** in nutrition use tone by confidence: high `mint-100`,
  medium `peach-100`, low `coral-100`.
- **`lav-500`** is the accent for focus outlines and interactive progress rings.
- **`coral`** is reserved for warnings, errors, destructive actions, and danger
  states (never used to imply a passing state).
- **`mint`** implies calm, complete, or success; it is never the sole signal
  for status (always paired with text/aria).

### Shadows

| Token | Value | Purpose |
|-------|-------|---------|
| `shadow-card` | `0 12px 32px -12px rgb(38 40 54 / 0.12)` | Card elevation |
| `shadow-chip` | `0 4px 12px -4px rgb(38 40 54 / 0.15)` | Round icon chips and small controls |

### Motion

| Token | Value | Purpose |
|-------|-------|---------|
| `animate-fade-up` | `fade-up 0.45s ease-out both` | Entrance for cards and content |
| `animate-pop` | `pop 0.25s ease-out both` | Small-scale entrance for toasts and per-step cards |

## Typography

- **Family:** [Nunito](https://nextjs.org/docs/app/api-reference/components/font)
  loaded via `next/font/google` with the `--font-nunito` variable. Fallbacks:
  `ui-rounded`, `"Segoe UI"`, `system-ui`, `sans-serif`. Applied through the
  `--font-sans` token in `globals.css`.
- **Font weights:** `font-semibold` (600) for body/helper, `font-bold` (700)
  for buttons and labels, `font-extrabold` (800) for headings and prominent
  values. No `font-light` or `font-medium` appears in the shared primitives.
- **Numeric values** use `tabular-nums` (a Tailwind utility) for timers,
  stats, RPE keys, quantities, and changing values so widths stay stable.
- **Sizing conventions:** page headings `text-xl`–`text-2xl`, card titles
  `text-base`/`text-lg` `font-extrabold`, stat values `text-xl`–`text-4xl`
  `tabular-nums`, helper text `text-xs`/`text-[11px]` `text-muted`.

## Shape, Elevation, and Motion

- **Radii:** cards and inputs use `rounded-3xl` (1.5rem); pills, chips, and
  nav use `rounded-full`; small internals use `rounded-xl`/`rounded-2xl`.
- **Elevation:** `shadow-card` for cards and `shadow-chip` for round icon
  controls and the floating bottom nav.
- **Motion tokens:** `animate-fade-up` and `animate-pop`, both animating only
  `transform` and `opacity` (see tokens above).
- **Reduced motion:** `globals.css` includes a global
  `@media (prefers-reduced-motion: reduce)` override that collapses animation
  and transition durations to `0.01ms` and disables smooth scrolling. Use the
  CSS/Web Animations `transform`/`opacity` preference from `ARCHITECTURE.md`
  for all custom motion.

## Background and Surfaces

- **Page base:** `cream` with two radial pastel gradients layered on the
  `body`: a lavender highlight at the top-right and a blush/pink at the
  bottom-left, both fading to transparent so the cream base shows through.
- **Card tone system:** `Card.tsx` maps a `CardTone` union
  (`white | blush | lavender | peach | mint | coral`) to tint backgrounds
  (`bg-white`, `bg-blush-100`, `bg-lav-100`, `bg-peach-100`, `bg-mint-100`,
  `bg-coral-100`). Cards render `rounded-3xl p-5 shadow-card` by default.
- **Empty state:** a dashed lavender-bordered, `white/50` rounded panel.

## Layout and Navigation

### App shell (`AppShell.tsx`)

The shell composes a header, main content column, footer, bottom nav, and toast
host. Auth routes and onboarding use a shell-free centered layout; product routes
are reachable only after the Supabase session boundary has authenticated the
request.

**Header** (centered, `max-w-3xl lg:max-w-5xl`):

- Left: an avatar-initial round button (links to `/settings`) plus either a
  route title (from a `TITLES` map) or a "Welcome back / Hello, {name}!"
  greeting.
- Center (desktop only, `md:flex`): inline primary nav links (Home, Workouts,
  Nutrition, Grocery, Progress) as rounded pills.
- Right: a notification bell placeholder and a settings button,
  both `h-11 w-11` round white `shadow-chip` controls.

**Main content:** centered `max-w-3xl px-4 pb-32 pt-5 lg:max-w-5xl`. The large
`pb-32` clears the floating mobile bottom nav.

**Footer:** centered `text-[11px] text-muted` disclaimer stating estimates only
and not medical, dietary, or exercise care.

### Onboarding flow

`/onboarding` renders a full-screen, shell-free layout (a centered
`max-w-xl` column that hides header, footer, and bottom nav) with its own
step progress bar and navigation.

### Bottom navigation (`BottomNav.tsx`)

Mobile-only (`md:hidden`) floating pill: `fixed inset-x-3 bottom-3 z-40
mx-auto max-w-md rounded-full bg-white/90 p-2 shadow-card backdrop-blur`.
Five tabs, each `h-12`, using `lucide-react` icons with `sr-only` labels:

- Home (`Home`)
- Workouts (`Dumbbell`)
- Nutrition (`UtensilsCrossed`)
- Grocery (`ShoppingBasket`)
- Progress (`TrendingUp`)

The active tab uses `bg-lav-100 text-ink`; inactive uses `text-muted`. All
tabs set `aria-current="page"` when active. Settings is reachable from the
header and the avatar, not from the bottom nav.

## Shared UI Component Inventory

All shared primitives live in `src/components/ui/` plus the cross-route
components in `src/components/`.

| Component | File | Conventions |
|-----------|------|-------------|
| `Card` | `ui/Card.tsx` | `CardTone` union → tint background; `rounded-3xl p-5 shadow-card`; no default padding override unless `className` adds `p-4` (as `StatTile` does). |
| `Button` | `ui/Button.tsx` | Variants `primary` (`bg-ink text-white`), `soft` (`bg-white/70`), `ghost`, `danger` (`bg-coral-200`). `min-h-12` (3rem = 44px+) target, `rounded-2xl px-5 text-sm font-bold`, disabled = `opacity-50` + `cursor-not-allowed`. |
| `Chip` | `ui/Chip.tsx` | Round frosted icon chip, `h-11 w-11` (44px target), `bg-white/70 shadow-chip`, required `label` → `aria-label` + `title`. |
| `ProgressRing` | `ui/ProgressRing.tsx` | Accessible circular progress; `role="img"` + `aria-label` percentage; `tabular-nums` center value. |
| `ProgressBar` | `ui/ProgressBar.tsx` | `role="progressbar"` with `aria-valuenow/min/max`; `tabular-nums` value/target; bar color overridable. |
| `StatTile` | `ui/StatTile.tsx` | `Card`-based, `p-4`, `tabular-nums` value, optional sub-line. |
| `ToastHost` | `ui/Toast.tsx` | `aria-live="polite"` host; `animate-pop` ink toasts; tone icon per `ok/info/warn`. |
| `DayStrip` | `components/DayStrip.tsx` | Horizontal week selector (`role="group"`, `aria-pressed` per day); 44px minimum day controls with compact gaps, today highlighted with a lavender badge. |
| `EmptyState` | `components/EmptyState.tsx` | Dashed lavender-bordered centered panel with optional action node. |
| `ExerciseIllustration` | `components/ExerciseIllustration.tsx` | Renders `/exercises/<slug>.png` via `next/image`; `illustrationAlt` alt text plus an `sr-only` CC BY-SA 4.0 credit. |
| `Sparkline` / `HistoryList` | `components/progress/progressShared.tsx` | Weight sparkline (`role="img"`, `aria-label`) and accessible calendar history summary list. |

## Accessibility and Interaction

The design follows the accessibility and motion guidance in `ARCHITECTURE.md`.

- **Touch targets:** at least 44×44px effective for interactive icons (Button
  `min-h-12`, Chip and round controls `h-11 w-11`, bottom-nav tabs `h-12`).
- **Focus:** a global `:focus-visible` outline of `2px solid var(--color-lav-500)`
  with `outline-offset: 2px` and `border-radius: 0.5rem` for focusable elements.
- **Aria and roles:** `role="img"`/`aria-label` for rings, sparklines, and
  meaningful icons; `role="progressbar"` for progress bars; `role="status"` and
  `role="alert"` for loading and errors; `role="timer"` for the session clock;
  `aria-live="polite"` for the toast host; `aria-pressed`/`aria-current` for
  toggle and nav state; `sr-only` labels for icon-only buttons and nav.
- **Status not conveyed by color alone:** completion, confidence, and day
  statuses always pair a tint with text labels or `aria-label`.
- **Screen-reader-only text:** used for icon-only labels and the illustration
  credit.
- **One-handed workout logger:** the session screen keeps planned/rest/safety
  stats readable and the sets/reps/RPE controls as large tap targets with
  `tabular-nums`.
- **Tabular numerals:** timers, RPE keys, stat values, quantities, and
  changing numbers.
- **Reduced motion:** global override in `globals.css` (see
  [Shape, Elevation, and Motion](#shape-elevation-and-motion)).
- **Loading/error/empty/offline:** `loading.tsx` (centered pulse, `role="status"`),
  `error.tsx` (blush panel with "Your saved data was not affected" and Try
  again), `EmptyState` for empty content, and the shell's storage-unavailable
  banner plus toast warnings for offline/unsaved-state feedback. Network and
  provider failures preserve drafts and are never presented as persisted
  mutations (see `ARCHITECTURE.md`).

## Exercise Media and Attribution

- **Catalog source:** `src/constants/exercises.ts` exports `EXERCISES`, each
  referencing a `slug` from `@bryllim/workout-guide` plus
  `illustrationAlt`, `regression`, `progression`, and `safety` copy.
- **Asset copy:** `scripts/copy-exercise-assets.mjs` copies each catalog slug's
  `frame-1.png` from `node_modules/@bryllim/workout-guide/assets/<slug>/` into
  `public/exercises/<slug>.png` (21 frames) at `npm run dev` and `npm run build`
  so illustrations render without a network request.
- **Rendering:** `ExerciseIllustration.tsx` loads `/exercises/<slug>.png` with
  `next/image`, using `exercise.illustrationAlt` as alt text and an `sr-only`
  credit line "Illustration by Bryl Lim, CC BY-SA 4.0." The transparent,
  white-line artwork is rendered on `ink`/`ink-soft` illustration surfaces so
  it remains legible against the pastel workout cards.
- **Attribution:** shown on the Workouts screen footer and on the Settings
  "Safety & sources" card. Assets are CC BY-SA 4.0 by Bryl Lim; do not replace
  or duplicate catalog media without a documented reason.

## Icons and Catalog Constants

- **Icons:** `lucide-react` for all interface icons. Icons are decorative
  (`aria-hidden`) when a visible or `sr-only` text label already exists.
  Reusable assets and icons are registered centrally where applicable.
- **Food catalog:** `src/constants/foods.ts` exports a curated starter catalog
  (`FOODS`) with per-serving values, `source`, `sourceVersion`, `estimated`,
  `confidence`, `servingGrams`, and `category`. Source is "Starter Food Catalog"
  version `2026.09`; every record is `estimated: true` until a trusted production
  database is selected.
- **Saved meals:** `src/constants/meals.ts` exports `SAVED_MEALS` (recipes
  referencing catalog food IDs with per-serving quantities).
- **Visibility:** source, version, confidence, estimated/user-provided flags,
  and serving basis are shown on nutrition entries and text-meal candidates
  (see `nutrition/page.tsx`). See `FEATURES.md` for the production nutrition
  database requirement.

## Domain, State, and Setup Architecture

### Snapshot model (`src/types/domain.ts`)

`AppSnapshot` is the compact durable read state: `schemaVersion`, `userId`,
`onboarded`, `profile`, `target`, `plan` (`WorkoutPlan`), `mealPlan`
(`MealPlan`), `sessions`, `nutritionLogs`, `weights`, `grocery`
(`GroceryList`), and `savedMeals`. Derived values (BMR/TDEE, totals, trends,
completion, recommendations) are recomputed from these durable facts by pure
utilities, never stored. Date keys are `YYYY-MM-DD`; durable events are ISO
timestamps. See `ARCHITECTURE.md` for ownership and versioning rules.

### Context and hydration (`src/contexts/AppContext.tsx`)

`AppProvider` starts with an empty authenticated snapshot. `useAppOptional()`
remains available for shell-safe access and actions emit semantic `events` and
`toasts`. The current actions update in-memory state while the authenticated
Supabase repository is being implemented; they do not seed or persist dummy
data.

### Repository boundary

- `src/services/repository.ts` defines the repository swap boundary for the
  authenticated Supabase implementation.
- The authenticated repository is the next persistence layer: it will load the
  current user's profile/read models and send durable mutations through
  authorized RPCs or Edge Functions. No browser storage is the product data
  authority.

### Deterministic utilities (`src/utility/`)

Pure, testable functions own calculations: `health.ts` (BMR Mifflin-St Jeor,
BMI, TDEE, conversions, aggressive-rate checks), `plan.ts` (workout plan),
`mealPlan.ts` (meal plan), `grocery.ts` (generation and merge policy),
`nutrition.ts` (totals, day status, averages), `progression.ts` (RPE-based
progression/regression), `textMeal.ts` (temporary text-meal parser), and `dates.ts`
(calendar keys, week math, formatting). Tests exist for `health` and
`progression`.

### Folder layout

Matches `ARCHITECTURE.md`: routes/layouts in `src/app/`, shared components in
`src/components/`, catalogs in `src/constants/`, context in `src/contexts/`,
Supabase clients in `src/lib/supabase/`, repositories/caches in `src/services/`,
types in `src/types/`, and pure logic in `src/utility/`.

## PWA and Metadata

- **Manifest** (`src/app/manifest.ts`): `name` "Calisthenics & Nutrition
  Coach", `short_name` "CaliCoach", `display` "standalone", `start_url` "/",
  `background_color` `#f6f5fa` (cream), `theme_color` `#e2def6` (lav-100),
  and SVG icons (192px any + 512px maskable) pointing at `/icon.svg`.
- **App icon** (`src/app/icon.svg`): a rounded-square lavender tile with an
  ink dumbbell glyph plus coral and mint accent circles.
- **Layout metadata** (`src/app/layout.tsx`): title, description, and
  `applicationName`. `viewport` sets `themeColor` `#e2def6`, `width`
  "device-width", and `initialScale` 1.
- **PWA status:** the manifest and SVG icon are the only PWA pieces shipped.
  A service worker (Serwist) and raster 192/512 icons are not yet implemented;
  see [Implemented vs. Planned](#implemented-vs-planned).

## Supabase and Environment Setup

- **Environment keys:** `.env.example` documents the two client-safe variables,
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Commit
  only `.env.example`; local values go in `.env.local` (never committed).
  Never use a service-role key in a `NEXT_PUBLIC_*` variable.
- **Clients:** `src/lib/supabase/client.ts` (`createBrowserClient`) and
  `server.ts` (`createServerClient` with cookie store). Both require the env
  keys; missing configuration sends product routes to the auth setup page.
- **Session refresh:** `src/lib/supabase/proxy.ts` exposes `updateSession`,
  which refreshes Supabase cookies and checks claims. `src/proxy.ts` wires it to
  the app boundary with a matcher that excludes static assets, `icon.svg`, and
  PNGs; unauthenticated product requests redirect to sign-in.
- **PKCE auth:** `src/app/auth/confirm/route.ts` exchanges Supabase email-link
  tokens for the server session cookie and redirects to a sanitized `next`
  path or `/auth/auth-code-error`; `src/app/auth/auth-code-error/page.tsx`
  shows the expired-link fallback.
- **Auth pages/actions:** sign-in, sign-up, check-email, forgot-password,
  update-password, configuration, and sign-out are implemented under
  `src/app/auth/` and `src/app/auth/actions.ts`.
- **Configuration behavior:** when the env keys are absent, product routes
  redirect to `/auth/configuration`; the app does not expose dummy product data.
- See [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) for the dashboard, auth URL,
  and CLI caution steps.

## Scripts and Verification Commands

From [`package.json`](./package.json), the Next.js scripts are:

| Script | Command | Covers |
|--------|---------|--------|
| `dev` | `node scripts/copy-exercise-assets.mjs && next dev` | Local dev server; copies exercise frames first |
| `build` | `node scripts/copy-exercise-assets.mjs && next build` | Production build; copies exercise frames first |
| `start` | `next start` | Serve the production build |
| `typecheck` | `tsc --noEmit` | Strict TypeScript verification |
| `lint` | `eslint .` | ESLint (core-web-vitals + TypeScript configs) |
| `test:local` | `vitest run` | Local utility/repository/service tests |

Supabase CLI scripts (`supabase:start`, `supabase:reset`, `supabase:test`,
`supabase:lint`, `supabase:types`, `supabase:push:dry`) are prospective until
the backend and local database workflow are added. The `copy-exercise-assets`
pre-step makes exercise illustrations render offline from
`public/exercises`.

## Implemented vs. Planned

### Implemented (auth-first scaffold)

- Responsive Next.js App Router app with the pastel design system, tokens,
  typography, motion, and accessibility conventions documented above.
- Auth-first route protection, Supabase SSR clients, Proxy claim refresh, PKCE
  confirmation, sign-in/sign-up/recovery/update-password pages, and sign-out.
- Empty authenticated app state plus onboarding (profile/goal/target), weekly workout plan, workout session
  logger (planned vs. actual, RPE, skip/modify), nutrition logging (search,
  custom, text→review), saved meals, grocery list with merge policy, and
  progress/history/weight.
- Exercise catalog and bundled illustrations from `@bryllim/workout-guide`
  with CC BY-SA 4.0 attribution.
- PWA manifest and SVG app icon.
- Supabase SSR boundary: browser/server clients, session-refresh proxy,
  `src/proxy.ts` matcher, and the PKCE confirm/auth-code-error routes.

### Planned (not yet shipped)

- Supabase schema under `supabase/migrations/` with tables, constraints,
  indexes, RLS policies, grants/revokes, and authorized RPCs or Edge
  Functions for every durable mutation.
- Generated `src/types/database.generated.ts` after schema changes.
- Supabase-backed profile, plan, log, grocery, and progress repository (Context
  actions and routes should remain the UI boundary).
- Server-side AI text-meal extraction on a protected Edge Function (the
  current `parseMealText` is a temporary client parser), with schema-validated JSON and
  confirmation-before-save.
- PWA service worker (Serwist) and raster 192/512 icons; installability and
  offline caching are progressive enhancements.
- A production trusted, versioned nutrition database (the current starter
  catalog remains an estimate until replaced).

## Documentation Map Note and Resolved Contradictions

This file is DESIGN.md-owned visual/UX detail and does not expand the scope of
`FEATURES.md` or `ARCHITECTURE.md`. `ARCHITECTURE.md`'s "Styling and Design
System" and "Accessibility and Motion" sections remain authoritative; where
`DESIGN.md` specifies exact tokens, radii, and component conventions, that
specificity is DESIGN.md-owned detail and is consistent with the architecture
guidance (transform/opacity-only motion, 44px targets, tabular numerals, and
the reduced-motion override).

No contradictions were found between `FEATURES.md`, `ARCHITECTURE.md`,
`AGENTS.md`, `SUPABASE_SETUP.md`, and the source code during this audit. The
auth-first boundary is consistently labeled in source and setup documentation;
durable Supabase domain persistence remains explicitly pending.
