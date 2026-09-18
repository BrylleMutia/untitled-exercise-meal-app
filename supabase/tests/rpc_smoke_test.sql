begin;

-- This suite is deliberately separate from the structural/RLS suites. It
-- exercises every deployed public mutation wrapper through the same
-- authenticated role that the Data API uses, while keeping all fixtures
-- inside this transaction.
select plan(103);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000401', 'rpc-smoke-a@example.test'),
  ('00000000-0000-0000-0000-000000000402', 'rpc-smoke-b@example.test');

-- The negative catalog-access checks need an owner-only food that User A must
-- not be able to reference.
insert into public.foods (
  app_id, owner_user_id, is_system, name, serving_label, serving_grams,
  serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category,
  source, source_version, estimated, confidence, preparation_basis
)
values (
  'test-rpc-smoke-food-b',
  '00000000-0000-0000-0000-000000000402',
  false,
  'User B private food',
  '1 serving',
  100,
  'g',
  100,
  10,
  10,
  3,
  2,
  'Other',
  'RPC smoke fixture',
  'test',
  true,
  'low',
  'as_labeled'
);

-- Build the full profile/target/plan bundle used by the five wrappers that
-- currently delegate to private.persist_profile_bundle(). The helper is
-- temporary and disappears with the test session.
create or replace function pg_temp.rpc_smoke_bundle(
  p_prefix text,
  p_units text default 'metric',
  p_name text default 'RPC Smoke User',
  p_effective_date date default '2026-09-07',
  p_meal_skipped boolean default false,
  p_plan_id text default null,
  p_meal_plan_id text default null
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'name', p_name,
      'age', 30,
      'sex', 'female',
      'heightCm', 165,
      'weightKg', 65,
      'units', p_units,
      'experience', 'beginner',
      'equipment', jsonb_build_array('none'),
      'daysPerWeek', 3,
      'sessionMinutes', 30,
      'goal', 'maintain',
      'dietaryPattern', '',
      'allergies', jsonb_build_array(),
      'foodPreferences', jsonb_build_array()
    ),
    'target', jsonb_build_object(
      'id', p_prefix || '-target',
      'effectiveDate', p_effective_date,
      'calories', 2000,
      'proteinG', 120,
      'carbsG', 220,
      'fatG', 60,
      'bmr', 1400,
      'bmi', 24,
      'tdee', 2000,
      'activityFactor', 1.5,
      'formula', 'rpc-smoke',
      'calculationAssumptions', 'fixture',
      'disclaimer', 'Test estimates only.'
    ),
    'plan', jsonb_build_object(
      'id', coalesce(p_plan_id, p_prefix || '-plan'),
      'workouts', jsonb_build_array(
        jsonb_build_object(
          'id', p_prefix || '-workout',
          'dayOfWeek', 1,
          'title', p_name || ' workout',
          'focus', 'Full body',
          'warmup', jsonb_build_array(),
          'cooldown', jsonb_build_array(),
          'estimatedMinutes', 30,
          'sortOrder', 1,
          'exercises', jsonb_build_array(
            jsonb_build_object(
              'id', p_prefix || '-exercise',
              'exerciseId', 'ex-knee-push-up',
              'sortOrder', 1,
              'sets', 3,
              'reps', 8,
              'restSeconds', 60
            )
          )
        )
      )
    ),
    'mealPlan', jsonb_build_object(
      'id', coalesce(p_meal_plan_id, p_prefix || '-meal-plan'),
      'weekOf', '2026-09-07',
      'meals', jsonb_build_array(
        jsonb_build_object(
          'id', p_prefix || '-planned-meal',
          'date', p_effective_date,
          'slot', 'breakfast',
          'foodId', 'food-egg',
          'label', 'Smoke-test breakfast',
          'servings', 1,
          'expectedCalories', 72,
          'expectedProteinG', 6.3,
          'expectedCarbsG', 0.4,
          'expectedFatG', 4.8,
          'expectedFiberG', 0,
          'source', 'Starter Food Catalog',
          'sourceVersion', '2026.09',
          'assumptions', 'fixture',
          'confidence', 'high',
          'preparationBasis', 'as_labeled',
          'skipped', p_meal_skipped
        )
      )
    ),
    'grocery', jsonb_build_object(
      'id', p_prefix || '-grocery',
      'weekOf', '2026-09-07',
      'items', jsonb_build_array(
        jsonb_build_object(
          'id', p_prefix || '-grocery-item',
          'name', 'Egg',
          'category', 'Protein',
          'unit', 'piece',
          'generatedQuantity', 2,
          'quantity', 2,
          'checked', false,
          'custom', false,
          'removed', false,
          'foodId', 'food-egg'
        )
      )
    ),
    'effectiveDate', p_effective_date,
    'goalId', p_prefix || '-goal'
  );
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000401';

