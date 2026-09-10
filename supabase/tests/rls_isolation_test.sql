begin;

select plan(38);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'rls-a@example.test'),
  ('00000000-0000-0000-0000-000000000202', 'rls-b@example.test');

insert into public.profiles (
  id, name, age, sex, height_cm, weight_kg, units, experience,
  equipment, days_per_week, session_minutes, goal
)
values
  ('00000000-0000-0000-0000-000000000201', 'RLS User A', 30, 'female', 165, 65,
   'metric', 'beginner', array['none'], 3, 30, 'maintain'),
  ('00000000-0000-0000-0000-000000000202', 'RLS User B', 31, 'male', 175, 75,
   'metric', 'intermediate', array['pullup_bar'], 4, 45, 'gain');

insert into public.foods (
  app_id, owner_user_id, is_system, name, serving_label, serving_grams,
  serving_unit, calories, protein_g, carbs_g, fat_g, category, source,
  source_version, estimated, confidence
)
values
  ('test-rls-food-a', '00000000-0000-0000-0000-000000000201', false,
   'RLS custom food A', '1 serving', 100, 'g', 100, 10, 10, 3, 'Other', 'test', '1', true, 'low'),
  ('test-rls-food-b', '00000000-0000-0000-0000-000000000202', false,
   'RLS custom food B', '1 serving', 100, 'g', 110, 11, 11, 3, 'Other', 'test', '1', true, 'low');

insert into public.meals (
  app_id, owner_user_id, is_system, name, servings, notes
)
values
  ('test-rls-meal-a', '00000000-0000-0000-0000-000000000201', false, 'RLS saved meal A', 1, 'test'),
  ('test-rls-meal-b', '00000000-0000-0000-0000-000000000202', false, 'RLS saved meal B', 1, 'test');

insert into public.meal_ingredients (meal_row_id, food_row_id, ingredient_order, servings)
values
  ((select row_id from public.meals where app_id = 'test-rls-meal-a'),
   (select row_id from public.foods where app_id = 'test-rls-food-a'), 1, 1),
  ((select row_id from public.meals where app_id = 'test-rls-meal-b'),
   (select row_id from public.foods where app_id = 'test-rls-food-b'), 1, 1);

insert into public.goals (
  app_id, user_id, goal_type, weekly_workout_target, effective_date,
  version, is_primary, status
)
values
  ('test-rls-goal-a', '00000000-0000-0000-0000-000000000201', 'maintain', 3, '2026-09-07', 1, true, 'active'),
  ('test-rls-goal-b', '00000000-0000-0000-0000-000000000202', 'gain', 4, '2026-09-07', 1, true, 'active');

insert into public.daily_targets (
  app_id, user_id, goal_row_id, version, effective_date, calories,
  protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor, formula, disclaimer
)
values
  ('test-rls-target-a', '00000000-0000-0000-0000-000000000201', (select row_id from public.goals where app_id = 'test-rls-goal-a'), 1, '2026-09-07', 2000, 120, 220, 60, 1400, 24, 2000, 1.5, 'test', 'test'),
  ('test-rls-target-b', '00000000-0000-0000-0000-000000000202', (select row_id from public.goals where app_id = 'test-rls-goal-b'), 1, '2026-09-07', 2200, 130, 240, 70, 1600, 24, 2200, 1.5, 'test', 'test');

insert into public.workout_plans (app_id, user_id, version, target_row_id)
values
  ('test-rls-plan-a', '00000000-0000-0000-0000-000000000201', 1, (select row_id from public.daily_targets where app_id = 'test-rls-target-a')),
  ('test-rls-plan-b', '00000000-0000-0000-0000-000000000202', 1, (select row_id from public.daily_targets where app_id = 'test-rls-target-b'));

