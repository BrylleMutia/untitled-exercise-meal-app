-- Cooking presentation is separate from authoritative ingredient food servings.
create function private.valid_cooking_measurement(p_value jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare field text; kind text;
begin
  if p_value is null or p_value='null'::jsonb then return true; end if;
  if jsonb_typeof(p_value)<>'object' then return false; end if;
  kind:=p_value->>'kind';
  if kind is null or kind not in ('amount','range','unmeasured') then return false; end if;
  if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('kind','name','text','quantity','upperQuantity','unit','gramsPerUnit','optional','note')) then return false; end if;
  foreach field in array array['name','text','unit','note'] loop
    if p_value ? field and (jsonb_typeof(p_value->field)<>'string' or btrim(p_value->>field)='' or char_length(p_value->>field)>case field when 'note' then 1000 when 'unit' then 40 else 256 end) then return false; end if;
  end loop;
  if p_value ? 'optional' and jsonb_typeof(p_value->'optional')<>'boolean' then return false; end if;
  foreach field in array array['quantity','upperQuantity','gramsPerUnit'] loop
    if p_value ? field then
      if jsonb_typeof(p_value->field)<>'number' then return false; end if;
      if (p_value->>field)::numeric<=0 or (p_value->>field)::numeric>1000000 then return false; end if;
    end if;
  end loop;
  if kind='unmeasured' then return p_value ? 'text' and not (p_value ?| array['quantity','upperQuantity','unit','gramsPerUnit']); end if;
  if not (p_value ? 'quantity' and p_value ? 'unit') then return false; end if;
  if kind='range' then return p_value ? 'upperQuantity' and (p_value->>'upperQuantity')::numeric>=(p_value->>'quantity')::numeric; end if;
  return not (p_value ? 'upperQuantity');
end;
$$;
create function private.valid_unmeasured_ingredients(p_value jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb;
begin
  if p_value is null or p_value='null'::jsonb then return true; end if;
  if jsonb_typeof(p_value)<>'array' then return false; end if;
  if jsonb_array_length(p_value)>100 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item)<>'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('name','measurement','optional')) then return false; end if;
    if jsonb_typeof(item->'name') is distinct from 'string' or btrim(item->>'name')='' or char_length(item->>'name')>256
      or jsonb_typeof(item->'measurement') is distinct from 'string' or btrim(item->>'measurement')='' or char_length(item->>'measurement')>256
      or (item ? 'optional' and jsonb_typeof(item->'optional')<>'boolean') then return false; end if;
  end loop;
  return true;
end;
$$;
alter table public.meal_ingredients add column cooking_measurement jsonb;
alter table public.meal_ingredients add constraint meal_ingredients_cooking_measurement_valid check(private.valid_cooking_measurement(cooking_measurement));
alter table public.meals add column unmeasured_ingredients jsonb, add column nutrition_notes text;
alter table public.meals add constraint meals_unmeasured_ingredients_valid check(private.valid_unmeasured_ingredients(unmeasured_ingredients));
alter table public.meals add constraint meals_nutrition_notes_length check(nutrition_notes is null or char_length(nutrition_notes)<=10000);

