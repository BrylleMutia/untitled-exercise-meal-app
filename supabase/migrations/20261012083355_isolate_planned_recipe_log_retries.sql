create or replace function private.log_planned_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  log_kind text := p_payload->>'kind';
  operation text;
  claim record;
  legacy_refs jsonb;
  result jsonb;
  current_plan public.meal_plans%rowtype;
  planned public.planned_meals%rowtype;
  actual_date date;
  actual_slot text;
  expected_version integer;
  updated_count integer;
begin
  if log_kind not in ('food', 'meal') or log_kind is null then
    perform private.raise_mutation_error('validation_failed', 'planned log kind must be food or meal');
  end if;
  operation := case when log_kind = 'food' then 'save_nutrition_log' else 'save_reviewed_meal' end;
  -- Honor completed requests made before planned logging had its own claim.
  select mi.result_refs into legacy_refs from public.mutation_idempotency mi
  where mi.user_id = caller_id and mi.idempotency_key = p_payload->>'idempotencyKey'
    and mi.operation in (operation, 'log_provided_recipe') and mi.status = 'completed'
    and mi.request_hash = private.request_hash(p_payload)
    and (
      (log_kind = 'food' and exists (select 1 from public.nutrition_logs nl
        where nl.user_id = caller_id and nl.app_id = mi.result_refs->>'nutrition_log_id'
          and nl.planned_meal_app_id = p_payload->>'plannedMealId'))
      or (log_kind = 'meal' and exists (select 1 from public.logged_meals lm
        where lm.user_id = caller_id and lm.app_id = mi.result_refs->>'logged_meal_id'
          and lm.planned_meal_app_id = p_payload->>'plannedMealId'))
    ) limit 1;
  if legacy_refs is not null then
    return jsonb_build_object('status', 'completed', 'operation', operation, 'replayed', true, 'result_refs', legacy_refs);
  end if;
  -- Keep the original planned intent separate from the logger's normalized payload.
  select * into claim from private.claim_mutation(caller_id, 'log_planned_meal', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', operation, 'replayed', true, 'result_refs', claim.result_refs);
  end if;
  perform private.validate_mutation_payload(operation, p_payload);
  perform private.assert_expected_versions(operation, p_payload, caller_id);
  perform private.assert_saved_meal_access(operation, p_payload, caller_id);
  perform private.assert_workout_log_shape(operation, p_payload);

  perform private.assert_nonblank(p_payload->>'plannedMealId', 'plannedMealId', 128);
  if coalesce(p_payload->>'expectedMealPlanVersion', '') !~ '^[0-9]+$' then
    perform private.raise_mutation_error('validation_failed', 'expected meal plan version must be an integer');
  end if;
  expected_version := (p_payload->>'expectedMealPlanVersion')::integer;
  if log_kind = 'food' then
    actual_date := (p_payload->'entry'->>'date')::date;
    actual_slot := p_payload->'entry'->>'slot';
  else
    perform private.assert_date_key(p_payload->>'date', 'date');
    perform private.assert_enum(p_payload->>'slot', 'slot', array['breakfast','lunch','dinner','snack']);
    actual_date := (p_payload->>'date')::date;
    actual_slot := p_payload->>'slot';
  end if;

  select * into current_plan from public.meal_plans
  where user_id = caller_id
  order by created_at desc, row_id desc limit 1 for update;
  if current_plan.row_id is null then
    perform private.raise_mutation_error('not_found', 'current meal plan not found');
  end if;
  if current_plan.version <> expected_version then
    perform private.raise_stale_version('meal_plan', expected_version, current_plan.version);
  end if;
  select * into planned from public.planned_meals
  where meal_plan_row_id = current_plan.row_id and user_id = caller_id
    and app_id = p_payload->>'plannedMealId'
    and meal_date = actual_date and meal_slot = actual_slot
  for update;
  if planned.row_id is null then
    perform private.raise_mutation_error('not_found', 'planned meal not found for this date and slot');
  end if;
  if log_kind = 'food' then
    if planned.food_row_id is null or not exists (
      select 1 from public.foods f where f.row_id = planned.food_row_id
        and f.app_id = p_payload->'entry'->>'foodId'
    ) then
      perform private.raise_mutation_error('validation_failed', 'logged food does not match planned food');
    end if;
    result := private.save_nutrition_log(p_payload);
    update public.nutrition_logs
    set planned_meal_app_id = planned.app_id
    where user_id = caller_id and app_id = result->'result_refs'->>'nutrition_log_id';
  else
    if planned.meal_row_id is null or not exists (
      select 1 from public.meals m where m.row_id = planned.meal_row_id
        and m.app_id = p_payload->'meal'->>'id'
    ) then
      perform private.raise_mutation_error('validation_failed', 'logged meal does not match planned meal');
    end if;
    result := private.save_reviewed_meal(p_payload);
    update public.logged_meals
    set planned_meal_app_id = planned.app_id
    where user_id = caller_id and app_id = result->'result_refs'->>'logged_meal_id';
  end if;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    perform private.raise_mutation_error('not_found', 'saved entry for planned meal was not found');
  end if;
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$$;

revoke all on function private.log_planned_meal(jsonb) from public, anon, authenticated;
notify pgrst, 'reload schema';

