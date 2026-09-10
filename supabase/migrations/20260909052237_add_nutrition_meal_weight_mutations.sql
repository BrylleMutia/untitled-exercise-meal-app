-- Nutrition, saved-meal, recipe, and weight mutations. Nutrition values are
-- snapshots supplied by the trusted catalog or an explicitly reviewed user
-- entry; this layer never recalculates historical rows from current catalog data.

create or replace function private.save_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  entry jsonb := coalesce(p_payload->'entry', '{}'::jsonb);
  food_row_id bigint;
  entry_id text := entry->>'id';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'save_nutrition_log',
    p_payload->>'idempotencyKey', p_payload
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
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.delete_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  entry_id text := p_payload->>'nutritionLogId';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'delete_nutrition_log',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_nutrition_log',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    delete from public.nutrition_logs
    where user_id = caller_id and app_id = entry_id;
    if not found then
      perform private.raise_mutation_error('not_found', 'nutrition log not found');
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_nutrition_log',
      'result_refs', jsonb_build_object('nutrition_log_id', entry_id)
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.save_weight_entry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  entry jsonb := coalesce(p_payload->'entry', '{}'::jsonb);
  entry_id text := entry->>'id';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'save_weight_entry',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'save_weight_entry',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if entry_id is null or btrim(entry_id) = '' then
      perform private.raise_mutation_error('validation_failed', 'weight id is required');
    end if;

    insert into public.weight_entries (
      app_id, user_id, entry_date, weight_kg
    )
    values (
      entry_id,
      caller_id,
      (entry->>'date')::date,
      (entry->>'weightKg')::numeric(6,2)
    )
    on conflict (user_id, app_id) do nothing;

    if not found then
      perform private.raise_mutation_error('conflict', 'weight entry already exists');
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'save_weight_entry',
      'result_refs', jsonb_build_object('weight_entry_id', entry_id)
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.save_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  meal jsonb := coalesce(p_payload->'meal', '{}'::jsonb);
  ingredient jsonb;
  meal_id text := meal->>'id';
  saved_meal_row_id bigint;
  ingredient_food_row_id bigint;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'save_saved_meal',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'save_saved_meal',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if meal_id is null or btrim(meal_id) = '' then
      perform private.raise_mutation_error('validation_failed', 'meal id is required');
    end if;
    if exists (
      select 1 from public.meals
      where app_id = meal_id and is_system
    ) then
      perform private.raise_mutation_error('conflict', 'system meals cannot be overwritten');
    end if;

    insert into public.meals (
      app_id, owner_user_id, is_system, name, servings, notes, source_url
    )
    values (
      meal_id,
      caller_id,
      false,
      btrim(meal->>'name'),
      (meal->>'servings')::numeric(8,3),
      nullif(meal->>'notes', ''),
      nullif(meal->>'sourceUrl', '')
    )
    on conflict (app_id) do update set
      name = excluded.name,
      servings = excluded.servings,
      notes = excluded.notes,
      source_url = excluded.source_url,
      updated_at = now()
    returning row_id into saved_meal_row_id;

    delete from public.meal_ingredients
    where meal_ingredients.meal_row_id = saved_meal_row_id;

    for ingredient in
      select value from jsonb_array_elements(coalesce(meal->'ingredients', '[]'::jsonb))
    loop
      select row_id into ingredient_food_row_id
      from public.foods
      where app_id = ingredient->>'foodId'
        and (is_system or owner_user_id = caller_id);
      if ingredient_food_row_id is null then
        perform private.raise_mutation_error('not_found', 'meal ingredient food not found');
      end if;

      insert into public.meal_ingredients (
        meal_row_id, food_row_id, ingredient_order, servings
      )
      values (
        saved_meal_row_id,
        ingredient_food_row_id,
        (select count(*) + 1
         from public.meal_ingredients mi
         where mi.meal_row_id = saved_meal_row_id),
        (ingredient->>'servings')::numeric(8,3)
      );
    end loop;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'save_saved_meal',
      'result_refs', jsonb_build_object('meal_id', meal_id)
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.save_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.save_nutrition_log(p_payload);
end;
$$;

create or replace function public.delete_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.delete_nutrition_log(p_payload);
end;
$$;

create or replace function public.save_weight_entry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.save_weight_entry(p_payload);
end;
$$;

create or replace function public.save_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.save_saved_meal(p_payload);
end;
$$;

create or replace function public.save_recipe(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.save_saved_meal(p_payload);
end;
$$;

revoke all on function private.save_nutrition_log(jsonb)
  from public, anon, authenticated;
revoke all on function private.delete_nutrition_log(jsonb)
  from public, anon, authenticated;
revoke all on function private.save_weight_entry(jsonb)
  from public, anon, authenticated;
revoke all on function private.save_saved_meal(jsonb)
  from public, anon, authenticated;

revoke all on function public.save_nutrition_log(jsonb) from public, anon;
revoke all on function public.delete_nutrition_log(jsonb) from public, anon;
revoke all on function public.save_weight_entry(jsonb) from public, anon;
revoke all on function public.save_saved_meal(jsonb) from public, anon;
revoke all on function public.save_recipe(jsonb) from public, anon;

grant execute on function public.save_nutrition_log(jsonb) to authenticated;
grant execute on function public.delete_nutrition_log(jsonb) to authenticated;
grant execute on function public.save_weight_entry(jsonb) to authenticated;
grant execute on function public.save_saved_meal(jsonb) to authenticated;
grant execute on function public.save_recipe(jsonb) to authenticated;