alter function private.save_saved_meal(jsonb) rename to save_saved_meal_before_cooking_measurements;
create function private.save_saved_meal(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe jsonb:=p_payload->'meal';
  claim record; result jsonb; old_row public.meals; saved public.meals;
  old_ingredients jsonb; new_ingredients jsonb; prior_measurements jsonb; item jsonb;
  old_same boolean; order_no integer:=0; measurement jsonb; food public.foods;
  quantity numeric; factor numeric; expected_servings numeric; extras jsonb; nutrition_text text;
begin
  select * into claim from private.claim_mutation(caller,'save_cooking_measurements',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_saved_meal','replayed',true,'result_refs',claim.result_refs); end if;
  -- Use the existing profile/plan/grocery/recipe lock order before capturing
  -- legacy metadata that the child transaction replaces.
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller);
  select * into old_row from public.meals where app_id=recipe->>'id' and owner_user_id=caller;
  select coalesce(jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings) order by i.ingredient_order),'[]'),
    coalesce(jsonb_agg(i.cooking_measurement order by i.ingredient_order),'[]')
    into old_ingredients,prior_measurements from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=old_row.row_id;
  if recipe ? 'unmeasuredIngredients' and not private.valid_unmeasured_ingredients(recipe->'unmeasuredIngredients') then
    perform private.raise_mutation_error('validation_failed','Invalid unmeasured cooking ingredients');
  end if;
  if recipe ? 'nutritionNotes' and (jsonb_typeof(recipe->'nutritionNotes') not in ('string','null') or char_length(recipe->>'nutritionNotes')>10000) then
    perform private.raise_mutation_error('validation_failed','Nutrition notes must be text of at most 10000 characters');
  end if;
  result:=private.save_saved_meal_before_cooking_measurements(p_payload);
  if coalesce((result->>'replayed')::boolean,false) then
    perform private.complete_mutation(claim.mutation_row_id,result->'result_refs'); return result;
  end if;
  select * into saved from public.meals where app_id=recipe->>'id' and owner_user_id=caller;
  if saved.row_id is null then perform private.raise_mutation_error('not_found','Recipe not found'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings) order by i.ingredient_order),'[]')
    into new_ingredients from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=saved.row_id;
  old_same:=old_ingredients=new_ingredients;
  for item in select value from jsonb_array_elements(recipe->'ingredients') loop
    order_no:=order_no+1;
    measurement:=case when item ? 'cookingMeasurement' then nullif(item->'cookingMeasurement','null'::jsonb)
      when old_same then nullif(prior_measurements->(order_no-1),'null'::jsonb) else null end;
    if not private.valid_cooking_measurement(measurement) then perform private.raise_mutation_error('validation_failed','Invalid ingredient cooking measurement'); end if;
    if measurement is not null and measurement->>'kind'<>'unmeasured' then
      select f.* into food from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=saved.row_id and i.ingredient_order=order_no;
      quantity:=case when measurement->>'kind'='range' then (measurement->>'upperQuantity')::numeric else (measurement->>'quantity')::numeric end;
      factor:=case when measurement ? 'gramsPerUnit' then (measurement->>'gramsPerUnit')::numeric else
        case measurement->>'unit' when 'g' then 1 when 'kg' then 1000 when 'mg' then 0.001 when 'oz' then 28.349523125 when 'lb' then 453.59237
          when 'serving' then food.serving_grams when 'piece' then case when food.serving_unit='piece' then food.serving_grams else null end
          else null end end;
      if factor is null then perform private.raise_mutation_error('validation_failed','Confirm grams per cooking unit before saving'); end if;
      expected_servings:=quantity*factor/food.serving_grams;
      if abs(expected_servings-(item->>'servings')::numeric)>0.00051 then
        perform private.raise_mutation_error('validation_failed','Cooking measurement must match the nutrition quantity; ranges use the upper amount');
      end if;
    end if;
    update public.meal_ingredients set cooking_measurement=measurement where meal_row_id=saved.row_id and ingredient_order=order_no;
  end loop;
  extras:=case when recipe ? 'unmeasuredIngredients' then nullif(recipe->'unmeasuredIngredients','null'::jsonb) when old_same then old_row.unmeasured_ingredients else null end;
  nutrition_text:=case when recipe ? 'nutritionNotes' then nullif(btrim(recipe->>'nutritionNotes'),'') when old_same then old_row.nutrition_notes else null end;
  if saved.unmeasured_ingredients is distinct from extras or saved.nutrition_notes is distinct from nutrition_text then
    update public.meals set unmeasured_ingredients=extras,nutrition_notes=nutrition_text where row_id=saved.row_id and owner_user_id=caller;
  end if;
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;
revoke all on function private.valid_cooking_measurement(jsonb),private.valid_unmeasured_ingredients(jsonb),
  private.save_saved_meal(jsonb),private.save_saved_meal_before_cooking_measurements(jsonb) from public,anon,authenticated;
