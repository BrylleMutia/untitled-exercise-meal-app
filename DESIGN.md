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
empty unfilled diet slots, shared pressed/validation feedback, and optional
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
- The workout progress summary always has a white fire-icon pill showing the
  numeric energy count (for example, "0 kcal" or "140 kcal"). When the estimate
  is unavailable, zero is a visual placeholder with an assistive explanation;
  the ring keeps its unavailable dash and "kcal est." label. Available values
  retain the existing rough weekly estimate and its help/assistive context.
- Steps shows one bold, tabular confirmed count: "2,000 / 10,000" when a
  target exists, or "2,000" with "No daily target" when unset. The heading
  supplies the visible unit; assistive text announces "steps" and reads the
  slash as "of" once. The date and manual-source explanation
  stay in help. A missing entry displays "0 / 10,000" when a target is set,
  or "0" without one, with a visible "Not logged" status and an unavailable
  ring. The zero is a visual placeholder, not a saved observation; assistive
  text says no steps were logged. Saved zero remains an observation.
  Recorded walking time uses compact units ("0 mins", "35 mins", "1 hr", or
  "1 hr 30 mins") in a white clock-icon pill matching
  the meals date pill. The approximate calorie range ("≈110–160 kcal") uses
  a matching white pill with a decorative fire icon on the left. These
  informational pills share a wrapping row with a 12px gap and a fixed 16px
  top margin at every breakpoint.
  For unlogged activity, matching clock and fire pills show "0 mins"
  and "0 kcal" as placeholders, with the visible "Not logged" status and
  assistive descriptions preserving their meaning. For a saved entry, missing
  walking time stays explicitly "Walking time not logged"; energy states
  distinguish missing minutes, zero minutes, and unsupported profiles. The ring
  sits to the right of the summary and its target action.
  The duplicate log/edit steps button is omitted; the overlapping plus action
  serves both states. Estimate details open from the card's help panel. Below
  768px, workout and steps headings precede their horizontally centered rings;
  the completion percentage and step counter appear beneath their respective
  rings. Below 768px, the full progress and steps summaries are centered,
  including percentages, counts, supporting states, pills, each wrapped detail
  row, and steps actions. At 768px and wider, summaries and action rows remain
  left-aligned beside the rings. Headings and help controls keep their positions.
  Missing/unavailable walking energy on saved entries remains plain supporting text. Their
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
- **Nutrition metrics** use shared semantic aliases and the presentation mapping
  in `nutritionMetrics.ts`: calories pastel red (`coral-200`), protein lavender
  (`lav-300`), carbs peach (`peach-200`), and fat mint (`mint-200`). Progress bars
  and nutrition pills use these same fills. Larger metric surfaces use the
  corresponding `100` tint; calorie rings use `coral-300`. Home, Nutrition,
  onboarding, Settings, Progress, and activity energy share this mapping. The
  Home steps summary is an explicit exception: its clock and walking-calorie
  pills both use white backgrounds.
- **Nutrition summaries** use separate rounded pills in Calories → Protein →
  Carbs → Fat order, with dark ink text, explicit units and macro labels, and
  tabular numerals. They wrap naturally at narrow widths and enlarged text.
  Food previews, reviewed meals, serving confirmations, Eaten entries, ingredient
  summaries, and calorie-only history summaries use the shared `NutritionPills`
  renderer. Inputs remain editable with metric-colored visible labels. Invalid
  or blank drafts do not show a zero preview; missing intake remains unlogged.
  Source, confidence, preparation assumptions, and ranges remain separate.
- **Confidence chips** in nutrition use tone by confidence: high `mint-100`,
  medium `peach-100`, low `coral-100`.
- **`lav-500`** is the accent for focus outlines and generic progress rings.
- **`coral`** identifies calories as a neutral metric category and retains existing
  confidence/caution uses. It does not identify operational errors or destructive
  actions. Calorie color never judges intake or marks an over-target value as failure.
- **Semantic danger colors** use `danger-50` #FEF2F2, `danger-100` #FEE2E2,
  `danger-200` #FECACA, `danger-300` #FCA5A5, `danger-600` #DC2626, and
  `danger-900` #7F1D1D. Error panels and explicit error toasts use the 50/100
  backgrounds with 900 text. Danger buttons use 200, hover 300 and 900 text;
  invalid fields use 600 borders. Text contrast exceeds 4.5:1 on both button
  states. Ordinary warning/info/success tones and nutrition pills remain unchanged.
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

### Shared card composition

Use the sectioned recipe editor (Option C) as the composition reference for
new or reused task cards. Inherit the existing tone, typography, and metric
tokens rather than copying the recipe's content or adding sections to simple
cards that do not need them.

- **Anatomy:** an optional heading/action row, a body grouped by related tasks,
  and an optional action footer. Give each substantial section a descriptive
  heading; keep sections expanded unless the feature calls for an expander.
- **Hierarchy:** headings use Nunito `font-extrabold`, visible field labels and
  actions use `font-bold`, and supporting source/assumption text uses
  `text-ink-soft`. Task-card titles use `text-lg`; modal titles use
  `text-xl sm:text-2xl`. Keep numbers tabular and units explicit.
- **Spacing:** retain `Card`'s `p-5` default and `p-4` compact padding. Use
  `gap-2`/`gap-3` within related rows and `gap-6` between substantial sections.
  Where a separator helps, use `border-t border-lav-100 pt-6`. Place more space
  between sections than between a heading and its content.
- **Surfaces:** white is the primary editor surface; light pastel tints group
  related rows and editing areas. Use `rounded-3xl shadow-card` on the outer
  card and `rounded-2xl` on inner rows, inputs, and controls. Prefer open sections
  with subtle rules to repeated nested cards and shadows. Existing colored
  dashboard cards retain their established tones.
