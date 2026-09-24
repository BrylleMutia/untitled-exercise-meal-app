begin;

select plan(34);

select has_column('public', 'profiles', 'revision', 'profiles expose an optimistic concurrency revision');
select has_column('public', 'profiles', 'eligibility_status', 'profiles persist screening outcome');
select has_column('public', 'profiles', 'eligibility_version', 'profiles persist screening policy version');
select has_column('public', 'daily_targets', 'calculation_version', 'targets persist calculation policy version');
select has_column('public', 'daily_targets', 'raw_calories', 'targets persist the unclamped raw calorie result');
select has_column('public', 'nutrition_logs', 'revision', 'nutrition records expose a revision');
select has_column('public', 'grocery_lists', 'revision', 'grocery lists expose a revision');
select has_function('private', 'preflight_mutation', ARRAY['text', 'jsonb'], 'authenticated mutations have a shared preflight boundary');
select has_function('private', 'raise_stale_version', ARRAY['text', 'integer', 'integer'], 'stale conflicts have a typed database error');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000901', 'mvp0@example.test'),
  ('00000000-0000-0000-0000-000000000902', 'mvp0-other@example.test');

insert into public.profiles (
  id, name, age, sex, height_cm, weight_kg, units, experience,
  equipment, days_per_week, session_minutes, goal
) values (
  '00000000-0000-0000-0000-000000000901', 'MVP0 User', 30, 'female', 165, 65,
  'metric', 'beginner', array['none'], 3, 30, 'maintain'
);

select is((select revision from public.profiles where id = '00000000-0000-0000-0000-000000000901'), 1, 'new profiles start at revision one');

update public.profiles
set name = 'MVP0 Updated'
where id = '00000000-0000-0000-0000-000000000901';
select is((select revision from public.profiles where id = '00000000-0000-0000-0000-000000000901'), 2, 'profile updates bump the revision atomically');

insert into public.grocery_lists (app_id, user_id, week_of)
values ('mvp0-grocery', '00000000-0000-0000-0000-000000000901', '2026-09-14');
insert into public.grocery_items (
  grocery_list_row_id, user_id, app_id, name, category, unit,
  generated_quantity, quantity
) values (
  (select row_id from public.grocery_lists where app_id = 'mvp0-grocery'),
  '00000000-0000-0000-0000-000000000901', 'mvp0-item', 'Oats', 'Grains', 'g', 100, 100
);
update public.grocery_lists set updated_at = now() where app_id = 'mvp0-grocery';

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000901';

select throws_ok($$
  select public.toggle_grocery_item('{"itemId":"mvp0-item","expectedVersions":{"groceryRevision":1},"idempotencyKey":"mvp0-stale"}'::jsonb)
$$, 'P0001', 'stale_version', 'stale grocery edits return a stable conflict code');

select lives_ok($$
  select public.set_grocery_quantity('{"itemId":"mvp0-item","quantity":101,"expectedVersions":{"groceryRevision":2},"idempotencyKey":"mvp0-grocery-revision-bump"}'::jsonb)
$$, 'a grocery item mutation succeeds against the current revision');
select is((select revision from public.grocery_lists where app_id = 'mvp0-grocery'), 3, 'grocery item mutations bump the parent list revision');

select throws_ok($$
  select public.save_weight_entry('{"entry":{"id":"mvp0-weight","date":"2026-09-17","weightKg":"NaN"},"idempotencyKey":"mvp0-invalid"}'::jsonb)
$$, 'P0001', null, 'non-finite numeric input is rejected before persistence');

select lives_ok($$
  select public.complete_onboarding('{"profile":{"name":"Unsafe","age":30,"sex":"female","heightCm":165,"weightKg":65,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain","targetEligibility":"unsupported"},"idempotencyKey":"mvp0-unsupported"}'::jsonb)
$$, 'unsupported screening saves a profile-only onboarding result for manual logging');

select is((select count(*)::int from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000901'), 0, 'unsupported onboarding creates no automated target row');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000901'), 0, 'unsupported onboarding creates no automated workout plan');

