# Cali - Exercise and Meal Planner — Design Decisions

## Shared pan loader — 2026-11-04

Use the authored, themed pan animation at its original speed for spacious loading
panels across the app. The reusable LoadingIndicator measures its own available
width: at least 240px shows a fixed 96px square above centered, wrapping status
text; narrower regions use the compact fallback. Compact controls keep their
existing spinner/text, including on desktop. No numeric percentage is fabricated.
The supplied colors and transparent background remain unchanged. Reduced motion
uses a static frame from the same artwork; loading/runtime failure also retains a
usable fallback. Animation pauses offscreen and while the document is hidden.

Generate plan uses this loader rather than horizontal progress bars. Labels are
Loading cooking group…, Restoring plan draft…, Generating plan preview… and
Updating cooking requirements…. Keep navigation and restored-draft notices in
place. Preview feedback sits beneath person/date navigation; cooking feedback
appears beneath the notice. Other steps show only one preview-loading status.
Hide stale meal/batch rows and retain existing retry/error guidance.

Connected Generate recipe batch controls default to 1 regardless of group size or
selected people, including newly added recipes, Select all and staged unselected-card
values. Fresh plans have no recipes selected. Batch labels and the 1–100 range retain their existing meaning.
Manual edits and restored drafts keep their values through people/step navigation.

## Generate plan daily review — 2026-11-03

Generation uses the same shared Stepper header and Back/Continue actions as
onboarding: a readable step count, section heading, and lavender progress
segments. The modal keeps progress in its bounded header, one active page
in the independently scrolling body, and navigation in its fixed footer.
Personal steps are Choose days → Choose recipes → Preview → Unused servings →
Review. Connected steps are Setup → Choose recipes → Preview → Recipes to cook
→ Review. Recipe warnings appear in final Review before the acknowledgment. Setup groups People, Choose days
and Planning mode in that order with visible section labels. Continue requires
at least one person and one date. Their Review edit shortcuts all return to Setup.
Empty warning/serving summaries have explicit copy and do not change step counts.

Required selections and valid batch/portion inputs gate Continue. Review includes
Edit shortcuts, recipe and daily warnings, replacements/unfilled-slot explanations where
applicable, and the final acknowledgment; Save plan appears only here. Back,
Continue and Edit move focus to the current heading and reset the body scroll.
View navigation preserves inputs, preview selection, warning disclosure and
acknowledgment. Reopened drafts begin at the first step and require fresh review.
Both flows show a lavender restored-draft notice with a 44px Discard draft action.
It wraps beneath the message on narrow screens and remains available across steps.
Discarding locks conflicting controls, then returns focus to the first step heading,
resets body scrolling and announces the reset. Defaults stay unsaved until edited;
failed clearing keeps the notice and current choices available for retry.
Saving locks navigation, edits and dismissal. At very narrow widths, navigation
icons and padding adapt to the available container width so Back/Continue labels
remain readable, including enlarged text. Expanded recipe-review rows stack at
narrow text widths, and disclaimer text and removal controls wrap within the
modal body.

Both Generate dialogs initially collapse entire Recipe warnings and Daily
preference warnings sections using the same native details/summary presentation
as Review unfilled meals. Summaries show affected recipe, day or meal-time counts.
Expanding Recipe warnings shows its introduction and every recipe card; the former
first-card See more/See less treatment is removed. Each expanded section ends in
a 44px lavender text-only Collapse all action with a section-specific accessible
name. It closes only its section, focuses its summary and scrolls it into view
instantly. Disclosure state survives step navigation and resets for each new
preview. Other warning-review callers keep their full presentation by default.
Generation summaries omit warning lists. Group Setup, Choose recipes
and Review use keyed header help for planning-mode, recipe/batch and private-review
guidance. The selected Preview explanation and standalone unfilled status are
removed. Personal generation retains its existing help. The acknowledgment
uses a 24px native checkbox inside a full-panel clickable label. Disclosure,
person and date navigation preserve acknowledgment and do not regenerate.

The preview reuses DayStrip with generation dates enabled. Connected generation
adds a Person select limited to selected members, defaulting to you when selected.
The date defaults to today when selected, otherwise the earliest selected date;
valid view selections survive regeneration. Breakfast, Lunch, Dinner and Snack
reuse Planned typography, recipe covers and portion nutrition pills. New and
Kept identify generated and retained meals. Every row shows Estimated servings;
only new group assignments have editable quantities. Missing meals and nutrition
stay explicit. Counts remain total new assignments, excluding Kept. Stale,
loading and failed previews hide meal details. Private image access is unchanged;
unavailable covers use the standard placeholder.

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
  The selected Card A uses a right-aligned compact date pill in the heading,
  then a 116px calorie ring on the left with three vertically stacked macro bars
  on the right. This two-column summary stays side by side at every viewport;
  macro labels and values wrap at enlarged text sizes. The macro stack's vertical
  midpoint aligns with the circle itself. Home hides all below-ring captions and
  the logged-meal count; the value/unit inside and accessible calorie summary remain.
  Nutrition retains the shared ring's default captions.
  There is no overlapping ring action or “No meals logged yet” paragraph.
  The ring/macros summary has no separate background fill. Beneath it, one
  rounded soft-white list contains Breakfast, Lunch, Dinner and Snack with no
  inter-slot gaps and three subtle 1px ink/10 dividers. Slot interiors retain
  header padding; entries span the full slot width with square edges, no gaps,
  and subtle dividers. Overflow stays visible for tooltips and focus outlines.
  Each slot has an icon, heading, calorie summary and right-aligned transparent
  44px plus. Compact meal rows use a small image, wrapping title,
  a plain approximate-calorie line, navy check and quiet X controls. Logged rows show a checkmark in a
  mint circle inside a transparent 44px undo button, with an “Undo logged [meal]”
  accessible name and “Undo meal log” tooltip. Undo restores linked planned rows;
  separately logged entries disappear. Failures retain the log with retry feedback.
  Meal names and calories form one compact text stack. Logged rows use one
  44px-minimum link for both lines, without a separate minimum height around the
  name. Home has no macro pills or nutrition scroller. Calories retain historical
  or saved portion values, including unavailable and partial-total explanations.
  Empty slots retain their heading and plus without a placeholder panel. Unknown
  nutrition stays explicit and linked planned/logged entries appear only once.
  Target assumptions remain available in Nutrition and Settings. The existing
  workout progress ring remains separate from food intake.
