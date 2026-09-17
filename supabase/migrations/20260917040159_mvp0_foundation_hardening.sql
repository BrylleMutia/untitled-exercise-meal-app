-- MVP-0 foundation: forward-only revisions, health eligibility metadata,
-- reusable validation, and stale-edit preflight for authenticated mutations.
-- This migration is local/staging ready; no linked project is changed here.

alter table public.profiles
  add column if not exists revision integer not null default 1,
  add column if not exists eligibility_status text not null default 'eligible',
  add column if not exists eligibility_version text not null default 'calicoach-eligibility-v1';

alter table public.daily_targets
  add column if not exists calculation_version text not null default 'calicoach-health-v1',
  add column if not exists raw_calories numeric(10, 2),
  add column if not exists goal_adjustment numeric(5, 3) not null default 0,
  add column if not exists safety_outcome text not null default 'supported';

alter table public.meals
  add column if not exists revision integer not null default 1,
  add column if not exists archived_at timestamptz;

alter table public.nutrition_logs
  add column if not exists revision integer not null default 1;

alter table public.grocery_lists
  add column if not exists revision integer not null default 1;

update public.daily_targets
set raw_calories = calories
where raw_calories is null;

alter table public.daily_targets
  alter column raw_calories set default 0,
  alter column raw_calories set not null;

alter table public.profiles
  add constraint profiles_revision_check check (revision >= 1),
  add constraint profiles_eligibility_status_check check (eligibility_status in ('eligible', 'unsupported', 'not_answered')),
  add constraint profiles_eligibility_version_check check (btrim(eligibility_version) <> '');

alter table public.daily_targets
  add constraint daily_targets_calculation_version_check check (btrim(calculation_version) <> ''),
  add constraint daily_targets_raw_calories_check check (raw_calories >= 0),
  add constraint daily_targets_safety_outcome_check check (safety_outcome in ('supported', 'below_floor', 'unsupported_population'));

alter table public.meals
  add constraint meals_revision_check check (revision >= 1);
alter table public.nutrition_logs
  add constraint nutrition_logs_revision_check check (revision >= 1);
alter table public.grocery_lists
  add constraint grocery_lists_revision_check check (revision >= 1);

create or replace function private.bump_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists profiles_bump_revision on public.profiles;
create trigger profiles_bump_revision
before update on public.profiles
for each row execute function private.bump_revision();

drop trigger if exists meals_bump_revision on public.meals;
create trigger meals_bump_revision
before update on public.meals
for each row execute function private.bump_revision();

drop trigger if exists nutrition_logs_bump_revision on public.nutrition_logs;
create trigger nutrition_logs_bump_revision
before update on public.nutrition_logs
for each row execute function private.bump_revision();

drop trigger if exists grocery_lists_bump_revision on public.grocery_lists;
create trigger grocery_lists_bump_revision
before update on public.grocery_lists
for each row execute function private.bump_revision();

