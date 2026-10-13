# Cali - Exercise and Meal Planner

Living product contract for a responsive web app built with Next.js, with optional
Progressive Web App (PWA) installation support.

## MVP-3 handover status — 2026-10-04

Everyday Usability and Choice is implemented: five onboarding groups and reliable
save/retry, fresh-browser account loading, manual steps and separate walking
estimates, remaining-calorie rings, Pilates, custom routine/session versions,
Low-carb/Keto-style planning, shared interaction feedback, and opt-in milestones.
The feature contracts below describe implemented behavior. Local verification
and the shared database rollout were recorded on 2026-10-01. PR #3 merged MVP-3
into `main` on 2026-10-04; candidate and resulting-main CI passed. Hosted
deployment, hosted Auth configuration, staging SMTP, final hosted acceptance,
and release sign-off remain pending. Device sync is deferred;
named custom movements have no automatic progression, and walking estimates
never increase the food target. See [`MVP3_HANDOVER.md`](./MVP3_HANDOVER.md) for
the complete handover and [`MVP_Priority_Matrix.md`](./MVP_Priority_Matrix.md) for
dated evidence. Historical RC3 checks do not establish MVP-3 readiness.

## Product Goal

Help a user follow a realistic workout routine, eat toward a personal goal,
and see whether their habits are working.

The MVP should protect one simple loop:

1. Set up a profile and goal.
2. Receive a weekly workout and meal plan.
3. Complete workouts and log food.
4. Review progress and adjust the next week.

## MVP Definition

The first release is a single-user, mobile-first web app backed by Supabase. It
must work well in a browser at narrow and wide viewport sizes and may be
installable as a PWA. Supabase Auth provides user identity and Supabase Postgres
is the authoritative store for profile data, plans, workout history, nutrition
history, grocery state, and progress data. The MVP does not include social
features.

Browser storage may cache read models and preserve recoverable form or session
drafts, but it is not an alternative source of truth. A network or provider
failure must never silently discard a user input or durable mutation.

The MVP must make all generated content editable. Users must be able to replace
an exercise, change a serving, skip a meal, and record what they actually did.

## Feature Priorities

- P0: Required for the first usable release.
- P1: Useful for a launchable beta, but not required for the first prototype.
- Later: Defer until the core loop has real usage.

## P0 Features

### 1. Onboarding and User Profile

Create or sign in to a Supabase account, then collect the minimum information
needed to produce the first workout plan:

- Age
- Sex used for BMR estimation
- Height
- Current weight
- Unit system: metric or imperial
- Training experience
- Available equipment
- Days per week available for training
- Typical workout duration
- Primary goal

Collect these fields progressively before generating a meal plan or refining
recommendations:

- Dietary pattern and food preferences
- Allergies and exclusions, including an explicit "none known" choice
- Cooking time and meal budget
- Target weight, desired rate of change, and target date when relevant

Before showing automated calorie, macro, or personalized progression targets,
the user must answer a brief health screen. Store only `eligible`, `unsupported`,
or `not_answered` plus the screening policy version; do not store a sensitive
free-text reason. Unsupported or unanswered screening blocks automated target
creation while preserving the user’s inputs for manual logging or later review.

The initial onboarding path should not require every optional preference. A user
must be able to reach the first plan in under five minutes, then complete or
edit the remaining profile fields from Settings.

Display calculated values as estimates, not medical measurements:

- BMR
- BMI
- Estimated TDEE
- Daily calorie target or range
- Protein, carbohydrate, and fat targets

Users must be able to edit profile data and recalculate targets at any time.
Name and display-unit edits update the profile without creating a new target or
plan version; body, goal, training, and nutrition-preference edits create only
the affected future artifacts and preserve historical assumptions.

### Health and Calculation Safety

Health calculations are estimates for supported adults and are not medical,
dietary, or exercise care. The implementation must use one documented BMR
formula, one documented activity-factor table, and versioned calculation
assumptions. It must not silently change formulas or clamp invalid inputs.

