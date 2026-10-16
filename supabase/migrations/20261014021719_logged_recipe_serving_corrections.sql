-- Store the actual recipe portion separately from its ingredient food units.
-- No historical backfill: legacy portions are recovered only when unambiguous.
alter table public.logged_meals add column recipe_servings numeric;
alter table public.logged_meals add constraint logged_meals_recipe_servings_valid
  check (recipe_servings is null or (recipe_servings > 0 and recipe_servings <= 10000));

create function private.infer_logged_recipe_servings(p_logged_row_id bigint)
returns numeric language plpgsql stable security invoker set search_path = '' as $$
declare logged public.logged_meals; recipe public.meals; portion numeric; ratios record;
begin
  select * into logged from public.logged_meals where row_id = p_logged_row_id and user_id = auth.uid();
  if logged.row_id is null or logged.source_mode <> 'saved_meal' then return null; end if;
  if logged.recipe_servings is not null then return logged.recipe_servings; end if;
  select * into recipe from public.meals where row_id = logged.meal_row_id;
  -- Supplied-macro logs already have a canonical one-recipe-serving food.
  select nl.servings into portion from public.nutrition_logs nl
    join public.foods f on f.row_id = nl.food_row_id
    where nl.logged_meal_row_id = logged.row_id and nl.user_id = logged.user_id
      and f.serving_label = '1 recipe serving'
      and nl.source_version like 'recipe:' || recipe.app_id || ':revision:%'
      and (select count(*) from public.nutrition_logs where logged_meal_row_id = logged.row_id) = 1;
  if portion is not null then return portion; end if;
  if recipe.servings is null or recipe.servings <= 0 then return null; end if;
  with original as (
    select food_row_id, sum(servings) quantity from public.meal_ingredients
    where meal_row_id = recipe.row_id group by food_row_id
  ), eaten as (
    select food_row_id, sum(servings) quantity from public.nutrition_logs
    where logged_meal_row_id = logged.row_id and user_id = logged.user_id group by food_row_id
  ), compared as (
    select o.quantity original_quantity, e.quantity eaten_quantity from original o
    full join eaten e using (food_row_id)
  )
  select count(*) n, bool_and(original_quantity > 0 and eaten_quantity > 0
    and original_quantity is not null and eaten_quantity is not null) complete,
    min(eaten_quantity / original_quantity) low_ratio,
    max(eaten_quantity / original_quantity) high_ratio into ratios from compared;
  if ratios.n = 0 or ratios.complete is not true or abs(ratios.high_ratio - ratios.low_ratio) > 0.000001 then return null; end if;
  return ratios.low_ratio * recipe.servings;
end;
$$;

