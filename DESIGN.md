# Cali - Exercise and Meal Planner — Design Decisions

> **Purpose:** Record the current visual direction, design tokens, UX patterns,
> responsive/navigation model, and auth-first setup for the app. This file is
> the owner of DESIGN.md-owned visual and component detail.
>
> **Product contract:** [`FEATURES.md`](./FEATURES.md)
> **Engineering contract:** [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> **Agent workflow:** [`AGENTS.md`](./AGENTS.md)
> **Supabase setup:** [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)

## MVP-3 design handover — 2026-10-04

Implemented surfaces include five focused onboarding groups, relative meal-cost
choices, a labeled final save, Home summary actions, remaining-calorie rings,
daily activity, Pilates selection, custom routines and session controls,
explicit unresolved diet slots, shared pressed/validation feedback, and optional
personal milestones. The pastel tokens and existing exercise media are retained.

Desktop 1440×900 and mobile 390×844 flows, keyboard order, large text, reduced
motion, and narrow overflow were verified locally on 2026-10-01. PR #3 merged
these surfaces into `main` on 2026-10-04; candidate and resulting-main CI passed,
including the public and authenticated browser suites. Recheck these
flows on the hosted candidate after deployment; no new hosted design acceptance
is implied. Hosted deployment, hosted Auth configuration, staging SMTP, final
hosted acceptance, and release sign-off remain pending.
See [`MVP3_HANDOVER.md`](./MVP3_HANDOVER.md) for remaining release
work and [`MVP_Priority_Matrix.md`](./MVP_Priority_Matrix.md) for dated evidence.

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
Cali - Exercise and Meal Planner app as it is implemented today. It reconciles
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

The current release is a **responsive Next.js auth-first application** with a
pastel, mobile-first interface. Authenticated users can set a profile and goal,
receive an editable weekly workout and meal plan, complete a workout and log
food, review progress, and adjust the next plan. Supabase is authoritative for
durable data; only recoverable browser drafts are local.

- **Visual reference:** pastel palette and stat-focused, card-based mobile
  screens inspired by [`assets/ui_reference_01.jpg`](./assets/ui_reference_01.jpg).
- **Repository boundary:** Context actions call the authenticated Supabase
  repository and expose pending/error states. See [Domain, State, and Setup
  Architecture](#domain-state-and-setup-architecture).
- **Supabase SSR boundary:** browser/server clients, session-refresh Proxy, PKCE
  callback, auth pages, auth actions, durable schema, authenticated mutations,
  RLS/RPCs, migrations, and profile/plan/log repository are implemented. See
  [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) for verification and release
  dependencies.

> **Boundary label:** Product routes require an authenticated Supabase session.
> Without Supabase configuration, the app routes to the auth setup page instead
> of showing dummy data. The footer keeps the health/nutrition estimate
> disclaimer and distinguishes estimates from user-provided values.

## Visual Direction and Reference

The interface is a friendly, calm, non-clinical pastel design. Cards use soft
tints and rounded corners; screens are stat-focused and mobile-first.

- **Reference influence:** `assets/ui_reference_01.jpg` shows pastel hero
  cards with a greeting, stat grids, and quick-link cards. The Home screen
  follows this shape: a blush "Today's meals" hero, compact workout and activity
  summaries, and a four-tile quick-links grid.
  The meals hero groups its heading, local-date pill, logging status, and three
  compact macro columns on the left, with
  a vertically centered 116px calorie ring and overlapping Add food action on
  the right, matching the workout and steps summaries. The ring retains its
  short logging-status caption. Each macro column shows its label, bold recorded
  value (or "Not logged"), an "of {target} g" line, and a short bar underneath.
  Bars align across the strip, including when a value wraps. Card-content widths
  below 420px on non-mobile layouts place the heading and date across the top,
  logging status beside the ring, and the full-width macro strip beneath.
  Below the 768px mobile breakpoint, the ring is horizontally centered below
  the heading and date, with logging status and full-width macros underneath.
  The strip uses three equal
  columns when it has at least 15rem available, otherwise stacks the macros to
  support narrow cards and enlarged text. Long values wrap without truncation.
  Target assumptions stay in contextual help;
  unlogged days say "Not logged" instead of showing
  zero intake. It keeps one Add food action, without duplicate meal or progress
  shortcuts. Target details remain available in Nutrition and Settings. The
  weekly progress ring tracks workout completion and centers a rough energy
  estimate from completed sessions when supported profile inputs are available.
- Beside the meals hero, compact lavender "Your progress" and mint "Today's
  steps" cards form a right-column stack with a 16px gap and content-driven
  heights. At 1024px and wider, meals and "Today's workout" form an independent
  left-column stack, while progress and steps occupy the right-column stack.
  Both stacks start 35px below the dashboard origin, with 16px between cards.
  Desktop meals uses 50px vertical and 23px horizontal padding; today's workout
  uses 39px vertical padding and its existing 16px horizontal padding. Progress
  and steps each use 26px vertical and 23px horizontal padding from 768px upward.
  At 768–1023px, meals also uses 26px vertical and 23px horizontal padding.
  These Home-only overrides follow the existing tablet and desktop breakpoints;
  below 768px, meals retains 20px padding and the other summaries retain 16px.
  Today's workout keeps 16px padding below 1024px. Meals follows its content height
  rather than stretching to match the right column. Columns need not end at the same height; shortcuts
  begin below the taller stack. Below 1024px, only meals keeps the 35px top margin.
  Both right-column rings are 116px, matching the meals ring, and
  centered vertically beside each card's full summary. Below 1024px, the order
  is meals, workout progress, steps, the compact full-width workout card, then
  shortcut tiles. The workout action sits beside its summary when its card has at least
  420px of content width; otherwise it sits below at full width. Long content
  and enlarged text can increase either stack's height without a fixed budget.
  A shared stateless workout summary serves two responsive placements with
  distinct heading IDs. Complementary display rules expose only one region and
  action at a time, preserving visible reading and keyboard order.
  Each ring has a 44px circular plus action overlapping its upper-right edge,
  using the meals card's pale surface and chip shadow. Workout plus opens
  `/workouts` directly; steps plus opens `/activity` as the sole log/edit steps
  action, with an accessible label reflecting whether today's entry exists.
- Steps shows one bold, tabular confirmed count: "2,000 / 10,000" when a
  target exists, or "2,000" with "No daily target" when unset. The heading
  supplies the visible unit; assistive text announces "steps" and reads the
  slash as "of" once. The date and manual-source explanation
  stay in help. Missing entries say "Not logged" and "No steps logged today",
  with the chosen target when present; saved zero remains an observation.
  Recorded walking minutes, including zero, use a white clock-icon pill matching
  the meals date pill. The approximate calorie range ("≈110–160 kcal") uses
  a matching white pill with a decorative fire icon on the left. These
  informational pills share a wrapping row with a 12px gap and a fixed 16px
  top margin at every breakpoint.
  Missing walking time stays explicitly "Walking time not logged"; energy states
  distinguish unlogged activity, missing minutes, zero minutes, and unsupported
  profiles. The ring sits to the right of the summary and its target action.
  The duplicate log/edit steps button is omitted; the overlapping plus action
  serves both states. Estimate details open from the card's help panel. Below
  768px, workout and steps headings precede their horizontally centered rings;
  the completion percentage and step counter appear beneath their respective
  rings. Below 768px, the full progress and steps summaries are centered,
  including percentages, counts, supporting states, pills, each wrapped detail
  row, and steps actions. At 768px and wider, summaries and action rows remain
  left-aligned beside the rings. Headings and help controls keep their positions.
  Missing/unavailable walking energy remains plain supporting text. Their
  summaries and actions wrap to preserve readable enlarged text. Shortcut headings
  and icons wrap as well. All actions remain at least 44px tall.
  No target shows an empty track and dash with "No daily target"; a chosen
  target with unlogged activity also shows a dash, labeled "Not logged" rather
  than 0%. Saved zero shows 0%; other saved values fill steps divided by target.
  At or above the target, visual fill caps at 100% and the ring caption replaces
  "Of target" with "Target reached";
  the actual count remains unchanged. Accessible labels distinguish these states.
- The optional Movement onboarding target starts blank, can be skipped, and
  appears in Review as the chosen number or "Not set". Settings has a dedicated
  `/settings#daily-step-target` section for save/remove and draft recovery.
  It is a personal preference with no suggested default or calorie reward.
  Supported walking energy remains separate and uses the same broad range as
  Activity, with assumptions and an "Estimate details" link in contextual help.
- The workout-energy unlogged/unavailable status in Your progress uses a white
  informational pill with a decorative fire icon and a fixed 17px top margin
  at every breakpoint. It wraps with enlarged text
  and is omitted when the ring has an available estimate.
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

### Contextual help and copy density

Use a balanced reduction of visible text across product and authentication
screens. Keep headings, labels, units, saved values, primary actions, and concise
state messages visible. Remove repeated introductions and shortcut slogans.
Move calculation methods, assumptions, feature descriptions, and version/history
explanations into grouped contextual help. Keep estimate ranges, source/confidence
labels, privacy consent, destructive confirmations, and immediate exercise safety
cues visible at the decision point. Retain the short app/auth footer disclaimer.

`HelpPopover` uses a circled question-mark icon in a 44×44px button, usually one
per card or related section. Distinct concepts such as daily step targets, BMR,
BMI, TDEE, and RPE may have their own help. The icon sits beside the heading or
label, outside labels and other interactive elements. Panels use existing
colors, a white rounded surface, readable body text, and a soft shadow.

Mouse hover after 300ms and keyboard focus show a preview without moving focus.
Click/tap or Enter/Space pins the panel and focuses its named non-modal dialog.
Links and a close button remain keyboard accessible. Escape, the trigger, close,
or outside interaction dismiss it; keyboard/close dismissal restores trigger
focus while outside interaction retains destination focus. A dismissed panel
does not immediately reopen from lingering hover or focus. Only one panel is
open at a time. Portals avoid clipping; positioning respects 16px viewport
margins, a 320px maximum width, available height, enlarged text, and reduced
motion. Historical records and task editors keep their existing expanders.

Local verification on 2026-10-06 covered 1168×930, 1440×900, 390×844,
320px width, enlarged text, and reduced motion. Shared help and representative
route checks cover mouse preview, keyboard and touch activation, dismissal,
focus return, source links, one open panel, viewport bounds, and unchanged
drafts. Public and authenticated scenarios passed across the full gate and
focused onboarding/account rechecks using isolated local accounts and port 3030.

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
  Home's greeting has no date row. The local date appears as a white rounded
  pill immediately after the meals-card help icon, with a 12px left margin.
  It wraps within the heading group at narrow widths and enlarged text sizes.
  Home has no separate Quick actions card.
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

MVP-3 uses five groups: About you, Movement, Food choices, Your goal, Review.
Headings receive focus on step changes. Review emphasizes the daily estimate
and choices; calculation details are expandable. Cost choices use familiar labels
and explain that they are relative costs, not prices. The final button says
“Saving your plan…” with a spinner/status announcement; navigation controls are
disabled until the save resolves, and failures leave the draft visible.

Home and Nutrition use a decreasing calories-remaining ring with accessible
numeric text. An unlogged day shows a dash, partial logs say “Still logging,”
over-target intake has a neutral numeric label, and missing targets are explicit.
The ring follows the selected date's effective target version; a later target
change does not alter the earlier day's display.
Food intake and activity energy remain separate. Home summary actions use large
touch targets. Steps and custom-routine forms retain drafts during failures.
Custom sessions keep the planned dose visible above actual inputs and provide
large complete/skip, pause/resume, and finish controls.

Shared buttons use a brief pressed scale and disabled/loading feedback. Inputs
use hover, focus, and invalid borders. Existing focus rings, keyboard behavior,
pastel surfaces, and global reduced-motion overrides are preserved. Optional
milestone cards use the existing short pop transition; no guilt or calorie reward
is attached to the milestone labels.
Settings uses matching cream rows for Milestones and future reminders, with a
visible label and description beside a stateful switch. The switch keeps a
44px touch target and its thumb position matches the saved on/off state.
Settings reads from profile to Your targets and Units & weight, then Daily step
target, Gentle motivation, Notifications, and account controls. This order is
the same on mobile and desktop so visual and keyboard navigation agree.
The profile summary presents experience, weekly training days, session length,
and goal as separate wrapping pills close beneath the name. The avatar stays
vertically centered beside the content. Edit uses the primary button and is
centered against the card from the small breakpoint upward; on narrower screens
it stays beside the name to leave room for the wrapping pills.
The step-target field uses the card heading as its visible label and retains an
accessible input label without repeating the heading on screen.
The four target tiles align their labels, help controls, and values. Their
backgrounds use the Home palette in order: blush for BMR, lavender for BMI,
mint for TDEE, and peach for the daily target. Color adds visual variety without
carrying health meaning; each tile retains its text label and value. Unit choices
display Metric and Imperial in title case while retaining their saved values.
Data controls groups Export JSON, Export CSV bundle, and Regenerate plan as
filled gray buttons in one row from the medium breakpoint; they stack on
smaller screens. Export status appears below that group, before account actions.

### Bottom navigation (`BottomNav.tsx`)

Mobile-only (`md:hidden`) floating pill: `fixed bottom-3 left-1/2 z-40
w-[calc(100vw_-_1.5rem)] max-w-md -translate-x-1/2 rounded-full bg-white/90
p-2 shadow-card backdrop-blur`. Its viewport-relative width keeps the five equal-width
tabs centered with symmetric 12px side margins on narrow mobile viewports.
Five tabs, each `h-12`, using `lucide-react` icons with `sr-only` labels:

- Home (`Home`)
- Workouts (`Dumbbell`)
- Nutrition (`UtensilsCrossed`)
- Grocery (`ShoppingBasket`)
- Progress (`TrendingUp`)

The active tab uses `bg-lav-100 text-ink`; inactive uses `text-muted`. All
tabs set `aria-current="page"` when active. Settings is reachable from the
header and the avatar, not from the bottom nav.

### Grocery custom-item form

The weekly list explains that the form adds items outside the meal plan. On
narrow screens, the item-name input takes a full row so entered text stays
readable; quantity, unit, and Add sit below it. At wider widths, the controls
share one row with fixed widths for quantity and unit. The item name has a
descriptive accessible label, and an in-progress item remains a recoverable
draft until it is saved. In the list below, narrow item rows keep the name and
remove action above the quantity controls; names can wrap, and the checkbox
has a 44px touch target.

## Shared UI Component Inventory

All shared primitives live in `src/components/ui/` plus the cross-route
components in `src/components/`.

| Component | File | Conventions |
|-----------|------|-------------|
| `Card` | `ui/Card.tsx` | `CardTone` union → tint background; `rounded-3xl p-5 shadow-card`; no default padding override unless `className` adds `p-4` (as `StatTile` does). |
| `Button` | `ui/Button.tsx` | Variants `primary` (`bg-ink text-white`), `soft` (`bg-white/70`), `ghost`, `danger` (`bg-coral-200`). `min-h-12` (3rem = 44px+) target, `rounded-2xl px-5 text-sm font-bold`, disabled = `opacity-50` + `cursor-not-allowed`. |
| `Chip` | `ui/Chip.tsx` | Round frosted icon chip, `h-11 w-11` (44px target), `bg-white/70 shadow-chip`, required `label` → `aria-label` + `title`. |
| `HelpPopover` / `HelpHeading` | `ui/HelpPopover.tsx` | Grouped circled-question-mark help; 44px trigger; hover/focus preview and click/tap pinning; named non-modal dialog, source links, viewport-aware portal, and deliberate focus return. |
| `ProgressRing` | `ui/ProgressRing.tsx` | Accessible circular progress; `role="img"` + `aria-label` percentage; `tabular-nums` center value. |
| `ProgressBar` | `ui/ProgressBar.tsx` | `role="progressbar"` with `aria-valuenow/min/max` for logged values and text for unlogged values; `tabular-nums` value/target; compact styling and bar color overridable. |
| `StatTile` | `ui/StatTile.tsx` | `Card`-based, `p-4`, `tabular-nums` value, optional sub-line. |
| `ToastHost` | `ui/Toast.tsx` | `aria-live="polite"` host; `animate-pop` ink toasts; tone icon per `ok/info/warn`. |
| `DayStrip` | `components/DayStrip.tsx` | Horizontal week selector (`role="group"`, `aria-pressed` per day); 44px minimum day controls with compact gaps, today highlighted with a lavender badge. |
| `EmptyState` | `components/EmptyState.tsx` | Dashed lavender-bordered centered panel with optional action node. |
| `ExerciseIllustration` | `components/ExerciseIllustration.tsx` | Renders `/exercises/<slug>.png` via `next/image`; `illustrationAlt` alt text plus an `sr-only` CC BY-SA 4.0 credit. |
| `Sparkline` / `HistoryList` | `components/progress/progressShared.tsx` | Weight sparkline (`role="img"`, `aria-label`) appears only with at least two entries; empty and single-entry states use compact dated text rather than an empty chart or fabricated change. The Weight card keeps its content height beside the taller Calendar card on desktop. The chart has inset endpoints and a capped width, with its date range and entry count below. The accessible calendar history summary lists entries; nutrition rows show human-readable food labels instead of internal IDs. Each history row stays within the card width and exposes horizontal scrolling for long details on narrow screens. |

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
  value provenance, estimate ranges, and serving basis are shown on nutrition
  entries and the unified meal review. Composite confirmations render one
  collapsed grouped meal card with an accessible ingredient disclosure. See
  `FEATURES.md` for the production nutrition database requirement.

## Domain, State, and Setup Architecture

### Snapshot model (`src/types/domain.ts`)

`AppSnapshot` is the compact durable read state: `schemaVersion`, `userId`,
`onboarded`, `profile`, `target`, `plan` (`WorkoutPlan`), `mealPlan`
(`MealPlan`), `sessions`, `nutritionLogs`, `loggedMeals`, `weights`, `grocery`
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

- **Manifest** (`src/app/manifest.ts`): `name` "Cali - Exercise and Meal
  Planner", `short_name` "Cali - Exercise and Meal Planner", `display`
  "standalone", `start_url` "/",
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
  `src/app/auth/` and `src/app/auth/actions.ts`. Successful sign-in and other
  session-changing auth forms navigate with a new document request so the root
  provider receives the authenticated account snapshot immediately. Existing
  accounts open Home; new accounts continue onboarding. If the initial account
  read fails, a retry screen appears instead of an empty onboarding state.
- **Signup validation:** account creation keeps the email and password fields
  in component state after validation errors. Password mismatch is shown in the
  form alert and beside both password fields, with accessible invalid-state
  attributes and coral styling; editing either password clears both inline
  mismatch messages. Field values are not persisted locally.
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
`supabase:lint`, `supabase:types`, `supabase:push:dry`) operate on the current
backend workflow; the CLI is pinned in the lockfile. Repository integration
and authenticated browser gates require the disposable local Supabase stack.
The `copy-exercise-assets` pre-step makes exercise illustrations render
offline from `public/exercises`.

## Implemented vs. Planned

### Implemented (authenticated MVP application)

- MVP-3 onboarding, activity, calorie-budget, workout/diet choice, shared input
  feedback, and opt-in milestones described above; release gates remain open.
- Responsive Next.js App Router app with the pastel design system, tokens,
  typography, motion, and accessibility conventions documented above.
- Auth-first route protection, Supabase SSR clients, Proxy claim refresh, PKCE
  confirmation, sign-in/sign-up/recovery/update-password pages, and sign-out.
- Authenticated onboarding and profile/goal/target setup; versioned editable
  workout and meal plans; a workout logger that keeps planned and actual values
  separate; nutrition logging and review; saved meals; reconciled groceries;
  and progress/history/weight.
- Supabase-backed durable profile, plan, workout, nutrition, grocery, history,
  export, and account-deletion flows through the repository and authorized RPCs.
- Protected on-demand USDA search and server-side AI meal extraction/estimate
  flows, with confirmation before saving and visible source/uncertainty.
- Automated local database, repository, and authenticated mobile/desktop
  browser gates; public sign-in and configuration states.
- Exercise catalog and bundled illustrations from `@bryllim/workout-guide`
  with CC BY-SA 4.0 attribution.
- PWA manifest and SVG app icon.
- Supabase SSR boundary: browser/server clients, session-refresh proxy,
  `src/proxy.ts` matcher, and the PKCE confirm/auth-code-error routes.

### Planned (post-MVP or release operations)

- PWA service worker (Serwist) and raster 192/512 icons; installability and
  offline synchronization remain progressive enhancements.
- Production Auth Site URL/redirects, live SMTP confirmation/recovery,
  leaked-password protection, and public deployment are separate launch gates.
- The starter food catalog remains estimated reference data; the app does not
  claim a bulk-imported trusted catalog. USDA lookup is on demand.

## Documentation Map Note and Resolved Contradictions

This file is DESIGN.md-owned visual/UX detail and does not expand the scope of
`FEATURES.md` or `ARCHITECTURE.md`. `ARCHITECTURE.md`'s "Styling and Design
System" and "Accessibility and Motion" sections remain authoritative; where
`DESIGN.md` specifies exact tokens, radii, and component conventions, that
specificity is DESIGN.md-owned detail and is consistent with the architecture
guidance (transform/opacity-only motion, 44px targets, tabular numerals, and
the reduced-motion override).

No contradictions were found between `FEATURES.md`, `ARCHITECTURE.md`,
`AGENTS.md`, `SUPABASE_SETUP.md`, and the source code during the 2026-09-28
status update. The auth-first boundary is consistently labeled in source and
setup documentation; durable Supabase domain persistence is implemented. See
the current RC3 verification record in `MVP_Priority_Matrix.md` for gates that
remain unverified.