- Home has one lavender Workouts card and one mint Steps card, both using
  the meals card's header icon, right-aligned compact local-date pill, transparent
  summary, left 116px ring and vertically centered right-hand metric stack.
  The ring/metrics stay side by side at every viewport; full labels wrap at large text.
  All three cards use 20px padding below 768px, then 26px vertical and 23px horizontal.
  Below 1024px, reading order is meals, workouts, steps, shortcuts. Desktop places
  meals on the left and workouts/steps in a right-hand stack, with 16px gaps and
  the existing 35px top offset. Cards follow content height.
- Activity metrics use horizontal label/value rows with values right-aligned:
  Completed, Scheduled and Est. kcal for workouts; Steps, Walk time and Est. kcal
  for steps. Repeated weekly suffixes are omitted; ring/list weekly context stays.
  All metric rows use a natural 20px line height and 4px gap at the base font
  size; description-bearing values have no separate minimum height. These
  read-only values keep keyboard explanations without adopting button sizing.
  Actual actions remain at least 44px. Labels wrap inside their column at large text. Unknown time/energy displays a
  dash with the full reason accessible and shown on hover/focus. Unlogged steps
  display 0 or 0 / target as a numeric placeholder, while the ring remains unknown
  and assistive text distinguishes it from a saved zero.
- Workouts combines the former Your progress and separate Today's workout cards.
  Its ring shows weekly completion percentage and This week, or a dash without a
  plan. Right-hand metrics show completed/scheduled workouts and approximate weekly
  energy; unavailable energy is explicit, never a numeric zero placeholder.
  A soft-white Today's workout section retains title, focus, exercise count,
  estimated duration and progression explanation. Its workout row spans the
  full outer Workouts card width with square corners at every viewport; interior
  horizontal padding matches the card's 20px mobile / 23px desktop inset.
  The section heading, rest-day copy and progression explanation remain inset.
  Transparent 44px calendar and
  Start/Resume/View actions have hover/focus tooltips. Completed workouts link to
  Workouts rather than entering the auto-start logger. Rest days keep their copy.
- Steps defaults to today and uses the selected date's confirmed count/target,
  walking time and rough walking energy range. Missing/zero minutes and unsupported
  profiles remain distinct. Target access stays in Settings; current target/profile
  assumptions apply to every selected date. No historical targets are invented.
  Below the overview, This week contains seven compact two-line weekday/date-number
  buttons on a soft-white surface. Today replaces the weekday on today's tile;
  the selected tile is dark with aria-pressed and a full-date accessible name.
  Tiles remain at least 44px in each dimension and grow with text. Native horizontal
  scrolling and its scrollbar stay available; revealing selection scrolls only the
  strip, without shifting the page vertically. Nutrition/Generate keep their existing
  full weekday/number/month tile appearances.
  The week stays anchored to the real current day and saved week start. Selection is
  local to the mounted card and resets to today only if it falls outside a changed
  current week. The header date pill and one polite status announce selection.
  Past/today missing observations keep an unknown ring and explained 0 / target
  placeholder; saved zero remains an observation. Future tiles show Upcoming, an
  unknown ring and dash statistics, with no logging action.
  One header 44px plus/pencil beside the selected date opens Add/Edit steps for that
  date. Its tooltip names the date. Overlapping ring plus controls are removed.
  The modal keeps its fixed date, Steps, optional Walking minutes, estimate context,
  Cancel/Save steps footer and Remove entry for a saved record. Pending operations
  lock dismissal; success closes and returns focus to the header action, falling
  back to the selected date tile if the action is unavailable. Selection changes
  never retarget an already-open editor.
  Modal scrolling, help dismissal, draft recovery and validation match Activity.
- The optional Movement onboarding target starts blank, can be skipped, and
  appears in Review as the chosen number or "Not set". Settings has a dedicated
  `/settings#daily-step-target` section for save/remove and draft recovery.
  It is a personal preference with no suggested default or calorie reward.
  Supported walking energy remains separate and uses the same broad range as
  Activity; assumptions and source details remain on Activity.

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
  Home activity summaries use plain stacked metrics instead of nutrition pills.
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
controls and all matches with its inline pastel portion panel. Entry tabs and
unrelated description review are hidden while preserving their input. The review
retains date/slot context and the search query. Focus
moves to the visible Recipe servings field, initialized to 1. Shared macro pills
show the selected portion, followed by a concise estimate/source statement and
contextual source help. Log meal is primary and Add to plan secondary, together
in a flexible two-column action row. A quiet Change selection action follows;
modal Cancel stays in the footer. No intermediate Review meal stage is shown for
selected recipes or single foods. Personal cooking-time, diet, avoided-food and
source/uncertainty warnings appear above the actions, with daily carbohydrate
assessment for the displayed portion. Allergy matches use the semantic danger
surface and clear uncertainty wording. Preference warnings do not disable
planning; selecting Add to plan acknowledges the visible assessment.
Controls and pills wrap on narrow screens and enlarged text. Change selection returns
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
  pill aligned to the right of the meals-card heading row, with a 12px minimum horizontal gap.
  Its visible format is `Thu, 10/11` (abbreviated weekday and zero-padded month/day), with the full date retained for assistive technology.
  It stays right-aligned when wrapping within the heading group at narrow widths and enlarged text sizes.
  Home has no separate Quick actions card.
  The meals, progress, and steps card headings have no contextual-help buttons.
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

