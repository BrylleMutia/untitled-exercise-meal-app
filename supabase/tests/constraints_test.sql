begin;

select plan(50);

-- All fixtures are local to this transaction. The two auth rows make the
-- composite ownership foreign keys exercise the same boundary as the app.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000101', 'constraint-a@example.test'),
  ('00000000-0000-0000-0000-000000000102', 'constraint-b@example.test');

insert into public.profiles (
  id, name, age, sex, height_cm, weight_kg, units, experience,
  equipment, days_per_week, session_minutes, goal
)
values
  ('00000000-0000-0000-0000-000000000101', 'Constraint A', 30, 'female', 165, 65,
   'metric', 'beginner', array['none'], 3, 30, 'maintain'),
  ('00000000-0000-0000-0000-000000000102', 'Constraint B', 30, 'male', 175, 75,
   'metric', 'beginner', array['none'], 3, 30, 'maintain');

insert into public.goals (
  app_id, user_id, goal_type, target_weight_kg, desired_rate_kg_per_week,
  weekly_workout_target, effective_date, version, is_primary, status
)
values
  ('test-goal-a-1', '00000000-0000-0000-0000-000000000101', 'maintain', 65, 0,
   3, '2026-09-07', 1, true, 'active'),
  ('test-goal-b-1', '00000000-0000-0000-0000-000000000102', 'maintain', 75, 0,
   3, '2026-09-07', 1, true, 'active');

insert into public.daily_targets (
  app_id, user_id, goal_row_id, version, effective_date, calories,
  protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor,
  formula, disclaimer
)
values
  ('test-target-a-1', '00000000-0000-0000-0000-000000000101',
   (select row_id from public.goals where app_id = 'test-goal-a-1'),
   1, '2026-09-07', 2000, 120, 220, 60, 1400, 23.9, 2000, 1.5,
   'test-formula', 'Test estimates only.'),
  ('test-target-b-1', '00000000-0000-0000-0000-000000000102',
   (select row_id from public.goals where app_id = 'test-goal-b-1'),
   1, '2026-09-07', 2200, 130, 240, 70, 1600, 24.5, 2200, 1.5,
   'test-formula', 'Test estimates only.');

insert into public.workout_plans (
  app_id, user_id, version, target_row_id
)
values (
  'test-plan-a-1', '00000000-0000-0000-0000-000000000101', 1,
  (select row_id from public.daily_targets where app_id = 'test-target-a-1')
);

insert into public.planned_workouts (
  plan_row_id, user_id, app_id, day_of_week, title, focus,
  estimated_minutes, sort_order
)
values (
  (select row_id from public.workout_plans where app_id = 'test-plan-a-1'),
  '00000000-0000-0000-0000-000000000101', 'test-workout-a-1', 1,
  'Test workout', 'Full body', 30, 1
);

insert into public.planned_exercises (
  planned_workout_row_id, user_id, app_id, exercise_row_id, sort_order,
  exercise_name_snapshot, measure_snapshot, catalog_source_version,
  sets, reps, rest_seconds
)
values (
  (select row_id from public.planned_workouts where app_id = 'test-workout-a-1'),
  '00000000-0000-0000-0000-000000000101', 'test-exercise-a-1',
  (select row_id from public.exercises order by row_id limit 1), 1,
  'Test exercise', 'reps', 'test', 3, 8, 60
);

insert into public.meal_plans (
  app_id, user_id, version, week_of, target_row_id
)
values (
  'test-meal-plan-a-1', '00000000-0000-0000-0000-000000000101', 1,
  '2026-09-07',
  (select row_id from public.daily_targets where app_id = 'test-target-a-1')
);

insert into public.planned_meals (
  meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot,
  meal_row_id, label, servings, expected_calories, expected_protein_g,
  expected_carbs_g, expected_fat_g
)
values (
  (select row_id from public.meal_plans where app_id = 'test-meal-plan-a-1'),
  '00000000-0000-0000-0000-000000000101', '2026-09-07', 'test-planned-meal-a-1',
  '2026-09-07', 'breakfast',
  (select row_id from public.meals where is_system order by row_id limit 1),
  'Test breakfast', 1, 300, 20, 30, 10
);

