-- Selected-week grocery controls preserve ownership, retries and other weeks.
create or replace function private.validate_mutation_payload(
  p_operation text,
  p_payload jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  entry jsonb;
  session_data jsonb;
  log_record jsonb;
  meal_data jsonb;
  ingredient jsonb;
  versions jsonb;
  version_key text;
  version_value jsonb;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    perform private.raise_mutation_error('validation_failed', 'payload must be an object');
  end if;
  if nullif(btrim(p_payload->>'idempotencyKey'), '') is null then
    perform private.raise_mutation_error('validation_failed', 'idempotencyKey is required');
  end if;

  versions := coalesce(p_payload->'expectedVersions', '{}'::jsonb);
  perform private.assert_json_shape(versions, 'expectedVersions', 'object');
  for version_key, version_value in select key, value from jsonb_each(versions)
  loop
    if version_key not in ('profileRevision', 'goalVersion', 'targetVersion', 'workoutPlanVersion', 'mealPlanVersion', 'groceryRevision', 'recordRevision') then
      perform private.raise_mutation_error('validation_failed', 'unknown expected version field');
    end if;
    perform private.assert_finite_number(version_value #>> '{}', version_key, case when version_key='groceryRevision' and p_operation='add_custom_grocery_item' and p_payload ? 'weekOf' then 0 else 1 end, 2147483647);
  end loop;

  if p_operation in ('complete_onboarding', 'update_profile', 'update_units', 'reset_plan', 'skip_planned_meal') then
    if jsonb_typeof(profile_data) <> 'object' or profile_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'profile is required');
    end if;
    if nullif(btrim(profile_data->>'name'), '') is null then
      perform private.raise_mutation_error('validation_failed', 'profile name is required');
    end if;
    perform private.assert_finite_number(profile_data->>'age', 'age', 18, 100);
    perform private.assert_finite_number(profile_data->>'heightCm', 'heightCm', 120, 230);
    perform private.assert_finite_number(profile_data->>'weightKg', 'weightKg', 35, 300);
    perform private.assert_finite_number(profile_data->>'daysPerWeek', 'daysPerWeek', 1, 7);
    perform private.assert_finite_number(profile_data->>'sessionMinutes', 'sessionMinutes', 15, 120);
    perform private.assert_enum(profile_data->>'sex', 'sex', array['female', 'male']);
    perform private.assert_enum(profile_data->>'units', 'units', array['metric', 'imperial']);
    perform private.assert_enum(profile_data->>'experience', 'experience', array['beginner', 'intermediate', 'advanced']);
    perform private.assert_enum(profile_data->>'goal', 'goal', array['lose', 'maintain', 'gain', 'strength', 'consistency']);
    perform private.assert_json_shape(coalesce(profile_data->'equipment', '[]'::jsonb), 'equipment', 'array');
    perform private.assert_json_shape(coalesce(profile_data->'allergies', '[]'::jsonb), 'allergies', 'array');
    perform private.assert_json_shape(coalesce(profile_data->'foodPreferences', '[]'::jsonb), 'foodPreferences', 'array');
    if p_payload ? 'effectiveDate' then perform private.assert_date_key(p_payload->>'effectiveDate', 'effectiveDate'); end if;
    if nullif(p_payload->>'targetDate', '') is not null then perform private.assert_date_key(p_payload->>'targetDate', 'targetDate'); end if;
    if profile_data ? 'targetEligibility' then
      perform private.assert_enum(profile_data->>'targetEligibility', 'targetEligibility', array['eligible', 'unsupported', 'not_answered']);
    end if;
    if profile_data ? 'eligibilityVersion' then perform private.assert_nonblank(profile_data->>'eligibilityVersion', 'eligibilityVersion', 64); end if;
    if profile_data ? 'cookingTimeMinutes' and nullif(profile_data->>'cookingTimeMinutes', '') is not null then
      perform private.assert_finite_number(profile_data->>'cookingTimeMinutes', 'cookingTimeMinutes', 1, 240);
    end if;
    if profile_data ? 'mealBudget' and nullif(profile_data->>'mealBudget', '') is not null then
      perform private.assert_finite_number(profile_data->>'mealBudget', 'mealBudget', 0, 1000000);
    end if;
    if coalesce(profile_data->>'targetEligibility', 'eligible') <> 'eligible'
       and not (p_operation in ('complete_onboarding', 'update_profile')
                and profile_data->>'targetEligibility' = 'unsupported') then
      perform private.raise_mutation_error('validation_failed', 'automated targets require an eligible adult screening result');
    end if;
  elsif p_operation in ('save_nutrition_log', 'log_saved_meal') then
    if p_operation = 'save_nutrition_log' then
      entry := coalesce(p_payload->'entry', '{}'::jsonb);
      if entry = '{}'::jsonb then perform private.raise_mutation_error('validation_failed', 'entry is required'); end if;
      perform private.assert_date_key(entry->>'date', 'entry.date');
      perform private.assert_finite_number(entry->>'servings', 'entry.servings', 0.0001, 10000);
      perform private.assert_finite_number(entry->>'calories', 'entry.calories', 0, 1000000);
      perform private.assert_finite_number(entry->>'proteinG', 'entry.proteinG', 0, 100000);
      perform private.assert_finite_number(entry->>'carbsG', 'entry.carbsG', 0, 100000);
      perform private.assert_finite_number(entry->>'fatG', 'entry.fatG', 0, 100000);
      perform private.assert_enum(entry->>'slot', 'entry.slot', array['breakfast', 'lunch', 'dinner', 'snack']);
      if entry ? 'servingUnit' then perform private.assert_enum(entry->>'servingUnit', 'entry.servingUnit', array['g', 'piece', 'serving', 'ml', 'custom']); end if;
      if entry ? 'confidence' then perform private.assert_enum(entry->>'confidence', 'entry.confidence', array['high', 'medium', 'low']); end if;
      perform private.assert_nonblank(coalesce(entry->>'source', 'User-provided'), 'entry.source', 256);
    else
      if jsonb_typeof(p_payload->'entries') <> 'array' or jsonb_array_length(p_payload->'entries') = 0 then
        perform private.raise_mutation_error('validation_failed', 'entries are required');
      end if;
      for entry in select value from jsonb_array_elements(p_payload->'entries')
      loop
        perform private.assert_json_shape(entry, 'meal entry', 'object');
        perform private.assert_nonblank(entry->>'id', 'meal entry id', 128);
        perform private.assert_date_key(entry->>'date', 'meal entry date');
        perform private.assert_enum(entry->>'slot', 'meal entry slot', array['breakfast', 'lunch', 'dinner', 'snack']);
        perform private.assert_finite_number(entry->>'servings', 'meal entry servings', 0.0001, 10000);
        perform private.assert_finite_number(entry->>'calories', 'meal entry calories', 0, 1000000);
        perform private.assert_finite_number(entry->>'proteinG', 'meal entry proteinG', 0, 100000);
        perform private.assert_finite_number(entry->>'carbsG', 'meal entry carbsG', 0, 100000);
        perform private.assert_finite_number(entry->>'fatG', 'meal entry fatG', 0, 100000);
      end loop;
    end if;
  elsif p_operation = 'save_weight_entry' then
    perform private.assert_date_key(p_payload->'entry'->>'date', 'entry.date');
    perform private.assert_finite_number(p_payload->'entry'->>'weightKg', 'entry.weightKg', 35, 300);
  elsif p_operation in ('toggle_grocery_item', 'set_grocery_quantity', 'remove_grocery_item') then
    if nullif(btrim(p_payload->>'itemId'), '') is null then perform private.raise_mutation_error('validation_failed', 'itemId is required'); end if;
    if p_operation = 'set_grocery_quantity' then perform private.assert_finite_number(p_payload->>'quantity', 'quantity', 0, 1000000); end if;
  elsif p_operation = 'add_custom_grocery_item' then
    if nullif(btrim(p_payload->'item'->>'name'), '') is null then perform private.raise_mutation_error('validation_failed', 'custom item name is required'); end if;
    perform private.assert_finite_number(p_payload->'item'->>'quantity', 'quantity', 0, 1000000);
    perform private.assert_nonblank(p_payload->'item'->>'unit', 'unit', 64);
  elsif p_operation = 'delete_nutrition_log' then
    if nullif(btrim(p_payload->>'nutritionLogId'), '') is null then perform private.raise_mutation_error('validation_failed', 'nutritionLogId is required'); end if;
  elsif p_operation = 'apply_workout_override' then
    if nullif(btrim(p_payload->>'slotKey'), '') is null or nullif(btrim(p_payload->>'plannedExerciseId'), '') is null then
      perform private.raise_mutation_error('validation_failed', 'slotKey and plannedExerciseId are required');
    end if;
    if p_payload ? 'sets' then perform private.assert_finite_number(p_payload->>'sets', 'sets', 1, 100); end if;
    if p_payload ? 'reps' then perform private.assert_finite_number(p_payload->>'reps', 'reps', 1, 1000); end if;
    if p_payload ? 'holdSeconds' then perform private.assert_finite_number(p_payload->>'holdSeconds', 'holdSeconds', 1, 3600); end if;
    if p_payload ? 'restSeconds' then perform private.assert_finite_number(p_payload->>'restSeconds', 'restSeconds', 0, 3600); end if;
  elsif p_operation in ('start_workout_session', 'save_workout_session', 'finish_workout_session', 'abandon_workout_session') then
    session_data := coalesce(p_payload->'session', '{}'::jsonb);
    perform private.assert_json_shape(session_data, 'session', 'object');
    perform private.assert_nonblank(session_data->>'id', 'session.id', 128);
    if p_operation = 'start_workout_session' then
      perform private.assert_nonblank(session_data->>'plannedWorkoutId', 'session.plannedWorkoutId', 128);
      perform private.assert_date_key(session_data->>'date', 'session.date');
      perform private.assert_nonblank(session_data->>'startedAt', 'session.startedAt', 64);
    end if;
    if p_operation in ('save_workout_session', 'finish_workout_session') then
      perform private.assert_json_shape(session_data->'logs', 'session.logs', 'array');
      for log_record in select value from jsonb_array_elements(session_data->'logs')
      loop
        perform private.assert_json_shape(log_record, 'exercise log', 'object');
        perform private.assert_nonblank(coalesce(log_record->>'plannedExerciseId', log_record->>'exerciseId'), 'exercise log exercise id', 128);
        perform private.assert_enum(coalesce(log_record->>'status', 'completed'), 'exercise log status', array['completed', 'skipped', 'modified']);
        if log_record ? 'rpe' and nullif(log_record->>'rpe', '') is not null then perform private.assert_finite_number(log_record->>'rpe', 'exercise log rpe', 1, 10); end if;
        if log_record->'actual' is not null and jsonb_typeof(log_record->'actual') = 'object' then
          if log_record->'actual' ? 'sets' and nullif(log_record->'actual'->>'sets', '') is not null then perform private.assert_finite_number(log_record->'actual'->>'sets', 'exercise log sets', 0, 10); end if;
          if log_record->'actual' ? 'reps' and nullif(log_record->'actual'->>'reps', '') is not null then perform private.assert_finite_number(log_record->'actual'->>'reps', 'exercise log reps', 0, 1000); end if;
          if log_record->'actual' ? 'holdSeconds' and nullif(log_record->'actual'->>'holdSeconds', '') is not null then perform private.assert_finite_number(log_record->'actual'->>'holdSeconds', 'exercise log holdSeconds', 0, 3600); end if;
        end if;
      end loop;
    end if;
  elsif p_operation in ('save_saved_meal', 'save_recipe') then
    meal_data := coalesce(p_payload->'meal', '{}'::jsonb);
    perform private.assert_json_shape(meal_data, 'meal', 'object');
    perform private.assert_nonblank(meal_data->>'id', 'meal.id', 128);
    perform private.assert_nonblank(meal_data->>'name', 'meal.name', 256);
    perform private.assert_finite_number(meal_data->>'servings', 'meal.servings', 0.0001, 10000);
    perform private.assert_json_shape(meal_data->'ingredients', 'meal.ingredients', 'array');
    if jsonb_array_length(meal_data->'ingredients') = 0 then perform private.raise_mutation_error('validation_failed', 'meal ingredients are required'); end if;
    for ingredient in select value from jsonb_array_elements(meal_data->'ingredients')
    loop
      perform private.assert_json_shape(ingredient, 'meal ingredient', 'object');
      perform private.assert_nonblank(ingredient->>'foodId', 'meal ingredient foodId', 128);
      perform private.assert_finite_number(ingredient->>'servings', 'meal ingredient servings', 0.0001, 10000);
    end loop;
  end if;
end;
$$;

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

  if p_operation in ('toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery') and p_payload ? 'weekOf' then
    perform private.assert_date_key(p_payload->>'weekOf','weekOf');
    if extract(isodow from (p_payload->>'weekOf')::date) <> 1 or p_payload->'grocery'->>'weekOf' is distinct from p_payload->>'weekOf' then
      perform private.raise_mutation_error('validation_failed','Choose one matching Monday grocery week');
    end if;
    perform private.assert_nonblank(p_payload->'grocery'->>'id','grocery.id',128);
    if coalesce(expected->>'groceryRevision','') !~ '^\d+$' then perform private.raise_mutation_error('validation_failed','Grocery revision is required'); end if;
  end if;

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
    and (p_operation <> 'regenerate_grocery' or p_payload->>'weekOf' is null or week_of=(p_payload->>'weekOf')::date)
  order by created_at desc, row_id desc limit 1 for update;
  if expected ? 'mealPlanVersion' and actual_meal is not null
     and (expected->>'mealPlanVersion')::integer <> actual_meal then
    perform private.raise_stale_version('meal_plan', (expected->>'mealPlanVersion')::integer, actual_meal);
  end if;

  select revision into actual_grocery
  from public.grocery_lists where user_id = p_user_id
    and (p_operation not in ('save_recipe','save_saved_meal','toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery')
      or p_payload->'grocery'->>'weekOf' is null
      or week_of=(p_payload->'grocery'->>'weekOf')::date)
  order by week_of desc, row_id desc limit 1 for update;
  if expected ? 'groceryRevision' and (actual_grocery is not null or p_operation in ('toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery') and p_payload ? 'weekOf')
     and (expected->>'groceryRevision')::integer <> coalesce(actual_grocery,0) then
    perform private.raise_stale_version('grocery', (expected->>'groceryRevision')::integer, coalesce(actual_grocery,0));
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

create or replace function private.toggle_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'toggle_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'toggle_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    update public.grocery_items
    set checked = not checked
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id = (select row_id from public.grocery_lists where user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;
    update public.grocery_lists set updated_at=now() where user_id=caller_id and row_id=(select row_id from public.grocery_lists where user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);

    result := jsonb_build_object('status', 'completed', 'operation', 'toggle_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.set_grocery_quantity(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  item_quantity numeric := (p_payload->>'quantity')::numeric;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'set_grocery_quantity', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'set_grocery_quantity', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    if item_quantity < 0 then
      perform private.raise_mutation_error('validation_failed', 'quantity must be non-negative');
    end if;
    update public.grocery_items
    set quantity = item_quantity
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id = (select row_id from public.grocery_lists where user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;
    update public.grocery_lists set updated_at=now() where user_id=caller_id and row_id=(select row_id from public.grocery_lists where user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);

    result := jsonb_build_object('status', 'completed', 'operation', 'set_grocery_quantity', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.remove_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'remove_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'remove_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    update public.grocery_items
    set removed = true
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id = (select row_id from public.grocery_lists where user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;
    update public.grocery_lists set updated_at=now() where user_id=caller_id and row_id=(select row_id from public.grocery_lists where user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);

    result := jsonb_build_object('status', 'completed', 'operation', 'remove_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.add_custom_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  grocery jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  item jsonb := coalesce(p_payload->'item', '{}'::jsonb);
  grocery_row_id bigint;
  item_id text := item->>'id';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'add_custom_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'add_custom_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    select row_id into grocery_row_id
    from public.grocery_lists
    where user_id = caller_id
      and (nullif(grocery->>'id','') is not null or nullif(grocery->>'weekOf','') is not null) and (nullif(grocery->>'id','') is null or app_id=grocery->>'id') and (nullif(grocery->>'weekOf','') is null or week_of=(grocery->>'weekOf')::date)
    order by row_id desc
    limit 1
    for update;
    if grocery_row_id is null and p_payload ? 'weekOf' then
      insert into public.grocery_lists(app_id,user_id,week_of) values(grocery->>'id',caller_id,(grocery->>'weekOf')::date) returning row_id into grocery_row_id;
    end if;
    if grocery_row_id is null then
      perform private.raise_mutation_error('not_found', 'grocery list not found');
    end if;

    insert into public.grocery_items (
      grocery_list_row_id, user_id, app_id, name, category, unit,
      generated_quantity, quantity, checked, custom_item, removed
    )
    values (
      grocery_row_id, caller_id, item_id, btrim(item->>'name'),
      coalesce(item->>'category', 'Other'), btrim(item->>'unit'),
      (item->>'quantity')::numeric(12,3), (item->>'quantity')::numeric(12,3),
      false, true, false
    );
    update public.grocery_lists set updated_at = now() where row_id = grocery_row_id and user_id = caller_id;

    result := jsonb_build_object('status', 'completed', 'operation', 'add_custom_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id, 'grocery_list_id', grocery->>'id'));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.regenerate_grocery(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  grocery jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  item jsonb;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  new_generated_quantity numeric;
  next_quantity numeric;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'regenerate_grocery',
    p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', 'regenerate_grocery',
      'replayed', true, 'result_refs', claim.result_refs
    );
  end if;

  begin
    select row_id into grocery_row_id
    from public.grocery_lists
    where user_id = caller_id
      and (
        (nullif(grocery->>'id','') is not null or nullif(grocery->>'weekOf','') is not null) and (nullif(grocery->>'id','') is null or app_id=grocery->>'id') and (nullif(grocery->>'weekOf','') is null or week_of=(grocery->>'weekOf')::date)
      )
    order by row_id desc
    limit 1
    for update;

    if grocery_row_id is null then
      perform private.raise_mutation_error('not_found', 'grocery list not found');
    end if;

    if p_payload ? 'weekOf' then
      -- Sum only the selected week's latest plan; nutrition servings remain canonical.
      with selected_plan as (
        select row_id from public.meal_plans where user_id=caller_id and week_of=(p_payload->>'weekOf')::date order by version desc,row_id desc limit 1
      ), quantities as (
        select i.food_row_id, i.servings * p.servings / m.servings amount
        from public.planned_meals p join selected_plan s on s.row_id=p.meal_plan_row_id
        join public.meals m on m.row_id=p.meal_row_id join public.meal_ingredients i on i.meal_row_id=m.row_id
        where p.user_id=caller_id and not p.skipped
        union all
        select p.food_row_id,p.servings from public.planned_meals p join selected_plan s on s.row_id=p.meal_plan_row_id
        where p.user_id=caller_id and not p.skipped and p.food_row_id is not null
      ), totals as (
        select food_row_id,sum(amount) amount from quantities group by food_row_id
      ) select jsonb_set(grocery,'{items}',coalesce(jsonb_agg(jsonb_build_object(
        'id','gi-' || f.app_id,'foodId',f.app_id,'name',f.name,'category',f.category,
        'unit',case when f.serving_unit='piece' then 'pcs' else 'g' end,
        'generatedQuantity',case when f.serving_unit='piece' then ceil(t.amount) else round(t.amount*f.serving_grams) end,
        'quantity',case when f.serving_unit='piece' then ceil(t.amount) else round(t.amount*f.serving_grams) end
      ) order by f.app_id),'[]'::jsonb),true) into grocery
      from totals t join public.foods f on f.row_id=t.food_row_id;
    end if;

    for item in
      select value from jsonb_array_elements(coalesce(grocery->'items', '[]'::jsonb))
    loop
      new_generated_quantity := (item->>'generatedQuantity')::numeric(12,3);
      select *
      into previous_item
      from public.grocery_items
      where grocery_list_row_id = grocery_row_id
        and app_id = item->>'id'
      for update;

      if previous_item.row_id is null then
        next_quantity := coalesce(
          nullif(item->>'quantity', '')::numeric,
          new_generated_quantity
        );
        insert into public.grocery_items (
          grocery_list_row_id, user_id, app_id, name, category, unit,
          generated_quantity, quantity, checked, custom_item, removed,
          source_food_row_id
        )
        values (
          grocery_row_id,
          caller_id,
          item->>'id',
          btrim(item->>'name'),
          item->>'category',
          btrim(item->>'unit'),
          new_generated_quantity,
          next_quantity,
          coalesce((item->>'checked')::boolean, false),
          coalesce((item->>'custom')::boolean, false),
          coalesce((item->>'removed')::boolean, false),
          (select f.row_id from public.foods f where f.app_id = item->>'foodId')
        );
      else
        next_quantity := case
          when previous_item.quantity = previous_item.generated_quantity
            then new_generated_quantity
          else previous_item.quantity
        end;
        update public.grocery_items
        set generated_quantity = new_generated_quantity,
            quantity = next_quantity
        where row_id = previous_item.row_id
          and user_id = caller_id;
      end if;
    end loop;

    perform private.reconcile_grocery_items(caller_id,grocery);
    update public.grocery_lists
    set updated_at = now()
    where row_id = grocery_row_id and user_id = caller_id;

    result := jsonb_build_object(
      'status', 'completed', 'operation', 'regenerate_grocery',
      'result_refs', jsonb_build_object('grocery_list_id', grocery->>'id')
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

revoke all on function private.validate_mutation_payload(text,jsonb) from public,anon,authenticated;
grant execute on function private.validate_mutation_payload(text,jsonb) to postgres;
revoke all on function private.assert_expected_versions(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.assert_expected_versions(text,jsonb,uuid) to postgres;
revoke all on function private.toggle_grocery_item(jsonb) from public,anon,authenticated;
grant execute on function private.toggle_grocery_item(jsonb) to postgres;
revoke all on function private.set_grocery_quantity(jsonb) from public,anon,authenticated;
grant execute on function private.set_grocery_quantity(jsonb) to postgres;
revoke all on function private.remove_grocery_item(jsonb) from public,anon,authenticated;
grant execute on function private.remove_grocery_item(jsonb) to postgres;
revoke all on function private.add_custom_grocery_item(jsonb) from public,anon,authenticated;
grant execute on function private.add_custom_grocery_item(jsonb) to postgres;
revoke all on function private.regenerate_grocery(jsonb) from public,anon,authenticated;
grant execute on function private.regenerate_grocery(jsonb) to postgres;
