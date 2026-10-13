-- Prefer authoritative supplied recipe macros for new or explicitly edited plans.
-- Existing prescriptions and eaten history are intentionally not backfilled.

create or replace function private.normalize_planned_meal_record(
  p_record jsonb,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb := p_record;
  meal_row public.meals%rowtype;
  food_row public.foods%rowtype;
  meal_ref text := nullif(p_record->>'mealId', '');
  food_ref text := nullif(p_record->>'foodId', '');
  servings numeric := (p_record->>'servings')::numeric;
  calories numeric := 0;
  protein numeric := 0;
  carbs numeric := 0;
  fat numeric := 0;
  fiber numeric := 0;
  has_fiber boolean := false;
begin
  if meal_ref is not null and food_ref is not null then
    perform private.raise_mutation_error('validation_failed', 'planned meal cannot reference both meal and food');
  end if;
  if servings is null or servings <= 0 then
    perform private.raise_mutation_error('validation_failed', 'planned meal servings must be positive');
  end if;

  if meal_ref is not null then
    select * into meal_row from public.meals
    where app_id = meal_ref and (is_system or owner_user_id = p_user_id) and archived_at is null;
    if meal_row.row_id is null then
      perform private.raise_mutation_error('not_found', 'planned meal recipe not found');
    end if;
    if meal_row.provided_nutrition is not null then
      if not private.valid_provided_recipe_nutrition(meal_row.provided_nutrition) then
        perform private.raise_mutation_error('validation_failed', 'recipe supplied nutrition is invalid');
      end if;
      -- A supplied four-macro record does not supply fiber; never retain client fiber.
      return (result - 'expectedFiberG') || jsonb_build_object(
        'label', coalesce(nullif(p_record->>'label', ''), meal_row.name),
        'expectedCalories', round((meal_row.provided_nutrition->>'calories')::numeric * servings, 2),
        'expectedProteinG', round((meal_row.provided_nutrition->>'proteinG')::numeric * servings, 2),
        'expectedCarbsG', round((meal_row.provided_nutrition->>'carbsG')::numeric * servings, 2),
        'expectedFatG', round((meal_row.provided_nutrition->>'fatG')::numeric * servings, 2),
        'source', 'source-provided', 'sourceVersion', 'recipe:' || meal_row.app_id || ':revision:' || meal_row.revision,
        'assumptions', 'Source-provided nutrition per serving; not independently verified or recalculated from ingredients. Reference: ' || coalesce(meal_row.reference, 'user provided'),
        'confidence', 'medium', 'preparationBasis', 'as_labeled'
      );
    end if;
    select coalesce(sum(f.calories * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.protein_g * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.carbs_g * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.fat_g * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.fiber_g * ingredient.servings / meal_row.servings), 0),
      bool_or(f.fiber_g is not null)
    into calories, protein, carbs, fat, fiber, has_fiber
    from public.meal_ingredients ingredient
    join public.foods f on f.row_id = ingredient.food_row_id
    where ingredient.meal_row_id = meal_row.row_id;
    result := result || jsonb_build_object(
      'label', coalesce(nullif(p_record->>'label', ''), meal_row.name),
      'expectedCalories', round(calories * servings, 2),
      'expectedProteinG', round(protein * servings, 2),
      'expectedCarbsG', round(carbs * servings, 2),
      'expectedFatG', round(fat * servings, 2),
      'source', 'trusted-catalog', 'sourceVersion', 'database-catalog',
      'assumptions', 'Calculated from the saved recipe and versioned food catalog.',
      'confidence', 'medium', 'preparationBasis', 'as_labeled'
    );
    if has_fiber then
      result := result || jsonb_build_object('expectedFiberG', round(fiber * servings, 2));
    end if;
  elsif food_ref is not null then
    select * into food_row from public.foods
    where app_id = food_ref and (is_system or owner_user_id = p_user_id);
    if food_row.row_id is null then
      perform private.raise_mutation_error('not_found', 'planned meal food not found');
    end if;
    result := result || jsonb_build_object(
      'label', coalesce(nullif(p_record->>'label', ''), food_row.name),
      'expectedCalories', round(food_row.calories * servings, 2),
      'expectedProteinG', round(food_row.protein_g * servings, 2),
      'expectedCarbsG', round(food_row.carbs_g * servings, 2),
      'expectedFatG', round(food_row.fat_g * servings, 2),
      'source', food_row.source, 'sourceVersion', food_row.source_version,
      'assumptions', 'Calculated from the versioned food catalog serving size.',
      'confidence', food_row.confidence, 'preparationBasis', food_row.preparation_basis
    );
    if food_row.fiber_g is not null then
      result := result || jsonb_build_object('expectedFiberG', round(food_row.fiber_g * servings, 2));
    end if;
  else
    result := result || jsonb_build_object(
      'expectedCalories', 0, 'expectedProteinG', 0, 'expectedCarbsG', 0,
      'expectedFatG', 0, 'source', 'user-choice', 'sourceVersion', 'unknown',
      'assumptions', 'No trusted catalog match; confirm the meal before logging.',
      'confidence', 'low', 'preparationBasis', 'unknown'
    );
  end if;
  return result;
end;
$$;

revoke all on function private.normalize_planned_meal_record(jsonb, uuid) from public, anon, authenticated;


create or replace function private.check_meal_constraints() returns trigger
language plpgsql security definer set search_path = '' as $$
declare plan public.meal_plans%rowtype; day_carbs numeric; forbidden boolean;
begin
  select * into plan from public.meal_plans where row_id = new.meal_plan_row_id;
  if plan.total_carb_limit is null then return null; end if;
  -- Supplied macros remain unverified even when the grocery ingredients are trusted.
  if exists (select 1 from public.planned_meals pm join public.meals m on m.row_id = pm.meal_row_id
    where pm.meal_plan_row_id = plan.row_id and not pm.skipped and m.provided_nutrition is not null) then
    perform private.raise_mutation_error('validation_failed', 'carb-limited plans require verified catalog nutrition');
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
revoke all on function private.check_meal_constraints() from public, anon, authenticated;

notify pgrst, 'reload schema';