insert into public.workout_sessions (
  app_id, user_id, planned_workout_row_id, planned_plan_row_id,
  planned_plan_version, session_date, started_at, status
)
values (
  'test-session-a-1', '00000000-0000-0000-0000-000000000101',
  (select row_id from public.planned_workouts where app_id = 'test-workout-a-1'),
  (select row_id from public.workout_plans where app_id = 'test-plan-a-1'),
  1, '2026-09-10', '2026-09-10 08:00:00+00', 'in_progress'
);

insert into public.grocery_lists (app_id, user_id, week_of)
values ('test-grocery-a-1', '00000000-0000-0000-0000-000000000101', '2026-09-07');

insert into public.grocery_items (
  grocery_list_row_id, user_id, app_id, name, category, unit,
  generated_quantity, quantity
)
values (
  (select row_id from public.grocery_lists where app_id = 'test-grocery-a-1'),
  '00000000-0000-0000-0000-000000000101', 'test-grocery-item-a-1',
  'Test oats', 'Grains', 'g', 500, 500
);

insert into public.mutation_idempotency (
  user_id, operation, idempotency_key, request_hash, status
)
values (
  '00000000-0000-0000-0000-000000000101', 'test_operation',
  'test-key-1', 'test-hash-1', 'pending'
);

select lives_ok($$update public.profiles set age = 18 where id = '00000000-0000-0000-0000-000000000101'$$,
  'profile accepts the adult lower age boundary');
select lives_ok($$update public.profiles set age = 100 where id = '00000000-0000-0000-0000-000000000101'$$,
  'profile accepts the adult upper age boundary');