-- 1-14: onboarding and the four profile-bundle wrappers.
select lives_ok($$
  select public.complete_onboarding(
    pg_temp.rpc_smoke_bundle('test-rpc-smoke-a') ||
    jsonb_build_object('idempotencyKey', 'test-rpc-smoke-onboarding-a')
  )
$$, 'complete_onboarding accepts a valid authenticated bundle');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000401'), 1, 'onboarding creates the owner profile');
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-000000000401'), 1, 'onboarding creates one goal');
select is((select count(*)::int from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000401'), 1, 'onboarding creates one target');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000401'), 1, 'onboarding creates one workout plan');
select is((select count(*)::int from public.meal_plans where user_id = '00000000-0000-0000-0000-000000000401'), 1, 'onboarding creates one meal plan');
select is((select count(*)::int from public.grocery_lists where user_id = '00000000-0000-0000-0000-000000000401'), 1, 'onboarding creates one grocery list');
select is((select exercise_name_snapshot from public.planned_exercises where app_id = 'test-rpc-smoke-a-exercise'), 'Knee Push-up', 'onboarding stores the planned exercise snapshot');
select is((select source_version from public.planned_meals where app_id = 'test-rpc-smoke-a-planned-meal'), '2026.09', 'onboarding stores the meal source version');
select is((select public.complete_onboarding(
  pg_temp.rpc_smoke_bundle('test-rpc-smoke-a') ||
  jsonb_build_object('idempotencyKey', 'test-rpc-smoke-onboarding-a')
)->>'replayed'), 'true', 'complete_onboarding replays the same request');
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-000000000401'), 1, 'onboarding replay does not duplicate the bundle');
select throws_ok($$select public.complete_onboarding('{"idempotencyKey":"test-rpc-smoke-onboarding-a","different":true}'::jsonb)$$, 'P0001', null, 'a changed onboarding payload is rejected for the same idempotency key');
select throws_ok($$
  select public.complete_onboarding(
    jsonb_set(
      pg_temp.rpc_smoke_bundle('test-rpc-smoke-invalid') ||
      jsonb_build_object('idempotencyKey', 'test-rpc-smoke-invalid'),
      '{plan,workouts,0,exercises,0,exerciseId}',
      '"missing-exercise"'::jsonb
    )
  )
$$, 'P0001', null, 'invalid onboarding child is rejected');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000401' and name = 'RPC Smoke User'), 1, 'the invalid onboarding payload does not overwrite the existing profile');

select lives_ok($$
  select public.update_profile(
    pg_temp.rpc_smoke_bundle('test-rpc-smoke-profile', 'metric', 'RPC Smoke Updated', '2026-09-08', false, 'test-rpc-smoke-a-plan', 'test-rpc-smoke-profile-meal-plan') ||
    jsonb_build_object('idempotencyKey', 'test-rpc-smoke-update-profile')
  )
$$, 'update_profile creates a new bundle version');
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-000000000401'), 2, 'update_profile appends a goal version');
select is((select count(*)::int from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000401'), 2, 'update_profile appends a target version');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000401'), 2, 'update_profile appends a workout plan version');