- **Controls:** persistent labels accompany placeholders; use shared button
  variants and descriptive 44px remove icons. Put the primary action at the
  end of the reading order and recovery actions beside the relevant message.
  Keep nutrition pills informational, wrapping, and separate from source,
  confidence, assumptions, and errors.
  For recipe servings, use a labeled numeric field between 44px minus/plus
  buttons, retaining direct fractional input and hiding native spinner arrows.
  Give the servings controls a pale lavender backing so their soft white circular
  buttons have the same visible treatment as ingredient removal controls.
  Keep row removal at the trailing edge after the measurement selector, bottom
  aligned with its input. When controls wrap, keep measurement and removal together.
- **Responsive layout:** use `min-w-0`, wrapping actions and pills, and stacked
  fields where space is tight. Long names and instructions must wrap; numeric
  inputs retain readable width. Verify 320px layouts and 200% text enlargement.

### Task modals

The shared `Modal` is a presentation-only Floating UI dialog. At 640px and above,
it is centered with `max-w-3xl` (48rem), 24px viewport clearance, rounded corners,
and the existing card shadow. Below 640px it fills the available viewport and
respects safe areas. A dim ink backdrop isolates the task; the header and footer
use `lav-50`, and the white body scrolls independently. Header and footer stay
visible, with Cancel left and the primary action right; phone actions use two
columns. Exceptionally tall headers or recovery messages can scroll within
their own bounded area so enlarged text and short viewports remain usable.

Opening traps focus and makes the background unavailable to interaction and
scrolling. Closing returns focus to the originating control. The close icon,
Cancel, Escape, and a direct backdrop click dismiss a recoverable editor;
authoritative saving disables dismissal. Contextual help is a nested non-modal
surface whose Escape and outside interactions do not also dismiss its parent.
Use one brief `animate-pop` entrance and honor reduced motion. Required fields,
operational errors, provider disclosure, draft recovery, and retry controls stay
visible within the modal rather than relying on background toasts.

### Saved-recipe search and portion review

The Nutrition meal-entry field reads “Search foods or saved recipes, or describe
a meal.” Results use compact white rows with Saved recipes above Foods. Recipe
names wrap, per-serving calories use the shared coral pill, and spelling
suggestions retain the Close match label. A saved match suppresses the analysis
suggestion; explicit provider actions remain available.

Selecting a saved recipe, local food, or explicit USDA result replaces search
controls and all matches with its inline white portion review. Entry tabs and
unrelated description review are hidden while preserving their input. The review
retains date/slot context and the search query. Focus
moves to the visible Recipe servings field, initialized to 1. Shared macro pills
show the selected portion, followed by a concise estimate/source statement and
contextual source help. Log meal is primary, Add to plan secondary, then Cancel.
Controls and pills wrap on narrow screens and enlarged text. Cancel returns
focus to search. Pending saves disable selection and portion changes; errors
and stale/unavailable-recipe recovery stay visible in the review. This flow adds
no motion beyond the existing reduced-motion-aware shared controls.

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

### Nutrition day card

The existing pastel summary has Previous week / Today / Next week controls above
the day strip. The week range is assistive-only text describing this navigation
group. A wrapping Planned / Eaten segmented control sits in the upper-right action group, with Eaten
selected on entry and accessible pressed states. On narrow layouts that action
group wraps below week navigation while retaining its own control order.
Toolbar arrows, both toggle buttons and Today share a 44px height at normal text
size, using relative sizing that scales consistently with enlarged text. Arrows
use the shared icon control's compact 44px option; its default elsewhere remains
48px. The toggle has no outer padding, so its visible height matches the buttons.
Text buttons use compact horizontal padding with unchanged typography and at
least 44px touch targets. Navigation wraps in Previous / Today / Next order when
space is limited, including enlarged-text layouts. The toggle can stack its equal-height options
when both labels cannot fit on one row. Labels remain fully visible without
clipping or horizontal overflow.
Switching it changes only the summary. Navigation preserves the weekday and is
disabled while saving. Loading and retry feedback precede totals; values from
another week never appear beneath the newly selected date.
Day buttons show weekday, number and abbreviated month vertically (WED / 14 /
Oct), with normal-weight weekday/month labels and an emphasized date number.
Each date uses its own month across boundaries. Accessible names include the
full local date and year; selected and Today indications remain available.
The calendar treatment uses one flat page per day, with a blush weekday header,
a fine dashed perforation divider and a white paper body. A selected page has
a navy header with white normal-weight weekday text,
a thin navy border and dark date text on white. Existing Today markers remain.
Modest corners and a single outline keep the calendar shape clear, without
stacked paper edges or shadows. No raster assets or baked-in date text are used.
Scroll padding accommodates the keyboard focus
outline, and narrow/enlarged-text layouts retain horizontal day-strip scrolling.
Unlogged Eaten summaries retain the empty macro tracks when targets exist,
“No meals eaten” and “Not logged” labels, and no colored fill. Empty tracks omit
numeric current values for assistive technology and never imply zero intake.

Eaten's supporting line uses “No meals eaten”, “1 meal eaten” or “N meals eaten,” counting grouped
meals once and standalone food rows separately. “No meals eaten” describes no saved
entries, while the ring/macros and contextual help continue to distinguish unknown
intake from recorded zero nutrition.