All five steps use one viewport-height `OnboardingFrame`: the step heading and
progress remain above a top-aligned white card sized to its content, and Back,
Continue or the final save action remain at the bottom of the viewport. The card
is capped at the available height; longer content scrolls inside it. Shorter
steps leave the pastel page background between the card and actions, rather than
blank space inside the white card. Fields retain their natural spacing and
padding, without height animations or JavaScript content measurement. Review keeps its
acknowledgement, tinted target summary, macros and choices as sections inside
this same card. Recovery notices and errors belong to the scrolling content;
saving status belongs to the bottom action area. Step changes reset card scroll,
and validation/save errors receive focus and scroll into view inside the card.
The frame follows the normal-zoom visual viewport as the keyboard or browser
toolbar changes, with `100dvh` as fallback and safe-area padding. Pinch zoom
does not resize the layout. On very short screens or enlarged text, oversized
header/footer regions can scroll within bounded heights to keep controls
reachable. The document itself does not scroll during onboarding. Other routes
and generation dialogs retain their existing layout.

MVP-3 uses five groups: About you, Movement, Food choices, Your goal, Review.
Below the name, Birthday uses a full-width `BirthDatePicker` with day/month/year
columns, a shared lavender selection band and a 132px viewport: three fully visible
44px rows with the selected date centered. Day/Month/Year names remain available
to assistive technology without visible column headers. The Birthday legend has
12px bottom spacing. The complete field occupies about 180px before validation
feedback; row heights grow with enlarged text. Selected values are bold and neighboring options are
quieter. Native vertical scroll snapping supports swipes and mouse wheels;
clicking a visible option, Arrow keys, Page Up/Down, Home/End and typeahead also
select values. Each named listbox has one focus stop and visible focus treatment.
There is no automatic animation. A new picker is empty, and the read-only age
below it appears only for a complete valid calendar date. Invalid days are cleared
when month/year changes. Partial choices survive recovery. Legacy profiles show
“Birthday not set” with their saved age until a date is supplied. Gender follows
on its own row. Review includes birthday and age; Settings → Edit reuses the picker.
Gender uses two side-by-side native Female/Male radios with visible circular
indicators, rounded lavender labels, checked-state styling, visible keyboard focus
and at least 44px touch targets. The pair stacks when enlarged text makes two
columns too narrow. The existing selection/default and sex-for-BMR
calculation input are unchanged.
About you uses two stacked compact `MeasurementRuler` controls for height and
current weight below the shared unit selector. Each combines a centered editable
value and small unit suffix with a shallow tick ruler, labeled major ticks and
a fixed lavender center marker. Controls occupy about 124px each at normal text
size and grow with text enlargement. There is no BMI classification strip.
Dragging left increases the measurement; dragging right decreases it. Arrow
keys adjust by 0.1, Page Up/Down by 1, and Home/End reach supported bounds.
Vertical scrolling and pinch zoom remain available. Numeric entry preserves
empty, partial and invalid strings; invalid values receive inline feedback.
Muted starting positions never become answers without interaction. Rounded
unit displays retain the original measurement for validation and saving.

The former About you eligibility buttons are replaced by a Review-first
acknowledgement panel. An explicit checkbox combines the estimates disclaimer
and adult eligibility confirmation; a separate “These situations apply to me /
I’m unsure” control selects manual logging. These choices are mutually exclusive.
Automated estimates appear only after eligibility is confirmed. Before a choice,
neutral guidance replaces the preview and the final action is disabled.
Unsupported users retain “Continue without automated targets”. The checkbox and
manual option lock during saving; navigation, recovered drafts and save retries
retain the choice. Drafts predating this acknowledgement require a fresh choice.
Headings receive focus on step changes. Review emphasizes the daily estimate
and choices; shared stepper Back/Continue actions use left/right chevrons.
Calculation details are expandable. Cost choices use familiar labels
and explain that they are relative costs, not prices. The final button says
“Saving your plan…” with a spinner/status announcement; navigation controls are
disabled until the save resolves, and failures leave the draft visible.

Home and Nutrition use a decreasing calories-remaining ring with accessible
numeric text. An unlogged day shows a dash and missing targets are explicit.
Nutrition retains the “Still logging” caption for partial logs and a neutral
numeric over-target caption. Home hides below-ring captions and the meal count,
while preserving the accessible calorie summary and the value/unit inside.
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

Below 640px, Nutrition uses flat inner panels inside the rounded Planned and
Recipes containers. Planned and eaten meal lists extend through the outer
20px horizontal padding; each pale pink entry has square corners, a stretched
image inset 10px from the left, top and bottom, the existing right inset and vertical gaps. Recipe cards, including
shared recipes, span the container width without their own rounded corners or
shadow, with a subtle bottom divider. Their square-corner cover surfaces are
156px tall and retain the existing image crop; titles, favorites, resource pills
and supporting content retain a 20px inset. Section and slot headings, toolbar
controls, dividers, warnings and loading/error/empty messages remain inset.
Focus outlines and tooltips remain visible. At 640px and wider, the existing
card spacing, rounding, shadows and recipe grid remain. This treatment is an
opt-in presentation variant and does not change other shared-component uses.

