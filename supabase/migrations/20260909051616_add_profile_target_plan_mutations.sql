-- Atomic persistence for profile setup and generated plan bundles.
-- The client keeps deterministic generation in TypeScript; this boundary
-- validates catalog references and writes normalized rows in one transaction.

create or replace function private.persist_profile_bundle(
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
  target_data jsonb := coalesce(p_payload->'target', '{}'::jsonb);
  plan_data jsonb := coalesce(p_payload->'plan', '{}'::jsonb);
  meal_plan_data jsonb := coalesce(p_payload->'mealPlan', '{}'::jsonb);
  grocery_data jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  bundle_effective_date date := coalesce(nullif(p_payload->>'effectiveDate', ''), current_date::text)::date;
  bundle_week_of date;
  goal_row_id bigint;
  goal_version integer;
  target_row_id bigint;
  target_version integer;
  plan_row_id bigint;
  plan_version integer;
  previous_plan_row_id bigint;
  meal_plan_row_id bigint;
  meal_plan_version integer;
  previous_meal_plan_row_id bigint;
  planned_workout_row_id bigint;
  exercise_row_id bigint;
  meal_row_id bigint;
  food_row_id bigint;
  exercise_measure text;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  workout_record jsonb;
  exercise_record jsonb;
  meal_record jsonb;
  grocery_item_record jsonb;
  result jsonb;
  goal_app_id text;
  target_app_id text;
  plan_app_id text;
  meal_plan_app_id text;
  grocery_app_id text;
  item_generated numeric;
  item_quantity numeric;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id,
    p_operation,
    p_payload->>'idempotencyKey',
    p_payload
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
    if profile_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'profile is required');
    end if;
    if target_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'target is required');
    end if;
    if plan_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'plan is required');
    end if;
    if meal_plan_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'mealPlan is required');
    end if;

    insert into public.profiles (
      id, name, age, sex, height_cm, weight_kg, units, experience,
      equipment, days_per_week, session_minutes, goal, dietary_pattern,
      allergies, food_preferences, cooking_time_minutes, meal_budget
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
      nullif(profile_data->>'mealBudget', '')::numeric(10,2)
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
      meal_budget = excluded.meal_budget;

    update public.goals as g
    set status = 'ended',
        is_primary = false,
        ended_date = bundle_effective_date
    where g.user_id = caller_id
      and g.status = 'active'
      and g.is_primary;

    goal_app_id := coalesce(nullif(p_payload->>'goalId', ''), 'goal-' || bundle_effective_date::text);
    select coalesce(max(version), 0) + 1
    into goal_version
    from public.goals
    where user_id = caller_id;

    insert into public.goals (
      app_id, user_id, goal_type, target_weight_kg,
      desired_rate_kg_per_week, target_date, weekly_workout_target,
      skill_targets, effective_date, version, is_primary, status
    )
    values (
      goal_app_id,
      caller_id,
      profile_data->>'goal',
      nullif(p_payload->>'targetWeightKg', '')::numeric(6,2),
      nullif(p_payload->>'desiredRateKgPerWeek', '')::numeric(6,3),
      nullif(p_payload->>'targetDate', '')::date,
      (profile_data->>'daysPerWeek')::smallint,
      coalesce(p_payload->'skillTargets', '{}'::jsonb),
      bundle_effective_date,
      goal_version,
      true,
      'active'
    )
    returning row_id into goal_row_id;

    target_app_id := coalesce(nullif(target_data->>'id', ''), 'target-' || bundle_effective_date::text);
    select coalesce(max(version), 0) + 1
    into target_version
    from public.daily_targets
    where user_id = caller_id;

    insert into public.daily_targets (
      app_id, user_id, goal_row_id, version, effective_date, calories,
      protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor,
      formula, calculation_assumptions, disclaimer
    )
    values (
      target_app_id,
      caller_id,
      goal_row_id,
      target_version,
      coalesce(nullif(target_data->>'effectiveDate', ''), bundle_effective_date::text)::date,
      (target_data->>'calories')::numeric(10,2),
      (target_data->>'proteinG')::numeric(10,2),
      (target_data->>'carbsG')::numeric(10,2),
      (target_data->>'fatG')::numeric(10,2),
      (target_data->>'bmr')::numeric(10,2),
      (target_data->>'bmi')::numeric(6,2),
      (target_data->>'tdee')::numeric(10,2),
      (target_data->>'activityFactor')::numeric(4,2),
      coalesce(target_data->>'formula', 'mifflin-st-jeor'),
      coalesce(target_data->>'calculationAssumptions', ''),
      coalesce(target_data->>'disclaimer', 'Estimates for healthy adults only.')
    )
    returning row_id into target_row_id;

    plan_app_id := coalesce(nullif(plan_data->>'id', ''), 'plan-' || bundle_effective_date::text);
    select coalesce(max(version), 0) + 1
    into plan_version
    from public.workout_plans
    where user_id = caller_id
      and app_id = plan_app_id;

    select row_id
    into previous_plan_row_id
    from public.workout_plans
    where user_id = caller_id
    order by created_at desc, row_id desc
    limit 1
    for update;

    insert into public.workout_plans (
      app_id, user_id, version, target_row_id, supersedes_plan_row_id
    )
    values (
      plan_app_id, caller_id, plan_version, target_row_id, previous_plan_row_id
    )
    returning row_id into plan_row_id;

    for workout_record in
      select value from jsonb_array_elements(coalesce(plan_data->'workouts', '[]'::jsonb))
    loop
      insert into public.planned_workouts (
        plan_row_id, user_id, app_id, day_of_week, title, focus, warmup,
        cooldown, estimated_minutes, sort_order
      )
      values (
        plan_row_id,
        caller_id,
        workout_record->>'id',
        (workout_record->>'dayOfWeek')::smallint,
        btrim(workout_record->>'title'),
        btrim(workout_record->>'focus'),
        array(select jsonb_array_elements_text(coalesce(workout_record->'warmup', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(workout_record->'cooldown', '[]'::jsonb))),
        (workout_record->>'estimatedMinutes')::smallint,
        coalesce((workout_record->>'sortOrder')::integer, 1)
      )
      returning row_id into planned_workout_row_id;

      for exercise_record in
        select value from jsonb_array_elements(coalesce(workout_record->'exercises', '[]'::jsonb))
      loop
        select row_id, measure
        into exercise_row_id, exercise_measure
        from public.exercises
        where app_id = exercise_record->>'exerciseId'
          and is_system;
        if exercise_row_id is null or exercise_measure is null then
          perform private.raise_mutation_error(
            'validation_failed',
            'unknown exercise catalog id'
          );
        end if;

        insert into public.planned_exercises (
          planned_workout_row_id, user_id, app_id, exercise_row_id,
          sort_order, exercise_name_snapshot, measure_snapshot,
          catalog_source_version, sets, reps, hold_seconds, rest_seconds,
          regression_reference_snapshot, progression_reference_snapshot
        )
        select
          planned_workout_row_id,
          caller_id,
          exercise_record->>'id',
          e.row_id,
          coalesce((exercise_record->>'sortOrder')::integer, row_number() over ()),
          e.name,
          e.measure,
          e.source_version,
          (exercise_record->>'sets')::smallint,
          nullif(exercise_record->>'reps', '')::smallint,
          nullif(exercise_record->>'holdSeconds', '')::smallint,
          (exercise_record->>'restSeconds')::smallint,
          e.regression_reference,
          e.progression_reference
        from public.exercises e
        where e.row_id = exercise_row_id
        ;
      end loop;
    end loop;

    bundle_week_of := (meal_plan_data->>'weekOf')::date;
    meal_plan_app_id := coalesce(nullif(meal_plan_data->>'id', ''), 'mp-' || bundle_week_of::text);
    select coalesce(max(version), 0) + 1
    into meal_plan_version
    from public.meal_plans
    where user_id = caller_id
      and app_id = meal_plan_app_id;

    select row_id
    into previous_meal_plan_row_id
    from public.meal_plans
    where user_id = caller_id
    order by created_at desc, row_id desc
    limit 1
    for update;

    insert into public.meal_plans (
      app_id, user_id, version, week_of, target_row_id, supersedes_plan_row_id
    )
    values (
      meal_plan_app_id, caller_id, meal_plan_version, bundle_week_of, target_row_id,
      previous_meal_plan_row_id
    )
    returning row_id into meal_plan_row_id;

    for meal_record in
      select value from jsonb_array_elements(coalesce(meal_plan_data->'meals', '[]'::jsonb))
    loop
      meal_row_id := null;
      food_row_id := null;

      if nullif(meal_record->>'mealId', '') is not null then
        select row_id into meal_row_id
        from public.meals
        where app_id = meal_record->>'mealId'
          and (is_system or owner_user_id = caller_id);
        if meal_row_id is null then
          perform private.raise_mutation_error('not_found', 'meal catalog id not found');
        end if;
      end if;

      if nullif(meal_record->>'foodId', '') is not null then
        select row_id into food_row_id
        from public.foods
        where app_id = meal_record->>'foodId'
          and (is_system or owner_user_id = caller_id);
        if food_row_id is null then
          perform private.raise_mutation_error('not_found', 'food catalog id not found');
        end if;
      end if;

      if meal_row_id is not null and food_row_id is not null then
        perform private.raise_mutation_error(
          'validation_failed',
          'planned meal cannot reference both meal and food'
        );
      end if;

      insert into public.planned_meals (
        meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot,
        meal_row_id, food_row_id, label, servings, skipped,
        expected_calories, expected_protein_g, expected_carbs_g,
        expected_fat_g, expected_fiber_g, source, source_version,
        assumptions, confidence, preparation_basis
      )
      values (
        meal_plan_row_id,
        caller_id,
        bundle_week_of,
        meal_record->>'id',
        (meal_record->>'date')::date,
        meal_record->>'slot',
        meal_row_id,
        food_row_id,
        btrim(coalesce(meal_record->>'label', 'Choose a meal that fits')),
        (meal_record->>'servings')::numeric(8,3),
        coalesce((meal_record->>'skipped')::boolean, false),
        coalesce((meal_record->>'expectedCalories')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedProteinG')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedCarbsG')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedFatG')::numeric(10,2), 0),
        nullif(meal_record->>'expectedFiberG', '')::numeric(10,2),
        nullif(meal_record->>'source', ''),
        nullif(meal_record->>'sourceVersion', ''),
        nullif(meal_record->>'assumptions', ''),
        nullif(meal_record->>'confidence', ''),
        nullif(meal_record->>'preparationBasis', '')
      );
    end loop;

    if grocery_data <> '{}'::jsonb then
      bundle_week_of := (grocery_data->>'weekOf')::date;
      grocery_app_id := coalesce(nullif(grocery_data->>'id', ''), 'gl-' || bundle_week_of::text);

      insert into public.grocery_lists (app_id, user_id, week_of)
      values (grocery_app_id, caller_id, bundle_week_of)
      on conflict (user_id, week_of) do update
        set updated_at = now()
      returning row_id into grocery_row_id;

      for grocery_item_record in
        select value from jsonb_array_elements(coalesce(grocery_data->'items', '[]'::jsonb))
      loop
        item_generated := (grocery_item_record->>'generatedQuantity')::numeric(12,3);
        select *
        into previous_item
        from public.grocery_items
        where grocery_list_row_id = grocery_row_id
          and app_id = grocery_item_record->>'id'
        for update;

        if previous_item.row_id is null then
          item_quantity := coalesce(
            nullif(grocery_item_record->>'quantity', '')::numeric,
            item_generated
          );
          insert into public.grocery_items (
            grocery_list_row_id, user_id, app_id, name, category, unit,
            generated_quantity, quantity, checked, custom_item, removed,
            source_food_row_id
          )
          values (
            grocery_row_id,
            caller_id,
            grocery_item_record->>'id',
            btrim(grocery_item_record->>'name'),
            grocery_item_record->>'category',
            btrim(grocery_item_record->>'unit'),
            item_generated,
            item_quantity,
            coalesce((grocery_item_record->>'checked')::boolean, false),
            coalesce((grocery_item_record->>'custom')::boolean, false),
            coalesce((grocery_item_record->>'removed')::boolean, false),
            (select row_id from public.foods where app_id = grocery_item_record->>'foodId')
          );
        else
          item_quantity := case
            when previous_item.quantity = previous_item.generated_quantity
              then item_generated
            else previous_item.quantity
          end;
          update public.grocery_items
          set name = btrim(grocery_item_record->>'name'),
              category = grocery_item_record->>'category',
              unit = btrim(grocery_item_record->>'unit'),
              generated_quantity = item_generated,
              quantity = item_quantity,
              source_food_row_id = coalesce(
                (select row_id from public.foods where app_id = grocery_item_record->>'foodId'),
                previous_item.source_food_row_id
              )
          where row_id = previous_item.row_id
            and user_id = caller_id;
        end if;
      end loop;
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', p_operation,
      'result_refs', jsonb_build_object(
        'profile_id', caller_id::text,
        'goal_id', goal_app_id,
        'target_id', target_app_id,
        'plan_id', plan_app_id,
        'meal_plan_id', meal_plan_app_id,
        'grocery_id', coalesce(grocery_app_id, '')
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
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.persist_profile_bundle('complete_onboarding', p_payload);
end;
$$;

create or replace function public.update_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.persist_profile_bundle('update_profile', p_payload);
end;
$$;

create or replace function public.update_units(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.persist_profile_bundle('update_units', p_payload);
end;
$$;

create or replace function public.reset_plan(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.persist_profile_bundle('reset_plan', p_payload);
end;
$$;

create or replace function public.skip_planned_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.persist_profile_bundle('skip_planned_meal', p_payload);
end;
$$;

revoke all on function private.persist_profile_bundle(text, jsonb)
  from public, anon, authenticated;

revoke all on function public.complete_onboarding(jsonb)
  from public, anon;
revoke all on function public.update_profile(jsonb)
  from public, anon;
revoke all on function public.update_units(jsonb)
  from public, anon;
revoke all on function public.reset_plan(jsonb)
  from public, anon;
revoke all on function public.skip_planned_meal(jsonb)
  from public, anon;

grant execute on function public.complete_onboarding(jsonb) to authenticated;
grant execute on function public.update_profile(jsonb) to authenticated;
grant execute on function public.update_units(jsonb) to authenticated;
grant execute on function public.reset_plan(jsonb) to authenticated;
grant execute on function public.skip_planned_meal(jsonb) to authenticated;