Editing a saved-recipe Eaten row opens a compact servings review rather than
ingredient selectors. The recipe name and saved date/slot provide context above
one Recipe servings input, which receives focus. Nutrition pills preview the
corrected historical portion (whole calories and at most one macro decimal).
Save correction and Cancel wrap without clipping at narrow widths or enlarged
text; both return focus to the row's Edit control after closing. Pending saves
disable inputs, dismissal and competing row actions. Errors retain the portion.
Older history with no reliable portion adds a labeled Previously logged recipe
servings input; it never substitutes a guessed one-serving basis.

Planned and Eaten share one summary layout: date/status/help beside a 96px
remaining-calorie ring, a calorie/target line, then the three macro progress rows.
Planned labels its ring “kcal to target” and its totals “kcal planned”; Eaten keeps
its intake wording. Their values and statuses remain independent. Context describes active and skipped counts
and explains that logged planned meals remain included. Empty and fully skipped
states show text instead of zero totals. Unknown metrics display Unavailable;
known incomplete subtotals carry Partial total and no complete progress bar.
Incomplete planned calories leave the ring unavailable; a known calorie total
can still drive the ring when only another metric is incomplete. Over-target
plans show zero remaining with the excess stated below the ring.
Macros retain one decimal where needed in both summary modes. Controls and labels
wrap at 320px and enlarged text, with existing focus and reduced-motion treatment.

A single Planned card follows the daily summary for every selected day. Each
Breakfast, Lunch, Dinner and Snack heading has a right-aligned Plus + Add meal
control. It opens one inline editor beneath that heading with the slot fixed;
there is no header Add to plan button or entry slot selector. Switching groups
preserves account/date/slot drafts. Search/manual mode has a Close control;
closing or successful saving returns focus to the originating Add meal button.
Selection shows only the food/recipe review, focusing quantity/servings. Review
Cancel restores search/results and focus without discarding description input.
Log meal and Add to plan remain separate review actions. Pending food and recipe
saves disable portion changes, dismissal and all group entry controls. If no
eligible goal is available, the prerequisite is explained while logging remains
available.

Four Breakfast, Lunch, Dinner, and Snack groups contain multiple planned and
Eaten rows. These labels distinguish prescription from intake without a
separate Logged section. An empty group states “Nothing planned or logged.” Daily summary and help retain
the distinction between unknown intake and zero. Planned
and Eaten entries share compact lavender rows with a status, name, wrapping
calorie/protein/carbohydrate/fat pills, source context and right-aligned actions.
They have no image banners, recipe yield/time/complexity pills or favorite controls.
Planned values describe the displayed planned portion; Eaten values come from
saved history. Planned recipe summaries open the overview. Actions wrap below
the summary when space is limited; expanded details/editors remain inside the row.
Planned rows retain Edit and Skip/Plan again and add Log, which opens an in-place
actual-serving confirmation. A successful linked log hides its Planned row to
avoid repetition while keeping the plan snapshot intact. Linked Eaten rows
offer Edit and Delete without Log again; deleting the last linked Eaten row
reveals Planned again. Eaten rows retain expand, edit, and delete.
Meal-entry reviews retain separate Log meal and Add to plan actions with a positive
portion and the selected meal slot. Actions have 44px or larger touch targets.
Meal entry focuses its search field after draft recovery, or the portion field
for a restored selection. Recipes cards have no planning footer; Add meal and
Generate remain the planning entry points.

### Saved-recipe authoring

Saved meals use the approved Option 1 pastel-banner `RecipeCard`.
Saved banners are lavender. The shared cover places a rounded image toward the
left and falls back to the existing default bowl.
The upper-right badge is Popular for the five most eaten recipes in the last
30 local days, or Favorite when favorited outside that group. The wrapping name
and separate 44px heart occupy the next row. Image and name open the overview;
the heart only changes the personal favorite and reflects server confirmation.
Coral calories remain per serving, with an accessible basis label and contextual
help rather than a visible suffix. A mint pie-icon pill shows the whole recipe
yield. Lavender time means whole-recipe minutes displayed as “X mins”;
its accessible label retains the whole-recipe
basis. Missing time reads “Not set” and explicit zero remains valid. Peach
complexity shows Easy, Medium, or Hard, defaulting missing recipe values to Medium.
Descriptions are omitted. The Planned section uses compact meal rows instead
of recipe cards, including valid food-only and skipped entries. Unloggable
planned rows are hidden; a slot with no visible planned or eaten rows uses
“Nothing planned or logged.” with its heading and Add meal action. Loading/error
states remain distinct. This presentation does not remove stored records or
alter planned totals, actual intake or generation occupancy.