At every viewport, Planned and Eaten entries use an inline layout: a stretched
recipe image strip at the left, a flexible name/portion and nutrition column,
and two 44px controls at the middle right, separated by 8px gaps. Names wrap fully,
including long words. The summary and action group are vertically centered
within the row. Nutrition uses MealRow’s centered inline alignment and opt-in
edgeToEdgeThumbnail presentation. The image column reclaims the original left inset
plus the 40px thumbnail column: 60px below 640px and 52px at larger widths at the
base font size. The image has fixed 10px left, top and bottom margins inside that
column, making its visible width 50px on mobile and 42px on larger screens.
The reclaimed inset portion scales with enlarged text; the 10px margins do not. Image-to-summary
spacing stays 8px, and summary/action positions retain their previous space.
The image stretches between its top and bottom margins; text and controls drive
row height, with a 40px minimum image height. Vertical padding belongs to the
summary and action areas. RecipeCover’s opt-in fill mode uses centered object-cover
cropping without an intrinsic square aspect constraint or distortion. Only the
image wrapper clips: square on mobile and matching the row’s left corner rounding
on larger screens. Row focus outlines and tooltips remain visible. Shared defaults,
Home thumbnails, Recipes covers, loading behavior and fallback imagery remain unchanged.
Nutrition opts into MealRow’s home-meal tone: the opaque home-meal color token
mixes 85% white with 15% blush-100 to match the lighter meal rows inside Home’s
layered Today’s meals card. The whole entry, including image margins, uses this
surface at every width. Other MealRow uses retain the default lavender tone;
Home’s existing overlays and recipe-card surfaces remain unchanged.
Each name is followed by a serving-only line such as “1 serving” or “0.5 servings”;
meal slots appear only in their section headings. Grouped Eaten rows use saved
recipeServings; standalone foods use saved food-serving counts rather than an
inline ×N suffix. Missing or invalid grouped portions say “Servings not recorded”;
they are never inferred from current recipes, ingredient quantities or nutrition ratios.
Visible Planned, Eaten and Planned · skipped captions are omitted. Accessible
row labels identify each entry as planned, eaten or skipped and include its name;
action names and tooltips retain their existing meanings.
Recipe-backed entries reuse the saved recipe cover; foods and missing images use
the existing generic fallback rather than an invented ingredient photo.
Main nutrition pills form one non-wrapping horizontal strip at every width. Only
the strip scrolls; names, actions and the page stay within their available width.
Overflowing strips support touch, trackpad and keyboard scrolling, receive a tab
stop, visible focus outline and assistive scroll instruction. Non-overflowing
strips add no tab stop. The strip is separate from the details-opening button.
Below 640px, known macros use P, C and F labels such as P 35g or P ≈45.5g;
640px-and-wider layouts retain full visible macro names. Calories retain kcal.
Main Planned entry pills round their displayed values to whole numbers without
an approximate prefix, for example 1021 kcal and P 46g. Stored precision and
calculations remain unchanged. Eaten formatting, including its existing estimate
markers and ranges, is retained. Metric colors remain; screen readers receive
full macro names and gram units. Missing or invalid nutrition stays explicit.
Other shared-component uses retain their default labels and wrapping.

Main Planned and Eaten summary pills below 640px match the compact Recipes pill
spacing: 8px horizontal and 4px vertical padding, a 16px line height and 4px gap
at the base font size, scaling with enlarged text. Other pill uses and the
640px-and-wider sizing remain unchanged. Eaten entries show the shared mint undo
action followed by a soft X icon button that retains the previous Delete action.
The X matches Home’s 44px remove control; eaten deletion remains immediate, while
planned removal retains its confirmation. Nutrition entry Edit controls and inline
correction entry points are removed at every viewport, with no replacement in details. Nutrition uses a
full 44px mint circle with a centered checkmark, matching the group’s circular
controls. Home retains its transparent 44px target and inset 32px mint circle.
Both are named “Undo logged [meal]” with an “Undo meal log” tooltip. Undo uses
the saved record's kind, ID, revision and stable retry key;
pending actions lock and failures retain the log with inline retry feedback.
Successful undo refreshes the selected week and returns focus to the slot's Add meal button. Linked plans
become pending when their last log is removed; independent entries disappear.

Meal-entry names open read-only details at every viewport. Planned and Eaten
recipe-backed entries use Recipe overview without Edit or Save personal copy,
retaining Details, Ingredients and Instructions tabs and focus return. Recipe
nutrition remains distinct from the saved logged portion. Eaten entries have no
disclosure arrow or inline ingredient expansion. Missing-recipe grouped logs
and standalone foods open Recorded meal details with saved portions, nutrition,
sources, preparation, assumptions and uncertainty; missing data stays explicit.
Nutrition entries have no Edit action. Recipe-library openings retain their editor or
Save personal copy action. Loading and retry preserve the entry’s read-only mode.

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

Nutrition meal-entry rows and their details no longer expose correction controls.
To change an entry, remove it and add the intended portion again. Saved history
is not recalculated from a later recipe edit. Existing correction domain contracts
and editors used by other workflows remain unchanged.

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
Breakfast, Lunch, Dinner and Snack heading has a right-aligned 44px Plus icon
named Add meal with a slot-specific tooltip. It opens the shared Add meal modal
with a fixed date/slot subtitle. Home uses the same modal. Search/description,
selectable results and inline portions share the first view; Enter manually
preserves the alternate manual form. Selected recipes and single foods expose
source details, warnings and direct Log meal/Add to plan in the first portion
panel; manual and AI authoring retain their review steps. Account/date/slot drafts survive route or method changes.
Closing or successful saving returns focus to the originating plus button.
Change selection restores search/results without discarding description input.
Log meal and Add to plan remain separate intake/planning actions. Pending food and recipe
saves disable portion changes, dismissal and all group entry controls. If no
eligible goal is available, the prerequisite is explained while logging remains
available.