alter function private.save_reviewed_meal(jsonb) rename to save_reviewed_meal_before_recipe_servings;
create function private.save_reviewed_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.require_authenticated(); claim record; result jsonb; logged public.logged_meals; portion numeric;
begin
  if p_payload->>'sourceMode' is distinct from 'saved_meal' then
    return private.save_reviewed_meal_before_recipe_servings(p_payload);
  end if;
  select * into claim from private.claim_mutation(caller, 'log_recipe_servings', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_reviewed_meal','replayed',true,'result_refs',claim.result_refs); end if;
  if p_payload ? 'recipeServings' then
    if jsonb_typeof(p_payload->'recipeServings') is distinct from 'number' then
      perform private.raise_mutation_error('validation_failed','Recipe servings must be a number');
    end if;
    portion := (p_payload->>'recipeServings')::numeric;
    if portion <= 0 or portion > 10000 then perform private.raise_mutation_error('validation_failed','Recipe servings must be positive and at most 10000'); end if;
  end if;
  result := private.save_reviewed_meal_before_recipe_servings(p_payload);
  select * into logged from public.logged_meals where user_id = caller and app_id = result->'result_refs'->>'logged_meal_id' for update;
  portion := coalesce(portion, private.infer_logged_recipe_servings(logged.row_id));
  if portion is not null then update public.logged_meals set recipe_servings = portion where row_id = logged.row_id and user_id = caller; end if;
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$$;

alter function private.update_logged_meal(jsonb) rename to update_logged_meal_before_recipe_servings;
create function private.update_logged_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.require_authenticated(); claim record; logged public.logged_meals;
  portion numeric; previous numeric; ratio numeric; result jsonb;
begin
  if not (p_payload ? 'recipeServings') then
    result := private.update_logged_meal_before_recipe_servings(p_payload);
    -- Ingredient edits by older clients invalidate a previously saved portion.
    if not coalesce((result->>'replayed')::boolean, false) then
      update public.logged_meals set recipe_servings = null
        where user_id = caller and app_id = p_payload->'loggedMeal'->>'id' and recipe_servings is not null;
    end if;
    return result;
  end if;
  select * into claim from private.claim_mutation(caller, 'update_logged_meal', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','update_logged_meal','replayed',true,'result_refs',claim.result_refs); end if;
  select * into logged from public.logged_meals where user_id = caller and app_id = p_payload->'loggedMeal'->>'id' for update;
  if logged.row_id is null then perform private.raise_mutation_error('not_found','Logged meal not found'); end if;
  if logged.source_mode <> 'saved_meal' then perform private.raise_mutation_error('validation_failed','Recipe servings apply only to saved recipe logs'); end if;
  if nullif(p_payload->'expectedVersions'->>'recordRevision','')::integer is distinct from logged.revision then
    perform private.raise_mutation_error('stale_version','Logged meal changed; refresh before editing');
  end if;
  if jsonb_typeof(p_payload->'recipeServings') is distinct from 'number' then
    perform private.raise_mutation_error('validation_failed','Recipe servings must be a number');
  end if;
  portion := (p_payload->>'recipeServings')::numeric;
  previous := private.infer_logged_recipe_servings(logged.row_id);
  if previous is null then
    -- Legacy non-proportional logs need the owner's explicit original portion.
    if jsonb_typeof(p_payload->'previousRecipeServings') is distinct from 'number' then
      perform private.raise_mutation_error('validation_failed','Confirm the previously logged recipe servings');
    end if;
    previous := (p_payload->>'previousRecipeServings')::numeric;
  end if;
  if portion <= 0 or portion > 10000 or previous <= 0 or previous > 10000 then
    perform private.raise_mutation_error('validation_failed','Recipe servings must be positive and at most 10000');
  end if;
  if not exists(select 1 from public.nutrition_logs where logged_meal_row_id = logged.row_id and user_id = caller) then
    perform private.raise_mutation_error('validation_failed','Logged recipe nutrition is unavailable');
  end if;
  ratio := portion / previous;
  -- Scale saved snapshots, never today's food/recipe nutrition; preserve IDs,
  -- sources, linked plans and provenance, including supplied-macro snapshots.
  update public.nutrition_logs nl set
    servings = nl.servings * ratio, serving_quantity = nl.serving_quantity * ratio,
    calories = round(nl.calories * ratio, 2), protein_g = round(nl.protein_g * ratio, 2),
    carbs_g = round(nl.carbs_g * ratio, 2), fat_g = round(nl.fat_g * ratio, 2),
    fiber_g = round(nl.fiber_g * ratio, 2),
    estimate_range = case when nl.estimate_range is null then null else (
      select jsonb_object_agg(metric.key, (
        select jsonb_object_agg(bound.key, to_jsonb(round((bound.value #>> '{}')::numeric * ratio, 2)))
        from jsonb_each(metric.value) bound
      )) from jsonb_each(nl.estimate_range) metric
    ) end
    where nl.logged_meal_row_id = logged.row_id and nl.user_id = caller;
  update public.logged_meals set recipe_servings = portion, revision = revision + 1
    where row_id = logged.row_id and user_id = caller;
  result := jsonb_build_object('status','completed','operation','update_logged_meal','result_refs',jsonb_build_object('logged_meal_id',logged.app_id));
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$$;

revoke all on function private.infer_logged_recipe_servings(bigint),
  private.save_reviewed_meal(jsonb), private.save_reviewed_meal_before_recipe_servings(jsonb),
  private.update_logged_meal(jsonb), private.update_logged_meal_before_recipe_servings(jsonb) from public, anon, authenticated;
revoke all on function public.save_reviewed_meal(jsonb), public.update_logged_meal(jsonb) from public, anon;
grant execute on function public.save_reviewed_meal(jsonb), public.update_logged_meal(jsonb) to authenticated;
revoke insert, update, delete on public.logged_meals from anon, authenticated;
notify pgrst, 'reload schema';
