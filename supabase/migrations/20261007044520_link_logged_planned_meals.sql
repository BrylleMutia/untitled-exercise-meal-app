-- A consumed plan item remains in its versioned plan. The optional stable app
-- id records which intake entry came from that item without tying history to
-- one version's planned_meals row.
alter table public.nutrition_logs
  add column planned_meal_app_id text;
alter table public.logged_meals
  add column planned_meal_app_id text;

alter table public.nutrition_logs
  add constraint nutrition_logs_planned_meal_app_id_not_blank
  check (planned_meal_app_id is null or btrim(planned_meal_app_id) <> '');
alter table public.logged_meals
  add constraint logged_meals_planned_meal_app_id_not_blank
  check (planned_meal_app_id is null or btrim(planned_meal_app_id) <> '');

create index nutrition_logs_planned_meal_link_idx
  on public.nutrition_logs (user_id, planned_meal_app_id)
  where planned_meal_app_id is not null;
create index logged_meals_planned_meal_link_idx
  on public.logged_meals (user_id, planned_meal_app_id)
  where planned_meal_app_id is not null;

-- Historical records lack an explicit origin. Pair only a unique exact food
-- or recipe reference in the same date and slot of that week's latest plan.
with current_plans as (
  select distinct on (user_id, week_of) row_id, user_id, week_of
  from public.meal_plans
  order by user_id, week_of, version desc, row_id desc
), food_pairs as (
  select pm.app_id, nl.row_id as log_row_id,
    count(*) over (partition by pm.row_id) as log_matches,
    count(*) over (partition by nl.row_id) as plan_matches
  from current_plans cp
  join public.planned_meals pm on pm.meal_plan_row_id = cp.row_id
  join public.nutrition_logs nl
    on nl.user_id = pm.user_id and nl.log_date = pm.meal_date
    and nl.meal_slot = pm.meal_slot and nl.food_row_id = pm.food_row_id
  where pm.food_row_id is not null and nl.logged_meal_row_id is null
    and nl.planned_meal_app_id is null
)
update public.nutrition_logs nl
set planned_meal_app_id = pairs.app_id
from food_pairs pairs
where nl.row_id = pairs.log_row_id
  and pairs.log_matches = 1 and pairs.plan_matches = 1;

with current_plans as (
  select distinct on (user_id, week_of) row_id, user_id, week_of
  from public.meal_plans
  order by user_id, week_of, version desc, row_id desc
), meal_pairs as (
  select pm.app_id, lm.row_id as log_row_id,
    count(*) over (partition by pm.row_id) as log_matches,
    count(*) over (partition by lm.row_id) as plan_matches
  from current_plans cp
  join public.planned_meals pm on pm.meal_plan_row_id = cp.row_id
  join public.logged_meals lm
    on lm.user_id = pm.user_id and lm.log_date = pm.meal_date
    and lm.meal_slot = pm.meal_slot and lm.meal_row_id = pm.meal_row_id
  where pm.meal_row_id is not null and lm.planned_meal_app_id is null
)
update public.logged_meals lm
set planned_meal_app_id = pairs.app_id
from meal_pairs pairs
where lm.row_id = pairs.log_row_id
  and pairs.log_matches = 1 and pairs.plan_matches = 1;

create function private.log_planned_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  log_kind text := p_payload->>'kind';
  operation text;
  replay jsonb;
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
  replay := private.preflight_mutation(operation, p_payload);
  if replay is not null then return replay; end if;

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
  return result;
end;
$$;

create function public.log_planned_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin return private.log_planned_meal(p_payload); end; $$;

revoke all on function private.log_planned_meal(jsonb) from public, anon, authenticated;
revoke all on function public.log_planned_meal(jsonb) from public, anon;
grant execute on function public.log_planned_meal(jsonb) to authenticated;