Recipes cards omit the action footer and divider. Edit sits at the image's
lower-right in a separate 44px white circular button with a subtle shadow,
visible focus and a dismissible hover/focus tooltip. Image opening and editing
use sibling buttons; tooltip and focus layers stay outside image clipping.
Archive lives in the Edit recipe footer as a 44px square danger icon, before
Cancel and Save changes in one horizontal row at every supported width. Text
may wrap inside the text buttons at enlarged text sizes; the controls stay in
one row and Save changes remains right-aligned on desktop. Creation has no
Archive action. Its accessible name and portaled tooltip are “Archive recipe”;
the tooltip stays outside footer clipping and dismisses before the editor.
The footer omits the archive explanation. Archive opens one final
Archive recipe? modal with Keep editing initially focused and a danger action.
That confirmation names the saved recipe and explains that archive hides it
from Recipes, retains existing plans/history, and discards unsaved edits.
Cancel, Escape and backdrop dismissal return to the same draft/tab/scroll;
only the inner modal dismisses. Pending archive locks competing actions and
both dialogs' dismissal. Failure preserves edits with retry using the original
operation identity; success clears the draft, closes both dialogs and focuses
Create. Archiving from an overview never reopens that archived overview.
Shared recipes offer Save personal copy in the overview, with no unauthorized
archive/edit controls. Other RecipeCard usages retain contextual footers.
The Recipes header places a secondary Filter recipes icon with an active-category
badge before a primary Plus icon named Create. Planned uses a secondary CalendarDays
icon named Overview when connected, followed by a primary WandSparkles icon named
Generate. These actions use 44px targets and hover/focus tooltips, with the same
DOM and keyboard order as their visual order.
Regular and compact recipe resource pills show approximate calories such as
“≈609 kcal”, without a calorie icon. Their accessible label retains calories
per serving; zero is distinct from unknown, which remains explicitly unavailable.
Owned/shared cards in Recipes opt into tighter resource pills below 640px:
12px base text/icons, 8px horizontal and 4px vertical pill padding, 4px gaps and
8px vertical group padding. All four values stay in one non-wrapping row, with
native horizontal scrolling when necessary. Intrinsic-width pills never shrink
or truncate their labels. Only an overflowing mobile row becomes a keyboard
tab stop, with visible focus and a scrolling description; the scrollbar is
visually hidden while touch, trackpad and keyboard scrolling remain available. Desktop restores regular wrapping. Generate's compact wrapping
and cooking-overview cards retain their layouts. Meal-entry and daily nutrition
summaries retain their existing units.
Breakfast, Lunch, Dinner and Snack headers use 44px secondary Plus icons named
Add meal, with slot-specific tooltips. Existing IDs, expanded state, pending
restrictions, toggling, drafts and focus return are preserved at all widths.

Filter recipes uses the shared modal with Recipe name, Favorites only, Source,
Meal time, Total cooking time and Difficulty. Apply filters commits edits;
Reset clears only the draft; Cancel, close and Escape discard unapplied edits.
Focus returns to the filter icon. Filter groups use OR within and AND between;
blank groups are unrestricted. Applied filters show a result count and Clear
filters. No matches, empty collection, shared loading/error and unavailable
favorite metadata have distinct feedback. Filters remain page-session state.

Meal duplication is removed; ordinary Create and Edit draft recovery remains.
Planned rows retain Edit, Skip/Plan again, and Log beside the summary. Expanded
editors and confirmations follow the summary. Opening Planned Edit focuses its
choice field
after draft recovery; cancellation or successful saving returns to Edit.
Lists preserve slot grouping and ordering. Planned/Eaten rows remain a single
column; Saved cards use one column on phones and up to two where space permits.
Pills/actions wrap at enlarged text sizes. Fine-pointer
hover lifts the card slightly, entry fades briefly, and confirmed hearts pulse;
reduced motion disables these effects.

Card padding and the 44px heart retain physical sizing when text is enlarged,
leaving room for wrapping names and metadata. Page headings, shell controls and
grouped eaten-meal actions wrap as well, so the surrounding page stays within
the actual 320px screen at 200% text. Recipe overlays use dynamic viewport width,
square covers that shrink to available space, and zero-minimum grid columns to
prevent native input widths from expanding the phone layout.

Create and Edit preserve the Option C authoring controls within the approved
Option 1 composition. Details contains name/servings/time/complexity with
no visible Recipe basics heading, per-serving nutrition and optional Reference.
Ingredients contains cooking measurements, entry methods, included rows, and review;
Instructions contains the required multiline method. Save actions stay in
the modal footer. Persistent numeric
labels accompany “Servings” and “Quantity” placeholders; new fields start blank.
The approved Option 1 extends this editor with a centered square cover in a
lavender surface above the tabs. The shared
`RecipeCover`, `RecipeImagePicker`, and `RecipeTabs` components keep creation,
editing, overview, and saved-meal thumbnails consistent. The generated generic
cartoon chicken, vegetable and rice bowl uses pronounced dark outlines,
simplified food shapes and flatter shading on a pale lavender background. It is
decorative fallback media, not a depiction of the saved ingredients. The shared
asset retains its square proportions and existing cover/thumbnail sizing;
uploaded, external and predefined recipe covers remain independent. “Change image” expands Upload, Use image URL, and Reset to
default actions without introducing another dialog.
Change image contains Upload, Use image URL and Reset to default, without a
preset gallery. Previously saved cartoon assets remain supported. Details
contains “Use this recipe for” native checkboxes, two columns on narrow screens
and four where space permits, with 44px labels and visible keyboard focus.
At least one assignment and a whole recipe yield from 1 to 10,000 are required.
The overview lists these assignments in Details; artwork does not select meals.

Sticky Teriyaki Chicken and Chicken Burrito Protein Boxes use square illustrative
food photographs matching the existing predefined covers: glazed chicken/rice,
and sliced chicken with beans, corn and peppers, respectively. They use the shared
cover loading/fallback path. Original cooking measurements stay in Ingredients;
Details contains ingredient-calculated nutrition, quoted source macros for
comparison, the reference, conversion proxies and confirmed tin-weight/garnish
assumptions. No alternate image picker or new authoring control is introduced.

