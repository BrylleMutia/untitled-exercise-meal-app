-- Explicitly provided recipe macros take precedence over ingredient estimates.
-- This never updates existing nutrition_logs or substitutes food nutrient values.
create function private.valid_provided_recipe_nutrition(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare key text;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  foreach key in array array['calories','proteinG','carbsG','fatG'] loop
    if jsonb_typeof(value->key) is distinct from 'number' then return false; end if;
    if (value->>key)::numeric not between 0 and 10000 then return false; end if;
  end loop;
  return true;
end;
$$;
alter table public.meals add column provided_nutrition jsonb;
alter table public.meals add constraint meals_provided_nutrition_shape check(private.valid_provided_recipe_nutrition(provided_nutrition));
update public.meals set provided_nutrition='{"calories":560,"proteinG":45,"carbsG":58,"fatG":16}',
  notes=regexp_replace(notes,'App nutrition is calculated[\s\S]*$','The app uses the source-provided macros above per serving, without recalculating them from the ingredients. Ingredient nutrition records are retained for ingredient information and groceries; they do not replace the supplied recipe macros. Garnish weights are assumptions for grocery quantities. Soy sauce contains soy and wheat; sesame oil and seeds contain sesame. Cooking time was not supplied. The generated cover is illustrative.')
where app_id='meal-korean-beef-bowl' and is_system;

alter function private.save_saved_meal(jsonb) rename to save_saved_meal_before_provided_nutrition;
create function private.save_saved_meal(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); result jsonb; macros jsonb:=nullif(p_payload->'meal'->'providedNutrition','null'::jsonb);
begin
  if not private.valid_provided_recipe_nutrition(macros) then
    perform private.raise_mutation_error('validation_failed','Provided nutrition requires nonnegative calories, protein, carbs and fat per serving');
  end if;
  result:=private.save_saved_meal_before_provided_nutrition(p_payload);
  if not coalesce((result->>'replayed')::boolean,false) and p_payload->'meal' ? 'providedNutrition' then
    update public.meals set provided_nutrition=macros where app_id=p_payload->'meal'->>'id' and owner_user_id=caller;
  end if;
  return result;
end;
$$;
revoke all on function private.valid_provided_recipe_nutrition(jsonb),private.save_saved_meal(jsonb),
  private.save_saved_meal_before_provided_nutrition(jsonb) from public,anon,authenticated;

-- Persist one explicitly sourced recipe portion, rather than inventing ingredient
-- nutrient adjustments. The server takes values from the stored recipe.
alter function private.save_reviewed_meal(jsonb) rename to save_reviewed_meal_before_provided_nutrition;
create function private.save_reviewed_meal(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe public.meals; claim record; result jsonb; portion numeric; item jsonb;
begin
  select * into recipe from public.meals where app_id=p_payload->'meal'->>'id' and (is_system or owner_user_id=caller) for share;
  if recipe.provided_nutrition is null then return private.save_reviewed_meal_before_provided_nutrition(p_payload); end if;
  select * into claim from private.claim_mutation(caller,'log_provided_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_reviewed_meal','replayed',true,'result_refs',claim.result_refs); end if;
  if jsonb_typeof(p_payload->'ingredients') is distinct from 'array' or jsonb_array_length(p_payload->'ingredients')<>1 then
    perform private.raise_mutation_error('validation_failed','Log provided recipe macros as a recipe portion');
  end if;
  item:=p_payload->'ingredients'->0;
  if jsonb_typeof(item->'servings') is distinct from 'number' then
    perform private.raise_mutation_error('validation_failed','Actual recipe servings are required');
  end if;
  portion:=(item->>'servings')::numeric;
  if portion<=0 or portion>10000 then perform private.raise_mutation_error('validation_failed','Invalid recipe portion'); end if;
  item:=jsonb_build_object('id',item->>'id','customName',recipe.name||' · provided recipe macros',
    'servings',portion,'servingGrams',1,'servingLabel','1 recipe serving','servingUnit','serving',
    'calories',recipe.provided_nutrition->'calories','proteinG',recipe.provided_nutrition->'proteinG',
    'carbsG',recipe.provided_nutrition->'carbsG','fatG',recipe.provided_nutrition->'fatG',
    'valueSource','user_provided','estimated',true,'confidence','medium','preparationBasis','as_labeled',
    'sourceVersion','recipe:'||recipe.app_id||':revision:'||recipe.revision,
    'assumptions','Source-provided recipe macros per serving; not recalculated from ingredients. Reference: '||coalesce(recipe.reference,'user provided'));
  result:=private.save_reviewed_meal_before_provided_nutrition(p_payload||jsonb_build_object('ingredients',jsonb_build_array(item)));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;
revoke all on function private.save_reviewed_meal(jsonb),private.save_reviewed_meal_before_provided_nutrition(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';

create or replace function private.check_meal_constraints() returns trigger
language plpgsql security definer set search_path = '' as $$
declare plan public.meal_plans%rowtype; day_carbs numeric; forbidden boolean;
begin
  select * into plan from public.meal_plans where row_id = new.meal_plan_row_id;
  if plan.total_carb_limit is null then return null; end if;
  if exists(select 1 from public.planned_meals pm join public.meals m on m.row_id=pm.meal_row_id where pm.meal_plan_row_id=plan.row_id and not pm.skipped and m.provided_nutrition is not null) then
    perform private.raise_mutation_error('validation_failed','Source-provided recipe macros are unverified for carbohydrate-limited plans');
  end if;
  -- Check authoritative ingredients rather than client supplied totals. Empty slots
  -- remain unresolved; they do not assert that the whole day is compliant.
  if exists (select 1 from public.planned_meals pm where pm.meal_plan_row_id = plan.row_id
    and pm.meal_row_id is not null and not exists
      (select 1 from public.meal_ingredients i where i.meal_row_id = pm.meal_row_id)) then
    perform private.raise_mutation_error('validation_failed', 'recipe has no verified serving data');
  end if;
  with ingredients as (
    select pm.meal_date, f.*, pm.servings as quantity
      from public.planned_meals pm join public.foods f on f.row_id = pm.food_row_id
      where pm.meal_plan_row_id = plan.row_id and not pm.skipped
    union all
    select pm.meal_date, f.*, pm.servings * i.servings / m.servings as quantity
      from public.planned_meals pm join public.meals m on m.row_id = pm.meal_row_id
      join public.meal_ingredients i on i.meal_row_id = m.row_id
      join public.foods f on f.row_id = i.food_row_id
      where pm.meal_plan_row_id = plan.row_id and not pm.skipped
  ), checked as (
    select *, value_source <> 'trusted_catalog'
      or (lower(plan.dietary_pattern) like '%vegan%' and app_id in
        ('food-egg','food-chicken','food-salmon','food-greek-yogurt','food-milk','food-cheddar','food-butter','food-honey','food-mvp3-173424','food-mvp3-171477','food-lemon-chicken-172385','food-korean-beef-171790','food-lemon-chicken-173410','food-lemon-chicken-171265','food-lemon-chicken-169640'))
      or (lower(plan.dietary_pattern) like '%vegetarian%' and app_id in ('food-chicken','food-salmon','food-mvp3-171477','food-lemon-chicken-172385','food-korean-beef-171790'))
      or exists (select 1 from unnest(plan.allergies) allergy where btrim(allergy) <> '' and (
        position(lower(btrim(allergy)) in lower(name)) > 0
        or (lower(allergy) ~ 'nut' and lower(name) ~ 'peanut|almond|nut')
        or (lower(allergy) ~ 'soy' and lower(name) ~ 'soy|tofu')
        or (lower(allergy) ~ 'dairy|milk' and category = 'Dairy')
        or (lower(allergy) ~ 'gluten|wheat' and lower(name) ~ 'wheat|bread|pasta')
        or (lower(allergy) ~ 'egg' and lower(name) ~ 'egg')
        or (lower(allergy) ~ 'fish|seafood' and lower(name) ~ 'salmon|fish')
      )) as invalid from ingredients
  ) select coalesce(max(carbs),0), coalesce(bool_or(invalid),false) into day_carbs, forbidden
    from (select meal_date, sum(carbs_g * quantity) carbs, bool_or(invalid) invalid from checked group by meal_date) days;
  if forbidden then perform private.raise_mutation_error('validation_failed', 'meal choice conflicts with verified diet or allergy constraints'); end if;
  if day_carbs > plan.total_carb_limit then perform private.raise_mutation_error('validation_failed', 'daily total carbohydrate limit exceeded'); end if;
  return null;
end;
$$;
revoke all on function private.check_meal_constraints() from public,anon,authenticated;