Four Breakfast, Lunch, Dinner, and Snack groups contain multiple planned and
Eaten rows. These labels distinguish prescription from intake without a
separate Logged section. Empty groups retain their headers without placeholders. Daily summary and help retain
the distinction between unknown intake and zero. Planned
and Eaten entries share compact pale pink rows with an inset, stretched image strip, an accessible
status label, a wrapping name, horizontally scrolling calorie/protein/carbohydrate/fat pills, uncertainty warnings
and vertically centered right-side actions at every width. The generic “mixed sources” caption is omitted;
meaningful AI ranges, estimated-entry confidence and missing-nutrition warnings
remain visible. Planned source captions, standalone “your entry” badges and
source/preparation captions are omitted from rows. Their underlying data and
existing recipe/recorded-detail information remain available.
They have no image banners, recipe yield/time/complexity pills or favorite controls.
Planned values describe the displayed planned portion; Eaten values come from
saved history. Planned and Eaten recipe summaries open the read-only overview.
Rows have no Edit action or inline correction controls.
Planned rows use tooltip-equipped check/X icons. Check immediately
logs the saved planned portion; X opens Remove planned meal? with Cancel initially
focused, the meal/date/slot and a danger Remove meal action. Legacy skipped rows
have a restore icon. Pending mutations lock competing actions; failures retain
the row and retry identity. A successful linked log hides its Planned row to
avoid repetition while keeping the plan snapshot intact. Linked Eaten rows
offer Undo and an X Delete action without Log again; deleting the last linked Eaten row
reveals Planned again. Eaten names open a modal rather than expanding inline.
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
Coral calories remain per serving, displaying ≈number kcal without a calorie icon,
with an accessible basis label. Recipe-wide source macros supply that stored
per-serving calorie value independently of ingredient food links; the same value
appears in meal-entry recipe choices. An explicit zero displays ≈0 kcal, while
invalid or unavailable nutrition keeps the unavailable label. A mint pie-icon pill shows the whole recipe
yield. Lavender time means whole-recipe minutes displayed as “X mins”;
its accessible label retains the whole-recipe
basis. Missing time reads “Not set” and explicit zero remains valid. Peach
complexity shows Easy, Medium, or Hard, defaulting missing recipe values to Medium.
Descriptions are omitted. The Planned section uses compact meal rows instead
of recipe cards, including valid food-only and skipped entries. Unloggable
planned rows remain visible with disabled logging and an actionable explanation;
an empty slot retains its heading and Add meal action. Loading/error
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
Breakfast, Lunch, Dinner and Snack headers on Home and Nutrition use transparent
44px ghost Plus icons with subtle dark hover feedback. Nutrition's icons are named
Add meal, with slot-specific tooltips. Existing IDs, expanded state, pending
restrictions, toggling, drafts and focus return are preserved at all widths.

Filter recipes uses the shared modal with Recipe name, Favorites only, Source,
Meal time, Total cooking time and Difficulty.
Favorites, Source, Meal time and Difficulty use independent rounded toggle pills
with pressed states. Total cooking time uses mutually exclusive native radios
styled as pills, defaulting to Any time. Selected pills use navy/white, unselected
pills use the soft treatment; all wrap with at least 44px targets and visible
keyboard focus. Time radios retain arrow-key navigation.
Apply filters commits edits; Reset clears only the draft. Cancel, close and Escape discard unapplied edits.
Focus returns to the filter icon. Filter groups use OR within and AND between;
blank groups are unrestricted. Applied filters show a result count and Clear
filters. No matches, empty collection, shared loading/error and unavailable
favorite metadata have distinct feedback. Filters remain page-session state.

Meal duplication is removed; ordinary Create and Edit draft recovery remains.
Planned rows use the shared check/X actions without Edit. Removal uses the shared
confirmation modal; logging and successful removal return focus to the slot’s Add meal action.
Lists preserve slot grouping and ordering. Planned/Eaten rows remain a single
column; Saved cards use one column on phones and up to two where space permits.
Main meal pills scroll horizontally and their two controls stay beside the wrapping
name at enlarged text sizes. Other pill and action groups retain their wrapping behavior. Fine-pointer
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

Clicking a recipe-library name or thumbnail opens “Recipe overview”
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
Recipe authoring selectors contain g, kg, mg, oz, lb, ml, L, tsp, tbsp, cups and
pc/pcs, including provider review and recovered drafts. Excluded source units
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
Successful recipe saves remember completed conversions automatically, with no
remember checkbox. Matching saved values are reused with a small "Using saved
conversion" status and Review or replace conversion action. If saved weights
disagree, Confirm conversion presents native radio choices with exact grams per
unit and personal/default/shared recipe source descriptions, plus the existing
manual input. Nothing is preselected by recency. Candidate text wraps within the
ingredient row and choices have at least 44px targets. Lookup progress and failure
copy keep manual confirmation available; delayed results do not change edited
input. Source choices are presentation state rather than persisted draft content.
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
wraps when enlarged text needs more room. Both add-item forms use an inset white
quantity control with Minus, a decimal input, and Plus, with the unit selector
outside on its right. Add remains a separate action. Targets are at least 44px.
Category cards span the available width. At 768px and above, each item keeps
its completion checkbox, wrapping name/metadata and quantity controls on one row.
Below 768px, controls fill a second row. Normal mode shows quantity/unit, Edit
and Delete. Edit uses the same inset control followed by the saved unit on its
right, then Save, Cancel and Delete. Units never stack below the edited number.
Action buttons wrap below the quantity/unit group before squeezing its input.
When the white field has less than 160px, its numeric input occupies the first
row and its inset buttons share the next row; below 88px those buttons stack.
The outside unit stays aligned with the numeric row. Container widths, rather
than viewport breakpoints, control these fallbacks, including at 200% text.
Each control has its own visible keyboard focus. Enter saves and Escape cancels.
Only Save persists quantity edits; adjustments remain recoverable drafts until
confirmed. Blank or invalid quantities disable stepping and submission with
explicit guidance. Row/shared quantities support zero through 1,000,000; the
personal extra-item form retains a minimum of one. Steps change the quantity by
one, clamp to the existing limits, and retain decimal values without arithmetic
artifacts. Week controls wrap when their labels need more room.