The Nutrition recipe section is labeled “Recipes”, including its region and
contextual help. Generate in the Planned header uses the shared navy primary
button with a leading WandSparkles icon; Create in the Recipes header uses the
navy primary button with a leading plus icon, beside the secondary Filter recipes icon. Generate opens “Generate plan” with
Choose days first and no standalone week range. Each date retains its full date
and year for assistive technology. The one-batch explanation lives in the shared
header help popover. Selectable compact cards reuse recipe covers and the pastel
surfaces, showing name, assigned meals, yield, already-planned and remaining
servings. Each whole-card label owns a visually hidden native checkbox with a recipe-name label,
associated planning details, a thin navy selected border and visible focus.
The square cover fills its image well inside a 15px background inset on every
side. The unobstructed name sits below the image without a visible checkbox.
Selection is shown through the navy border and lavender background; the focus
outline remains distinct from selection.
Every displayed card is selectable, including exhausted or restricted recipes.
Select all checks every displayed card; generation eligibility remains separate
from selection. Cards end at the yield/planned/remaining counters, with no
restriction or exclusion messages in their content or checkbox descriptions.
Unused-serving explanations remain in the preview. The Choose recipes heading
has right-aligned Select all (navy primary) and Clear (soft) actions with
ListChecks/ListX icons. Both this header and Choose days use icon-only actions
below 768px with at least 44 × 44px targets; icons and visible labels appear from
768px upward. Screen-reader labels remain available at every width without
redundant tooltips. The header and action group wrap
with the actions right-aligned when needed. Interaction freezes
during loading, stale review and saving.
The container-based grid uses two columns at normal mobile text size and up to
four in the desktop dialog; enlarged text reduces columns to keep content readable.
Cards omit calories, time, complexity, favorites and extra actions. Select all and Clear change an
immediate preview; Shuffle rearranges valid entries. The dated preview lists one
serving per meal. One final acknowledgment covers assignments, warnings and unused
portions before Save plan. Closing retains the preview and returns focus to Generate. Stale data
requires Review updated preview; failed saves retain the same retry intent.
During submission, dismissal, date navigation and surrounding mutations are
disabled. Content wraps at 320px and enlarged text without horizontal page overflow.


Details, Ingredients, and Instructions use a pill-shaped tab bar. Details
opens first on every view, Create, Edit, reopening and recovered draft. Only
the cover and title remain above the panels. Panel
buttons wrap into readable rows when enlarged text exceeds the available width.
Panel changes retain all entered values and review results. Arrow keys and Home/End
move tab focus; only the active panel enters the accessibility tree. A footer
message identifies missing required input and offers a link to the relevant
inactive panel. New recipes use “Save”; editing uses “Save changes”.
The modal heading wraps within its allocated width at enlarged text sizes;
its separate 44px close target retains room without overlapping the title.

Clicking a saved-meal name or thumbnail opens a read-only “Recipe overview”
using the same cover and tabs. Its footer offers Close and Edit for owned and
predefined recipes. The predefined editor explains that saving creates a
personal version and retains existing planned/logged references. Saved cards offer Edit for predefined and personal recipes; eligible editors
provide Archive. Retained plan copies and other members' recipes do not expose it.
Ingredients show whole-recipe cooking names, original quantities and units,
including ranges, optional ingredients and unmeasured seasonings. Nutrition,
yield, time and complexity appear only in Details. Nutrition basis in Details
shows sources, preparation and confirmed conversions. Missing instructions
stay visibly unspecified. Edit returns to the overview after successful saving
or cancellation. Nutrition, references, and instructions remain in the overview
and editor. Meal-entry reviews retain planning and logging actions; Recipes
library cards have no action footer.

The recipe-name placeholder is “What should we call this recipe?”. Servings
buttons change the count by one, clamp at zero/10000, and cannot decrement blank
or zero values. Zero remains editable but does not produce a nutrition preview
or enable saving. Invalid nonblank values disable both adjustment buttons.
Servings icon buttons keep 44px sizing and their 10px outer spacing when text
is enlarged, leaving the numeric field readable at 320px instead of scaling
both buttons with the font size.
Name, Servings, and Time (mins.) share a row when their content fits and wrap
in DOM order at narrow widths or enlarged text. Time uses the normal input
surface with a decorative clock at the left, padded text, and “e.g. 30” as its
placeholder. Persistent labeling and helper text explain that time is optional
total preparation/cooking/serving time for the entire recipe. There are no
time stepper buttons or visible native spinner arrows. Blank means unknown;
zero is a valid explicit value. Invalid whole-minute input shows labeled inline
guidance and disables Save, without changing the nutrition preview.
Saved recipe details show a clock and “X mins” only when time is known.
Search ingredients, Describe ingredients, and Add custom ingredient offer
trusted autofill, explicit AI review, and labeled manual values. Review appends
confirmed ingredients without replacing the existing list. Sources, preparation,
serving bases, and assumptions remain in Details. Trash icon buttons have descriptive
labels and at least 44px targets, including when removing the final ingredient.
Per-serving pills use the shared calorie/protein/carbs/fat palette and wrap on
narrow screens and enlarged text. Incomplete inputs show guidance instead of
zero or partial totals. Instructions are a multiline field; References accept
links or citations and appear in the Details tab. Instructions appear in their
own tab. Complexity is a required labeled select beside the basic fields with
Easy, Medium, and Hard options, initially Medium. Existing supported values remain
selected; missing/blank restored values default to Medium. Merely opening a blank
editor does not create a draft because of the default. Legacy recipe records are
backfilled to Medium and the overview uses the same fallback without changing tabs.
Pending save, provider failure, restored draft, unavailable draft storage, and
stale-version guidance stay within the editor.
Closing keeps the editor's draft state alive for reopening and retains the
existing recoverable browser draft. Successful saving clears the draft and
closes only after authoritative state and draft cleanup complete. Discard resets
the form explicitly. The name field receives focus after draft restoration;
ingredient selection moves focus to the new quantity field.
Nutrition basis separates Recipe ingredients from Ingredients awaiting addition,
with distinct accessible groups. Pending review rows show whether they are
selected for addition and expose the same source, confirmed grams-per-unit and
assumed nutrition weight controls as added ingredients. Review nutrition basis
opens Details and focuses the relevant weight field. Return to ingredient review
restores the originating row's focus, or focuses Add selected ingredients once
all selected rows are valid. Confirming a source alone does not establish a
household measure's weight or add a suggested ingredient. Review identifies
missing sources, invalid amounts, missing gram conversions and unfinished unit
conversions, with a direct recovery action. Selected suggestions must be added
explicitly or deselected before Save; addition retains unselected suggestions,
moves focus to the first added quantity and updates recipe nutrition.
Successful and fallback covers have no visible “Recipe image” caption;
accessible descriptions remain. Loading status is announced and actual image
failure retains visible feedback and Retry. Nutrition pills are confined to
Details, where they update after ingredient edits. Normal cooking rows omit
nutrition-record serving/source lines. A range has separate lower/upper fields;
unknown unit conversions link to Nutrition basis rather than guessing a weight.
Recipe authoring selectors contain exactly g, kg, mg, oz, ml, tsp, tbsp, cups and
piece/s, including provider review and recovered drafts. Excluded source units
convert by measurement type; unresolved amounts remain labeled as original
quantities beside confirmation controls, without additional picker options.
The overview keeps saved cooking units.
Create/Edit unit selection preserves the amount: the number changes together
with the unit. Unavailable conversions open an inline Confirm conversion section
beside the cooking row, retaining the original amount and labeling the required
grams per unit. The conversion input receives focus; Confirm conversion or
Cancel conversion returns focus to that ingredient's quantity. Recovered
confirmations receive focus when Ingredients is opened, while the initial
Details/name focus stays unchanged. The preview rounds for readability while
the converted quantities retain calculation precision. Controls wrap within
the existing ingredient layout at 320px and enlarged text sizes.
The overview keeps saved cooking units. A stale predefined recipe shows a
loading message before opening; failed refresh offers Retry recipe and Cancel
without adding a success toast or discarding drafts.
Seasonings and unmeasured items have their own editable cooking rows, with
exclusions explained in Details. Validation offers a direct route to Details,
Ingredients or Instructions without clearing any input.
Switching entry methods prefills only an empty destination from the active
search text, description, or custom name. Existing destination input and review
remain intact; changing methods triggers no provider action. These fields remain
recoverable drafts. Saved-food pickers share plural-aware, token-based ranking;
bounded spelling suggestions show “Close match” and require explicit selection.

