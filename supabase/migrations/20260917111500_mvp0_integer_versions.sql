-- Expected versions are integer counters. Reject decimal or exponent-shaped
-- values before PostgreSQL can round them during an integer cast.

create or replace function private.assert_expected_versions(
  p_operation text,
  p_payload jsonb,
  p_user_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  expected jsonb := coalesce(p_payload->'expectedVersions', '{}'::jsonb);
  actual_profile integer;
  actual_goal integer;
  actual_target integer;
  actual_workout integer;
  actual_meal integer;
  actual_grocery integer;
  actual_record integer;
  record_id text;
  version_key text;
begin
  if p_operation is null or btrim(p_operation) = '' then
    perform private.raise_mutation_error('validation_failed', 'operation is required');
  end if;

  for version_key in select entry.key from jsonb_each(expected) as entry
  loop
    if (expected->>version_key) !~ '^\d+$' then
      perform private.raise_mutation_error('validation_failed', version_key || ' must be an integer');
    end if;
  end loop;

  -- Stable lock order: profile, goal, target, workout plan, meal plan,
  -- grocery list, then a directly edited child record.
  select revision into actual_profile
  from public.profiles where id = p_user_id for update;
  if expected ? 'profileRevision' and actual_profile is not null
     and (expected->>'profileRevision')::integer <> actual_profile then
    perform private.raise_stale_version('profile', (expected->>'profileRevision')::integer, actual_profile);
  end if;

  select version into actual_goal
  from public.goals where user_id = p_user_id and status = 'active' and is_primary
  order by version desc limit 1 for update;
  if expected ? 'goalVersion' and actual_goal is not null
     and (expected->>'goalVersion')::integer <> actual_goal then
    perform private.raise_stale_version('goal', (expected->>'goalVersion')::integer, actual_goal);
  end if;

  select version into actual_target
  from public.daily_targets where user_id = p_user_id
  order by version desc limit 1 for update;
  if expected ? 'targetVersion' and actual_target is not null
     and (expected->>'targetVersion')::integer <> actual_target then
    perform private.raise_stale_version('target', (expected->>'targetVersion')::integer, actual_target);
  end if;

  select version into actual_workout
  from public.workout_plans where user_id = p_user_id
  order by created_at desc, row_id desc limit 1 for update;
  if expected ? 'workoutPlanVersion' and actual_workout is not null
     and (expected->>'workoutPlanVersion')::integer <> actual_workout then
    perform private.raise_stale_version('workout_plan', (expected->>'workoutPlanVersion')::integer, actual_workout);
  end if;

  select version into actual_meal
  from public.meal_plans where user_id = p_user_id
  order by created_at desc, row_id desc limit 1 for update;
  if expected ? 'mealPlanVersion' and actual_meal is not null
     and (expected->>'mealPlanVersion')::integer <> actual_meal then
    perform private.raise_stale_version('meal_plan', (expected->>'mealPlanVersion')::integer, actual_meal);
  end if;

  select revision into actual_grocery
  from public.grocery_lists where user_id = p_user_id
  order by week_of desc, row_id desc limit 1 for update;
  if expected ? 'groceryRevision' and actual_grocery is not null
     and (expected->>'groceryRevision')::integer <> actual_grocery then
    perform private.raise_stale_version('grocery', (expected->>'groceryRevision')::integer, actual_grocery);
  end if;

  record_id := nullif(p_payload->>'nutritionLogId', '');
  if record_id is not null then
    select revision into actual_record
    from public.nutrition_logs
    where user_id = p_user_id and app_id = record_id
    for update;
    if expected ? 'recordRevision' and actual_record is not null
       and (expected->>'recordRevision')::integer <> actual_record then
      perform private.raise_stale_version('nutrition_record', (expected->>'recordRevision')::integer, actual_record);
    end if;
  end if;
end;
$$;

revoke all on function private.assert_expected_versions(text, jsonb, uuid)
  from public, anon, authenticated;