The list heading is “Grocery list”; its help explains recipe-yield scaling,
skipped meals and unmeasured exclusions. Generated quantities and “adjusted by
you” remain visible. Each account/week has its own recoverable extra-item draft,
including empty weeks. Fields and list mutations are disabled during loading,
failed refreshes and pending saves. Extra-item fields also wait for draft recovery
before accepting input, so recovery cannot replace newly typed text.
Personal and shared extra-item Add buttons replace the plus with a same-size
loading spinner while saving, expose a busy state, and remain disabled until the
request finishes. Reduced-motion preferences stop the spinner animation.
Item cards use loaders instead of visible action-progress captions. Checking or
unchecking shows a 16px spinner fully inside the upper-right corner, inset 6px.
It overlays the card without reserving a gutter or moving controls; rows keep
their symmetric padding and full quantity/action width. Mobile name/metadata
text has a small local inset to keep long names clear of the loader. The loader
is noninteractive and stays clear of action icons. Save, Cancel and Delete replace
only their own icon with the same-size spinner in their existing 44px buttons.
The active control exposes its busy state, and one visually hidden live region
announces progress. Reduced motion stops animation. Errors, validation and draft
recovery guidance remain visible. Failed actions restore icons and retain the
item and editing draft; confirmed deletion retains its focus destination. This
loader-only treatment is local to item cards; total-amount feedback is unchanged.
In normal mode, the item name, displayed quantity, provenance and blank card
space share the checkbox action and show a pointer cursor while unlocked.
Interactive controls and selected text do not toggle the row. Card-wide checking
pauses during editing, while the native checkbox remains available when unlocked.
The list item keeps its semantics without a second tab stop; keyboard users use
the checkbox. Loading and pending mutations disable both activation paths.
The quantity stepper, unit selector and Add button share a 48px height in both
extra-item forms. They align horizontally at normal mobile widths, with wrapping
retained for narrow or enlarged-text layouts. Row editors keep their 44px controls.
Manual shared rows show “Added by {name}” when the original adder is a current
member with a known profile name. They omit “adjusted by you”; unknown adders
have no attribution line. Carried-week provenance remains visible alongside it.

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
- **Loading/error/empty/offline:** `loading.tsx` (shared responsive pan loader, `role="status"`),
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
| `dev` | `node scripts/copy-exercise-assets.mjs && node scripts/copy-loading-assets.mjs && next dev` | Local dev server; copies exercise and loading assets first |
| `build` | `node scripts/copy-exercise-assets.mjs && node scripts/copy-loading-assets.mjs && next build` | Production build; copies exercise and loading assets first |
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

Generated preview assignments use the shared compact meal rows with their default
lavender tone. Each read-only row shows the full date, bold meal name, meal slot, and serving
count, without nutrition pills, source details, or saved-meal actions. The preview
count uses singular meal for one assignment and plural meals otherwise.

Day strips, week navigators, Progress weekday headers and workout cards follow
the account preference. Existing dates and today indicators remain unchanged.
Grocery lists show a regrouping review notice and identify carried edits by their
source week. Loading/error states remain distinct from genuinely empty weeks.

Generated grocery item names have a compact title-case Generated badge. Items
added manually through the extra-item form have no origin badge. Shared transfers
use personalGenerated provenance, because their
custom flag also serves internal preservation and is not a display label.
Normal rows show only the current quantity and unit, without the repeated
"generated X unit" line. Carried-week and adjustment notes render only when
applicable. The quantity editor shows "Plan quantity: X unit" for Generated
items whose draft quantity differs from the generated requirement, falling back
to the saved quantity for invalid drafts. Long names and badges wrap naturally;
checkboxes, quantity controls, focus behavior and 44px actions stay unchanged.

### Approved shared recipe additions

Hainanese Chicken Rice, Korean Broccoli Side Dish and Tortang Talong with Chicken
are shared defaults for current and new accounts. Approved uploaded covers are
bundled assets. Personal originals remain separate. Authored measurements,
conversions, source references and instructions are retained; Hainanese water
uses the author-approved zero-calorie correction.

Grocery Total Amount omits the redundant spending description and decimal-entry
helper sentence; validation errors and carried-amount review guidance remain.

## Cooking group interactions

Choose recipes in both Generate dialogs uses the approved Classic Stack composition: a single prominent white recipe card with a thin ink border, a lavender food-photo mat, wrapping title and recipe facts, with two subtly offset inert backing cards. Large round lavender Skip/X controls sit on the left and mint Add/check controls on the right, with directional arrows and visible labels. Left swipes skip; right swipes add. The first card moves 18px left/center/right/center once when card and controls are visible, highlighting the matching action; pointer, keyboard and field interaction interrupt it. Reduced motion omits this demonstration, rotation and exit travel. Horizontal drags follow the pointer, short gestures return to center, and committed cards exit over 220ms. The image and card scroll in the modal; touch-action preserves vertical panning and pinch zoom. Native buttons and scoped Left/Right Arrow keys provide alternatives, polite status updates announce choices, and hidden backing cards never enter the focus order.

Recipe position and added count sit above the deck; Undo and an expandable Review choices list sit below its action controls. Review choices uses compact cover/name/status rows and explicit Review buttons rather than a second grid. Fresh plans start empty, restored choices remain Added, and invalid local batch text stays visible with recovery guidance. Group quantity controls are usable before adding and display the maximum servings produced by the batch allowance; staged unselected edits do not regenerate. Personal cards retain Yield, Planned, Remaining and meal slots. Source covers, approximate nutrition, time, complexity and edited-default annotations reuse existing recipe presentation. Layouts wrap at enlarged text sizes, and action targets remain at least 44px.