### Grocery custom-item form

The mint week toolbar precedes the list with Previous / This week / Next controls
and its compact preference-aligned seven-day range beside them, replacing the
former date-jump input. The range shows its year (both years across New Year) and
retains full dates for assistive technology and polite announcements. Controls
and range wrap at narrow widths and enlarged text; both center whenever the
range occupies a second row, including wrapping caused by enlarged text. Week
navigation is frozen during a save; read transitions retain the toolbar and show
an explicit loading or Retry state instead of another week's items.

The weekly list explains that the form adds items outside the meal plan. On
narrow screens, the item-name input takes a full row so entered text stays
readable; quantity, unit, and Add form a right-aligned group below it. At 768px
and above, the controls share one vertically aligned row with Item. The group
may wrap when enlarged text needs more room. Quantity and unit retain their
existing widths and action targets stay at least 44px. The item name has a
descriptive accessible label, and an in-progress item remains a recoverable
draft until it is saved. Category cards span the available width. At 768px and above, each item keeps
its completion checkbox, wrapping name/metadata and quantity controls on one row.
Below 768px, controls fill a second row. Normal mode shows quantity/unit, Edit
and Delete. Edit reveals Plus, a growing decimal field with its unit, Minus,
a primary Save check, Cancel X and Delete. Cancel moves below the main row,
aligned right, if the control group is too narrow. The quantity unit stacks below
the number when necessary so it does not squeeze the editable value. Icons retain 44px targets;
keyboard focus is separate from selection. Enter saves and Escape cancels.
Only Save persists quantity changes; adjustments remain drafts until confirmed.
Week controls wrap when their labels need more room.

The list heading is “Grocery list”; its help explains recipe-yield scaling,
skipped meals and unmeasured exclusions. Generated quantities and “adjusted by
you” remain visible. Each account/week has its own recoverable extra-item draft,
including empty weeks. Fields and list mutations are disabled during loading,
failed refreshes and pending saves. Extra-item fields also wait for draft recovery
before accepting input, so recovery cannot replace newly typed text.

The top mint card places Total Amount below week navigation, with a bold
PHP-formatted value and a 44px Edit total amount icon. Unset is ₱— with Not
recorded; zero is displayed explicitly. The inline editor has a persistent peso
prefix, a labeled decimal field, Save amount and Cancel, plus
invalid, saving, offline/retry, recovered-draft and stale-review feedback. Focus
enters the field and returns to Edit after confirmation or cancel; Escape
cancels. Review latest amount acknowledges refreshed data without replacing the
user's input. Amounts carried after calendar regrouping identify their original
week and request review. Grocery's Refresh action keeps the existing refresh
icon and recalculates quantities while preserving edits and recorded spending.

## Shared UI Component Inventory

All shared primitives live in `src/components/ui/` plus the cross-route
components in `src/components/`.