select lives_ok($$
  select public.update_units(
    pg_temp.rpc_smoke_bundle('test-rpc-smoke-units', 'imperial', 'RPC Smoke Imperial', '2026-09-09', false, 'test-rpc-smoke-units-plan', 'test-rpc-smoke-units-meal-plan') ||
    jsonb_build_object('idempotencyKey', 'test-rpc-smoke-update-units')
  )
$$, 'update_units accepts a complete unit-change bundle');
select is((select units from public.profiles where id = '00000000-0000-0000-0000-000000000401'), 'imperial', 'update_units persists the changed unit system');
select is((select count(*)::int from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000401'), 2, 'update_units preserves the current target version for a display-unit-only edit');

select lives_ok($$
  select public.reset_plan(
    pg_temp.rpc_smoke_bundle('test-rpc-smoke-reset', 'imperial', 'RPC Smoke Reset', '2026-09-10', false, 'test-rpc-smoke-reset-plan', 'test-rpc-smoke-reset-meal-plan') ||
    jsonb_build_object('idempotencyKey', 'test-rpc-smoke-reset-plan')
  )
$$, 'reset_plan creates a future plan bundle');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000401'), 3, 'reset_plan retains previous workout plan history');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000401' and app_id = 'test-rpc-smoke-reset-plan'), 1, 'reset_plan stores the new plan application ID');

select lives_ok($$
  select public.skip_planned_meal(
    pg_temp.rpc_smoke_bundle('test-rpc-smoke-skip', 'imperial', 'RPC Smoke Skip', '2026-09-10', true, 'test-rpc-smoke-a-plan', 'test-rpc-smoke-a-meal-plan') ||
    jsonb_build_object('idempotencyKey', 'test-rpc-smoke-skip-meal')
  )
$$, 'skip_planned_meal creates a new meal-plan version');
select is((select skipped from public.planned_meals where app_id = 'test-rpc-smoke-skip-planned-meal'), true, 'skip_planned_meal persists skipped state');
select is((select skipped from public.planned_meals where app_id = 'test-rpc-smoke-a-planned-meal'), false, 'skip_planned_meal leaves the earlier plan unchanged');
select is((select count(*)::int from public.meal_plans where user_id = '00000000-0000-0000-0000-000000000401' and app_id = 'test-rpc-smoke-a-meal-plan'), 2, 'skip_planned_meal appends the same meal-plan application ID as a version');

-- 15-27: User B owns a separate bundle and private food for isolation checks.
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000402';
select lives_ok($$
  select public.complete_onboarding(
    pg_temp.rpc_smoke_bundle('test-rpc-smoke-b', 'metric', 'RPC Smoke User B') ||
    jsonb_build_object('idempotencyKey', 'test-rpc-smoke-onboarding-b')
  )
$$, 'User B can create an independent bundle');
select lives_ok($$select public.save_nutrition_log('{"entry":{"id":"test-rpc-smoke-nutrition-b","date":"2026-09-10","slot":"lunch","foodId":"food-egg","servings":1,"servingQuantity":1,"servingUnit":"piece","calories":72,"proteinG":6.3,"carbsG":0.4,"fatG":4.8,"fiberG":0,"estimated":true,"confidence":"high","source":"Starter Food Catalog","sourceVersion":"2026.09","preparationBasis":"as_labeled"},"idempotencyKey":"test-rpc-smoke-nutrition-b"}'::jsonb)$$, 'User B creates a nutrition row for cross-user checks');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000401';
select throws_ok($$select public.save_saved_meal('{"meal":{"id":"test-rpc-smoke-private-food-meal","name":"Should fail","servings":1,"ingredients":[{"foodId":"test-rpc-smoke-food-b","servings":1}]},"idempotencyKey":"test-rpc-smoke-private-food"}'::jsonb)$$, 'P0001', null, 'User A cannot use User B private food');
select throws_ok($$select public.toggle_grocery_item('{"itemId":"test-rpc-smoke-b-grocery-item","idempotencyKey":"test-rpc-smoke-cross-grocery"}'::jsonb)$$, 'P0001', null, 'User A cannot toggle User B grocery data');
select throws_ok($$select public.delete_nutrition_log('{"nutritionLogId":"test-rpc-smoke-nutrition-b","idempotencyKey":"test-rpc-smoke-cross-nutrition"}'::jsonb)$$, 'P0001', null, 'User A cannot delete User B nutrition data');