Current preview gaps show a collapsed Review unfilled meals disclosure with an affected-meal-time count, without a separate unfilled-status sentence. Its bottom lavender Collapse all action closes only this section and returns focus to the summary. Details group meal slots chronologically by date and explain that at least one selected person could not be assigned that meal time, without inferring which members or private health limits caused a gap. Opening or closing this disclosure preserves input and acknowledgment. The preview heading counts new per-person meal assignments and excludes retained meals. Recipes to cook explains whole batches and leftover servings. Unknown server warnings and the zero-assignment explanation remain visible under Planning notes. Pending, outdated and failed previews do not show warning summaries as current results. Recipe cooking totals, replacement review and confirmation before saving remain visible in the preview flow.

The 2026-10-21 compact-pill/edited-default refinement passed 519 local tests, 1,302 database assertions across 40 files, and desktop/mobile cooking-group flows with local fixture cleanup. Dialog checks cover 320, 390, 469, 570, 594, 760 and 1440px, 200% text, reduced motion, keyboard focus, current-preview acknowledgment, draft recovery and loading/error/empty feedback. TypeScript, ESLint and the webpack production build passed. Browser verification uses an isolated webpack test server.

Settings uses the existing lavender card, member initials and display names, a privately shared one-use PIN, explicit consent and a connected-success modal. Profile and action groups wrap at enlarged text sizes; target tiles use available-width columns, and Settings help headings may wrap their controls to avoid overflow at 320px with 200% text. Shared access is explained before confirmation; emails and health measurements are omitted. Shared week proposals sit beside member controls, and the ordinary week preference points to this agreement flow.

Nutrition and Grocery have no Personal/Group segmented control. Nutrition retains the daily calendar, targets, Planned/Eaten rows and owned recipes, with one combined Recipes section. A soft Overview button sits immediately left of Generate and opens Cooking overview for the displayed week. Recipe cards lead with saved-version cooking totals; expandable Meal distribution lists contain chronological member assignments and editing controls. Cooking overview marks the signed-in member as “(you)” in recipe participant lists and assignment labels using account IDs, so matching display names do not merge different members. Shared assignment Edit opens the modal, expands the relevant recipe and focuses its matching editor. Modal close restores focus to its entry point. There is no inline cooking schedule or separate Shared recipes gallery. Canonical defaults appear once, customized variants remain distinct, and Recipe overview shows Shared by: display name or Source: Default recipe. One Generate entry opens Generate plan, with People defaulting to all members; the dialog explains that selecting only yourself still contributes to shared groceries and unchecking others preserves their meals. No alternate personal-generation action appears while connected. The planner reuses existing modal, day tiles and recipe-card patterns, with People, Fill/Replace radios, batch limits, editable estimated portions, replacement review, whole-batch cooking and leftovers. Hidden native recipe checkboxes retain keyboard behavior. Bulk controls show icons below 768px and text with icons above that breakpoint.

Connected Grocery uses one week navigator, one categorized Grocery list, one Refresh action, one add-item form and one shared PHP spending editor. There is no Private extras disclosure or separate private-spending panel. Shared with names identify the audience. Each member explicitly consents to sharing their own all-week history, future independent meal-plan ingredients and extra items, and adding recorded spending. A concise notice precedes Generate PIN and Connect and share; those actions accept grocery sharing without a separate checkbox. Existing connections receive a one-time Share groceries with your group modal with Share groceries and Not now. Closing or Escape saves dismissal for that membership; Settings retains Enable grocery sharing. Groceries has no large consent card. Authorized transfers resume on opening Groceries or Cooking group settings, with compact progress and retry feedback within the Grocery list or settings; matching items remain separate. Unsaved personal drafts remain device-local and are reviewed before saving to the group. Recovered spending drafts require confirmation of the final shared total rather than automatic addition. Unconnected accounts retain personal groceries. Navigation and conflicting controls lock during submissions. Shared groceries reuse explicit quantity and PHP amount editors with account/group/week/item drafts, captured revisions and review-before-retry. Shared recipe overview reuses ingredient/instruction tabs and offers Save personal copy. Generation attribution uses “Recent: <display name>, <MM/DD/YY>” across Nutrition, Cooking overview and Grocery. Generation success uses the modal title “You're all set!”, followed by generation details, an Overview h3 and the recipe-cover grid with participant names and saved cooking totals. The former general saved-summary explanation is omitted; superseded generations retain their separate notice. Done spans the footer content width below 640px with the standard horizontal padding, and keeps its content-sized appearance and alignment at larger widths. One acknowledgment remains shared by Nutrition and Grocery, with existing dismissal and focus restoration. Full dates remain accessible, controls retain 44px targets and layouts wrap at enlarged text sizes.

### Advisory preference review in Generate

Place Recipe warnings in final Review in both dialogs, grouped by recipe
with 44px Remove recipe actions. Avoided-food/allergy matches use semantic danger
surfaces and readable dark text; other warnings use pastel warning treatment.
Name matched ingredients and terms without claiming safety. Warned recipes remain
selectable. State once that cost checks are temporarily paused.

