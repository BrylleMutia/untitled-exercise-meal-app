-- Authored cooking rows remain independent of nutrition-serving records.
alter table public.meals add column cooking_ingredients jsonb;
alter table public.meals add column nutrition_input jsonb;

create function private.valid_cooking_ingredients(p_value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; ids text[]:='{}';
begin
 if p_value is null then return true; end if;
 if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_value)>100 then return false; end if;
 for item in select value from jsonb_array_elements(p_value) loop
  if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','foodId','nutritionServings','cookingMeasurement')) then return false; end if;
  if jsonb_typeof(item->'id') is distinct from 'string' or length(btrim(item->>'id'))=0 or length(item->>'id')>128 or item->>'id'=any(ids) then return false; end if;
  ids:=ids||(item->>'id');
  if not private.valid_cooking_measurement(item->'cookingMeasurement') or jsonb_typeof(item->'cookingMeasurement') is distinct from 'object' or length(btrim(coalesce(item->'cookingMeasurement'->>'name','')))=0 then return false; end if;
  if item ? 'foodId' and (jsonb_typeof(item->'foodId') is distinct from 'string' or length(btrim(item->>'foodId'))=0 or length(item->>'foodId')>128) then return false; end if;
  if item ? 'nutritionServings' and (not item ? 'foodId' or jsonb_typeof(item->'nutritionServings') is distinct from 'number' or (item->>'nutritionServings')::numeric<0.0001 or (item->>'nutritionServings')::numeric>10000) then return false; end if;
 end loop;
 return true;
end; $$;
alter table public.meals add constraint meals_cooking_ingredients_check check(private.valid_cooking_ingredients(cooking_ingredients));

create function private.validate_recipe_cooking(p_recipe jsonb,p_caller uuid) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; input jsonb:=p_recipe->'nutritionInput'; factor numeric; key text; macros jsonb:=nullif(p_recipe->'providedNutrition','null'::jsonb); normalized numeric;
begin
 if p_recipe ? 'cookingIngredients' then
  if not private.valid_cooking_ingredients(p_recipe->'cookingIngredients') or jsonb_array_length(p_recipe->'cookingIngredients')=0 or jsonb_array_length(p_recipe->'cookingIngredients')+jsonb_array_length(coalesce(p_recipe->'unmeasuredIngredients','[]'))>100 then perform private.raise_mutation_error('validation_failed','Check the cooking ingredient list'); end if;
  for item in select value from jsonb_array_elements(p_recipe->'cookingIngredients') loop
   if item ? 'foodId' and not exists(select 1 from public.foods f where f.app_id=item->>'foodId' and (f.is_system or f.owner_user_id=p_caller)) then perform private.raise_mutation_error('not_found','Ingredient nutrition source unavailable'); end if;
   if macros is null and (not item ? 'foodId' or not item ? 'nutritionServings' or not exists(select 1 from jsonb_array_elements(p_recipe->'ingredients') i where i->>'foodId'=item->>'foodId' and abs((i->>'servings')::numeric-(item->>'nutritionServings')::numeric)<0.000001)) then perform private.raise_mutation_error('validation_failed','Ingredient calculations require a nutrition source and conversion for every ingredient'); end if;
  end loop;
 end if;
 if input is not null then
  if jsonb_typeof(input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(input) k where k not in ('method','basis','values')) or coalesce(input->>'method','') not in ('provided','ingredients') or coalesce(input->>'basis','') not in ('per-serving','whole-recipe') then perform private.raise_mutation_error('validation_failed','Invalid recipe nutrition method or basis'); end if;
  if input->>'method'='provided' then
   if macros is null or not private.valid_provided_recipe_nutrition(macros) or jsonb_typeof(input->'values') is distinct from 'object' then perform private.raise_mutation_error('validation_failed','Enter all four recipe macro values'); end if;
   factor:=case when input->>'basis'='whole-recipe' then (p_recipe->>'servings')::numeric else 1 end;
   foreach key in array array['calories','proteinG','carbsG','fatG'] loop
    if jsonb_typeof(input->'values'->key) is distinct from 'number' then perform private.raise_mutation_error('validation_failed','Enter all four recipe macro values'); end if;
    normalized:=(input->'values'->>key)::numeric/factor;
    if normalized<0 or normalized>10000 or abs(normalized-(macros->>key)::numeric)>greatest(1,abs(normalized))*0.000000001 then perform private.raise_mutation_error('validation_failed','Recipe macros do not match their source basis and yield'); end if;
   end loop;
  elsif macros is not null then perform private.raise_mutation_error('validation_failed','Ingredient nutrition cannot override recipe macros'); end if;
 end if;