-- 28-40: workout lifecycle, including a second session for abandonment.
select lives_ok($$select public.start_workout_session('{"session":{"id":"test-rpc-smoke-session-a","plannedWorkoutId":"test-rpc-smoke-skip-workout","date":"2026-09-10","startedAt":"2026-09-10T08:00:00Z"},"idempotencyKey":"test-rpc-smoke-start-a"}'::jsonb)$$, 'start_workout_session creates an in-progress session');
select is((select count(*)::int from public.workout_sessions where user_id = '00000000-0000-0000-0000-000000000401' and app_id = 'test-rpc-smoke-session-a'), 1, 'workout start creates one session');
select is((select public.start_workout_session('{"session":{"id":"test-rpc-smoke-session-a","plannedWorkoutId":"test-rpc-smoke-skip-workout","date":"2026-09-10","startedAt":"2026-09-10T08:00:00Z"},"idempotencyKey":"test-rpc-smoke-start-a"}'::jsonb)->>'replayed'), 'true', 'workout start replays safely');
select lives_ok($$select public.save_workout_session('{"session":{"id":"test-rpc-smoke-session-a","logs":[{"plannedExerciseId":"test-rpc-smoke-skip-exercise","actualExerciseId":"ex-push-up","status":"completed","actual":{"sets":3,"reps":6},"rpe":6,"manageable":true,"pain":false,"note":"substituted"}]},"idempotencyKey":"test-rpc-smoke-save-session-a"}'::jsonb)$$, 'save_workout_session stores actual values and a substitution');
select is((select count(*)::int from public.exercise_logs el join public.workout_sessions ws on ws.row_id = el.session_row_id where ws.app_id = 'test-rpc-smoke-session-a'), 1, 'workout save creates one log');
select is((select actual_exercise_row_id from public.exercise_logs el join public.workout_sessions ws on ws.row_id = el.session_row_id where ws.app_id = 'test-rpc-smoke-session-a'), (select row_id from public.exercises where app_id = 'ex-push-up'), 'workout save stores the actual substitution');
select ok((select planned_sets <> actual_sets or planned_reps <> actual_reps from public.exercise_logs el join public.workout_sessions ws on ws.row_id = el.session_row_id where ws.app_id = 'test-rpc-smoke-session-a'), 'planned and actual workout values remain separate');
select lives_ok($$select public.finish_workout_session('{"session":{"id":"test-rpc-smoke-session-a","finishedAt":"2026-09-10T08:30:00Z","logs":[{"plannedExerciseId":"test-rpc-smoke-skip-exercise","actualExerciseId":"ex-push-up","status":"completed","actual":{"sets":3,"reps":6},"rpe":6,"manageable":true,"pain":false}]},"idempotencyKey":"test-rpc-smoke-finish-a"}'::jsonb)$$, 'finish_workout_session completes the valid session');
select is((select status from public.workout_sessions where app_id = 'test-rpc-smoke-session-a'), 'completed', 'finished session is completed');
select is((select public.finish_workout_session('{"session":{"id":"test-rpc-smoke-session-a","finishedAt":"2026-09-10T08:30:00Z","logs":[{"plannedExerciseId":"test-rpc-smoke-skip-exercise","actualExerciseId":"ex-push-up","status":"completed","actual":{"sets":3,"reps":6},"rpe":6,"manageable":true,"pain":false}]},"idempotencyKey":"test-rpc-smoke-finish-a"}'::jsonb)->>'replayed'), 'true', 'finish_workout_session replays safely');
select throws_ok($$select public.finish_workout_session('{"session":{"id":"test-rpc-smoke-session-a","logs":[]},"idempotencyKey":"test-rpc-smoke-finish-again"}'::jsonb)$$, 'P0001', null, 'a completed session cannot be finished with a new key');
select lives_ok($$select public.start_workout_session('{"session":{"id":"test-rpc-smoke-session-abandoned","plannedWorkoutId":"test-rpc-smoke-skip-workout","date":"2026-09-09","startedAt":"2026-09-09T08:00:00Z"},"idempotencyKey":"test-rpc-smoke-start-abandoned"}'::jsonb)$$, 'a second session can be started for abandonment');
select lives_ok($$select public.abandon_workout_session('{"session":{"id":"test-rpc-smoke-session-abandoned"},"idempotencyKey":"test-rpc-smoke-abandon-a"}'::jsonb)$$, 'abandon_workout_session abandons an in-progress session');
select is((select status from public.workout_sessions where app_id = 'test-rpc-smoke-session-abandoned'), 'abandoned', 'abandon_workout_session persists abandoned status');

