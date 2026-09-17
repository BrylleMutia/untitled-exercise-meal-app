-- Forward-only MVP hardening migration.
-- The Supabase CLI is not installed in this workspace, so this file was
-- authored explicitly and must be applied/verified through the normal
-- migration workflow before a linked project is changed.

alter table public.exercises
  add constraint exercises_app_id_nonblank check (btrim(app_id) <> '');
alter table public.foods
  add constraint foods_app_id_nonblank check (btrim(app_id) <> '');
alter table public.meals
  add constraint meals_app_id_nonblank check (btrim(app_id) <> '');

create or replace function private.log_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  entry jsonb;
  entry_id text;
  food_row_id bigint;
  ids jsonb := '[]'::jsonb;
  entries jsonb := coalesce(p_payload->'entries', '[]'::jsonb);
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'log_saved_meal',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'log_saved_meal',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 then
      perform private.raise_mutation_error('validation_failed', 'meal entries are required');
    end if;

    for entry in select value from jsonb_array_elements(entries)
    loop
      entry_id := entry->>'id';
      if entry_id is null or btrim(entry_id) = '' then
        perform private.raise_mutation_error('validation_failed', 'meal entry id is required');
      end if;

      food_row_id := null;
      if nullif(entry->>'foodId', '') is not null then
        select row_id into food_row_id
        from public.foods
        where app_id = entry->>'foodId'
          and (is_system or owner_user_id = caller_id);
        if food_row_id is null then
          perform private.raise_mutation_error('not_found', 'food not found');
        end if;
      elsif nullif(btrim(entry->>'customName'), '') is null then
        perform private.raise_mutation_error('validation_failed', 'foodId or customName is required');
      end if;

      insert into public.nutrition_logs (
        app_id, user_id, log_date, meal_slot, food_row_id, custom_name,
        servings, serving_quantity, serving_unit, calories, protein_g,
        carbs_g, fat_g, fiber_g, estimated, confidence, source,
        source_version, preparation_basis, assumptions, idempotency_key
      ) values (
        entry_id, caller_id, (entry->>'date')::date, entry->>'slot',
        food_row_id, nullif(btrim(entry->>'customName'), ''),
        (entry->>'servings')::numeric(10,3),
        coalesce(nullif(entry->>'servingQuantity', '')::numeric(10,3), (entry->>'servings')::numeric(10,3)),
        coalesce(nullif(entry->>'servingUnit', ''), 'serving'),
        (entry->>'calories')::numeric(10,2), (entry->>'proteinG')::numeric(10,2),
        (entry->>'carbsG')::numeric(10,2), (entry->>'fatG')::numeric(10,2),
        nullif(entry->>'fiberG', '')::numeric(10,2),
        coalesce((entry->>'estimated')::boolean, true), coalesce(entry->>'confidence', 'low'),
        btrim(coalesce(entry->>'source', 'User-provided')),
        coalesce(entry->>'sourceVersion', ''), coalesce(entry->>'preparationBasis', 'unknown'),
        nullif(entry->>'assumptions', ''),
        case
          when nullif(p_payload->>'idempotencyKey', '') is null then null
          else (p_payload->>'idempotencyKey') || ':' || entry_id
        end
      )
      on conflict (user_id, app_id) do update set
        log_date = excluded.log_date, meal_slot = excluded.meal_slot,
        food_row_id = excluded.food_row_id, custom_name = excluded.custom_name,
        servings = excluded.servings, serving_quantity = excluded.serving_quantity,
        serving_unit = excluded.serving_unit, calories = excluded.calories,
        protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g, fiber_g = excluded.fiber_g,
        estimated = excluded.estimated, confidence = excluded.confidence,
        source = excluded.source, source_version = excluded.source_version,
        preparation_basis = excluded.preparation_basis, assumptions = excluded.assumptions,
        idempotency_key = excluded.idempotency_key;

      ids := ids || to_jsonb(entry_id);
    end loop;

    result := jsonb_build_object(
      'status', 'completed', 'operation', 'log_saved_meal',
      'result_refs', jsonb_build_object('nutrition_log_ids', ids)
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.log_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.log_saved_meal(p_payload);
end;
$$;

revoke all on function private.log_saved_meal(jsonb) from public, anon, authenticated;
revoke all on function public.log_saved_meal(jsonb) from public, anon;
grant execute on function public.log_saved_meal(jsonb) to authenticated;

create or replace function private.apply_workout_override(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  planned_row_id bigint;
  replacement_row_id bigint;
  replacement_equipment text[];
  owned_equipment text[];
  override_id text := 'override-' || md5(coalesce(p_payload->>'idempotencyKey', p_payload::text));
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'apply_workout_override', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'apply_workout_override', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    select row_id into planned_row_id
    from public.planned_exercises
    where user_id = caller_id and app_id = p_payload->>'plannedExerciseId';
    if planned_row_id is null then
      perform private.raise_mutation_error('not_found', 'planned exercise not found');
    end if;

    if nullif(p_payload->>'replacementExerciseId', '') is not null then
      select row_id, equipment into replacement_row_id, replacement_equipment
      from public.exercises
      where app_id = p_payload->>'replacementExerciseId' and is_system;
      if replacement_row_id is null then
        perform private.raise_mutation_error('not_found', 'replacement exercise not found');
      end if;
      select array_append(equipment, 'none') into owned_equipment
      from public.profiles where id = caller_id;
      if owned_equipment is null or not (replacement_equipment <@ owned_equipment) then
        perform private.raise_mutation_error('validation_failed', 'replacement exercise requires unavailable equipment');
      end if;
    end if;

    update public.workout_plan_overrides
    set active = false, ended_at = now()
    where user_id = caller_id and planned_exercise_row_id = planned_row_id and active;

    insert into public.workout_plan_overrides (
      app_id, user_id, planned_exercise_row_id, replacement_exercise_row_id,
      measure_override, sets_override, reps_override, hold_seconds_override,
      rest_seconds_override, active, effective_at
    ) values (
      override_id, caller_id, planned_row_id, replacement_row_id,
      case when nullif(p_payload->>'holdSeconds', '') is not null then 'hold' when nullif(p_payload->>'reps', '') is not null then 'reps' else null end,
      nullif(p_payload->>'sets', '')::smallint,
      nullif(p_payload->>'reps', '')::smallint,
      nullif(p_payload->>'holdSeconds', '')::smallint,
      nullif(p_payload->>'restSeconds', '')::smallint,
      true, now()
    ) on conflict (user_id, app_id) do update set
      replacement_exercise_row_id = excluded.replacement_exercise_row_id,
      measure_override = excluded.measure_override,
      sets_override = excluded.sets_override,
      reps_override = excluded.reps_override,
      hold_seconds_override = excluded.hold_seconds_override,
      rest_seconds_override = excluded.rest_seconds_override,
      active = true, ended_at = null, effective_at = excluded.effective_at;

    result := jsonb_build_object('status', 'completed', 'operation', 'apply_workout_override', 'result_refs', jsonb_build_object('override_id', override_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.apply_workout_override(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.apply_workout_override(p_payload);
end;
$$;

revoke all on function private.apply_workout_override(jsonb) from public, anon, authenticated;
revoke all on function public.apply_workout_override(jsonb) from public, anon;
grant execute on function public.apply_workout_override(jsonb) to authenticated;