end; $$;

do $patch$
declare definition text; original text;
begin
 select pg_get_functiondef('private.validate_mutation_payload(text,jsonb)'::regprocedure) into definition;
 original:='if jsonb_array_length(meal_data->''ingredients'') = 0 then';
 if position(original in definition)=0 then raise exception 'Recipe validation baseline differs'; end if;
 execute replace(definition,original,'if jsonb_array_length(meal_data->''ingredients'') = 0 and not (private.valid_provided_recipe_nutrition(nullif(meal_data->''providedNutrition'',''null''::jsonb)) and meal_data->''providedNutrition'' is not null and private.valid_cooking_ingredients(meal_data->''cookingIngredients'') and jsonb_typeof(meal_data->''cookingIngredients'')=''array'' and jsonb_array_length(meal_data->''cookingIngredients'')>0) then');
 select pg_get_functiondef('private.save_authored_recipe_without_complexity(jsonb)'::regprocedure) into definition;
 original:='jsonb_array_elements(recipe->''ingredients'') i where i->>''foodId''=food->>''id''';
 if position(original in definition)=0 then raise exception 'Recipe food baseline differs'; end if;
 execute replace(definition,original,'jsonb_array_elements((recipe->''ingredients'')||coalesce(recipe->''cookingIngredients'',''[]''::jsonb)) i where i->>''foodId''=food->>''id''');
 select pg_get_functiondef('private.save_saved_meal(jsonb)'::regprocedure) into definition;
 execute replace(definition,'private.save_saved_meal(', 'private.save_saved_meal_before_optional_conversions(');
end; $patch$;