insert into public.planned_workouts (plan_row_id, user_id, app_id, day_of_week, title, focus, estimated_minutes)
values
  ((select row_id from public.workout_plans where app_id = 'test-rls-plan-a'), '00000000-0000-0000-0000-000000000201', 'test-rls-workout-a', 1, 'RLS workout A', 'Push', 30),
  ((select row_id from public.workout_plans where app_id = 'test-rls-plan-b'), '00000000-0000-0000-0000-000000000202', 'test-rls-workout-b', 1, 'RLS workout B', 'Pull', 30);

insert into public.planned_exercises (
  planned_workout_row_id, user_id, app_id, exercise_row_id, sort_order,
  exercise_name_snapshot, measure_snapshot, catalog_source_version, sets, reps, rest_seconds
)
values
  ((select row_id from public.planned_workouts where app_id = 'test-rls-workout-a'), '00000000-0000-0000-0000-000000000201', 'test-rls-exercise-a', (select row_id from public.exercises limit 1), 1, 'RLS exercise A', 'reps', 'test', 3, 8, 60),
  ((select row_id from public.planned_workouts where app_id = 'test-rls-workout-b'), '00000000-0000-0000-0000-000000000202', 'test-rls-exercise-b', (select row_id from public.exercises limit 1), 1, 'RLS exercise B', 'reps', 'test', 3, 8, 60);

insert into public.workout_plan_overrides (user_id, app_id, planned_exercise_row_id, measure_override, reps_override)
values
  ('00000000-0000-0000-0000-000000000201', 'test-rls-override-a', (select row_id from public.planned_exercises where app_id = 'test-rls-exercise-a'), 'reps', 10),
  ('00000000-0000-0000-0000-000000000202', 'test-rls-override-b', (select row_id from public.planned_exercises where app_id = 'test-rls-exercise-b'), 'reps', 10);

insert into public.meal_plans (app_id, user_id, version, week_of, target_row_id)
values
  ('test-rls-meal-plan-a', '00000000-0000-0000-0000-000000000201', 1, '2026-09-07', (select row_id from public.daily_targets where app_id = 'test-rls-target-a')),
  ('test-rls-meal-plan-b', '00000000-0000-0000-0000-000000000202', 1, '2026-09-07', (select row_id from public.daily_targets where app_id = 'test-rls-target-b'));

insert into public.planned_meals (
  meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot,
  meal_row_id, label, servings
)
values
  ((select row_id from public.meal_plans where app_id = 'test-rls-meal-plan-a'), '00000000-0000-0000-0000-000000000201', '2026-09-07', 'test-rls-planned-meal-a', '2026-09-07', 'breakfast', (select row_id from public.meals where is_system limit 1), 'RLS meal A', 1),
  ((select row_id from public.meal_plans where app_id = 'test-rls-meal-plan-b'), '00000000-0000-0000-0000-000000000202', '2026-09-07', 'test-rls-planned-meal-b', '2026-09-07', 'breakfast', (select row_id from public.meals where is_system limit 1), 'RLS meal B', 1);

insert into public.workout_sessions (
  app_id, user_id, planned_workout_row_id, planned_plan_row_id,
  planned_plan_version, session_date, started_at, status
)
values
  ('test-rls-session-a', '00000000-0000-0000-0000-000000000201', (select row_id from public.planned_workouts where app_id = 'test-rls-workout-a'), (select row_id from public.workout_plans where app_id = 'test-rls-plan-a'), 1, '2026-09-10', '2026-09-10 08:00+00', 'in_progress'),
  ('test-rls-session-b', '00000000-0000-0000-0000-000000000202', (select row_id from public.planned_workouts where app_id = 'test-rls-workout-b'), (select row_id from public.workout_plans where app_id = 'test-rls-plan-b'), 1, '2026-09-10', '2026-09-10 08:00+00', 'in_progress');