-- 41-51: nutrition, deletion, weight, saved meal, and recipe wrappers.
select lives_ok($$select public.save_nutrition_log('{"entry":{"id":"test-rpc-smoke-nutrition-a","date":"2026-09-10","slot":"lunch","foodId":"food-egg","servings":2,"servingQuantity":2,"servingUnit":"piece","calories":144,"proteinG":12.6,"carbsG":0.8,"fatG":9.6,"fiberG":0,"estimated":true,"confidence":"high","source":"Starter Food Catalog","sourceVersion":"2026.09","preparationBasis":"as_labeled","assumptions":"fixture"},"idempotencyKey":"test-rpc-smoke-nutrition-a"}'::jsonb)$$, 'save_nutrition_log stores a system-food snapshot');
select ok((select source = 'Starter Food Catalog' and source_version = '2026.09' and serving_quantity = 2 and confidence = 'high' and preparation_basis = 'as_labeled' and estimated from public.nutrition_logs where app_id = 'test-rpc-smoke-nutrition-a'), 'nutrition metadata remains a saved snapshot');
select lives_ok($$select public.save_nutrition_log('{"entry":{"id":"test-rpc-smoke-nutrition-custom","date":"2026-09-10","slot":"snack","customName":"Reviewed homemade snack","servings":1,"servingQuantity":1,"servingUnit":"custom","calories":200,"proteinG":5,"carbsG":20,"fatG":10,"confidence":"low","source":"User-provided","sourceVersion":"manual","preparationBasis":"prepared"},"idempotencyKey":"test-rpc-smoke-nutrition-custom"}'::jsonb)$$, 'save_nutrition_log accepts a reviewed custom-name entry');
select is((select public.save_nutrition_log('{"entry":{"id":"test-rpc-smoke-nutrition-a","date":"2026-09-10","slot":"lunch","foodId":"food-egg","servings":2,"servingQuantity":2,"servingUnit":"piece","calories":150,"proteinG":13,"carbsG":1,"fatG":10,"confidence":"medium","source":"Manual correction","sourceVersion":"manual","preparationBasis":"as_labeled"},"idempotencyKey":"test-rpc-smoke-nutrition-update"}'::jsonb)->>'status'), 'completed', 'saving the same nutrition app ID updates the snapshot');
select is((select count(*)::int from public.nutrition_logs where user_id = '00000000-0000-0000-0000-000000000401' and app_id = 'test-rpc-smoke-nutrition-a'), 1, 'nutrition application IDs remain unique');
select lives_ok($$select public.delete_nutrition_log('{"nutritionLogId":"test-rpc-smoke-nutrition-custom","idempotencyKey":"test-rpc-smoke-delete-nutrition"}'::jsonb)$$, 'delete_nutrition_log deletes an owned entry');
select is((select count(*)::int from public.nutrition_logs where app_id = 'test-rpc-smoke-nutrition-custom'), 0, 'deleted nutrition entry is gone');
select is((select public.delete_nutrition_log('{"nutritionLogId":"test-rpc-smoke-nutrition-custom","idempotencyKey":"test-rpc-smoke-delete-nutrition"}'::jsonb)->>'replayed'), 'true', 'delete_nutrition_log replays safely');
select lives_ok($$select public.save_weight_entry('{"entry":{"id":"test-rpc-smoke-weight-a","date":"2026-09-10","weightKg":65.2},"idempotencyKey":"test-rpc-smoke-weight-a"}'::jsonb)$$, 'save_weight_entry stores an observation');
select is((select weight_kg from public.weight_entries where app_id = 'test-rpc-smoke-weight-a'), 65.2::numeric, 'weight observation is preserved');
select lives_ok($$select public.save_saved_meal('{"meal":{"id":"test-rpc-smoke-saved-meal","name":"Smoke-test meal","servings":2,"notes":"fixture","ingredients":[{"foodId":"food-egg","servings":2},{"foodId":"food-milk","servings":1}]},"idempotencyKey":"test-rpc-smoke-saved-meal"}'::jsonb)$$, 'save_saved_meal stores a user-owned meal');
select is((select count(*)::int from public.meal_ingredients mi join public.meals m on m.row_id = mi.meal_row_id where m.app_id = 'test-rpc-smoke-saved-meal'), 2, 'saved meal stores all ordered ingredients');
select lives_ok($$select public.save_recipe('{"meal":{"id":"test-rpc-smoke-recipe","name":"Smoke-test recipe","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"idempotencyKey":"test-rpc-smoke-recipe"}'::jsonb)$$, 'save_recipe wrapper delegates successfully');
select is((select count(*)::int from public.meals where app_id = 'test-rpc-smoke-recipe' and owner_user_id = '00000000-0000-0000-0000-000000000401'), 1, 'save_recipe creates an owner meal');
select is((select public.save_recipe('{"meal":{"id":"test-rpc-smoke-recipe","name":"Smoke-test recipe","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"idempotencyKey":"test-rpc-smoke-recipe"}'::jsonb)->>'replayed'), 'true', 'save_recipe replay is stable');