select lives_ok($$
  select public.update_units('{"profile":{"name":"Unsafe","age":30,"sex":"female","heightCm":165,"weightKg":65,"units":"imperial","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain","dietaryPattern":"","allergies":[],"foodPreferences":[]},"profileOnly":true,"expectedVersions":{"profileRevision":3},"idempotencyKey":"mvp0-profile-only-units"}'::jsonb)
$$, 'display-unit edits remain available for unsupported profiles');
select is((select units from public.profiles where id = '00000000-0000-0000-0000-000000000901'), 'imperial', 'profile-only unit edits persist the selected display units');
select is((select revision from public.profiles where id = '00000000-0000-0000-0000-000000000901'), 4, 'profile-only edits bump only the profile revision');

select throws_ok($$
  select public.save_weight_entry('{"entry":{"id":"mvp0-bad-date","date":"2026-02-30","weightKg":65},"idempotencyKey":"mvp0-bad-date"}'::jsonb)
$$, 'P0001', null, 'invalid local dates are rejected by the shared validator');

select throws_ok($$
  select public.save_nutrition_log('{"entry":{"id":"mvp0-bad-unit","date":"2026-09-17","slot":"lunch","customName":"bad","servings":1,"servingUnit":"cup","calories":1,"proteinG":1,"carbsG":1,"fatG":1},"idempotencyKey":"mvp0-bad-unit"}'::jsonb)
$$, 'P0001', 'entry.servingUnit is not supported', 'unsupported serving units are rejected before persistence');

select throws_ok($$
  select public.start_workout_session('{"session":{"id":"mvp0-bad-session","plannedWorkoutId":"x","date":"2026-09-17"},"idempotencyKey":"mvp0-bad-session"}'::jsonb)
$$, 'P0001', 'session.startedAt is required', 'workout sessions require a started timestamp');

select throws_ok($$
  select public.save_saved_meal('{"meal":{"id":"mvp0-empty-meal","name":"Empty","servings":1,"ingredients":[]},"idempotencyKey":"mvp0-empty-meal"}'::jsonb)
$$, 'P0001', 'meal ingredients are required', 'saved meals require at least one validated ingredient');

select throws_ok($$
  select public.toggle_grocery_item('{"itemId":"mvp0-item","expectedVersions":{"unknown":1},"idempotencyKey":"mvp0-unknown-version"}'::jsonb)
$$, 'P0001', 'unknown expected version field', 'unknown expected-version fields are rejected');
select throws_ok($$
  select public.toggle_grocery_item('{"itemId":"mvp0-item","expectedVersions":{"groceryRevision":1.5},"idempotencyKey":"mvp0-decimal-version"}'::jsonb)
$$, 'P0001', 'groceryRevision must be an integer', 'expected versions reject decimal counters');

select lives_ok($$
  select public.save_saved_meal('{"meal":{"id":"mvp0-owned-meal","name":"Owned meal","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"idempotencyKey":"mvp0-owned-meal-create"}'::jsonb)
$$, 'saved meals can be created through the authenticated wrapper');
select is((select revision from public.meals where app_id = 'mvp0-owned-meal'), 1, 'new saved meals start at revision one');
select lives_ok($$
  select public.save_saved_meal('{"meal":{"id":"mvp0-owned-meal","name":"Owned meal updated","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"idempotencyKey":"mvp0-owned-meal-update"}'::jsonb)
$$, 'saved meal updates bump the row revision');
select throws_ok($$
  select public.save_saved_meal('{"meal":{"id":"mvp0-owned-meal","name":"Stale overwrite","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"expectedVersions":{"recordRevision":1},"idempotencyKey":"mvp0-owned-meal-stale"}'::jsonb)
$$, 'P0001', 'stale_version', 'saved meal edits reject stale revisions');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000902';
select throws_ok($$
  select public.save_saved_meal('{"meal":{"id":"mvp0-owned-meal","name":"Cross-account overwrite","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"idempotencyKey":"mvp0-cross-account-meal"}'::jsonb)
$$, 'P0001', null, 'saved meal edits cannot cross account ownership');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000901';

select throws_ok($$
  select public.save_workout_session('{"session":{"id":"mvp0-ambiguous-session","logs":[{"plannedExerciseId":"ex-push-up","actual":{"sets":1,"reps":1,"holdSeconds":10}}]},"idempotencyKey":"mvp0-ambiguous-session"}'::jsonb)
$$, 'P0001', 'exercise log cannot include both reps and holdSeconds', 'workout logs reject ambiguous reps and hold measurements');

select is((select quantity from public.grocery_items where app_id = 'mvp0-item'), 101::numeric, 'a stale grocery request does not mutate the item');

select * from finish();

rollback;
