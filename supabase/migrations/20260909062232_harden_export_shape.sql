-- Keep account exports useful at the application boundary without leaking
-- internal identity/foreign-key implementation details.

create or replace function private.build_account_export()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
begin
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', (
      select to_jsonb(p)
      from public.profiles p
      where p.id = caller_id
    ),
    'goals', coalesce((
      select jsonb_agg(to_jsonb(g) - array['row_id', 'user_id'] order by g.version)
      from public.goals g
      where g.user_id = caller_id
    ), '[]'::jsonb),
    'dailyTargets', coalesce((
      select jsonb_agg(to_jsonb(t) - array['row_id', 'user_id', 'goal_row_id'] order by t.version)
      from public.daily_targets t
      where t.user_id = caller_id
    ), '[]'::jsonb),
    'workoutPlans', coalesce((
      select jsonb_agg(
        to_jsonb(wp) - array['row_id', 'user_id', 'target_row_id', 'supersedes_plan_row_id']
        order by wp.created_at, wp.row_id
      )
      from public.workout_plans wp
      where wp.user_id = caller_id
    ), '[]'::jsonb),
    'plannedWorkouts', coalesce((
      select jsonb_agg(
        to_jsonb(pw) - array['row_id', 'user_id', 'plan_row_id']
        order by pw.row_id
      )
      from public.planned_workouts pw
      where pw.user_id = caller_id
    ), '[]'::jsonb),
    'plannedExercises', coalesce((
      select jsonb_agg(
        to_jsonb(pe) - array['row_id', 'user_id', 'planned_workout_row_id', 'exercise_row_id']
        order by pe.row_id
      )
      from public.planned_exercises pe
      where pe.user_id = caller_id
    ), '[]'::jsonb),
    'workoutPlanOverrides', coalesce((
      select jsonb_agg(
        to_jsonb(po) - array[
          'row_id', 'user_id', 'planned_exercise_row_id', 'replacement_exercise_row_id'
        ]
        order by po.row_id
      )
      from public.workout_plan_overrides po
      where po.user_id = caller_id
    ), '[]'::jsonb),
    'mealPlans', coalesce((
      select jsonb_agg(
        to_jsonb(mp) - array['row_id', 'user_id', 'target_row_id', 'supersedes_plan_row_id']
        order by mp.created_at, mp.row_id
      )
      from public.meal_plans mp
      where mp.user_id = caller_id
    ), '[]'::jsonb),
    'plannedMeals', coalesce((
      select jsonb_agg(
        (to_jsonb(pm) - array['row_id', 'user_id', 'meal_plan_row_id', 'meal_row_id', 'food_row_id'])
        || jsonb_build_object(
          'mealId', (select m.app_id from public.meals m where m.row_id = pm.meal_row_id),
          'foodId', (select f.app_id from public.foods f where f.row_id = pm.food_row_id)
        )
        order by pm.row_id
      )
      from public.planned_meals pm
      where pm.user_id = caller_id
    ), '[]'::jsonb),
    'workoutSessions', coalesce((
      select jsonb_agg(
        to_jsonb(ws) - array['row_id', 'user_id', 'planned_workout_row_id', 'planned_plan_row_id']
        order by ws.session_date, ws.row_id
      )
      from public.workout_sessions ws
      where ws.user_id = caller_id
    ), '[]'::jsonb),
    'exerciseLogs', coalesce((
      select jsonb_agg(
        to_jsonb(el) - array[
          'row_id', 'user_id', 'session_row_id', 'planned_exercise_row_id', 'actual_exercise_row_id'
        ]
        order by el.row_id
      )
      from public.exercise_logs el
      where el.user_id = caller_id
    ), '[]'::jsonb),
    'nutritionLogs', coalesce((
      select jsonb_agg(
        (to_jsonb(nl) - array['row_id', 'user_id', 'food_row_id'])
        || jsonb_build_object(
          'foodId', (select f.app_id from public.foods f where f.row_id = nl.food_row_id)
        )
        order by nl.log_date, nl.row_id
      )
      from public.nutrition_logs nl
      where nl.user_id = caller_id
    ), '[]'::jsonb),
    'weightEntries', coalesce((
      select jsonb_agg(to_jsonb(we) - array['row_id', 'user_id'] order by we.entry_date, we.row_id)
      from public.weight_entries we
      where we.user_id = caller_id
    ), '[]'::jsonb),
    'groceryLists', coalesce((
      select jsonb_agg(to_jsonb(gl) - array['row_id', 'user_id'] order by gl.week_of, gl.row_id)
      from public.grocery_lists gl
      where gl.user_id = caller_id
    ), '[]'::jsonb),
    'groceryItems', coalesce((
      select jsonb_agg(
        (to_jsonb(gi) - array['row_id', 'user_id', 'grocery_list_row_id', 'source_food_row_id'])
        || jsonb_build_object(
          'foodId', (select f.app_id from public.foods f where f.row_id = gi.source_food_row_id)
        )
        order by gi.row_id
      )
      from public.grocery_items gi
      where gi.user_id = caller_id
    ), '[]'::jsonb),
    'savedMeals', coalesce((
      select jsonb_agg(to_jsonb(m) - array['row_id', 'owner_user_id'] order by m.created_at, m.row_id)
      from public.meals m
      where m.owner_user_id = caller_id
    ), '[]'::jsonb),
    'savedMealIngredients', coalesce((
      select jsonb_agg(
        (to_jsonb(mi) - array['row_id', 'meal_row_id', 'food_row_id'])
        || jsonb_build_object(
          'mealId', (select m.app_id from public.meals m where m.row_id = mi.meal_row_id),
          'foodId', (select f.app_id from public.foods f where f.row_id = mi.food_row_id)
        )
        order by mi.row_id
      )
      from public.meal_ingredients mi
      join public.meals m on m.row_id = mi.meal_row_id
      where m.owner_user_id = caller_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.build_account_export() from public, anon, authenticated;