| Component | File | Conventions |
|-----------|------|-------------|
| `Card` | `ui/Card.tsx` | `CardTone` union → tint background; `rounded-3xl p-5 shadow-card`; no default padding override unless `className` adds `p-4` (as `StatTile` does). |
| `Modal` | `ui/Modal.tsx` | Named modal dialog; centered `max-w-3xl` desktop/full-screen phone; fixed header/footer and scrolling body; focus trap/return, background isolation, contextual help tree, dismissal protection, and safe-area padding. |
| `Button` | `ui/Button.tsx` | Variants `primary` (`bg-ink text-white`), `soft` (`bg-white/70`), `ghost`, `danger` (`bg-danger-200 text-danger-900`, hover `bg-danger-300`). `min-h-12` (3rem = 44px+) target, `rounded-2xl px-5 text-sm font-bold`, disabled = `opacity-50` + `cursor-not-allowed`. |
| `Chip` | `ui/Chip.tsx` | Round frosted icon chip, `h-11 w-11` (44px target), `bg-white/70 shadow-chip`, required `label` → `aria-label` + `title`. |
| `HelpPopover` / `HelpHeading` | `ui/HelpPopover.tsx` | Grouped circled-question-mark help; 44px trigger; hover/focus preview and click/tap pinning; named non-modal dialog, source links, viewport-aware portal, and deliberate focus return. |
| `ProgressRing` | `ui/ProgressRing.tsx` | Accessible circular progress; `role="img"` + `aria-label` percentage; `tabular-nums` center value. |
| `ProgressBar` | `ui/ProgressBar.tsx` | `role="progressbar"` with `aria-valuenow/min/max` for logged values and text for unlogged values; `tabular-nums` value/target; compact styling and bar color overridable. |
| `NutritionPills` / `NutritionFieldLabel` | `ui/NutritionPills.tsx` | Read-only wrapping metric pills and colored form labels; shared metric palette, explicit units, missing/invalid values, and optional estimate markers. |
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
  version `2026.09` remains on legacy development estimates. Reviewed foods use
  individually identified USDA FoodData Central SR Legacy records, including
  the six new recipe ingredients; their version and preparation basis remain
  visible separately from recipe-level portion/cooking uncertainty.
- **Saved meals:** `src/constants/meals.ts` exports `SAVED_MEALS` (recipes
  referencing catalog food IDs with whole-recipe quantities and a serving count).
  Creamy Lemon Chicken is an active predefined recipe: Easy, 30 minutes,
  two servings, measured USDA ingredient records, a reference, full instructions,
  and a generated cover. Korean Beef Bowl adds four Easy servings, a generated
  cover, and supplied macros of 560 kcal, 45 g protein, 58 g carbs and 16 g fat
  per serving; its cooking time is unset. Every predefined recipe must supply
  macros and its own generated image. Use provided macros when present; only
  estimate when none are supplied. The editor shows provided macro fields per
  serving with explicit labels and supports switching to ingredient calculation.
  Retired recipes remain resolvable for old
  plans/history but disappear from Saved meals and future selection.
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


## Start of week and generation date selection

Onboarding's preferences include a labeled native Start of week select with seven
weekday names, initially Sunday, and a review-summary row. Settings exposes the
same control with a Save start of week action, pending feedback, retained input
on failure, and an explicit Refresh and review action for stale profiles. The
help explains unchanged dates/history and where grocery edits are carried. Success
announces regrouping and asks the user to review grocery lists.

Generate plan starts with Choose days before Choose recipes, without a separate
week-range line. Its native checkboxes share Nutrition's day-strip tiles: weekday
header, date number, month, dashed divider, dark selected header/border, and today
marker. Only the generation dialog's unselected tiles have a 1px dashed outer
border in ink at 50% opacity. The main Nutrition selector keeps its white outer
border and blush hover border. Selected tiles retain a solid dark outer border
in both selectors.
Accessible names contain the full date and year. The seven-day strip scrolls
within its own bounds where needed, with 44px minimum controls, visible keyboard
focus, existing pastel tokens, and reduced-motion support. Clearing selections
retains the displayed week. Choose days and Choose recipes each align their
heading with a primary Select all/ListChecks action and soft Clear/ListX action.
Both sets show icons only below 768px, retaining accessible labels and 44px
targets, and show text with icons from 768px. Headers wrap at narrow widths.
Empty selection has specific guidance and cannot
be saved.

Generated preview assignments reuse the Planned section's compact lavender meal
rows. Each read-only row shows the full date, bold meal name, meal slot, and serving
count, without nutrition pills, source details, or saved-meal actions. The preview
count uses singular meal for one assignment and plural meals otherwise.

Day strips, week navigators, Progress weekday headers and workout cards follow
the account preference. Existing dates and today indicators remain unchanged.
Grocery lists show a regrouping review notice and identify carried edits by their
source week. Loading/error states remain distinct from genuinely empty weeks.

### Approved shared recipe additions

Hainanese Chicken Rice, Korean Broccoli Side Dish and Tortang Talong with Chicken
are shared defaults for current and new accounts. Approved uploaded covers are
bundled assets. Personal originals remain separate. Authored measurements,
conversions, source references and instructions are retained; Hainanese water
uses the author-approved zero-calorie correction.

Grocery Total Amount omits the redundant spending description and decimal-entry
helper sentence; validation errors and carried-amount review guidance remain.

## Cooking group interactions

Connected Generate plan uses equal-height recipe selection cards with stretching bodies and a `min-h-11` title minimum; names wrap fully and may grow at large text sizes. Covers, names and compact resource pills form the keyboard-focusable selection label. The pills reuse the main Recipes card component in coral approximate calories per serving, mint yield per batch, lavender total minutes and peach complexity order, using text-xs, smaller padding and icons, and natural wrapping. Source and weekly maximum-serving information remain in accessible descriptions rather than visible paragraphs. Selection focus draws one outline around the entire outer card, including its batch footer; the label has no separate outline. Batch inputs and buttons retain their own focus indicators when operated. A separate footer inside each card contains 44px minus, numeric Batches and plus controls, always visible and disabled for unchecked recipes. The grid uses up to two columns through tablet widths and four on wide screens; a 10rem card minimum reduces the column count on narrow screens and at large text sizes, retaining room for the stepper. Selected cards describe the maximum servings for the week to assistive technology; both selected and unchecked cards show the four compact pills. Controls accept whole batches from 1–100; invalid or temporarily blank text stays local, shows recovery guidance, clears acknowledgment and blocks preview requests and saving. Valid allowances retain the existing draft and debounce behavior. The nearby explanation states that selected recipes remain available with preference warnings while structural planning limits apply, and that retained meals consume the weekly batch allowance. There is no separate Cooking limits list. Confirmed customizations of default recipes display “(edited)” after their names in Recipes and both Generate dialogs. This is a display annotation derived from catalog replacement links or the authorized shared isEditedDefault flag; names, images and revision numbers alone are not evidence. Stored names, IDs and planning references remain unchanged.