-- 52-62: grocery operations and merge behavior.
select lives_ok($$select public.set_grocery_quantity('{"itemId":"test-rpc-smoke-skip-grocery-item","quantity":5,"idempotencyKey":"test-rpc-smoke-set-grocery"}'::jsonb)$$, 'set_grocery_quantity accepts a user override');
select lives_ok($$select public.toggle_grocery_item('{"itemId":"test-rpc-smoke-skip-grocery-item","idempotencyKey":"test-rpc-smoke-toggle-grocery"}'::jsonb)$$, 'toggle_grocery_item changes checked state');
select lives_ok($$select public.remove_grocery_item('{"itemId":"test-rpc-smoke-skip-grocery-item","idempotencyKey":"test-rpc-smoke-remove-grocery"}'::jsonb)$$, 'remove_grocery_item soft-removes the item');
select lives_ok($$select public.regenerate_grocery('{"grocery":{"id":"test-rpc-smoke-skip-grocery","weekOf":"2026-09-07","items":[{"id":"test-rpc-smoke-skip-grocery-item","generatedQuantity":7}]},"idempotencyKey":"test-rpc-smoke-regenerate-grocery"}'::jsonb)$$, 'regenerate_grocery accepts generated quantities');
select is((select quantity from public.grocery_items where app_id = 'test-rpc-smoke-skip-grocery-item'), 5::numeric, 'regeneration preserves an explicit quantity override');
select ok((select checked and removed and generated_quantity = 7 from public.grocery_items where app_id = 'test-rpc-smoke-skip-grocery-item'), 'regeneration preserves checked, removed, and generated state');
select is((select public.regenerate_grocery('{"grocery":{"id":"test-rpc-smoke-skip-grocery","weekOf":"2026-09-07","items":[{"id":"test-rpc-smoke-skip-grocery-item","generatedQuantity":7}]},"idempotencyKey":"test-rpc-smoke-regenerate-grocery"}'::jsonb)->>'replayed'), 'true', 'regenerate_grocery replays safely');
select lives_ok($$select public.add_custom_grocery_item('{"grocery":{"id":"test-rpc-smoke-skip-grocery","weekOf":"2026-09-07"},"item":{"id":"test-rpc-smoke-custom-grocery","name":"Custom smoke item","category":"Other","unit":"pack","quantity":1},"idempotencyKey":"test-rpc-smoke-add-custom-grocery"}'::jsonb)$$, 'add_custom_grocery_item creates a custom row');
select is((select custom_item from public.grocery_items where app_id = 'test-rpc-smoke-custom-grocery'), true, 'custom grocery state is persisted');
select throws_ok($$select public.set_grocery_quantity('{"itemId":"test-rpc-smoke-b-grocery-item","quantity":9,"idempotencyKey":"test-rpc-smoke-cross-grocery-set"}'::jsonb)$$, 'P0001', null, 'grocery quantity cannot cross user ownership');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000402';
select is((select checked from public.grocery_items where app_id = 'test-rpc-smoke-b-grocery-item'), false, 'cross-user grocery attempts leave the target unchanged');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000401';
select throws_ok($$select public.save_saved_meal('{"meal":{"id":"meal-yogurt-bowl","name":"overwrite","servings":1,"ingredients":[]},"idempotencyKey":"test-rpc-smoke-system-meal"}'::jsonb)$$, 'P0001', null, 'system meals cannot be overwritten');

