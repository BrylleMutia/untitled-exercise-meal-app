-- Account export and deletion use an authenticated server-side boundary.
-- Export returns a read-only JSON document; the idempotency table stores only
-- the operation reference, never the document itself.

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
      select jsonb_agg(to_jsonb(g) order by g.version)
      from public.goals g
      where g.user_id = caller_id
    ), '[]'::jsonb),
    'dailyTargets', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.version)
      from public.daily_targets t
      where t.user_id = caller_id
    ), '[]'::jsonb),
    'workoutPlans', coalesce((
      select jsonb_agg(to_jsonb(wp) order by wp.created_at, wp.row_id)
      from public.workout_plans wp
      where wp.user_id = caller_id
    ), '[]'::jsonb),
    'plannedWorkouts', coalesce((
      select jsonb_agg(to_jsonb(pw) order by pw.row_id)
      from public.planned_workouts pw
      where pw.user_id = caller_id
    ), '[]'::jsonb),
    'plannedExercises', coalesce((
      select jsonb_agg(to_jsonb(pe) order by pe.row_id)
      from public.planned_exercises pe
      where pe.user_id = caller_id
    ), '[]'::jsonb),
    'workoutPlanOverrides', coalesce((
      select jsonb_agg(to_jsonb(po) order by po.row_id)
      from public.workout_plan_overrides po
      where po.user_id = caller_id
    ), '[]'::jsonb),
    'mealPlans', coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.created_at, mp.row_id)
      from public.meal_plans mp
      where mp.user_id = caller_id
    ), '[]'::jsonb),
    'plannedMeals', coalesce((
      select jsonb_agg(to_jsonb(pm) order by pm.row_id)
      from public.planned_meals pm
      where pm.user_id = caller_id
    ), '[]'::jsonb),
    'workoutSessions', coalesce((
      select jsonb_agg(to_jsonb(ws) order by ws.session_date, ws.row_id)
      from public.workout_sessions ws
      where ws.user_id = caller_id
    ), '[]'::jsonb),
    'exerciseLogs', coalesce((
      select jsonb_agg(to_jsonb(el) order by el.row_id)
      from public.exercise_logs el
      where el.user_id = caller_id
    ), '[]'::jsonb),
    'nutritionLogs', coalesce((
      select jsonb_agg(to_jsonb(nl) order by nl.log_date, nl.row_id)
      from public.nutrition_logs nl
      where nl.user_id = caller_id
    ), '[]'::jsonb),
    'weightEntries', coalesce((
      select jsonb_agg(to_jsonb(we) order by we.entry_date, we.row_id)
      from public.weight_entries we
      where we.user_id = caller_id
    ), '[]'::jsonb),
    'groceryLists', coalesce((
      select jsonb_agg(to_jsonb(gl) order by gl.week_of, gl.row_id)
      from public.grocery_lists gl
      where gl.user_id = caller_id
    ), '[]'::jsonb),
    'groceryItems', coalesce((
      select jsonb_agg(to_jsonb(gi) order by gi.row_id)
      from public.grocery_items gi
      where gi.user_id = caller_id
    ), '[]'::jsonb),
    'savedMeals', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at, m.row_id)
      from public.meals m
      where m.owner_user_id = caller_id
    ), '[]'::jsonb),
    'savedMealIngredients', coalesce((
      select jsonb_agg(to_jsonb(mi) order by mi.row_id)
      from public.meal_ingredients mi
      join public.meals m on m.row_id = mi.meal_row_id
      where m.owner_user_id = caller_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.export_account_data(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  exported jsonb;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'export_account_data',
    p_payload->>'idempotencyKey', p_payload
  );

  exported := private.build_account_export();

  if not claim.replay then
    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'export_account_data',
      'result_refs', jsonb_build_object('exported_at', now()),
      'data', exported
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'operation', 'export_account_data',
    'replayed', true,
    'result_refs', claim.result_refs,
    'data', exported
  );
exception when others then
  if claim.mutation_row_id is not null then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
  end if;
  raise;
end;
$$;

create or replace function private.delete_account(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'delete_account',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_account',
      'replayed', true,
      'result_refs', claim.result_refs,
      'clear_cache', true
    );
  end if;

  begin
    delete from auth.users where id = caller_id;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_account',
      'result_refs', jsonb_build_object('user_id', caller_id::text),
      'clear_cache', true
    );
    -- The mutation row is removed by the auth.users cascade, so this update is
    -- intentionally best-effort and does not change the deletion result.
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.delete_account(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.delete_account(p_payload);
end;
$$;

revoke all on function private.build_account_export() from public, anon, authenticated;
revoke all on function public.export_account_data(jsonb) from public, anon;
revoke all on function private.delete_account(jsonb) from public, anon, authenticated;
revoke all on function public.delete_account(jsonb) from public, anon;

grant execute on function public.export_account_data(jsonb) to authenticated;
grant execute on function public.delete_account(jsonb) to authenticated;