insert into public.exercise_logs (
  session_row_id, user_id, planned_exercise_row_id, actual_exercise_row_id,
  planned_exercise_app_id, planned_exercise_name_snapshot, planned_measure,
  planned_sets, planned_reps, actual_measure, actual_sets, actual_reps, status
)
values
  ((select row_id from public.workout_sessions where app_id = 'test-rls-session-a'), '00000000-0000-0000-0000-000000000201', (select row_id from public.planned_exercises where app_id = 'test-rls-exercise-a'), (select row_id from public.exercises limit 1), 'test-rls-exercise-a', 'RLS exercise A', 'reps', 3, 8, 'reps', 3, 8, 'completed'),
  ((select row_id from public.workout_sessions where app_id = 'test-rls-session-b'), '00000000-0000-0000-0000-000000000202', (select row_id from public.planned_exercises where app_id = 'test-rls-exercise-b'), (select row_id from public.exercises limit 1), 'test-rls-exercise-b', 'RLS exercise B', 'reps', 3, 8, 'reps', 3, 8, 'completed');

insert into public.nutrition_logs (
  app_id, user_id, log_date, meal_slot, food_row_id, servings,
  serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g,
  confidence, source
)
values
  ('test-rls-nutrition-a', '00000000-0000-0000-0000-000000000201', '2026-09-10', 'lunch', (select row_id from public.foods where app_id = 'food-egg'), 1, 1, 'serving', 100, 10, 2, 5, 'medium', 'test'),
  ('test-rls-nutrition-b', '00000000-0000-0000-0000-000000000202', '2026-09-10', 'lunch', (select row_id from public.foods where app_id = 'food-egg'), 1, 1, 'serving', 100, 10, 2, 5, 'medium', 'test');

insert into public.weight_entries (app_id, user_id, entry_date, weight_kg)
values
  ('test-rls-weight-a', '00000000-0000-0000-0000-000000000201', '2026-09-10', 65),
  ('test-rls-weight-b', '00000000-0000-0000-0000-000000000202', '2026-09-10', 75);

insert into public.grocery_lists (app_id, user_id, week_of)
values
  ('test-rls-grocery-a', '00000000-0000-0000-0000-000000000201', '2026-09-07'),
  ('test-rls-grocery-b', '00000000-0000-0000-0000-000000000202', '2026-09-07');

insert into public.grocery_items (
  grocery_list_row_id, user_id, app_id, name, category, unit,
  generated_quantity, quantity
)
values
  ((select row_id from public.grocery_lists where app_id = 'test-rls-grocery-a'), '00000000-0000-0000-0000-000000000201', 'test-rls-grocery-item-a', 'RLS oats A', 'Grains', 'g', 500, 500),
  ((select row_id from public.grocery_lists where app_id = 'test-rls-grocery-b'), '00000000-0000-0000-0000-000000000202', 'test-rls-grocery-item-b', 'RLS oats B', 'Grains', 'g', 500, 500);

insert into public.mutation_idempotency (user_id, operation, idempotency_key, request_hash)
values
  ('00000000-0000-0000-0000-000000000201', 'test_rls', 'test-rls-key-a', 'test-rls-hash-a'),
  ('00000000-0000-0000-0000-000000000202', 'test_rls', 'test-rls-key-b', 'test-rls-hash-b');

set local role anon;
select is((select count(*)::int from public.exercises), 21, 'anonymous users can read system exercises');
select is((select count(*)::int from public.foods), 22, 'anonymous users can read system foods');
select is((select count(*)::int from public.meals), 4, 'anonymous users can read system meals');
select is((select count(*)::int from public.meal_ingredients), 14, 'anonymous users can read system meal ingredients');
select is((select count(*)::int from public.foods where not is_system), 0, 'anonymous users cannot read custom foods');
select is((select count(*)::int from public.meals where not is_system), 0, 'anonymous users cannot read saved meals');
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'anonymous users cannot read durable profiles');
select throws_ok($$insert into public.weight_entries (app_id, user_id, entry_date, weight_kg) values ('test-anon-weight', '00000000-0000-0000-0000-000000000201', '2026-09-10', 65)$$,
  '42501', null, 'anonymous users cannot write durable tables');