-- 63-68: export and account deletion are run after all other operations.
select lives_ok($$select public.export_account_data('{"idempotencyKey":"test-rpc-smoke-export-a"}'::jsonb)$$, 'export_account_data returns the authenticated owner document');
select ok((select (public.export_account_data('{"idempotencyKey":"test-rpc-smoke-export-shape"}'::jsonb)->'data'->'goals'->0) ? 'app_id'), 'export preserves application IDs');
select ok((select (public.export_account_data('{"idempotencyKey":"test-rpc-smoke-export-shape-2"}'::jsonb)->'data'->'goals'->0) ? 'row_id') = false, 'export omits internal row IDs');
select ok((select (public.export_account_data('{"idempotencyKey":"test-rpc-smoke-export-shape-3"}'::jsonb)->'data'->'goals'->0) ? 'user_id') = false, 'export omits ownership IDs');
select is((select public.export_account_data('{"idempotencyKey":"test-rpc-smoke-export-replay"}'::jsonb)->>'status'), 'completed', 'export is retry-safe');
select is((select public.export_account_data('{"idempotencyKey":"test-rpc-smoke-export-replay"}'::jsonb)->>'replayed'), 'true', 'export replay returns a stable result');

-- Anonymous execution is denied for the complete public wrapper inventory.
set local role anon;
select throws_ok($$select public.complete_onboarding('{}'::jsonb)$$, '42501', null, 'anon cannot execute complete_onboarding');
select throws_ok($$select public.update_profile('{}'::jsonb)$$, '42501', null, 'anon cannot execute update_profile');
select throws_ok($$select public.update_units('{}'::jsonb)$$, '42501', null, 'anon cannot execute update_units');
select throws_ok($$select public.reset_plan('{}'::jsonb)$$, '42501', null, 'anon cannot execute reset_plan');
select throws_ok($$select public.skip_planned_meal('{}'::jsonb)$$, '42501', null, 'anon cannot execute skip_planned_meal');
select throws_ok($$select public.start_workout_session('{}'::jsonb)$$, '42501', null, 'anon cannot execute start_workout_session');
select throws_ok($$select public.save_workout_session('{}'::jsonb)$$, '42501', null, 'anon cannot execute save_workout_session');
select throws_ok($$select public.finish_workout_session('{}'::jsonb)$$, '42501', null, 'anon cannot execute finish_workout_session');
select throws_ok($$select public.abandon_workout_session('{}'::jsonb)$$, '42501', null, 'anon cannot execute abandon_workout_session');
select throws_ok($$select public.save_nutrition_log('{}'::jsonb)$$, '42501', null, 'anon cannot execute save_nutrition_log');
select throws_ok($$select public.delete_nutrition_log('{}'::jsonb)$$, '42501', null, 'anon cannot execute delete_nutrition_log');
select throws_ok($$select public.save_weight_entry('{}'::jsonb)$$, '42501', null, 'anon cannot execute save_weight_entry');
select throws_ok($$select public.save_saved_meal('{}'::jsonb)$$, '42501', null, 'anon cannot execute save_saved_meal');
select throws_ok($$select public.save_recipe('{}'::jsonb)$$, '42501', null, 'anon cannot execute save_recipe');
select throws_ok($$select public.toggle_grocery_item('{}'::jsonb)$$, '42501', null, 'anon cannot execute toggle_grocery_item');
select throws_ok($$select public.set_grocery_quantity('{}'::jsonb)$$, '42501', null, 'anon cannot execute set_grocery_quantity');
select throws_ok($$select public.remove_grocery_item('{}'::jsonb)$$, '42501', null, 'anon cannot execute remove_grocery_item');
select throws_ok($$select public.add_custom_grocery_item('{}'::jsonb)$$, '42501', null, 'anon cannot execute add_custom_grocery_item');
select throws_ok($$select public.regenerate_grocery('{}'::jsonb)$$, '42501', null, 'anon cannot execute regenerate_grocery');
select throws_ok($$select public.export_account_data('{}'::jsonb)$$, '42501', null, 'anon cannot execute export_account_data');
select throws_ok($$select public.delete_account('{}'::jsonb)$$, '42501', null, 'anon cannot execute delete_account');

-- Delete User B last for this SQL transaction. The outer rollback removes the
-- remaining User A fixture and restores the local database to its prior state.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000402';
select is((select public.delete_account('{"idempotencyKey":"test-rpc-smoke-delete-b"}'::jsonb)->>'clear_cache'), 'true', 'delete_account returns the cache-clearing signal');
set local role postgres;
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-000000000402'), 0, 'delete_account removes the disposable Auth user');

select * from finish();

rollback;
