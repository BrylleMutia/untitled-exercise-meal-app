# Calisthenics and Nutrition Coach

Initial feature plan for a responsive web app built with Next.js, with optional
Progressive Web App (PWA) installation support.

## Product Goal

Help a user follow a realistic calisthenics routine, eat toward a personal goal,
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
- Warn when a requested rate or target is unusually aggressive, require explicit confirmation, and never present it as recommended care.
- Preserve the calculation and target version that was used for historical plans and summaries.

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

Each planned meal should contain:

- Local calendar date and meal slot
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

### 8. AI-Assisted Nutrition Estimation

The initial AI feature should estimate meals from text, not claim to identify
exact nutrition from photos.

Example input:

> Two eggs, two slices of whole wheat toast with butter, and a banana.

Implementation flow:

1. Send the user's text to a protected Supabase Edge Function or other
   server-side AI endpoint after an explicit user action.
2. Have the model extract food names, quantities, units, preparation, and
   uncertainties into validated structured JSON.
3. Match extracted items against a trusted nutrition database.
4. Calculate calories and macros in application code from the matched database
   records, never from model-generated numbers.
5. Show matches, assumptions, confidence, and serving sizes for confirmation.
6. Let the user correct the food or portion before saving the entry.

The AI endpoint must never contain provider secrets in the Next.js browser
bundle or any `NEXT_PUBLIC_*` variable. The endpoint only creates a reviewable
extraction candidate; it must not save a nutrition entry or mutate user data. A
separate confirmed mutation persists the user's reviewed result.

The UI should call out uncertainty for foods with hidden ingredients, such as
restaurant meals, sauces, cooking oil, and mixed dishes. Do not display false
precision for estimates.

Photo recognition, voice input, and social-media recipe extraction are later
features.

### 9. Custom Meals and Recipes

Users can create a reusable meal or recipe with:

- Name
- Ingredients
- Quantity for each ingredient
- Number of servings
- Preparation notes
- Calculated nutrition per serving

Allow users to duplicate, edit, and log a saved meal. A social-media URL may be
stored as a reference, but the user should enter or confirm the ingredients in
the MVP.

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

Allow users to record weight manually. Progress photos and body measurements
can be added later.

### 12. Settings and Data Controls

Include:

- Unit preference
- Notification preference
- Edit profile and targets
- Reset plan while retaining history
- Delete account data and clear cached browser data
- Export user data in a simple JSON or CSV format
- Nutrition and health disclaimer

All important screens need loading, empty, error, offline, and retry-friendly
states. Network failures must preserve active drafts and clearly identify
unsaved changes; they must not be shown as completed server mutations.

## P1 Features

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

- Home: today's workout, meals, targets, and progress snapshot
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
