-- Meal labels are user-editable presentation data. Trusted normalization must
-- recalculate nutrition and provenance without replacing an explicit label.

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
