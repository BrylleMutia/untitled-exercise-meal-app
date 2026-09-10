-- Cover every foreign-key predicate reported by the remote performance
-- advisor. Keep the exact FK column order so deletes and ownership joins can
-- use these indexes without changing the already-deployed schema.

create index daily_targets_goal_user_idx
  on public.daily_targets (goal_row_id, user_id);

create index exercise_logs_session_user_idx
  on public.exercise_logs (session_row_id, user_id);

create index exercise_logs_user_idx
  on public.exercise_logs (user_id);

create index grocery_items_list_user_idx
  on public.grocery_items (grocery_list_row_id, user_id);

create index meal_plans_target_user_idx
  on public.meal_plans (target_row_id, user_id);

create index planned_exercises_user_idx
  on public.planned_exercises (user_id);

create index planned_exercises_workout_user_idx
  on public.planned_exercises (planned_workout_row_id, user_id);

create index planned_meals_plan_user_week_idx
  on public.planned_meals (meal_plan_row_id, user_id, week_of);

create index planned_workouts_plan_user_idx
  on public.planned_workouts (plan_row_id, user_id);

create index workout_plan_overrides_exercise_user_idx
  on public.workout_plan_overrides (planned_exercise_row_id, user_id);

create index workout_plans_target_user_idx
  on public.workout_plans (target_row_id, user_id);

create index workout_sessions_plan_user_idx
  on public.workout_sessions (planned_plan_row_id, user_id);