select throws_ok($$select public.complete_onboarding('{}'::jsonb)$$, '42501', null, 'anonymous users cannot execute mutation RPCs');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000201';
select is((select count(*)::int from public.profiles), 1, 'User A can read User A profile');
select is((select count(*)::int from public.goals), 1, 'User A can read User A goals');
select is((select count(*)::int from public.daily_targets), 1, 'User A can read User A targets');
select is((select count(*)::int from public.workout_plans), 1, 'User A can read User A plans');
select is((select count(*)::int from public.planned_workouts), 1, 'User A can read User A planned workouts');
select is((select count(*)::int from public.planned_exercises), 1, 'User A can read User A planned exercises');
select is((select count(*)::int from public.workout_sessions), 1, 'User A can read User A sessions');
select is((select count(*)::int from public.exercise_logs), 1, 'User A can read User A exercise logs');
select is((select count(*)::int from public.nutrition_logs), 1, 'User A can read User A nutrition logs');
select is((select count(*)::int from public.weight_entries), 1, 'User A can read User A weights');
select is((select count(*)::int from public.grocery_lists), 1, 'User A can read User A grocery lists');
select is((select count(*)::int from public.grocery_items), 1, 'User A can read User A grocery items');
select is((select count(*)::int from public.workout_plan_overrides), 1, 'User A can read User A overrides');
select is((select count(*)::int from public.mutation_idempotency), 1, 'User A can read User A idempotency rows');
select is((select count(*)::int from public.foods where not is_system), 1, 'User A can read their custom food');
select is((select count(*)::int from public.meals where not is_system), 1, 'User A can read their saved meal');
select is((select count(*)::int from public.meal_ingredients mi join public.meals m on m.row_id = mi.meal_row_id where not m.is_system), 1, 'User A can read their saved meal ingredients');
select is((
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.goals where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.planned_workouts where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.planned_exercises where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.workout_sessions where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.exercise_logs where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.nutrition_logs where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.weight_entries where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.grocery_lists where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.grocery_items where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.workout_plan_overrides where user_id = '00000000-0000-0000-0000-000000000202') +
  (select count(*) from public.mutation_idempotency where user_id = '00000000-0000-0000-0000-000000000202')
  )::int, 0, 'User A cannot read User B durable rows');
select throws_ok($$insert into public.nutrition_logs (app_id, user_id, log_date, meal_slot, food_row_id, servings, serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g, confidence, source) values ('test-direct-write-a', '00000000-0000-0000-0000-000000000201', '2026-09-10', 'lunch', (select row_id from public.foods where app_id = 'food-egg'), 1, 1, 'serving', 100, 10, 2, 5, 'medium', 'test')$$,
  '42501', null, 'User A cannot insert directly into durable tables');
select throws_ok($$update public.profiles set name = 'hijacked' where id = '00000000-0000-0000-0000-000000000202'$$,
  '42501', null, 'User A cannot update User B through a direct table write');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-000000000202'$$,
  '42501', null, 'User A cannot delete User B through a direct table write');
select throws_ok($$select public.toggle_grocery_item(jsonb_build_object('itemId', 'test-rls-grocery-item-b', 'idempotencyKey', 'test-cross-user-toggle'))$$,
  'P0001', null, 'User A cannot mutate User B grocery data through an RPC');
select is((select count(*)::int from public.meal_ingredients mi join public.meals m on m.row_id = mi.meal_row_id where m.app_id = 'test-rls-meal-b'), 0, 'User A cannot see User B custom meal ingredients');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000202';
select is((select count(*)::int from public.profiles), 1, 'User B can read User B profile');
select is((select count(*)::int from public.goals), 1, 'User B can read User B goals');
select is((select count(*)::int from public.foods where not is_system), 1, 'User B can read their custom food');
select is((select count(*)::int from public.meals where not is_system), 1, 'User B can read their saved meal');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000201'), 0, 'User B cannot read User A profile');
select is((select count(*)::int from public.meal_ingredients mi join public.meals m on m.row_id = mi.meal_row_id where m.app_id = 'test-rls-meal-a'), 0, 'User B cannot see User A custom meal ingredients');

select * from finish();

rollback;
