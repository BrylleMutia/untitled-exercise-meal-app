-- Fix the trusted nutrition normalization path so the public preflight claim
-- and the private persistence path use the same original request hash. The
-- earlier migration passed a normalized payload to the legacy function, which
-- attempted to claim the same idempotency key with a different hash.

create or replace function private.save_nutrition_log_unchecked(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  entry jsonb := coalesce(p_payload->'entry', '{}'::jsonb);
  food_row_id bigint;
  entry_id text := entry->>'id';
  result jsonb;
begin
  if entry_id is null or btrim(entry_id) = '' then
    perform private.raise_mutation_error('validation_failed', 'nutrition id is required');
  end if;

  if nullif(entry->>'foodId', '') is not null then
    select row_id into food_row_id
    from public.foods
    where app_id = entry->>'foodId'
      and (is_system or owner_user_id = caller_id);
    if food_row_id is null then
      perform private.raise_mutation_error('not_found', 'food not found');
    end if;
  elsif nullif(btrim(entry->>'customName'), '') is null then
    perform private.raise_mutation_error(
      'validation_failed',
      'foodId or customName is required'
    );
  end if;

  insert into public.nutrition_logs (
    app_id, user_id, log_date, meal_slot, food_row_id, custom_name,
    servings, serving_quantity, serving_unit, calories, protein_g,
    carbs_g, fat_g, fiber_g, estimated, confidence, source,
    source_version, preparation_basis, assumptions, idempotency_key
  )
  values (
    entry_id,
    caller_id,
    (entry->>'date')::date,
    entry->>'slot',
    food_row_id,
    nullif(btrim(entry->>'customName'), ''),
    (entry->>'servings')::numeric(10,3),
    coalesce(nullif(entry->>'servingQuantity', '')::numeric(10,3),
             (entry->>'servings')::numeric(10,3)),
    coalesce(nullif(entry->>'servingUnit', ''), 'serving'),
    (entry->>'calories')::numeric(10,2),
    (entry->>'proteinG')::numeric(10,2),
    (entry->>'carbsG')::numeric(10,2),
    (entry->>'fatG')::numeric(10,2),
    nullif(entry->>'fiberG', '')::numeric(10,2),
    coalesce((entry->>'estimated')::boolean, true),
    coalesce(entry->>'confidence', 'low'),
    btrim(coalesce(entry->>'source', 'User-provided')),
    coalesce(entry->>'sourceVersion', ''),
    coalesce(entry->>'preparationBasis', 'unknown'),
    nullif(entry->>'assumptions', ''),
    nullif(p_payload->>'idempotencyKey', '')
  )
  on conflict (user_id, app_id) do update set
    log_date = excluded.log_date,
    meal_slot = excluded.meal_slot,
    food_row_id = excluded.food_row_id,
    custom_name = excluded.custom_name,
    servings = excluded.servings,
    serving_quantity = excluded.serving_quantity,
    serving_unit = excluded.serving_unit,
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    fiber_g = excluded.fiber_g,
    estimated = excluded.estimated,
    confidence = excluded.confidence,
    source = excluded.source,
    source_version = excluded.source_version,
    preparation_basis = excluded.preparation_basis,
    assumptions = excluded.assumptions,
    idempotency_key = excluded.idempotency_key;

  result := jsonb_build_object(
    'status', 'completed',
    'operation', 'save_nutrition_log',
    'result_refs', jsonb_build_object('nutrition_log_id', entry_id)
  );
  return result;
end;
$$;

create or replace function private.save_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  normalized jsonb := p_payload;
  entry jsonb := coalesce(p_payload->'entry', '{}'::jsonb);
  food_row public.foods%rowtype;
  food_app_id text := nullif(entry->>'foodId', '');
  serving_count numeric;
  result jsonb;
begin
  -- The public wrapper has already preflighted this payload. Reclaiming the
  -- same original payload is intentional: it returns the pending claim whose
  -- hash still matches before the trusted values are normalized.
  select * into claim from private.claim_mutation(
    caller_id, 'save_nutrition_log', p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'save_nutrition_log',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if food_app_id is not null then
      select * into food_row
      from public.foods
      where app_id = food_app_id
        and (is_system or owner_user_id = caller_id);
      if food_row.row_id is null then
        perform private.raise_mutation_error('not_found', 'food not found');
      end if;

      serving_count := (entry->>'servings')::numeric;
      if serving_count is null or serving_count <= 0 then
        perform private.raise_mutation_error('validation_failed', 'servings must be positive');
      end if;

      normalized := jsonb_set(normalized, '{entry,calories}', to_jsonb(round(food_row.calories * serving_count, 2)), true);
      normalized := jsonb_set(normalized, '{entry,proteinG}', to_jsonb(round(food_row.protein_g * serving_count, 2)), true);
      normalized := jsonb_set(normalized, '{entry,carbsG}', to_jsonb(round(food_row.carbs_g * serving_count, 2)), true);
      normalized := jsonb_set(normalized, '{entry,fatG}', to_jsonb(round(food_row.fat_g * serving_count, 2)), true);
      normalized := jsonb_set(normalized, '{entry,fiberG}', coalesce(to_jsonb(round(food_row.fiber_g * serving_count, 2)), 'null'::jsonb), true);
      normalized := jsonb_set(normalized, '{entry,estimated}', to_jsonb(food_row.estimated), true);
      normalized := jsonb_set(normalized, '{entry,confidence}', to_jsonb(food_row.confidence), true);
      normalized := jsonb_set(normalized, '{entry,source}', to_jsonb(food_row.source), true);
      normalized := jsonb_set(normalized, '{entry,sourceVersion}', to_jsonb(food_row.source_version), true);
      normalized := jsonb_set(normalized, '{entry,preparationBasis}', to_jsonb(food_row.preparation_basis), true);
      normalized := jsonb_set(normalized, '{entry,servingQuantity}', to_jsonb(case when food_row.serving_unit = 'piece' then serving_count else food_row.serving_grams * serving_count end), true);
      normalized := jsonb_set(normalized, '{entry,servingUnit}', to_jsonb(food_row.serving_unit), true);
    end if;

    result := private.save_nutrition_log_unchecked(normalized);
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

-- Check constraints and trigger-enforced domain bounds use the same SQLSTATE
-- so callers and the existing database contract can classify the failure.
create or replace function private.validate_planned_exercise_bounds()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bounds jsonb;
begin
  select progression_bounds into bounds from public.exercises where row_id = new.exercise_row_id;
  if bounds is null then raise exception using errcode = '23503', message = 'exercise catalog bounds not found'; end if;
  if new.sets < (bounds->>'minSets')::integer or new.sets > (bounds->>'maxSets')::integer then
    raise exception using errcode = '23514', message = 'sets exceed the exercise catalog bounds';
  end if;
  if new.measure_snapshot = 'reps' and (new.reps < (bounds->>'minReps')::integer or new.reps > (bounds->>'maxReps')::integer) then
    raise exception using errcode = '23514', message = 'reps exceed the exercise catalog bounds';
  end if;
  if new.measure_snapshot = 'hold' and (new.hold_seconds < (bounds->>'minHoldSeconds')::integer or new.hold_seconds > (bounds->>'maxHoldSeconds')::integer) then
    raise exception using errcode = '23514', message = 'hold duration exceeds the exercise catalog bounds';
  end if;
  return new;
end;
$$;