Daily carbohydrate warnings follow recipe warnings in Review, grouped chronologically with
estimated totals, saved thresholds and contributing recipes. Unknown totals are
explicitly incomplete. Keep operational/unfilled warnings distinct. One final
checkbox covers the current preview and warnings; input changes clear it.
Connected Generate shows only the viewer's detailed matches and a general
reminder to consider others. The summary shows Selected people with actual
per-account assignment counts (including zero) and ID-based “(you)” labels.
The completion summary places its single centered You’re all set! heading in the
scrolling content above the centered check-done animation, followed by
Generated by and the existing saved-generation details and cooking overview.
The checkmark is 1.5 times its initial visible size: a centered 192px artwork
viewport makes the completed circle about 70px wide. Its compact 88px-high,
160px-wide outer area and smaller bottom gap reduce the whitespace before
Generated by. Overflow is clipped and the static poster uses the same sizing. The
header retains Close; the footer retains Done. The supplied animation plays once
and holds its completed checkmark, with a completed static poster for reduced
motion or failures. It never delays dismissal. Your review at generation and
its recipe/daily warning lists are omitted from this summary. Existing cross-route
notices and reopened summaries share this presentation. Text wraps within scrolling modals at enlarged sizes;
44px controls, keyboard focus and reduced-motion behavior remain intact.

### Shared Add meal modal and planned actions

The selected Modal A is search-first, with food/recipe results, recipe thumbnails,
inline portion controls and direct Log meal/Add to plan actions for selected
recipes, local foods and explicit USDA selections. Manual entry stays in the same dialog
with Back to search. Date and slot are fixed by the triggering plus. Existing
source/uncertainty information and personal planning warnings appear in the first
portion panel. Manual forms and AI ingredient review retain explicit review
requirements. Change selection is distinct from footer Cancel.
Use the shared scrollable modal, retained per-slot drafts, visible keyboard focus,
44px controls and focus return after dismissal or successful saves. A planned
check logs its saved portion directly, without opening this review flow. The X
opens Remove planned meal? with the meal/date/slot, a focused Cancel button and
pastel-danger Remove meal. Errors remain in the confirmation for retry. Nutrition
uses these same icon actions and a legacy restore icon, without entry Edit.
There is no inline correction form or empty placeholder beneath slot headings.


### Recipe nutrition method and optional conversion flow

Details begins with the labeled Nutrition method select. New recipes select
Recipe-wide macros; existing recipes show their saved method. Recipe-wide mode
shows a Macro basis selector (Per serving / Whole recipe), four explicit source
values, the derived opposite basis, and concise yield/estimate guidance. Switching
to ingredient calculations retains entered values and exposes unresolved nutrition
requirements. Source-wide totals never silently change after cooking-row edits.

In recipe-wide mode, Ingredients puts Add cooking ingredient before optional
Search ingredients and Describe ingredients actions. Cooking-row names receive
focus when added. Each row offers Link food for nutrition or conversions and Add
ingredient nutrition. The latter opens the existing serving/macros form within the
row, clearly labeled optional; Use ingredient nutrition requires a complete record,
while Back to ingredient restores focus and retains unfinished inputs. A persistent
save-area notice explains that unfinished nutrition will not be applied. Recipe-save
failures show the specific error and draft-retention guidance together, preserving
that reason until the next attempt even if account reads clear the shared error.
Unlinked
rows explain that food linking and nutrition are optional rather than instructing
the user to supply nutrition.

Ingredients offers Add cooking ingredient independently of food search. Rows retain
the existing name/amount/range/unit/note/optional controls; Link food for nutrition
or conversions is optional in recipe-wide mode. Shared labels include cups, tbsp,
tsp and pc/pcs alongside mass and volume units. Unknown cross-unit conversion keeps
the committed measurement while offering Confirm conversion, Enter a new measurement,
and Keep original. A replacement amount starts blank, includes both range bounds,
and states that it is not a weight equivalence. Optional unfinished conversions do
not disable recipe-wide saving, and the explanation states what will be saved.

The same compact grocery quantity controls display authored units and pluralized
counts. Input labels, native selectors, visible focus, existing 44px touch targets,
wrapping source descriptions and responsive recipe tabs remain the visual contract.

### Grocery category suggestions and corrections

Both extra-item forms retain name, quantity/unit and Add, with a visible Category selector beneath the entry controls. Reuse existing input tokens, six category sections, full-width mobile wrapping and 44px targets. Suggestions appear before Add without a confirmation step. Remembered choices show "Using your saved category" or "Using the group's saved category." Use automatic category clears the preference only when Add/Save succeeds.

Manual-row Edit includes Category beside the quantity editing flow; Generated rows remain quantity-only. Cancel retains saved values. Category changes move the row between cards and restore focus to its Edit control after refresh. Normal rows gain no category or Manual badge. The existing polite toast host announces saved quantities and units, including pc/pcs and cup/cups: "2 pcs tomatoes added to Produce." or "2 pcs tomatoes moved to Produce." Failed saves do not show success. Failed lookups offer Retry categories while built-in suggestions remain usable. Stale preferences show the latest category and explicit review while retaining input. Long names, large text and keyboard controls wrap within cards.

Grocery extra names remain as typed in recoverable drafts. Add saves the name with its first letter capitalized, preserving remaining casing; the row and success toast use that saved name.

### Grocery name autocomplete

Both extra-item forms reuse GroceryNameInput with existing labels, name drafts and input tokens. A fixed Floating UI portal anchors a wrapping white listbox to the input, flipping/shifting within an eight-pixel viewport margin and scrolling when necessary. Show at most six name-only options after two non-whitespace characters; rows have at least 44px targets. No automatic text replacement occurs while typing, on blur or from read responses.

The combobox retains DOM focus while Arrow Up/Down changes the active descendant. Enter selects the active option and blocks form submission while open; Escape dismisses; Tab leaves without selection. Pointer selection fills the name, closes the popup and preserves focus, quantity and unit. IME composition suppresses suggestions and Enter interception until composition ends. Failed history reads show compact Retry past items guidance while dictionary suggestions remain usable. Recovered names stay unselected until the user opens or types in the field. Category, Add, first-letter capitalization and authoritative save-toasts retain their existing behavior.
