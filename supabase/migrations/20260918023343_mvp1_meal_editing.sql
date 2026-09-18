-- MVP-1 meal editing: keep plan history immutable while allowing future-plan
-- edits and safe archiving of user-owned recipes.

create or replace function private.persist_meal_plan_edit(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  current_plan record;
  meal_plan_data jsonb := coalesce(p_payload->'mealPlan', '{}'::jsonb);
  grocery_data jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  meal_record jsonb;
  grocery_item_record jsonb;
  meal_row_id bigint;
  food_row_id bigint;
  meal_plan_row_id bigint;
  previous_meal_plan_row_id bigint;
  meal_plan_version integer;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  item_generated numeric;
  item_quantity numeric;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id,
    'edit_meal_plan',
    p_payload->>'idempotencyKey',
    p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'edit_meal_plan',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if jsonb_typeof(meal_plan_data) is distinct from 'object'
       or meal_plan_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'mealPlan is required');
    end if;
    perform private.assert_nonblank(meal_plan_data->>'id', 'mealPlan.id', 128);
    perform private.assert_date_key(meal_plan_data->>'weekOf', 'mealPlan.weekOf');
    perform private.assert_json_shape(meal_plan_data->'meals', 'mealPlan.meals', 'array');

    perform private.assert_expected_versions('edit_meal_plan', p_payload, caller_id);

    select row_id, app_id, version, week_of, target_row_id
    into current_plan
    from public.meal_plans
    where user_id = caller_id
    order by created_at desc, row_id desc
    limit 1
    for update;

    if not found then
      perform private.raise_mutation_error('not_found', 'meal plan not found');
    end if;
    if current_plan.app_id <> meal_plan_data->>'id'
       or current_plan.week_of <> (meal_plan_data->>'weekOf')::date then
      perform private.raise_mutation_error('conflict', 'only the current meal plan can be edited');
    end if;

    select coalesce(max(version), 0) + 1
    into meal_plan_version
    from public.meal_plans
    where user_id = caller_id
      and app_id = current_plan.app_id;

    previous_meal_plan_row_id := current_plan.row_id;
    insert into public.meal_plans (
      app_id, user_id, version, week_of, target_row_id, supersedes_plan_row_id
    )
    values (
      current_plan.app_id,
      caller_id,
      meal_plan_version,
      current_plan.week_of,
      current_plan.target_row_id,
      previous_meal_plan_row_id
    )
    returning row_id into meal_plan_row_id;

    for meal_record in
      select value from jsonb_array_elements(meal_plan_data->'meals')
    loop
      perform private.assert_nonblank(meal_record->>'id', 'planned meal id', 128);
      perform private.assert_date_key(meal_record->>'date', 'planned meal date');
      perform private.assert_enum(meal_record->>'slot', 'planned meal slot', array['breakfast', 'lunch', 'dinner', 'snack']);
      perform private.assert_nonblank(meal_record->>'label', 'planned meal label', 256);
      perform private.assert_finite_number(meal_record->>'servings', 'planned meal servings', 0.0001, 10000);

      meal_row_id := null;
      food_row_id := null;
      if nullif(meal_record->>'mealId', '') is not null then
        select row_id into meal_row_id
        from public.meals
        where app_id = meal_record->>'mealId'
          and (is_system or owner_user_id = caller_id)
          and archived_at is null;
        if meal_row_id is null then
          perform private.raise_mutation_error('not_found', 'planned meal recipe not found');
        end if;
      end if;
      if nullif(meal_record->>'foodId', '') is not null then
        select row_id into food_row_id
        from public.foods
        where app_id = meal_record->>'foodId'
          and (is_system or owner_user_id = caller_id);
        if food_row_id is null then
          perform private.raise_mutation_error('not_found', 'planned meal food not found');
        end if;
      end if;
      if meal_row_id is not null and food_row_id is not null then
        perform private.raise_mutation_error('validation_failed', 'planned meal cannot reference both meal and food');
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
        current_plan.week_of,
        meal_record->>'id',
        (meal_record->>'date')::date,
        meal_record->>'slot',
        meal_row_id,
        food_row_id,
        btrim(meal_record->>'label'),
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
      perform private.assert_date_key(grocery_data->>'weekOf', 'grocery.weekOf');
      select row_id into grocery_row_id
      from public.grocery_lists
      where user_id = caller_id
        and (app_id = nullif(grocery_data->>'id', '')
             or week_of = (grocery_data->>'weekOf')::date)
      order by row_id desc
      limit 1
      for update;

      if grocery_row_id is null then
        perform private.raise_mutation_error('not_found', 'grocery list not found');
      end if;

      for grocery_item_record in
        select value from jsonb_array_elements(coalesce(grocery_data->'items', '[]'::jsonb))
      loop
        item_generated := (grocery_item_record->>'generatedQuantity')::numeric(12,3);
        select * into previous_item
        from public.grocery_items
        where grocery_list_row_id = grocery_row_id
          and app_id = grocery_item_record->>'id'
        for update;

        if previous_item.row_id is null then
          item_quantity := coalesce(nullif(grocery_item_record->>'quantity', '')::numeric, item_generated);
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
            when previous_item.quantity = previous_item.generated_quantity then item_generated
            else previous_item.quantity
          end;
          update public.grocery_items
          set generated_quantity = item_generated,
              quantity = item_quantity
          where row_id = previous_item.row_id
            and user_id = caller_id;
        end if;
      end loop;
      update public.grocery_lists set updated_at = now()
      where row_id = grocery_row_id and user_id = caller_id;
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'edit_meal_plan',
      'result_refs', jsonb_build_object(
        'meal_plan_id', current_plan.app_id,
        'meal_plan_version', meal_plan_version,
        'grocery_id', coalesce(grocery_data->>'id', '')
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

create or replace function public.edit_meal_plan(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.persist_meal_plan_edit(p_payload);
end;
$$;

create or replace function private.archive_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  meal_id text := nullif(p_payload->>'mealId', '');
  meal_owner uuid;
  is_system_meal boolean;
  actual_revision integer;
  expected_revision integer;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim from private.claim_mutation(
    caller_id, 'archive_saved_meal', p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'archive_saved_meal', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    if meal_id is null then perform private.raise_mutation_error('validation_failed', 'mealId is required'); end if;
    select owner_user_id, is_system, revision into meal_owner, is_system_meal, actual_revision
    from public.meals where app_id = meal_id for update;
    if not found or is_system_meal or meal_owner is distinct from caller_id then
      perform private.raise_mutation_error('not_found', 'saved meal not found');
    end if;
    if p_payload->'expectedVersions' ? 'recordRevision' then
      expected_revision := (p_payload->'expectedVersions'->>'recordRevision')::integer;
      if expected_revision <> actual_revision then
        perform private.raise_stale_version('saved_meal', expected_revision, actual_revision);
      end if;
    end if;
    update public.meals set archived_at = coalesce(archived_at, now())
    where app_id = meal_id and owner_user_id = caller_id;
    result := jsonb_build_object('status', 'completed', 'operation', 'archive_saved_meal', 'result_refs', jsonb_build_object('meal_id', meal_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.archive_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.archive_saved_meal(p_payload);
end;
$$;

revoke all on function private.persist_meal_plan_edit(jsonb) from public, anon, authenticated;
revoke all on function private.archive_saved_meal(jsonb) from public, anon, authenticated;
revoke all on function public.edit_meal_plan(jsonb) from public, anon;
revoke all on function public.archive_saved_meal(jsonb) from public, anon;
grant execute on function public.edit_meal_plan(jsonb) to authenticated;
grant execute on function public.archive_saved_meal(jsonb) to authenticated;

-- Extend the existing save boundary so recipe edits and active-plan grocery
-- reconciliation commit in the same transaction.
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
  grocery jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  ingredient jsonb;
  grocery_item_record jsonb;
  meal_id text := meal->>'id';
  saved_meal_row_id bigint;
  ingredient_food_row_id bigint;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  item_generated numeric;
  item_quantity numeric;
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
    if exists (select 1 from public.meals where app_id = meal_id and is_system) then
      perform private.raise_mutation_error('conflict', 'system meals cannot be overwritten');
    end if;

    insert into public.meals (
      app_id, owner_user_id, is_system, name, servings, notes, source_url
    )
    values (
      meal_id, caller_id, false, btrim(meal->>'name'),
      (meal->>'servings')::numeric(8,3),
      nullif(meal->>'notes', ''), nullif(meal->>'sourceUrl', '')
    )
    on conflict (app_id) do update set
      name = excluded.name,
      servings = excluded.servings,
      notes = excluded.notes,
      source_url = excluded.source_url,
      archived_at = null,
      updated_at = now()
    returning row_id into saved_meal_row_id;

    delete from public.meal_ingredients where meal_row_id = saved_meal_row_id;
    for ingredient in select value from jsonb_array_elements(coalesce(meal->'ingredients', '[]'::jsonb)) loop
      select row_id into ingredient_food_row_id
      from public.foods
      where app_id = ingredient->>'foodId'
        and (is_system or owner_user_id = caller_id);
      if ingredient_food_row_id is null then
        perform private.raise_mutation_error('not_found', 'meal ingredient food not found');
      end if;
      insert into public.meal_ingredients (meal_row_id, food_row_id, ingredient_order, servings)
      values (
        saved_meal_row_id,
        ingredient_food_row_id,
        (select count(*) + 1 from public.meal_ingredients mi where mi.meal_row_id = saved_meal_row_id),
        (ingredient->>'servings')::numeric(8,3)
      );
    end loop;

    if grocery <> '{}'::jsonb then
      select row_id into grocery_row_id
      from public.grocery_lists
      where user_id = caller_id
        and (app_id = nullif(grocery->>'id', '') or week_of = (grocery->>'weekOf')::date)
      order by row_id desc limit 1 for update;
      if grocery_row_id is null then
        perform private.raise_mutation_error('not_found', 'grocery list not found');
      end if;
      for grocery_item_record in select value from jsonb_array_elements(coalesce(grocery->'items', '[]'::jsonb)) loop
        item_generated := (grocery_item_record->>'generatedQuantity')::numeric(12,3);
        select * into previous_item
        from public.grocery_items
        where grocery_list_row_id = grocery_row_id and app_id = grocery_item_record->>'id'
        for update;
        if previous_item.row_id is null then
          item_quantity := coalesce(nullif(grocery_item_record->>'quantity', '')::numeric, item_generated);
          insert into public.grocery_items (
            grocery_list_row_id, user_id, app_id, name, category, unit,
            generated_quantity, quantity, checked, custom_item, removed, source_food_row_id
          )
          values (
            grocery_row_id, caller_id, grocery_item_record->>'id',
            btrim(grocery_item_record->>'name'), grocery_item_record->>'category',
            btrim(grocery_item_record->>'unit'), item_generated, item_quantity,
            coalesce((grocery_item_record->>'checked')::boolean, false),
            coalesce((grocery_item_record->>'custom')::boolean, false),
            coalesce((grocery_item_record->>'removed')::boolean, false),
            (select row_id from public.foods where app_id = grocery_item_record->>'foodId')
          );
        else
          item_quantity := case when previous_item.quantity = previous_item.generated_quantity
            then item_generated else previous_item.quantity end;
          update public.grocery_items
          set generated_quantity = item_generated, quantity = item_quantity
          where row_id = previous_item.row_id and user_id = caller_id;
        end if;
      end loop;
      update public.grocery_lists set updated_at = now()
      where row_id = grocery_row_id and user_id = caller_id;
    end if;

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