select throws_ok($$update public.profiles set age = 17 where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects age below the adult boundary');
select throws_ok($$update public.profiles set sex = 'other' where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects unsupported sex values');
select lives_ok($$update public.profiles set height_cm = 120, weight_kg = 35 where id = '00000000-0000-0000-0000-000000000101'$$,
  'profile accepts lower height and weight boundaries');
select lives_ok($$update public.profiles set height_cm = 230, weight_kg = 300 where id = '00000000-0000-0000-0000-000000000101'$$,
  'profile accepts upper height and weight boundaries');
select throws_ok($$update public.profiles set height_cm = 119 where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects height below the supported boundary');
select throws_ok($$update public.profiles set units = 'stones' where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects unsupported unit systems');
select throws_ok($$update public.profiles set experience = 'expert' where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects unsupported experience values');
select throws_ok($$update public.profiles set equipment = array['barbell'] where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects equipment outside the supported subset');
select lives_ok($$update public.profiles set days_per_week = 1, session_minutes = 15 where id = '00000000-0000-0000-0000-000000000101'$$,
  'profile accepts minimum training frequency and session duration');
select lives_ok($$update public.profiles set days_per_week = 7, session_minutes = 120 where id = '00000000-0000-0000-0000-000000000101'$$,
  'profile accepts maximum training frequency and session duration');
select throws_ok($$update public.profiles set days_per_week = 0 where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects zero training days');
select throws_ok($$update public.profiles set session_minutes = 121 where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects sessions above the supported duration');
select throws_ok($$update public.profiles set goal = 'marathon' where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects unsupported goals');
select throws_ok($$update public.profiles set name = '   ' where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects blank names');
select throws_ok($$update public.profiles set cooking_time_minutes = 241 where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects cooking time above the supported boundary');
select throws_ok($$update public.profiles set meal_budget = -0.01 where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', null, 'profile rejects negative meal budgets');
select throws_ok($$insert into public.goals (app_id, user_id, goal_type, target_weight_kg, desired_rate_kg_per_week, weekly_workout_target, effective_date, version, is_primary, status)
  values ('test-goal-bad-weight', '00000000-0000-0000-0000-000000000101', 'lose', 34, 0, 3, '2026-09-07', 2, false, 'ended')$$,
  '23514', null, 'goals reject target weights below the health boundary');
select throws_ok($$insert into public.goals (app_id, user_id, goal_type, weekly_workout_target, effective_date, target_date, version, is_primary, status)
  values ('test-goal-bad-date', '00000000-0000-0000-0000-000000000101', 'lose', 3, '2026-09-10', '2026-09-09', 2, false, 'ended')$$,
  '23514', null, 'goal target dates cannot precede effective dates');
select throws_ok($$insert into public.goals (app_id, user_id, goal_type, weekly_workout_target, effective_date, version, is_primary, status)
  values ('test-goal-bad-status', '00000000-0000-0000-0000-000000000101', 'lose', 3, '2026-09-10', 2, false, 'ended')$$,
  '23514', null, 'active goals cannot have an ended date invariant violation');
select throws_ok($$insert into public.goals (app_id, user_id, goal_type, weekly_workout_target, effective_date, skill_targets, version, is_primary, status)
  values ('test-goal-bad-json', '00000000-0000-0000-0000-000000000101', 'lose', 3, '2026-09-10', '[]', 2, false, 'ended')$$,
  '23514', null, 'goal skill_targets must be a JSON object');
select throws_ok($$insert into public.goals (app_id, user_id, goal_type, weekly_workout_target, effective_date, version, is_primary, status)
  values ('test-goal-duplicate-active', '00000000-0000-0000-0000-000000000101', 'lose', 3, '2026-09-10', 2, true, 'active')$$,
  '23505', null, 'only one active primary goal is allowed per user');
select throws_ok($$insert into public.goals (app_id, user_id, goal_type, weekly_workout_target, effective_date, version, is_primary, status, ended_date)
  values ('test-goal-duplicate-version', '00000000-0000-0000-0000-000000000101', 'lose', 3, '2026-09-10', 1, false, 'ended', '2026-09-10')$$,
  '23505', null, 'goal versions are unique for a user');
select throws_ok($$insert into public.daily_targets (app_id, user_id, goal_row_id, version, effective_date, calories, protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor, formula, disclaimer)
  values ('test-target-cross-user', '00000000-0000-0000-0000-000000000102', (select row_id from public.goals where app_id = 'test-goal-a-1'), 2, '2026-09-10', 2000, 100, 200, 60, 1400, 24, 2000, 1.5, 'test', 'test')$$,
  '23503', null, 'daily targets cannot reference another user goal');
select throws_ok($$insert into public.daily_targets (app_id, user_id, goal_row_id, version, effective_date, calories, protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor, formula, disclaimer)
  values ('test-target-negative', '00000000-0000-0000-0000-000000000101', (select row_id from public.goals where app_id = 'test-goal-a-1'), 2, '2026-09-10', -1, 100, 200, 60, 1400, 24, 2000, 1.5, 'test', 'test')$$,
  '23514', null, 'daily target nutrition and health values are non-negative');
select throws_ok($$insert into public.daily_targets (app_id, user_id, goal_row_id, version, effective_date, calories, protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor, formula, disclaimer)
  values ('test-target-factor', '00000000-0000-0000-0000-000000000101', (select row_id from public.goals where app_id = 'test-goal-a-1'), 2, '2026-09-10', 2000, 100, 200, 60, 1400, 24, 2000, 1.66, 'test', 'test')$$,
  '23514', null, 'daily target activity factor is bounded');
select throws_ok($$insert into public.daily_targets (app_id, user_id, goal_row_id, version, effective_date, calories, protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor, formula, disclaimer)
  values ('test-target-blank', '00000000-0000-0000-0000-000000000101', (select row_id from public.goals where app_id = 'test-goal-a-1'), 2, '2026-09-10', 2000, 100, 200, 60, 1400, 24, 2000, 1.5, ' ', 'test')$$,
  '23514', null, 'daily target formulas must be non-blank');
select throws_ok($$insert into public.daily_targets (app_id, user_id, goal_row_id, version, effective_date, calories, protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor, formula, disclaimer)
  values ('test-target-duplicate', '00000000-0000-0000-0000-000000000101', (select row_id from public.goals where app_id = 'test-goal-a-1'), 1, '2026-09-10', 2000, 100, 200, 60, 1400, 24, 2000, 1.5, 'test', 'test')$$,
  '23505', null, 'daily target versions are unique for a user');
select throws_ok($$insert into public.workout_plans (app_id, user_id, version, target_row_id)
  values ('test-plan-cross-user', '00000000-0000-0000-0000-000000000102', 1, (select row_id from public.daily_targets where app_id = 'test-target-a-1'))$$,
  '23503', null, 'workout plans cannot reference another user target');
select throws_ok($$insert into public.planned_workouts (plan_row_id, user_id, app_id, day_of_week, title, focus, estimated_minutes)
  values ((select row_id from public.workout_plans where app_id = 'test-plan-a-1'), '00000000-0000-0000-0000-000000000101', 'test-workout-bad-day', 7, 'Test', 'Test', 30)$$,
  '23514', null, 'planned workout days are limited to zero through six');
select throws_ok($$insert into public.planned_workouts (plan_row_id, user_id, app_id, day_of_week, title, focus, estimated_minutes)
  values ((select row_id from public.workout_plans where app_id = 'test-plan-a-1'), '00000000-0000-0000-0000-000000000101', 'test-workout-duplicate-day', 1, 'Test', 'Test', 30)$$,
  '23505', null, 'a plan version has at most one workout per day');
select throws_ok($$insert into public.planned_exercises (planned_workout_row_id, user_id, app_id, exercise_row_id, sort_order, exercise_name_snapshot, measure_snapshot, catalog_source_version, sets, reps, hold_seconds, rest_seconds)
  values ((select row_id from public.planned_workouts where app_id = 'test-workout-a-1'), '00000000-0000-0000-0000-000000000101', 'test-exercise-bad-measure', (select row_id from public.exercises limit 1), 2, 'Test', 'reps', 'test', 3, 8, 10, 60)$$,
  '23514', null, 'planned exercise reps and hold values are mutually exclusive');
select throws_ok($$insert into public.planned_exercises (planned_workout_row_id, user_id, app_id, exercise_row_id, sort_order, exercise_name_snapshot, measure_snapshot, catalog_source_version, sets, reps, rest_seconds)
  values ((select row_id from public.planned_workouts where app_id = 'test-workout-a-1'), '00000000-0000-0000-0000-000000000101', 'test-exercise-bad-sets', (select row_id from public.exercises limit 1), 2, 'Test', 'reps', 'test', 11, 8, 60)$$,
  '23514', null, 'planned exercise sets remain within progression bounds');
select throws_ok($$insert into public.workout_plan_overrides (user_id, app_id, planned_exercise_row_id, measure_override, reps_override, hold_seconds_override, active)
  values ('00000000-0000-0000-0000-000000000101', 'test-override-bad-measure', (select row_id from public.planned_exercises where app_id = 'test-exercise-a-1'), 'reps', 8, 10, true)$$,
  '23514', null, 'exercise overrides enforce their measurement form');
select throws_ok($$insert into public.workout_plan_overrides (user_id, app_id, planned_exercise_row_id, active, effective_at, ended_at)
  values ('00000000-0000-0000-0000-000000000101', 'test-override-active-end', (select row_id from public.planned_exercises where app_id = 'test-exercise-a-1'), true, '2026-09-10 10:00+00', '2026-09-11 10:00+00')$$,
  '23514', null, 'active overrides cannot have an end date');
select throws_ok($$insert into public.meal_plans (app_id, user_id, version, week_of, target_row_id)
  values ('test-meal-plan-bad-week', '00000000-0000-0000-0000-000000000101', 2, '2026-09-08', (select row_id from public.daily_targets where app_id = 'test-target-a-1'))$$,
  '23514', null, 'meal plan weeks must start on Monday');
select throws_ok($$insert into public.planned_meals (meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot, meal_row_id, label, servings)
  values ((select row_id from public.meal_plans where app_id = 'test-meal-plan-a-1'), '00000000-0000-0000-0000-000000000101', '2026-09-07', 'test-meal-bad-date', '2026-09-14', 'lunch', (select row_id from public.meals where is_system limit 1), 'Test', 1)$$,
  '23514', null, 'planned meals must remain within the plan week');
select throws_ok($$insert into public.planned_meals (meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot, meal_row_id, food_row_id, label, servings)
  values ((select row_id from public.meal_plans where app_id = 'test-meal-plan-a-1'), '00000000-0000-0000-0000-000000000101', '2026-09-07', 'test-meal-both-refs', '2026-09-08', 'lunch', (select row_id from public.meals where is_system limit 1), (select row_id from public.foods where is_system limit 1), 'Test', 1)$$,
  '23514', null, 'planned meals cannot reference both a meal and a food');
select throws_ok($$insert into public.planned_meals (meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot, meal_row_id, label, servings)
  values ((select row_id from public.meal_plans where app_id = 'test-meal-plan-a-1'), '00000000-0000-0000-0000-000000000101', '2026-09-07', 'test-meal-duplicate-slot', '2026-09-07', 'breakfast', (select row_id from public.meals where is_system limit 1), 'Test', 1)$$,
  '23505', null, 'a meal plan version has at most one meal per date and slot');
select throws_ok($$insert into public.workout_sessions (app_id, user_id, planned_workout_row_id, planned_plan_row_id, planned_plan_version, session_date, started_at, finished_at, status)
  values ('test-session-bad-status', '00000000-0000-0000-0000-000000000101', (select row_id from public.planned_workouts where app_id = 'test-workout-a-1'), (select row_id from public.workout_plans where app_id = 'test-plan-a-1'), 1, '2026-09-10', '2026-09-10 09:00+00', '2026-09-10 08:00+00', 'complete')$$,
  '23514', null, 'workout session status and timestamps are constrained');
select throws_ok($$insert into public.workout_sessions (app_id, user_id, planned_workout_row_id, planned_plan_row_id, planned_plan_version, session_date, started_at, status)
  values ('test-session-duplicate-progress', '00000000-0000-0000-0000-000000000101', (select row_id from public.planned_workouts where app_id = 'test-workout-a-1'), (select row_id from public.workout_plans where app_id = 'test-plan-a-1'), 1, '2026-09-10', '2026-09-10 09:00+00', 'in_progress')$$,
  '23505', null, 'only one in-progress session exists per planned workout');
select throws_ok($$insert into public.exercise_logs (session_row_id, user_id, planned_exercise_row_id, actual_exercise_row_id, planned_exercise_app_id, planned_exercise_name_snapshot, planned_measure, planned_sets, planned_reps, actual_measure, status, actual_sets, actual_reps)
  values ((select row_id from public.workout_sessions where app_id = 'test-session-a-1'), '00000000-0000-0000-0000-000000000101', (select row_id from public.planned_exercises where app_id = 'test-exercise-a-1'), (select row_id from public.exercises limit 1), 'test-exercise-a-1', 'Test exercise', 'reps', 3, 8, 'reps', 'skipped', 1, 1)$$,
  '23514', null, 'skipped exercise logs cannot contain actual values');
select throws_ok($$insert into public.nutrition_logs (app_id, user_id, log_date, meal_slot, servings, serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g, confidence, source)
  values ('test-nutrition-no-ref', '00000000-0000-0000-0000-000000000101', '2026-09-10', 'lunch', 1, 1, 'serving', 100, 10, 10, 5, 'medium', 'test')$$,
  '23514', null, 'nutrition logs require a visible food or custom name');
select throws_ok($$insert into public.nutrition_logs (app_id, user_id, log_date, meal_slot, food_row_id, servings, serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g, confidence, source)
  values ('test-nutrition-negative', '00000000-0000-0000-0000-000000000101', '2026-09-10', 'lunch', (select row_id from public.foods where is_system limit 1), 1, 1, 'serving', -1, 10, 10, 5, 'medium', 'test')$$,
  '23514', null, 'nutrition values are non-negative');
select throws_ok($$insert into public.weight_entries (app_id, user_id, entry_date, weight_kg)
  values ('test-weight-bad', '00000000-0000-0000-0000-000000000101', '2026-09-10', 34.99)$$,
  '23514', null, 'weight entries enforce the supported health range');
select throws_ok($$insert into public.grocery_lists (app_id, user_id, week_of)
  values ('test-grocery-bad-week', '00000000-0000-0000-0000-000000000101', '2026-09-08')$$,
  '23514', null, 'grocery list weeks must start on Monday');
select throws_ok($$insert into public.grocery_items (grocery_list_row_id, user_id, app_id, name, category, unit, generated_quantity, quantity)
  values ((select row_id from public.grocery_lists where app_id = 'test-grocery-a-1'), '00000000-0000-0000-0000-000000000101', 'test-grocery-negative', 'Test', 'Other', 'g', -1, 0)$$,
  '23514', null, 'grocery generated quantities cannot be negative');
select throws_ok($$insert into public.mutation_idempotency (user_id, operation, idempotency_key, request_hash, status)
  values ('00000000-0000-0000-0000-000000000101', 'test_operation_bad', 'test-key-bad', 'test-hash-bad', 'unknown')$$,
  '23514', null, 'idempotency statuses are limited to pending, completed, or failed');
select throws_ok($$insert into public.mutation_idempotency (user_id, operation, idempotency_key, request_hash, status, created_at, expires_at)
  values ('00000000-0000-0000-0000-000000000101', 'test_operation_bad_time', 'test-key-time', 'test-hash-time', 'pending', '2026-09-10 10:00+00', '2026-09-10 09:00+00')$$,
  '23514', null, 'idempotency expiry cannot precede creation');

select * from finish();

rollback;