Current preview gaps show Some meal slots are still unfilled once, followed by a collapsed Review unfilled meals disclosure with an affected-meal-time count. Details group meal slots chronologically by date and explain that at least one selected person could not be assigned that meal time, without inferring which members or private health limits caused a gap. Opening or closing this disclosure preserves input and acknowledgment. The preview heading counts new per-person meal assignments and excludes retained meals. Recipes to cook explains whole batches and leftover servings. Unknown server warnings and the zero-assignment explanation remain visible under Planning notes. Pending, outdated and failed previews do not show warning summaries as current results. Recipe cooking totals, replacement review and confirmation before saving remain visible in the preview flow.

The 2026-10-21 compact-pill/edited-default refinement passed 519 local tests, 1,302 database assertions across 40 files, and desktop/mobile cooking-group flows with local fixture cleanup. Dialog checks cover 320, 390, 469, 570, 594, 760 and 1440px, 200% text, reduced motion, keyboard focus, current-preview acknowledgment, draft recovery and loading/error/empty feedback. TypeScript, ESLint and the webpack production build passed. Browser verification uses an isolated webpack test server.

Settings uses the existing lavender card, member initials and display names, a privately shared one-use PIN, explicit consent and a connected-success modal. Shared access is explained before confirmation; emails and health measurements are omitted. Shared week proposals sit beside member controls, and the ordinary week preference points to this agreement flow.

Nutrition and Grocery have no Personal/Group segmented control. Nutrition retains the daily calendar, targets, Planned/Eaten rows and owned recipes, with one combined Recipes section. A soft Overview button sits immediately left of Generate and opens Cooking overview for the displayed week. Recipe cards lead with saved-version cooking totals; expandable Meal distribution lists contain chronological member assignments and editing controls. Cooking overview marks the signed-in member as “(you)” in recipe participant lists and assignment labels using account IDs, so matching display names do not merge different members. Shared assignment Edit opens the modal, expands the relevant recipe and focuses its matching editor. Modal close restores focus to its entry point. There is no inline cooking schedule or separate Shared recipes gallery. Canonical defaults appear once, customized variants remain distinct, and Recipe overview shows Shared by: display name or Source: Default recipe. One Generate entry opens Generate plan, with People defaulting to all members; the dialog explains that selecting only yourself still contributes to shared groceries and unchecking others preserves their meals. No alternate personal-generation action appears while connected. The planner reuses existing modal, day tiles and recipe-card patterns, with People, Fill/Replace radios, batch limits, editable estimated portions, replacement review, whole-batch cooking and leftovers. Hidden native recipe checkboxes retain keyboard behavior. Bulk controls show icons below 768px and text with icons above that breakpoint.

Grocery shares one week navigator across Shared grocery list and Private extras — only you. Shared spending and Private spending remain separately labeled. The private section opens for existing items, recorded spending (including zero), recovered drafts and loading/error feedback; otherwise Add private extras offers disclosure. Each list retains its own Refresh, add-item controls and feedback. Navigation and conflicting controls lock during either scope's submission. Shared groceries reuse explicit quantity and PHP amount editors with account/group/week/item drafts, captured revisions and review-before-retry. Shared recipe overview reuses ingredient/instruction tabs and offers Save personal copy. Generation attribution uses “Recent: <display name>, <MM/DD/YY>” across Nutrition, Cooking overview and Grocery. Generation success uses the modal title “You're all set!”, followed by generation details, an Overview h3 and the recipe-cover grid with participant names and saved cooking totals. The former general saved-summary explanation is omitted; superseded generations retain their separate notice. Done spans the footer content width below 640px with the standard horizontal padding, and keeps its content-sized appearance and alignment at larger widths. One acknowledgment remains shared by Nutrition and Grocery, with existing dismissal and focus restoration. Full dates remain accessible, controls retain 44px targets and layouts wrap at enlarged text sizes.

### Advisory preference review in Generate

Place Recipe warnings after recipe selection in both dialogs, grouped by recipe
with 44px Remove recipe actions. Avoided-food/allergy matches use semantic danger
surfaces and readable dark text; other warnings use pastel warning treatment.
Name matched ingredients and terms without claiming safety. Warned recipes remain
selectable. State once that cost checks are temporarily paused.

Daily carbohydrate review follows assignments, grouped chronologically with
estimated totals, saved thresholds and contributing recipes. Unknown totals are
explicitly incomplete. Keep operational/unfilled warnings distinct. One final
checkbox covers the current preview and warnings; input changes clear it.
Connected Generate shows only the viewer's detailed matches and a general
reminder to consider others. The summary shows Selected people with actual
per-account assignment counts (including zero), ID-based “(you)” labels, and the
private Your review at generation snapshot. Existing cross-route notices reopen
this historical review. Text wraps within scrolling modals at enlarged sizes;
44px controls, keyboard focus and reduced-motion behavior remain intact.
