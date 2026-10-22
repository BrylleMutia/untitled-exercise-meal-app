-- Preserve recorded uncertainty when advisory generation admits estimated ingredient nutrition.
CREATE OR REPLACE FUNCTION private.normalize_planned_meal_record(p_record jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'source', case when exists(select 1 from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=meal_row.row_id and f.value_source='ai_estimate') then 'AI-estimated recipe' when exists(select 1 from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=meal_row.row_id and f.value_source<>'trusted_catalog') then 'user-provided recipe' else 'trusted-catalog' end,
      'sourceVersion', 'recipe:'||meal_row.app_id||':revision:'||meal_row.revision,
      'assumptions', 'Calculated from saved ingredient quantities and their recorded nutrition sources; values and portions are estimates. Unmeasured ingredients are not included.',
      'confidence', case when exists(select 1 from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=meal_row.row_id and f.value_source='ai_estimate') then 'low' else 'medium' end, 'preparationBasis', 'as_labeled'
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
$function$;
revoke all on function private.normalize_planned_meal_record(jsonb,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