revoke insert,update,delete on public.meals,public.meal_ingredients from anon,authenticated;
revoke all on function public.save_recipe(jsonb),public.save_saved_meal(jsonb) from public,anon;
grant execute on function public.save_recipe(jsonb),public.save_saved_meal(jsonb) to authenticated;

do $catalog$
declare recipe_row public.meals; canonical jsonb; item jsonb; order_no integer:=0;
begin
  select * into recipe_row from public.meals where app_id='meal-creamy-lemon-chicken' and is_system;
  select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings) order by i.ingredient_order) into canonical
    from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=recipe_row.row_id;
  if canonical='[{"foodId":"food-lemon-chicken-172385","servings":4},{"foodId":"food-lemon-chicken-173410","servings":0.3},{"foodId":"food-lemon-chicken-169761","servings":0.08},{"foodId":"food-lemon-chicken-171265","servings":3.09},{"foodId":"food-lemon-chicken-167747","servings":0.47},{"foodId":"food-lemon-chicken-169640","servings":0.21}]'::jsonb and recipe_row.notes like 'Ingredients for %' then
    for item in select value from jsonb_array_elements('[{"kind":"amount","name":"Chicken thigh fillet","quantity":400,"unit":"g","note":"Marinate with salt and pepper"},{"kind":"range","name":"Butter","quantity":25,"upperQuantity":30,"unit":"g"},{"kind":"amount","name":"All-purpose flour","quantity":1,"unit":"tbsp","gramsPerUnit":8},{"kind":"amount","name":"Milk","quantity":300,"unit":"ml","gramsPerUnit":1.03},{"kind":"amount","name":"Lemon juice","text":"Juice of 1 lemon","quantity":1,"unit":"lemon","gramsPerUnit":47},{"kind":"amount","name":"Honey","quantity":1,"unit":"tbsp","gramsPerUnit":21}]'::jsonb) loop
      order_no:=order_no+1;
      update public.meal_ingredients set cooking_measurement=item where meal_row_id=recipe_row.row_id and ingredient_order=order_no;
    end loop;
    update public.meals set notes='1. Marinate the chicken with salt and pepper. Pan-fry skin-side down over medium heat without oil, letting the natural fat render until the skin is golden brown and crispy.
2. Flip and cook for another 5–10 minutes, or until fully cooked through. Check that the thickest part reaches 74°C (165°F); time varies with thickness. Remove the chicken and keep it aside.
3. In the same pan, melt the butter. Add the flour and cook briefly to form a roux. Slowly pour in the milk while stirring continuously to avoid lumps.
4. Stir in the lemon juice and honey. Season to taste with salt, pepper, chicken bouillon powder and MSG.
5. Return the chicken to the sauce and simmer for 1–2 minutes so everything comes together.',nutrition_notes='Nutrition estimate: 2 equal servings; 400 g raw boneless skin-on thigh meat, the upper butter amount of 30 g, whole milk, 8 g flour, 47 g lemon juice and 21 g honey. Milk conversion: 1 ml ≈ 1.03 g. Counts all chicken fat and sauce as eaten. Milk type, butter quantity and discarded rendered fat change the result. Salt, pepper, chicken bouillon powder and MSG are unmeasured and excluded from nutrition and grocery quantities; sodium is not estimated. Rice and other sides are not included. The generated image is illustrative.',
      unmeasured_ingredients='[{"name":"Salt","measurement":"To taste"},{"name":"Pepper","measurement":"To taste"},{"name":"Chicken bouillon powder","measurement":"To taste"},{"name":"MSG","measurement":"To taste"}]'::jsonb where row_id=recipe_row.row_id;
  end if;
end;
$catalog$;