- Validate age, height, weight, units, and target ranges at the input boundary.
- Reject unsupported or invalid values with an actionable message instead of generating a target.
- Do not generate automated calorie, macro, or personalized progression targets for minors, pregnancy or postpartum situations, eating-disorder recovery, or conditions requiring individualized professional care.
- BMI is informational only, is optional where appropriate, and must not be the sole basis for a goal or target.
- Display calorie and macro results as estimates or ranges with their assumptions, source, effective date, and disclaimer.
- If shown on Home, workout energy is a rough estimate for supported adult
  profiles only. Estimate completed sessions from recorded elapsed time and
  current profile weight, using moderate calisthenics at 3.8 MET from the
  [2024 Adult Compendium](https://pacompendium.com/conditioning-exercise/);
  its standard MET convention is roughly 1 kcal/kg/hour and is not a precise
  individual measurement. Cap elapsed time at planned or typical session
  duration. Label the result approximate, note that elapsed time may include
  rests or pauses and personal effort varies, and never use it as a meal
  allowance or target.
- Warn when a requested rate or target is unusually aggressive, require explicit confirmation, and never present it as recommended care.
- Preserve the calculation and target version that was used for historical plans and summaries.
- The current policy identifier is `calicoach-health-v1`. Raw estimates below
  the supported safety floor return an unsupported outcome; the app never
  silently substitutes a 1,200-kcal value.

### 2. Goals and Targets

Support one primary goal at a time:

- Lose weight
- Maintain weight
- Gain weight
- Build strength or skills
- Improve consistency

Allow the user to set:

- Target weight, when relevant
- Desired rate of change, when relevant
- Target date, when relevant
- Weekly workout target
- Daily calorie and macro targets
- Optional skill targets, such as a pull-up or handstand

Show a warning when a selected target appears unusually aggressive. Never present
the app as a substitute for medical or dietary care.

### 3. Exercise Library

Start with a curated, static catalog rather than a user-generated marketplace.
Each exercise should include:

- Name and description
- Movement category and primary muscles
- Difficulty level
- Required equipment
- Reps, hold time, or duration type
- Illustration asset from `@bryllim/workout-guide`
- Accessible illustration description
- Short instructions or optional reference video URL
- Easier regressions
- Harder progressions
- Basic safety guidance

Exercise illustrations are bundled with the client through
`@bryllim/workout-guide` and are available without a network request. Reference
videos are supplemental, may require connectivity, and must never be the only
way to understand an exercise. Do not add unlicensed or scraped exercise media.

The first catalog should cover the movements needed for a balanced routine:

- Push
- Pull
- Squat
- Hinge
- Core
- Mobility and warm-up

### 4. Weekly Workout Plan

Generate a weekly plan using deterministic rules and the profile inputs. AI is
not required to choose exercises or calculate progression in the MVP.

MVP-3 offers Calisthenics and Pilates foundations in onboarding and Workouts.
Pilates uses approved mat movements, breathing, warm-up, rest, cooldown, and
gentler doses on consecutive days. Beginner prescriptions exclude movements
above the beginner catalog difficulty. Pilates has no automatic calisthenics
progression suggestions or calisthenics energy estimate.

Users can also create reusable routines at `/workouts/custom` from catalog
exercises or named text-only movements. Catalog choices respect equipment and
experience; all routines are checked against available workout time. Routines
retain versioned prescriptions; sessions copy the prescription at start and
store actual reps/holds, sets, RPE, notes, and completed/modified/skipped work
separately. Pause/resume and partial completion are supported. Finished sessions
cannot be overwritten by routine edits. User movements never progress
automatically. Custom session history is available on the routines page and in
account export; weekly planned-workout statistics remain specific to the weekly
prescription.

Each workout should contain:

- Warm-up
- Exercises in order
- Sets and reps, hold times, or durations
- Rest guidance
- Suggested regression or progression
- Cooldown or mobility work
- Expected duration

The plan must account for available equipment, training days, experience, and
workout duration.

Basic progressive overload rules:

- Record difficulty using a 1-10 RPE scale when the user can provide it.
- A qualifying session completes all prescribed work without a safety concern and
  has an RPE of 7 or lower. If RPE is not recorded, the user must explicitly mark
  the work as manageable for it to qualify.
- After two consecutive qualifying exposures to the same exercise variant,
  increase one progression variable by one catalog-defined step in the next
  applicable workout.
- RPE 8, partial completion, a modification, or a skipped exercise retains the
  current level. Two consecutive non-qualifying exposures may suggest the
  catalog-defined regression.
- RPE 9-10, reported pain, or a safety concern must never trigger progression;
  show a recovery or regression suggestion instead.
- Increase only one variable at a time and remain within the catalog-defined
  bounds for reps, hold time, sets, load, and exercise difficulty.
- Rest days and days with no scheduled workout are not failed sessions.
- Allow the user to override the suggested progression. The override remains in
  effect until the user changes or removes it.

The same profile, goal, plan version, recorded performance, and user overrides
must produce the same generated result. A plan edit or regeneration creates a
new future plan version and never changes completed history.

### 5. Workout Execution and Logging

Provide a focused session view that lets the user:

- Start, pause, and finish a workout
- See the current exercise and rest guidance
- Log actual reps, hold time, duration, and load if used
- Mark an exercise complete, skipped, or modified
- Substitute an exercise
- Record difficulty or RPE
- Add a note

Save the planned value and actual value separately. Completion history must not
be overwritten when the plan changes later.

### 6. Weekly Meal Plan

Generate an editable weekly meal plan using the active target version, dietary
pattern, food preferences, allergies and exclusions, cooking time, meal budget,
and available saved meals or recipes. AI is not required to choose meals or
calculate nutrition for the plan.

MVP-3 adds Low-carb (maximum 130 g **total** carbohydrate/day) and Keto-style
(maximum 50 g/day), also combined with vegetarian or vegan restrictions.
These are conservative product planning assumptions, not guarantees of ketosis
or dietary care. Future targets use a separate calculation version. Six
reviewed USDA SR Legacy food records and four measured-portion meals use new
identities to preserve historical starter values. A carb-limited plan uses only
trusted serving data and enforces allergies, existing dietary restrictions,
portions, and daily carbohydrate totals in generation and server mutations.
Meals use cooked/labeled quantities and count all listed oil. If a safe slot
cannot be filled, it remains visibly unresolved; a partially planned day is
never described as fully compliant. Editing the future plan never rewrites
logged food.

Each planned meal should contain:

- Local calendar date and meal slot
- Stable slot key and order within the date/slot, so multiple snacks or added
  meals remain independently editable
- Referenced food, saved meal, or recipe
- Planned serving quantity and unit
- Expected calories and macros calculated from trusted nutrition records
- Source, assumptions, confidence, and the target version used

Users must be able to replace a planned meal, change its serving, skip it, or
add a meal. These changes create a new future meal-plan version or snapshot and
must not alter previously logged nutrition.

### 7. Nutrition and Meal Logging

Support these input methods in the MVP:

- Search and select a food
- Enter a custom food manually
- Log a planned meal
- Add a saved meal or recipe
- Enter a meal using plain text

The Nutrition day view has a Planned card with Breakfast, Lunch, Dinner, and
Snack groups. Each group may contain multiple planned rows and independently
marked Eaten rows. Empty slots say “Nothing planned or logged.” The summary and
contextual help retain the distinction between unknown and zero intake. Planned and Eaten entries
share compact status/name, nutrition and action rows without recipe banners
or favorite controls. Planned
nutrition describes its shown portion and preserves stored prescription values;
Eaten nutrition retains saved historical values. Recipe yield/time/complexity
pills remain on Saved recipe cards. Each meal-group heading has a Plus + Add meal
button, even before a weekly plan exists. It opens the shared search, description,
AI review, or manual editor beneath that heading with the slot already fixed;
there is no Planned-header entry button or meal-slot selector in this editor.
Only one editor is open at a time. Switching groups preserves their separate
account/date/slot drafts. Closing or successful saving returns focus to the
originating Add meal control. A confirmed candidate
offers Add to plan and Log meal: the first versions the plan and reconciles
groceries, while the second records actual intake without changing the plan.
New plans use the active eligible target; without one, logging remains available
and the card explains how to add a goal. AI-only estimates can be logged with
uncertainty but must be matched or corrected before planning. Carb-limited plans
require trusted eligible nutrition data.

Every visible planned row offers Edit, Skip or Plan again, and Log. Log confirms
the actual serving and nutrition before adding a linked Eaten row. The planned
record remains in its versioned plan but is hidden in the day view while linked
Eaten entries exist. A linked Eaten row offers Log again for another separately
confirmed portion; deleting the last linked entry shows the Planned row again.
Independent logs do not consume a plan item. Older logs are linked only when a
same-date, same-slot food or meal reference yields one clear pair; ambiguous
history remains unlinked. Unresolved plans explain why logging is disabled
until edited. Eaten entries retain expand, edit, and delete controls, including
grouped meals and entries without a plan.
Closing or changing days leaves recoverable per-date, per-slot drafts. Saved
meals' Log shortcut requires a slot choice and confirmation; a failed save
retains that choice.

For each food or meal, store:

- Serving quantity and unit
- Calories
- Protein
- Carbohydrates
- Fat
- Optional fiber and other nutrition fields
- Whether the values are estimated or user-provided
- Nutrition data source and source version
- Raw, cooked, or other preparation basis when relevant
- Assumptions and confidence for estimated values

Show daily totals compared with the user's targets. Include meals and snacks,
with an easy way to correct or delete an entry. Missing or partially logged
meals must be labeled clearly and must not be represented as zero intake.

Nutrition calculations must use canonical metric quantities internally and
provide validated conversions for supported household units. Raw/cooked status,
serving assumptions, database source, and confidence must remain visible when
they affect the estimate. Unmatched or ambiguous foods require user correction
or an explicitly uncertain custom entry; they must not receive false precision.

The MVP must select and document one trusted, versioned nutrition database
before production use. Do not silently combine records from different sources.
Every catalog or matched food record must retain its source and source version.
The nutrition contract must define the canonical gram or milliliter basis,
supported household-unit conversions, branded-food behavior, raw/cooked rules,
restaurant and mixed-dish uncertainty, and the fallback when no trusted match
exists. User-provided values must remain distinguishable from catalog estimates.

The current predefined recipe catalog contains Creamy Lemon Chicken
(Easy, 30 minutes, two servings) and Korean Beef Bowl (Easy, four servings,
cooking time not supplied). All predefined recipes require measured
ingredients, calories/protein/carbohydrate/fat, a generated recipe
image, and visible serving/preparation assumptions. This recipe uses 400 g raw
boneless skin-on chicken thighs, 30 g butter, 300 ml whole milk (approximately
309 g), 8 g flour, 47 g lemon juice and 21 g honey. Its per-serving estimate is
approximately 695 kcal, 39 g protein, 21 g carbohydrate and 50 g fat; all sauce
and rendered fat are counted, unmeasured seasonings and sides are excluded.
Ingredients use separately identified USDA SR Legacy records. Instructions retain
the supplied TikTok reference and include honey in the sauce step.

Korean Beef Bowl preserves the supplied macros per serving: approximately
560 kcal, 45 g protein, 58 g carbohydrate and 16 g fat. When recipe macros are
provided, use them without estimating replacements from the ingredients. Store
them separately as source-provided recipe nutrition and scale them by actual
servings for logging. Ingredient records and raw/uncooked quantities remain
available for grocery calculations. Optional ginger is included in the grocery
quantities; garnish weights are explicit assumptions (3 g sesame seeds, 15 g
spring onion). Source-provided nutrition remains visible in the overview and
editable in a personal version; ingredient edits do not silently recalculate it.
Existing saved intake is never recalculated. Unverified provided macros cannot
establish compliance with a strict carbohydrate-limited plan.

The eight earlier predefined recipes are retired, retaining their original
identities, ingredients, plans and saved nutrition history. Personal recipes are
unaffected. New plans can select the replacement for lunch/dinner when compatible
with restrictions and cooking time; breakfast remains unresolved unless an
eligible personal recipe is available. The app must not substitute chicken into
vegetarian/vegan plans or bypass milk/wheat restrictions.

### Saved recipes in daily meal entry

The existing Search or describe editor searches active Saved meals locally as
recipes, above its Foods matches. Archived recipes and catalog originals hidden
by account preferences are excluded; personal replacements remain searchable.
Exact names, partial names, plurals and close matches share food-search ranking,
with up to six recipe suggestions. Neither searching nor selecting sends a
provider request; USDA and DeepSeek remain explicit actions, and a matching
recipe suppresses the no-match analysis suggestion.

Selecting opens Review recipe servings for the selected date and meal slot,
focuses a one-serving input, and accepts positive fractional portions. Log meal
creates one independent grouped Eaten entry. Add to plan references the existing
recipe through atomic planning, retaining goal, diet and trusted-value checks.
Neither logging nor preview changes the recipe's whole yield or consumes an
existing planned meal. Supplied per-serving macros stay authoritative: half a
Korean Beef Bowl is 280 kcal / 22.5g protein / 29g carbs / 8g fat. Ingredient-based
portions use the same scaled quantities and rounding as the existing logger.

Recipe and food portion selection are mutually exclusive. A selected match hides
search controls, all results, entry tabs and unrelated description review; the
quantity/servings field receives focus. Pending saves disable portion controls
and the surrounding meal-group entry buttons. Cancel returns focus
to search and retains query and description-review inputs. Account/date/slot
recovery retains recipe identity, reviewed revision/contents, servings text and
submission identity. Failed saves retain the review and retry the same intent;
changing the recipe or portion creates a new intent. Restored selections resolve
against current recipes. Changed content requires an explicit renewed review;
archived/unavailable recipes and missing or invalid ingredients block submission
rather than producing partial nutrition. Only confirmed success clears the draft.

Supplied recipe macros are also authoritative for new planned prescriptions and
explicit plan edits. The server scales all four stored per-serving values by the
planned portion, records source-provided provenance and recipe revision, and
leaves fiber unknown when no fiber was supplied. These values do not become
trusted catalog nutrition merely because ingredient records are trusted;
carb-limited plans still require verified catalog values. Recipes without supplied
macros and food-only plans retain their existing calculation paths. The forward
correction does not backfill existing prescriptions or recalculate eaten history;
explicitly saving an edited plan creates a corrected new version while retaining
the previous version. The October 13 migration is deployed to the linked database
with 70 matching history entries; see HANDOVER.md for verification evidence.

### 8. AI-Assisted Nutrition Estimation

The MVP-1 AI feature uses DeepSeek `deepseek-flash` to extract reviewable meals
from the unified “Search or describe a meal” input. It
must not claim to identify exact nutrition from photos.

Example input:

> Two eggs, two slices of whole wheat toast with butter, and a banana.

Implementation flow:

1. Send the user's text to a protected Supabase Edge Function or other
   server-side AI endpoint after an explicit user action.
2. Have the model extract food names, quantities, units, preparation, and
   uncertainties into validated structured JSON.
3. Match each stated ingredient against the local catalog and protected,
   on-demand USDA FoodData Central search.
4. Calculate macros from matched catalog records. If no trusted match exists,
   the user may explicitly request a separate DeepSeek estimate for selected
   unresolved ingredients; it returns only a low-confidence low/base/high range.
5. Show matches, hidden-ingredient questions, assumptions, confidence, source,
   preparation basis, and serving sizes for confirmation.
6. Let the user correct the food or portion before one atomic confirmation.
   A confirmed composite meal creates one reusable recipe and one expandable
   grouped history card; editing history does not edit the reusable recipe.

The AI endpoint must never contain provider secrets in the Next.js browser
bundle or any `NEXT_PUBLIC_*` variable. Extraction and estimate endpoints only
create reviewable candidates; they must not save a nutrition entry or mutate
user data. A separate confirmed mutation persists the reviewed result. AI
estimates remain `estimated: true`, `confidence: low`, `valueSource:
ai_estimate`, and retain a complete low/base/high range.

The UI should call out uncertainty for foods with hidden ingredients, such as
restaurant meals, sauces, cooking oil, and mixed dishes. Do not display false
precision for estimates.

After MVP-1, guided meal-photo logging may use `deepseek-flash` to suggest
visible foods, not calories or macros. The flow is: capture a photo; review
suggested foods; ask about portion sizes, oils, sauces, cooking method, and
ingredients the image cannot reveal; let the user correct food and quantity;
match trusted nutrition records and calculate estimates; then save only after
explicit confirmation. If a food or amount remains unknown, show uncertainty
and allow manual entry instead of false precision. Do not retain meal images in
the app after analysis. Disclose the provider's image/data handling before
launch, and validate accuracy and usability against representative weighed
meals. Photo recognition, voice input, and social-media recipe extraction are
not MVP-1 signoff requirements. Photo capture/upload and image analysis remain
outside MVP-1.

### 9. Custom Meals and Recipes

Users can create a reusable meal or recipe with:

- Name
- Ingredients
- Quantity for each ingredient
- Number of servings
- Optional total preparation, cooking, and serving time in whole minutes
- Editable Easy, Medium, or Hard complexity, defaulting to Medium and required for recipe-authoring saves
- Required multiline instructions when authoring or editing a recipe
- Optional reference link or citation
- Optional recipe cover: default illustration, uploaded image, or HTTPS image URL
- Calculated nutrition per serving

Allow users to create, edit, archive, and log saved meals. Meal duplication is
removed from the available workflows. A social-media URL may be
stored as a reference, but the user should enter or confirm the ingredients in
the MVP.

Create and Edit open the approved Option 1 recipe modal. A centered cover sits
above Name, Servings, and Time (mins.), without a visible Recipe basics heading.
Details, Ingredients, and Instructions are persistent tabs; Ingredients opens
first and changing tabs never clears input or review. These fields share a row when space permits
and wrap in that order on narrow screens or enlarged text. Desktop uses a centered dialog; phones use a full-screen editor
with a persistent header and Cancel/Save footer. The body scrolls while background
interaction and scrolling are blocked. Closing returns focus to its originating
control; Escape dismisses contextual help before the recipe editor. Close,
Cancel, and a direct backdrop click retain the draft, while dismissal is disabled
during saving or uploading a cover. The footer uses Save for creation and Save
changes for editing. Clicking a saved meal opens a read-only overview with the
same cover and tabs, plus Edit for owned and predefined recipes. First saving an
edit to a predefined recipe creates a personal version and hides the original
in that account's Saved meals; later edits target the personal version. Archive
hides a predefined recipe for the current account. Shared catalog data, other
accounts, current planned references and eaten history retain their original
records. Recipes previously created as copies remain ordinary saved recipes.
Canceling an edit returns to the overview and retains
the draft; successful saving returns with refreshed authoritative recipe data.
The editor starts with empty servings and ingredients. Ingredient
search offers saved foods and trusted USDA matches; descriptions use an explicit
AI analysis action followed by review. Possible hidden ingredients remain
excluded until selected, and supported units must resolve without guessed
conversions. Users may add a reusable custom ingredient with a labeled serving,
gram basis, preparation, category, and user-provided nutrition. Recipe ingredient
selectors include servings and piece/s by default, alongside the food's supported
units. Piece counts require a canonical piece basis or an explicit serving weight;
missing conversions remain unresolved in review. Pending foods and the recipe
save together. AI-only macro estimates cannot be saved through recipe
authoring. Valid ingredient/quantity/serving changes update per-serving nutrition
pills immediately; incomplete input shows guidance rather than a partial total.
References accept plain text or a complete HTTP(S) URL; no URL import occurs.
Existing recipes remain loggable without instructions; the authoring editor
requires instructions before saving changes. Instructions and references appear
in the overview/editor tabs and are copied on duplication. Optional time
describes the whole recipe, is copied on duplication and export, and appears
as “X mins total” in details. New time fields start blank; blank remains unknown,
while explicit zero is retained. Negative, fractional, invalid, and out-of-range
time values prevent saving. Time is direct entry with a clock icon and no
adjustment controls; it does not change nutrition or the profile cooking-time
preference. Closing or a
failed save retains the full recipe draft; explicit discard resets it.
The default cover is a generic illustration. A user may choose a still JPEG,
PNG, or WebP up to 5 MB (at most 25 million pixels), or a full HTTPS URL without
credentials. Uploads are private and re-encoded as WebP with metadata removed;
cover selection becomes part of the recipe only after Save succeeds. URL images
load from their external host without a referrer and may become unavailable.
Unavailable covers show the default and offer Retry image. Reset to default
is retained in the recoverable draft, including after reload. Image URLs and
private object paths copy with recipe duplication and appear in account export;
expiring access URLs are never saved. These covers are separate from temporary
meal-analysis images and are not used to infer nutrition.
Recipe servings use minus/input/plus controls with direct fractional entry;
blank and zero cannot be decremented, and zero remains invalid for saving or
complete nutrition totals. Ingredient removal follows the unit control.
Switching Search, Describe, and Custom prefills only a blank destination from
the active text field and preserves existing input, nutrition, and review.
Saved-food searches across recipes and logging rank exact phrases, plural-aware
tokens, prefixes, then bounded spelling suggestions labeled “Close match”. Every
query token must match; preparation terms remain distinct. Suggestions require
explicit selection and do not authorize automatic nutrition or unit conversions.

Saved meals use the approved pastel-banner card: cover, name,
personal favorite heart, per-serving calories, whole-recipe yield, total time,
editable complexity, and bottom actions. Calories omit the visible per-serving
suffix but retain accessible labels and contextual help. A mint pie-icon yield
pill is independent of planned portions. Configured card time reads “X mins”;
missing time reads “Not set”; missing
recipe complexity defaults to Medium. Descriptions stay off cards. Planned
serving changes never change per-serving calorie values or whole-recipe yields.
Planned and Eaten displays use compact rows; food-only and unresolved entries retain logging
restrictions. Existing slot grouping, ordering, permissions, skip and log flows
remain unchanged. Catalog recipes can be favorited by their stable identity.

Popular means the user's top five non-archived recipes actually eaten during
the last 30 local calendar days, including today. Planned-only meals do not
count. Each grouped eaten record counts once regardless of ingredients or
servings; retries do not add records. Positive counts rank by count, then latest
eaten date, then stable recipe ID. Popular takes badge precedence over Favorite;
the separate filled heart still indicates the user's favorite. Metadata refreshes
after relevant logging/correction/deletion, archival, local-day changes, and
reconnection. Favorites never edit recipes or regenerate plans/groceries.
Failed changes retain the confirmed state with refresh/retry guidance.

Existing recipes with missing complexity are backfilled to Medium, including
archived and predefined records; configured values remain unchanged. New and
legacy restored drafts start at Medium unless a supported choice is present.
Complexity is an editable default, never inferred from time, ingredients, or AI.
Cancellation and failed saving preserve Create/Edit input. Old duplicate drafts
are not reused and remain subject to their existing seven-day expiry.

Saved cards provide Log with a trailing plus, followed by edit and archive icon
buttons; these use descriptive accessible names and hover/focus tooltips. The
current M1.2 implementation provides create, edit, archive, and log controls for
saved meals, plus replacement, serving, add, and skip/reapply
controls for the active planned meal. Plan edits create a new future snapshot;
recipe archive is a soft-delete so historical planned meals and nutrition logs
remain resolvable. Recipe saves and active-plan grocery reconciliation use one
authorized transaction. Custom-food persistence, multiple same-slot ordering,
preference/cooking-time/budget-aware generation, and recipe-specific draft
recovery are implemented in the MVP-1 pass. Local, browser, and authorized
remote evidence is tracked in `MVP_Priority_Matrix.md`. Implementation commits
are now included in the merged MVP-3 candidate; the current hosted acceptance
and release-packaging gates are tracked in
[`MVP3_HANDOVER.md`](./MVP3_HANDOVER.md#pending-release-work).

### 10. Grocery List

Generate a grocery list from selected meals for a selected date range, starting
with one week.

Required behavior:

- Combine duplicate ingredients
- Multiply quantities by planned servings
- Group items by category
- Add custom items
- Edit quantities
- Check items off
- Remove items
- Keep checked state when the list is reopened

The current grocery list must update after every saved user edit that affects
it, including a planned meal replacement, serving change, recipe ingredient
change, grocery quantity edit, item removal, or custom-item addition. Store the
generated quantity separately from a user-adjusted quantity. Preserve checked
state, explicit quantity overrides, removed items, and custom items when the
list is regenerated; surface changed generated quantities without silently
overwriting user corrections.

The first version does not need store-specific pricing, inventory tracking, or
online ordering.

### 11. Calendar and Progress

Provide a calendar or history view showing:

- Completed, skipped, and planned workouts
- Complete, partial, and unlogged nutrition days
- Weight entries
- Goal milestones

Provide basic trends for:

- Weight
- Workout completion rate
- Total completed sessions
- Average daily calories
- Average protein

Progress calculations use different completeness rules for workouts and meals:

- Workout completion rate uses scheduled workout occurrences as the denominator.
  Rest days and unscheduled gaps, including an every-other-day schedule, are
  excluded rather than counted as missed workouts.
- Nutrition review includes every calendar day in the selected date range because
  meals are expected daily. A day without saved meals is shown as unlogged or
  incomplete, never as zero intake.
- Calorie and protein averages are labeled with the number of logged days used;
  nutrition completeness is calculated separately across all calendar days.
- Trends must show their date range, data count, and whether values are estimated.
- Weight needs at least two entries for a change or trend line. With one entry,
  show the dated observation and explain that another entry is needed; with no
  entries, show an explicit empty state. Never describe a single entry as a
  0.0 kg change.

Allow users to record weight manually. Progress photos and body measurements
can be added later.

### 12. Settings and Data Controls

Include:

- Unit preference
- Notification preference
- Edit profile and targets
- Reset plan while retaining history
- Delete account data and clear cached browser data
- Export user data as lossless JSON plus a deterministic ZIP containing
  metadata and one CSV per exported entity collection
- Nutrition and health disclaimer

All important screens need loading, empty, error, offline, and retry-friendly
states. Network failures must preserve active drafts and clearly identify
unsaved changes; they must not be shown as completed server mutations.

## P1 Features

### MVP-3 everyday usability (implemented behavior; release gates tracked in the matrix)

- Onboarding groups About you, Movement, Food choices, Your goal, and Review.
  The meal cost preference offers Budget-friendly (`4` relative units), Balanced
  (`7`), or Flexible (no cap). These are relative catalog costs, not prices;
  existing numeric preferences are preserved until changed.
- Final onboarding shows a labeled saving state, prevents duplicate submits,
  retains a recoverable draft on failure, and navigates after a confirmed save.
  An existing account loads its saved data after sign-in in a fresh browser.
- Home offers food, steps, and workout actions in its summary cards, with today's
  local date in a white pill beside the meals-card help icon. `/activity` stores one
  manual step observation per local date, editable for the past year, with
  optional walking minutes. Zero steps is an observation; a deleted/missing
  entry is unlogged. Failed saves preserve drafts and require an explicit retry.
- At 1024px and wider, Home stacks meals and today's workout in the left column,
  with compact workout-progress and steps summaries in the right column and
  shortcuts below both stacks. Cards have content-driven heights. Smaller-screen
  order is meals, workout progress, steps, the compact full-width workout
  summary, then shortcuts. The steps card reads only today's confirmed account entry, including
  explicit zero and optional walking minutes. Its single current/target count
  reads "2,000 / 10,000", announced as "2,000 of 10,000 steps"; an unset
  target keeps "2,000" with "No daily target" and announces "2,000 steps".
  The heading supplies the visible unit. Date/source explanations
  stay in contextual help. Recorded minutes appear in a white clock pill beside
  a matching white fire-icon pill for the approximate energy range, in a wrapping
  detail row. Below 768px, the complete progress and steps summaries, including
  steps actions and each wrapped detail row, are centered beneath their rings;
  wider layouts retain left alignment. When today's entry is missing, the
  count shows "0 / 10,000" (or "0" without a target) and white clock/fire
  pills show "0 walking minutes" and "0 kcal" as visual placeholders. The
  visible "Not logged" label and unavailable ring distinguish this from a
  saved zero; assistive text also identifies the placeholders. Missing minutes
  on a saved entry, saved zero minutes, and unsupported energy estimates retain
  distinct visible messages. At/above target, the ring says "Target reached"
  while the actual count remains unchanged. Workout-energy status messages
  use a white fire-icon pill in Your progress with a 17px top margin. The walking
  detail row has a 16px top margin at every screen size. The overlapping steps
  plus is the single log/edit action, labeled for the current saved/unlogged
  state; the target link remains beneath the details. The plus and help's
  estimate-detail link open `/activity`; unfinished drafts and failed saves never replace the saved
  Home value. Home and Activity share walking-estimate profile eligibility.
  Overlapping plus actions on the Home rings open the Workouts tab directly
  or open the daily-steps editor.
- Daily step targets are optional, user-chosen profile preferences. Movement
  onboarding starts blank, retains recoverable drafts, allows skipping, and
  includes the choice or "Not set" in Review. `/settings#daily-step-target`
  supports save, change, remove, explicit retry, and deliberate stale-draft
  reapplication. Whole numbers 1–200,000 are the technical range; blank means
  unset, while zero, fractions, non-finite, and out-of-range values are rejected.
  Existing profiles remain unset. Target changes leave plans, nutrition targets,
  and saved step observations unchanged.
- Contextual help reduces persistent descriptions throughout Home, onboarding,
  Settings, Activity, Nutrition, Workouts, Grocery, Progress, and account screens.
  Circled question-mark buttons open grouped explanations through hover,
  keyboard, or touch. Essential labels, values, unknown activity, uncertainty,
  save/conflict/offline states, consent, and exercise safety remain visible.
  Calculation/source and history/version explanations remain accessible in
  help; opening help never saves a form or changes account data.
- Home's daily ring shows a dash with no target or unlogged activity, explicit
  0% for saved zero, proportional progress below target, and a full ring with
  neutral "Target reached" copy at or above target. Only visual fill is clamped;
  actual saved counts stay visible. Target and estimate links open Settings and
  Activity respectively. There are no historical step-percentage charts.
- Rollout status (2026-10-05): the target UI, authenticated RPC, nullable profile
  column, and atomic onboarding/profile persistence are implemented. Local schema
  equivalence was verified before creating the forward migration; clean reset,
  database lint, and all 529 pgTAP assertions passed. Client saves check column
  availability and retain drafts on an unmigrated backend. Following explicit owner
  authorization, the linked database migration was applied on 2026-10-05. All 47
  migration versions match, the final dry run has no pending changes, and the
  deployed schema matches the verified local schema. Durable target saves are now
  available; existing profiles remain unset until users save their chosen targets.
- Walking energy is a broad derived estimate only with minutes, eligible profile
  weight, and ages 19–59 covered by the adult reference. It uses 2.8–3.8 MET and
  rounds the range outward to tens of kcal. It is separate from workout energy and never increases
  the food target. Automatic device sync remains deferred.
- Home and Nutrition show a decreasing calories-remaining ring. Unlogged intake
  is unknown; partial logs say “Still logging”; estimates are labeled; over-target
  intake has a neutral numeric message; missing targets stay unavailable.
  The selected date uses its effective target version; a later target change
  never replaces an earlier day's estimate.
- Gentle motivation is off by default. A saved opt-in shows personal firsts and
  participation on at least three distinct days in the past week. Rest days,
  missed logging, and calories never incur a penalty.
- Signup resend uses an actual local-mail delivery and link test. The local
  confirmation template uses a token hash to support a different browser.
  Staging SMTP delivery and matching hosted template configuration are required
  before release sign-off; local evidence alone does not satisfy that gate.

Add these after the core loop works:

- Local workout and meal reminders
- Barcode scanning for packaged foods
- Voice meal entry
- More regional food databases
- Better recipe import from a pasted webpage URL
- Body measurements and progress photos
- Skill-specific training programs
- Plan deload and recovery weeks
- Pantry and ingredient inventory
- Budget estimates for grocery lists

## Later Features

Keep these out of the MVP:

- Photo-based portion and macro estimation
- Direct TikTok or Instagram importing
- Wearable integrations
- Social feed, friends, or leaderboards
- Coach or trainer marketplace
- Automatic exercise-form analysis
- Restaurant menu recognition
- Online grocery ordering
- Subscriptions and paid plans

## Suggested App Navigation

Use a small navigation surface for the first release:

- Home: today's workout, meals with compact target bars, and weekly workout
  completion with an optional rough workout-energy estimate
- Workouts: weekly plan, workout details, and session logging
- Nutrition: daily log, meal suggestions, and saved recipes
- Grocery: current weekly grocery list
- Progress: calendar, trends, and history
- Settings: profile, targets, preferences, and data controls

Onboarding should be a separate flow before the main navigation.

## Initial Data Model

The first implementation should be able to represent these entities:

- `UserProfile`
- `Goal`
- `DailyTarget`
- `Exercise`
- `WorkoutPlan`
- `PlannedWorkout`
- `PlannedExercise`
- `MealPlan`
- `PlannedMeal`
- `WorkoutSession`
- `ExerciseLog`
- `Food`
- `Meal`
- `RecipeIngredient`
- `NutritionLog`
- `WeightEntry`
- `GroceryList`
- `GroceryItem`

Store dates as local calendar dates for daily logs and timestamps for events.
Keep planned values separate from completed values. Store nutrition source,
source version, assumptions, and confidence for AI-assisted entries. Store
generated grocery quantities separately from user-adjusted quantities.

## Next.js Implementation Constraints

- Use strict TypeScript and the Next.js App Router with a dependency set that
  supports the selected Next.js release.
- Use Supabase Auth and Supabase Postgres as the authoritative persistence layer
  for the first release.
- Use the Supabase SSR client and secure cookies for authenticated web sessions.
  Use browser storage such as IndexedDB only for cached read models and
  recoverable drafts; it must not become a competing source of truth.
- Use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for
  client-safe configuration in local `.env.local` files; commit only an
  `.env.example` template.
- Keep calculation logic in pure, testable functions.
- Keep AI and nutrition-database credentials on a server, never in
  `NEXT_PUBLIC_*` variables.
- Design for responsive layouts, large text, keyboard input, focus management,
  reduced motion, and screen reader labels.
- Make the workout logger usable with one hand and with minimal screen reading
  during exercise.
- Treat PWA installation, service-worker caching, and web push as progressive
  enhancements. They must not be required for core logging or durable writes.

## MVP Acceptance Checklist

- A new user can complete onboarding in under five minutes.
- A user can create or sign in to an account and use the app with Supabase as the
  authoritative data store.
- Signing in on a new browser loads an existing account's profile and saved data
  immediately, without another onboarding flow or a manual refresh.
- A user can see BMR, BMI, estimated TDEE, calorie target or range, and macro targets.
- Invalid or unsupported health inputs do not produce automated targets.
- A user can create or receive a deterministic weekly plan that respects equipment,
  experience, schedule, and duration.
- The exercise catalog displays the bundled illustration for each supported exercise
  with accessible text and a text-only fallback.
- A user can create or receive an editable weekly meal plan with planned meals,
  servings, and trusted nutrition assumptions.
- A user can complete a workout and record actual performance.
- The next plan can use recorded performance for the documented RPE-based progression
  and regression rules.
- A user can log food manually and see daily totals.
- A user can enter a text meal and review AI/database matches before saving it.
- A user can create and reuse a custom meal.
- A user can generate and check off a weekly grocery list.
- Grocery state updates after each saved meal, serving, recipe, or grocery-item
  edit without overwriting explicit user corrections.
- A user can review completed workouts, nutrition days, and weight history.
- Workout completion excludes unscheduled rest gaps, while nutrition completeness
  includes every calendar day and distinguishes unlogged days from zero intake.
- A user can edit targets without losing historical logs.
- The app handles empty, loading, failure, and offline states without data loss;
  unsaved drafts are preserved and unsaved mutations are not presented as saved.
- Health estimates and AI nutrition values are clearly labeled as estimates.

## Recommended Build Order

1. Next.js project shell, App Router, responsive theme, Supabase browser/server
   clients, authentication, and repository contracts.
2. Onboarding, profile calculations, goals, settings, and authenticated data
   ownership.
3. Exercise catalog, workout templates, and weekly plan generation.
4. Weekly meal plan, trusted nutrition catalog, manual food logging, saved meals,
   and daily nutrition totals.
5. Workout session screen and performance history.
6. Grocery list generation, immediate edit updates, and merge behavior.
7. Calendar, weight entries, and progress trends.
8. Server-side AI text parsing, nutrition matching, confirmation UI, and tests.
9. Responsive accessibility, browser network-failure recovery, optional PWA
   manifest/service worker, data export, safety copy, and beta polish.

Do not start with AI-generated plans or photo recognition. First make the
underlying exercise, food, serving, and progression data reliable; AI should
make input faster without becoming the authority for calculations or safety.

## Implementation status note (2026-09-20)

The current implementation persists onboarding goal fields and profile food
preferences, hydrates historical workout plans and sessions, supports
per-exercise-slot workout overrides, carries planned-meal nutrition metadata,
logs saved meals atomically, and exposes the first M1.2 planned-meal/recipe
editor slice through authorized Supabase mutations. Onboarding, nutrition,
grocery, and in-progress session drafts are recoverable in the versioned
IndexedDB/localStorage draft repository and are never treated as durable until
the Supabase mutation succeeds. MVP-0 now also
includes revision-aware stale conflict handling, health eligibility metadata,
RPC preflight validation, and profile-only onboarding for unsupported health
screening outcomes (manual logging remains available). The local MVP-1 pass now
includes trusted USDA search/selection, normalized serving options, custom-food
persistence, correction controls, protected candidate-only AI extraction,
unified guided meal review, grouped recipe/history persistence, bounded
 progress history, and recoverable plan/recipe drafts. USDA release selection,
 provider deployment, grouped schema rollout, protected-function smoke, and
 the repeatable public/authenticated browser gates are recorded in
 `MVP_Priority_Matrix.md`. The two confirmed remote test accounts are retained
 for later testing; they are not deleted as part of candidate signoff.

### MVP-1 Settings and export contract

Settings stores `notificationsEnabled` as an authenticated profile preference.
It defaults to `false` for new and existing users, is opt-in, and is changed
through the authorized profile RPC. MVP-1 does not send reminders, push
notifications, or email notifications; delivery is a later feature. The shell
notification control is a link to this preference and never presents a
decorative unread state.

Export keeps the existing lossless JSON download and adds a deterministic ZIP
bundle. The bundle contains `manifest.json`, `export.json`, `metadata.csv`, and
one CSV file for every entity collection returned by `export_account_data`.
CSV fields preserve original units, ISO dates, source/version, assumptions,
confidence, estimated/user-provided flags, and nested values as JSON strings.

### MVP-1 conflict and draft contract

Every editable aggregate uses the shared expected-version and idempotency path.
An unchanged transport retry reuses its idempotency key; an explicit reapply
after a stale response refreshes the authoritative snapshot and uses a new key.
The active draft remains visible until the authoritative mutation succeeds or
the user explicitly discards it. Drafts are account-scoped, versioned, and
stored IndexedDB-first with a localStorage fallback. Legacy unscoped workout
keys are not bulk-cleared or exposed across accounts.

### MVP-1 nutrition provider contract

Production nutrition search is protected, on-demand USDA FoodData Central API
access. Search candidates include FDC ID, USDA data type, the configured
release/source label, preparation basis, canonical nutrients per 100 g, and a
provider revision of `<dataType>:<fdcId>`. Household serving options are shown
only when USDA supplies a positive gram weight. Starter foods remain explicitly
development/estimated fixtures and are not production USDA records.

Meal-photo analysis remains outside MVP-1. Its later guided contract is
photo → visible-food suggestions → questions about portions, oils, sauces, and
hidden ingredients → user correction → trusted nutrition calculation → explicit
save. Images are not retained by this app after analysis; provider-side
handling must be disclosed and the photo flow needs separate accuracy,
privacy, and usability verification before release.