create or replace function private.save_saved_meal(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe jsonb:=p_payload->'meal'; result jsonb; week date;
begin
 perform private.validate_recipe_cooking(recipe,caller);
 result:=private.save_saved_meal_before_optional_conversions(p_payload);
 if not coalesce((result->>'replayed')::boolean,false) then
  update public.meals set cooking_ingredients=case when recipe ? 'cookingIngredients' then recipe->'cookingIngredients' else cooking_ingredients end,
   nutrition_input=case when recipe ? 'nutritionInput' then recipe->'nutritionInput' else nutrition_input end
  where app_id=recipe->>'id' and owner_user_id=caller;
  for week in select distinct week_of from public.grocery_lists where user_id=caller and calendar_active loop
   perform private.reconcile_personal_cooking_grocery(caller,week);
  end loop;
 end if;
 return result;
end; $$;

create function private.remember_cooking_ingredient_conversions() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; ingredient public.meal_ingredients;
begin
 if new.owner_user_id is null or new.is_system or new.app_id like 'group-copy-%' then return new; end if;
 for item in select value from jsonb_array_elements(coalesce(new.cooking_ingredients,'[]')) where value ? 'foodId' loop
  ingredient.meal_row_id:=new.row_id;
  select row_id into ingredient.food_row_id from public.foods where app_id=item->>'foodId' and (is_system or owner_user_id=new.owner_user_id);
  if ingredient.food_row_id is not null then ingredient.cooking_measurement:=item->'cookingMeasurement'; perform private.remember_ingredient_conversions(ingredient); end if;
 end loop;
 return new;
end; $$;
create trigger remember_cooking_ingredient_conversions after insert or update of cooking_ingredients on public.meals for each row execute function private.remember_cooking_ingredient_conversions();

create function private.recipe_conversion_rows() returns table(meal_row_id bigint,food_row_id bigint,cooking_measurement jsonb) language sql stable security definer set search_path='' as $$
 select meal_row_id,food_row_id,cooking_measurement from public.meal_ingredients
 union all select m.row_id,f.row_id,i->'cookingMeasurement' from public.meals m cross join lateral jsonb_array_elements(coalesce(m.cooking_ingredients,'[]')) i join public.foods f on f.app_id=i->>'foodId';
$$;
do $reads$
declare definition text;
begin
 select pg_get_functiondef('private.get_ingredient_conversions(text[])'::regprocedure) into definition;
 execute replace(definition,'public.meal_ingredients','private.recipe_conversion_rows()');
 select pg_get_functiondef('private.cooking_recipe_json(public.meals)'::regprocedure) into definition;
 execute replace(definition,'''providedNutrition'',p_recipe.provided_nutrition','''providedNutrition'',p_recipe.provided_nutrition,''cookingIngredients'',p_recipe.cooking_ingredients,''nutritionInput'',p_recipe.nutrition_input');
 select pg_get_functiondef('public.get_cooking_recipe(text)'::regprocedure) into definition;
 execute replace(definition,'select food_row_id from public.meal_ingredients where meal_row_id=recipe.row_id','select food_row_id from private.recipe_conversion_rows() where meal_row_id=recipe.row_id');
end; $reads$;

do $copies$
declare definition text; addition text;
begin
 select pg_get_functiondef('private.cooking_copy_recipe(bigint,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'app text;','app text; cooking_item jsonb; cooking_rows jsonb:=''[]''::jsonb;');
 addition:=$body$
 for cooking_item in select value from jsonb_array_elements(coalesce(recipe.cooking_ingredients,'[]')) loop
  if cooking_item ? 'foodId' then
   select * into food from public.foods where app_id=cooking_item->>'foodId';
   if food.row_id is null then perform private.raise_mutation_error('not_found','Ingredient conversion source unavailable'); end if;
   app:='group-copy-'||p_user::text||'-food-'||food.row_id::text||'-'||md5(to_jsonb(food)::text);
   select row_id into food_id from public.foods where app_id=app;
   if food_id is null then
    food_id:=private.cooking_copy_row('foods',food.row_id,jsonb_build_object('app_id',app,'owner_user_id',p_user,'is_system',false));
    insert into public.food_serving_options(food_row_id,label,unit,grams,provider_revision,created_at) select food_id,label,unit,grams,provider_revision,created_at from public.food_serving_options where food_row_id=food.row_id;
   end if;
   cooking_item:=cooking_item||jsonb_build_object('foodId',app);
  end if;
  cooking_rows:=cooking_rows||jsonb_build_array(cooking_item);
 end loop;
 if recipe.cooking_ingredients is not null then update public.meals set cooking_ingredients=cooking_rows where row_id=copy_id; end if;
$body$;
 if position(' return copy_id;' in definition)=0 then raise exception 'Recipe copy baseline differs'; end if;
 execute replace(definition,' return copy_id;',addition||' return copy_id;');
end; $copies$;

create function private.recipe_cooking_grocery(p_recipe public.meals,p_scale numeric,p_source text)
returns table(row_id bigint,id text,name text,category text,unit text,quantity numeric) language sql stable security definer set search_path='' as $$
 select f.row_id,
  'gi-cook-'||case when i ? 'foodId' then 'f'||length(i->>'foodId')||':'||(i->>'foodId') else 'r'||length(p_source)||':'||p_source||length(i->>'id')||':'||(i->>'id') end||'-'||private.conversion_unit(i->'cookingMeasurement'->>'unit'),
  i->'cookingMeasurement'->>'name',coalesce(f.category,'Other'),private.conversion_unit(i->'cookingMeasurement'->>'unit'),
  coalesce((i->'cookingMeasurement'->>'upperQuantity')::numeric,(i->'cookingMeasurement'->>'quantity')::numeric)*p_scale
 from jsonb_array_elements(p_recipe.cooking_ingredients) i left join public.foods f on f.app_id=i->>'foodId'
 where i->'cookingMeasurement'->>'kind'<>'unmeasured'
 union all
 select f.row_id,'gi-'||f.app_id,f.name,f.category,case when f.serving_unit='piece' then 'pcs' else 'g' end,i.servings*p_scale*case when f.serving_unit='piece' then 1 else f.serving_grams end
 from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=p_recipe.row_id and p_recipe.cooking_ingredients is null;
$$;

do $groceries$
declare definition text; start_at integer; end_at integer; replacement text;
begin
 select pg_get_functiondef('private.before_shared_reconcile_personal_cooking_grocery(uuid,date)'::regprocedure) into definition;
 start_at:=position(' quantities as(' in definition); end_at:=position(' loop' in substring(definition from start_at));
 if start_at=0 or end_at=0 then raise exception 'Personal grocery baseline differs'; end if;
 replacement:=$body$
 quantities as(select r.* from public.planned_meals p join latest on latest.row_id=p.meal_plan_row_id join public.meals m on m.row_id=p.meal_row_id cross join lateral private.recipe_cooking_grocery(m,p.servings/m.servings,m.app_id) r where not p.skipped and not exists(select 1 from public.cooking_assignments a where a.user_id=p_user and a.id=p.app_id and private.cooking_group_for(p_user)=a.group_id)
 union all select f.row_id,'gi-'||f.app_id,f.name,f.category,case when f.serving_unit='piece' then 'pcs' else 'g' end,p.servings*case when f.serving_unit='piece' then 1 else f.serving_grams end from public.planned_meals p join latest on latest.row_id=p.meal_plan_row_id join public.foods f on f.row_id=p.food_row_id where not p.skipped)
 select row_id,id,name,category,unit,case when unit in ('pcs','piece') then ceil(sum(quantity)) when id like 'gi-cook-%' then sum(quantity) else round(sum(quantity)) end quantity from quantities group by row_id,id,name,category,unit
$body$;
 definition:=substring(definition from 1 for start_at-1)||replacement||substring(definition from start_at+end_at-1);
 execute replace(definition,'generated_quantity=excluded.generated_quantity;','generated_quantity=excluded.generated_quantity,name=excluded.name,unit=excluded.unit;');
 select pg_get_functiondef('private.before_shared_reconcile_cooking_grocery(uuid,date)'::regprocedure) into definition;
 start_at:=position(' totals as(' in definition); end_at:=position(' loop' in substring(definition from start_at));
 if start_at=0 or end_at=0 then raise exception 'Shared grocery baseline differs'; end if;
 replacement:=$body$
 totals as(select r.* from portions p join recipes m on m.recipe_id=p.recipe_id and m.revision=p.recipe_revision cross join lateral private.recipe_cooking_grocery(m,ceil(p.portions/m.servings),p.recipe_id) r)
 select case when id like 'gi-cook-%' then 'cg-'||id else 'cg-'||md5(lower(name)||':'||case when unit='pcs' then 'piece' else 'g' end) end id,name,category,unit,case when unit in ('piece','pcs') then ceil(sum(quantity)) when id like 'gi-cook-%' then sum(quantity) else round(sum(quantity)) end quantity from totals group by id,name,category,unit
$body$;
 definition:=substring(definition from 1 for start_at-1)||replacement||substring(definition from start_at+end_at-1);
 execute definition;
end; $groceries$;

revoke all on function private.valid_cooking_ingredients(jsonb),private.validate_recipe_cooking(jsonb,uuid),private.save_saved_meal_before_optional_conversions(jsonb),private.remember_cooking_ingredient_conversions(),private.recipe_conversion_rows(),private.recipe_cooking_grocery(public.meals,numeric,text) from public,anon,authenticated;
revoke insert,update,delete on public.meals from anon,authenticated;
notify pgrst,'reload schema';