do $catalog$
declare recipe_row public.meals; canonical jsonb; item jsonb; order_no integer:=0;
begin
  select * into recipe_row from public.meals where app_id='meal-korean-beef-bowl' and is_system;
  select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings) order by i.ingredient_order) into canonical
    from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=recipe_row.row_id;
  if canonical='[{"foodId":"food-korean-beef-171790","servings":6},{"foodId":"food-korean-beef-168877","servings":2.5},{"foodId":"food-korean-beef-174277","servings":0.32},{"foodId":"food-lemon-chicken-169640","servings":0.21},{"foodId":"food-korean-beef-171016","servings":0.045},{"foodId":"food-korean-beef-169230","servings":0.06},{"foodId":"food-korean-beef-169231","servings":0.02},{"foodId":"food-korean-beef-170393","servings":0.61},{"foodId":"food-korean-beef-168409","servings":1.5},{"foodId":"food-korean-beef-170150","servings":0.03},{"foodId":"food-korean-beef-170005","servings":0.15}]'::jsonb and recipe_row.notes like 'Ingredients for %' then
    for item in select value from jsonb_array_elements('[{"kind":"amount","name":"Beef mince, 5% fat","quantity":600,"unit":"g"},{"kind":"amount","name":"Jasmine rice","quantity":250,"unit":"g","note":"Uncooked"},{"kind":"amount","name":"Soy sauce","quantity":2,"unit":"tbsp","gramsPerUnit":16},{"kind":"amount","name":"Honey","quantity":1,"unit":"tbsp","gramsPerUnit":21},{"kind":"amount","name":"Sesame oil","quantity":1,"unit":"tsp","gramsPerUnit":4.5},{"kind":"amount","name":"Garlic","text":"2 cloves","quantity":2,"unit":"clove","gramsPerUnit":3},{"kind":"amount","name":"Ginger","quantity":1,"unit":"tsp","gramsPerUnit":2,"optional":true},{"kind":"amount","name":"Carrot","text":"1 carrot","quantity":1,"unit":"carrot","gramsPerUnit":61,"note":"Julienned"},{"kind":"amount","name":"Cucumber","text":"½ cucumber","quantity":0.5,"unit":"cucumber","gramsPerUnit":300,"note":"Sliced"},{"kind":"unmeasured","name":"Sesame seeds","text":"For garnish","note":"Amount not specified"},{"kind":"unmeasured","name":"Spring onion","text":"For garnish","note":"Amount not specified"}]'::jsonb) loop
      order_no:=order_no+1;
      update public.meal_ingredients set cooking_measurement=item where meal_row_id=recipe_row.row_id and ingredient_order=order_no;
    end loop;
    update public.meals set notes='1. Cook the rice according to its package instructions.
2. Brown the mince and drain excess liquid. Cook ground beef through to 71°C (160°F).
3. Add garlic, soy sauce, honey, sesame oil, and ginger if using.
4. Simmer until glossy.
5. Divide the beef and cooked rice equally into 4 portions.
6. Add fresh carrot and cucumber on the side. Finish with sesame seeds and spring onion.',nutrition_notes='Source-reported macros per serving: approximately 560 kcal, 45 g protein, 58 g carbs, 16 g fat. These are reference estimates supplied with the recipe and have not been independently verified. The app uses these source-provided macros without recalculating them from ingredients. Ingredient records support groceries and ingredient information. Confirmed recipe assumptions: 16 g per tbsp soy sauce, 21 g per tbsp honey, 4.5 g per tsp sesame oil, 3 g per garlic clove, 2 g per tsp ginger, 61 g per carrot and 300 g per whole cucumber. Optional ginger is included in grocery quantities. The source did not quantify sesame seeds or spring onion; the existing 3 g and 15 g garnish assumptions are retained for groceries. Soy sauce contains soy and wheat; sesame oil and seeds contain sesame. Cooking time was not supplied. The generated cover is illustrative.',
      unmeasured_ingredients='[]'::jsonb where row_id=recipe_row.row_id;
  end if;
end;
$catalog$;
notify pgrst,'reload schema';