create or replace function private.raise_stale_version(
  p_entity text,
  p_expected integer,
  p_actual integer
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    message = 'stale_version',
    detail = jsonb_build_object(
      'entity', p_entity,
      'expected', p_expected,
      'actual', p_actual,
      'refreshedSnapshotAvailable', true
    )::text;
end;
$$;

create or replace function private.assert_finite_number(
  p_value text,
  p_field text,
  p_min numeric default null,
  p_max numeric default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  parsed numeric;
begin
  if p_value is null or btrim(p_value) = '' then
    perform private.raise_mutation_error('validation_failed', p_field || ' is required');
  end if;
  if lower(btrim(p_value)) in ('nan', '+nan', '-nan', 'infinity', '+infinity', '-infinity') then
    perform private.raise_mutation_error('validation_failed', p_field || ' must be finite');
  end if;
  begin
    parsed := p_value::numeric;
  exception when others then
    perform private.raise_mutation_error('validation_failed', p_field || ' must be numeric');
  end;
  if p_min is not null and parsed < p_min then
    perform private.raise_mutation_error('validation_failed', p_field || ' is below the supported range');
  end if;
  if p_max is not null and parsed > p_max then
    perform private.raise_mutation_error('validation_failed', p_field || ' is above the supported range');
  end if;
end;
$$;

create or replace function private.assert_date_key(p_value text, p_field text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    perform private.raise_mutation_error('validation_failed', p_field || ' must use YYYY-MM-DD');
  end if;
  begin
    perform p_value::date;
  exception when others then
    perform private.raise_mutation_error('validation_failed', p_field || ' is not a valid date');
  end;
end;
$$;

create or replace function private.assert_nonblank(
  p_value text,
  p_field text,
  p_max_length integer default 255
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    perform private.raise_mutation_error('validation_failed', p_field || ' is required');
  end if;
  if char_length(p_value) > p_max_length then
    perform private.raise_mutation_error('validation_failed', p_field || ' is too long');
  end if;
end;
$$;

create or replace function private.assert_enum(
  p_value text,
  p_field text,
  p_allowed text[]
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_nonblank(p_value, p_field, 64);
  if not (p_value = any(p_allowed)) then
    perform private.raise_mutation_error('validation_failed', p_field || ' is not supported');
  end if;
end;
$$;

create or replace function private.assert_json_shape(
  p_value jsonb,
  p_field text,
  p_expected text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from p_expected then
    perform private.raise_mutation_error('validation_failed', p_field || ' must be a JSON ' || p_expected);
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
begin
  if p_operation is null or btrim(p_operation) = '' then
    perform private.raise_mutation_error('validation_failed', 'operation is required');
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
    perform private.assert_finite_number(version_value #>> '{}', version_key, 1, 2147483647);
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

create or replace function private.preflight_mutation(
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
begin
  caller_id := private.require_authenticated();
  select * into claim from private.claim_mutation(
    caller_id, p_operation, p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', p_operation, 'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;
  perform private.validate_mutation_payload(p_operation, p_payload);
  perform private.assert_expected_versions(p_operation, p_payload, caller_id);
  return null;
end;
$$;

create or replace function private.persist_profile_health_metadata(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  target_data jsonb := coalesce(p_payload->'target', '{}'::jsonb);
begin
  update public.profiles
  set eligibility_status = coalesce(nullif(profile_data->>'targetEligibility', ''), 'eligible'),
      eligibility_version = coalesce(nullif(profile_data->>'eligibilityVersion', ''), 'calicoach-eligibility-v1')
  where id = caller_id
    and (
      eligibility_status is distinct from coalesce(nullif(profile_data->>'targetEligibility', ''), 'eligible')
      or eligibility_version is distinct from coalesce(nullif(profile_data->>'eligibilityVersion', ''), 'calicoach-eligibility-v1')
    );
  update public.daily_targets
  set calculation_version = coalesce(nullif(target_data->>'calculationVersion', ''), 'calicoach-health-v1'),
      raw_calories = coalesce(nullif(target_data->>'rawCalories', '')::numeric, calories),
      goal_adjustment = coalesce(nullif(target_data->>'goalAdjustment', '')::numeric, 0),
      safety_outcome = coalesce(nullif(target_data->>'safetyOutcome', ''), 'supported')
  where user_id = caller_id
    and app_id = target_data->>'id';
end;
$$;

-- Unsupported health situations may keep an authenticated profile for manual
-- logging, but they must never create automated target or plan rows.
create or replace function private.persist_profile_only(
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, p_operation, p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', p_operation,
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    insert into public.profiles (
      id, name, age, sex, height_cm, weight_kg, units, experience,
      equipment, days_per_week, session_minutes, goal, dietary_pattern,
      allergies, food_preferences, cooking_time_minutes, meal_budget,
      eligibility_status, eligibility_version
    )
    values (
      caller_id,
      btrim(coalesce(profile_data->>'name', '')),
      (profile_data->>'age')::smallint,
      profile_data->>'sex',
      (profile_data->>'heightCm')::numeric(5,2),
      (profile_data->>'weightKg')::numeric(6,2),
      profile_data->>'units',
      profile_data->>'experience',
      array(select jsonb_array_elements_text(coalesce(profile_data->'equipment', '[]'::jsonb))),
      (profile_data->>'daysPerWeek')::smallint,
      (profile_data->>'sessionMinutes')::smallint,
      profile_data->>'goal',
      coalesce(profile_data->>'dietaryPattern', ''),
      array(select jsonb_array_elements_text(coalesce(profile_data->'allergies', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(profile_data->'foodPreferences', '[]'::jsonb))),
      nullif(profile_data->>'cookingTimeMinutes', '')::smallint,
      nullif(profile_data->>'mealBudget', '')::numeric(10,2),
      coalesce(nullif(profile_data->>'targetEligibility', ''), 'unsupported'),
      coalesce(nullif(profile_data->>'eligibilityVersion', ''), 'calicoach-eligibility-v1')
    )
    on conflict (id) do update set
      name = excluded.name,
      age = excluded.age,
      sex = excluded.sex,
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      units = excluded.units,
      experience = excluded.experience,
      equipment = excluded.equipment,
      days_per_week = excluded.days_per_week,
      session_minutes = excluded.session_minutes,
      goal = excluded.goal,
      dietary_pattern = excluded.dietary_pattern,
      allergies = excluded.allergies,
      food_preferences = excluded.food_preferences,
      cooking_time_minutes = excluded.cooking_time_minutes,
      meal_budget = excluded.meal_budget,
      eligibility_status = excluded.eligibility_status,
      eligibility_version = excluded.eligibility_version;

    if p_operation = 'update_profile' then
      update public.goals
      set status = 'ended', is_primary = false, ended_date = current_date
      where user_id = caller_id and status = 'active' and is_primary;
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', p_operation,
      'result_refs', jsonb_build_object(
        'profile_id', caller_id::text,
        'target_status', 'unsupported'
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.complete_onboarding(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb; result jsonb;
begin
  replay := private.preflight_mutation('complete_onboarding', p_payload);
  if replay is not null then return replay; end if;
  if p_payload->'profile'->>'targetEligibility' = 'unsupported' then
    result := private.persist_profile_only('complete_onboarding', p_payload);
    perform private.persist_profile_health_metadata(p_payload);
    return result;
  end if;
  result := private.persist_profile_bundle('complete_onboarding', p_payload);
  perform private.persist_profile_health_metadata(p_payload);
  return result;
end; $$;

create or replace function public.update_profile(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb; result jsonb;
begin
  replay := private.preflight_mutation('update_profile', p_payload);
  if replay is not null then return replay; end if;
  if p_payload->'profile'->>'targetEligibility' = 'unsupported' then
    result := private.persist_profile_only('update_profile', p_payload);
    perform private.persist_profile_health_metadata(p_payload);
    return result;
  end if;
  result := private.persist_profile_bundle('update_profile', p_payload);
  perform private.persist_profile_health_metadata(p_payload);
  return result;
end; $$;

create or replace function public.update_units(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb; result jsonb;
begin
  replay := private.preflight_mutation('update_units', p_payload);
  if replay is not null then return replay; end if;
  result := private.persist_profile_bundle('update_units', p_payload);
  perform private.persist_profile_health_metadata(p_payload);
  return result;
end; $$;

create or replace function public.reset_plan(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb; result jsonb;
begin
  replay := private.preflight_mutation('reset_plan', p_payload);
  if replay is not null then return replay; end if;
  result := private.persist_profile_bundle('reset_plan', p_payload);
  perform private.persist_profile_health_metadata(p_payload);
  return result;
end; $$;

create or replace function public.skip_planned_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb; result jsonb;
begin
  replay := private.preflight_mutation('skip_planned_meal', p_payload);
  if replay is not null then return replay; end if;
  result := private.persist_profile_bundle('skip_planned_meal', p_payload);
  perform private.persist_profile_health_metadata(p_payload);
  return result;
end; $$;

create or replace function public.save_nutrition_log(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('save_nutrition_log', p_payload);
  if replay is not null then return replay; end if;
  return private.save_nutrition_log(p_payload);
end; $$;

create or replace function public.log_saved_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('log_saved_meal', p_payload);
  if replay is not null then return replay; end if;
  return private.log_saved_meal(p_payload);
end; $$;

create or replace function public.save_weight_entry(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('save_weight_entry', p_payload);
  if replay is not null then return replay; end if;
  return private.save_weight_entry(p_payload);
end; $$;

create or replace function public.delete_nutrition_log(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('delete_nutrition_log', p_payload);
  if replay is not null then return replay; end if;
  return private.delete_nutrition_log(p_payload);
end; $$;

create or replace function public.apply_workout_override(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('apply_workout_override', p_payload);
  if replay is not null then return replay; end if;
  return private.apply_workout_override(p_payload);
end; $$;

create or replace function public.toggle_grocery_item(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('toggle_grocery_item', p_payload);
  if replay is not null then return replay; end if;
  return private.toggle_grocery_item(p_payload);
end; $$;

create or replace function public.set_grocery_quantity(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('set_grocery_quantity', p_payload);
  if replay is not null then return replay; end if;
  return private.set_grocery_quantity(p_payload);
end; $$;

create or replace function public.remove_grocery_item(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('remove_grocery_item', p_payload);
  if replay is not null then return replay; end if;
  return private.remove_grocery_item(p_payload);
end; $$;

create or replace function public.add_custom_grocery_item(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('add_custom_grocery_item', p_payload);
  if replay is not null then return replay; end if;
  return private.add_custom_grocery_item(p_payload);
end; $$;

create or replace function public.regenerate_grocery(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('regenerate_grocery', p_payload);
  if replay is not null then return replay; end if;
  return private.regenerate_grocery(p_payload);
end; $$;

create or replace function private.export_account_data(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid; claim record; exported jsonb; result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim from private.claim_mutation(caller_id, 'export_account_data', p_payload->>'idempotencyKey', p_payload);
  exported := private.build_account_export();
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'export_account_data', 'replayed', true, 'result_refs', claim.result_refs, 'data', exported);
  end if;
  result := jsonb_build_object('status', 'completed', 'operation', 'export_account_data', 'result_refs', jsonb_build_object('exported_at', now()), 'data', exported);
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
exception when others then
  if claim.mutation_row_id is not null then perform private.fail_mutation(claim.mutation_row_id, sqlstate); end if;
  raise;
end; $$;

create or replace function public.export_account_data(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('export_account_data', p_payload);
  if replay is not null then return jsonb_build_object('status', 'completed', 'operation', 'export_account_data', 'replayed', true, 'result_refs', replay->'result_refs', 'data', private.build_account_export()); end if;
  return private.export_account_data(p_payload);
end; $$;

create or replace function public.delete_account(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := private.preflight_mutation('delete_account', p_payload);
  if replay is not null then return replay; end if;
  return private.delete_account(p_payload);
end; $$;

revoke all on function private.bump_revision() from public, anon, authenticated;
revoke all on function private.raise_stale_version(text, integer, integer) from public, anon, authenticated;
revoke all on function private.assert_finite_number(text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function private.assert_date_key(text, text) from public, anon, authenticated;
revoke all on function private.assert_nonblank(text, text, integer) from public, anon, authenticated;
revoke all on function private.assert_enum(text, text, text[]) from public, anon, authenticated;
revoke all on function private.assert_json_shape(jsonb, text, text) from public, anon, authenticated;
revoke all on function private.assert_expected_versions(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.validate_mutation_payload(text, jsonb) from public, anon, authenticated;
revoke all on function private.preflight_mutation(text, jsonb) from public, anon, authenticated;
revoke all on function private.persist_profile_health_metadata(jsonb) from public, anon, authenticated;
revoke all on function private.persist_profile_only(text, jsonb) from public, anon, authenticated;
revoke all on function private.export_account_data(jsonb) from public, anon, authenticated;

revoke all on function public.complete_onboarding(jsonb) from public, anon;
revoke all on function public.update_profile(jsonb) from public, anon;
revoke all on function public.update_units(jsonb) from public, anon;
revoke all on function public.reset_plan(jsonb) from public, anon;
revoke all on function public.skip_planned_meal(jsonb) from public, anon;
revoke all on function public.save_nutrition_log(jsonb) from public, anon;
revoke all on function public.log_saved_meal(jsonb) from public, anon;
revoke all on function public.save_weight_entry(jsonb) from public, anon;
revoke all on function public.delete_nutrition_log(jsonb) from public, anon;
revoke all on function public.apply_workout_override(jsonb) from public, anon;
revoke all on function public.toggle_grocery_item(jsonb) from public, anon;
revoke all on function public.set_grocery_quantity(jsonb) from public, anon;
revoke all on function public.remove_grocery_item(jsonb) from public, anon;
revoke all on function public.add_custom_grocery_item(jsonb) from public, anon;
revoke all on function public.regenerate_grocery(jsonb) from public, anon;
revoke all on function public.export_account_data(jsonb) from public, anon;
revoke all on function public.delete_account(jsonb) from public, anon;

grant execute on function public.complete_onboarding(jsonb) to authenticated;
grant execute on function public.update_profile(jsonb) to authenticated;
grant execute on function public.update_units(jsonb) to authenticated;
grant execute on function public.reset_plan(jsonb) to authenticated;
grant execute on function public.skip_planned_meal(jsonb) to authenticated;
grant execute on function public.save_nutrition_log(jsonb) to authenticated;
grant execute on function public.log_saved_meal(jsonb) to authenticated;
grant execute on function public.save_weight_entry(jsonb) to authenticated;
grant execute on function public.delete_nutrition_log(jsonb) to authenticated;
grant execute on function public.apply_workout_override(jsonb) to authenticated;
grant execute on function public.toggle_grocery_item(jsonb) to authenticated;
grant execute on function public.set_grocery_quantity(jsonb) to authenticated;
grant execute on function public.remove_grocery_item(jsonb) to authenticated;
grant execute on function public.add_custom_grocery_item(jsonb) to authenticated;
grant execute on function public.regenerate_grocery(jsonb) to authenticated;
grant execute on function public.export_account_data(jsonb) to authenticated;
grant execute on function public.delete_account(jsonb) to authenticated;

create or replace function public.start_workout_session(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin replay := private.preflight_mutation('start_workout_session', p_payload); if replay is not null then return replay; end if; return private.start_workout_session(p_payload); end; $$;
create or replace function public.save_workout_session(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin replay := private.preflight_mutation('save_workout_session', p_payload); if replay is not null then return replay; end if; return private.save_workout_session(p_payload); end; $$;
create or replace function public.finish_workout_session(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin replay := private.preflight_mutation('finish_workout_session', p_payload); if replay is not null then return replay; end if; return private.finish_workout_session(p_payload); end; $$;
create or replace function public.abandon_workout_session(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin replay := private.preflight_mutation('abandon_workout_session', p_payload); if replay is not null then return replay; end if; return private.abandon_workout_session(p_payload); end; $$;
create or replace function public.save_saved_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin replay := private.preflight_mutation('save_saved_meal', p_payload); if replay is not null then return replay; end if; return private.save_saved_meal(p_payload); end; $$;
create or replace function public.save_recipe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin replay := private.preflight_mutation('save_saved_meal', p_payload); if replay is not null then return replay; end if; return private.save_saved_meal(p_payload); end; $$;

revoke all on function private.export_account_data(jsonb) from public, anon, authenticated;
revoke all on function public.start_workout_session(jsonb) from public, anon;
revoke all on function public.save_workout_session(jsonb) from public, anon;
revoke all on function public.finish_workout_session(jsonb) from public, anon;
revoke all on function public.abandon_workout_session(jsonb) from public, anon;
revoke all on function public.save_saved_meal(jsonb) from public, anon;
revoke all on function public.save_recipe(jsonb) from public, anon;
grant execute on function public.start_workout_session(jsonb) to authenticated;
grant execute on function public.save_workout_session(jsonb) to authenticated;
grant execute on function public.finish_workout_session(jsonb) to authenticated;
grant execute on function public.abandon_workout_session(jsonb) to authenticated;
grant execute on function public.save_saved_meal(jsonb) to authenticated;
grant execute on function public.save_recipe(jsonb) to authenticated;
