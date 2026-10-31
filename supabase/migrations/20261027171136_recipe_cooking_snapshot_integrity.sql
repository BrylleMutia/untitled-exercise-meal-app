create function private.cooking_copy_food(p_source bigint,p_user uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare food public.foods; app text; copied bigint;
begin
 select * into food from public.foods where row_id=p_source;
 if food.row_id is null then perform private.raise_mutation_error('not_found','Ingredient source unavailable'); end if;
 app:='group-copy-'||p_user::text||'-food-'||food.row_id::text||'-'||md5(to_jsonb(food)::text);
 select row_id into copied from public.foods where app_id=app;
 if copied is null then
  copied:=private.cooking_copy_row('foods',food.row_id,jsonb_build_object('app_id',app,'owner_user_id',p_user,'is_system',false));
  insert into public.food_serving_options(food_row_id,label,unit,grams,provider_revision,created_at) select copied,label,unit,grams,provider_revision,created_at from public.food_serving_options where food_row_id=food.row_id;
 end if;
 return copied;
end; $$;
create or replace function private.cooking_copy_recipe(p_source bigint,p_user uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare recipe public.meals; ingredient public.meal_ingredients; copy_id bigint; food_id bigint; app text; item jsonb; rows jsonb:='[]'::jsonb;
begin
 select * into recipe from public.meals where row_id=p_source;
 app:='group-copy-'||p_user::text||'-'||p_source::text||'-'||recipe.revision::text;
 select row_id into copy_id from public.meals where app_id=app;
 if copy_id is not null then return copy_id; end if;
 for item in select value from jsonb_array_elements(coalesce(recipe.cooking_ingredients,'[]')) loop
  if item ? 'foodId' then
   select row_id into food_id from public.foods where app_id=item->>'foodId';
   food_id:=private.cooking_copy_food(food_id,p_user);
   item:=item||jsonb_build_object('foodId',(select app_id from public.foods where row_id=food_id));
  end if;
  rows:=rows||jsonb_build_array(item);
 end loop;
 copy_id:=private.cooking_copy_row('meals',p_source,jsonb_build_object('app_id',app,'owner_user_id',p_user,'is_system',false,'archived_at',null,'cooking_ingredients',case when recipe.cooking_ingredients is null then null else rows end));
 for ingredient in select * from public.meal_ingredients where meal_row_id=p_source order by ingredient_order loop
  food_id:=private.cooking_copy_food(ingredient.food_row_id,p_user);
  perform private.cooking_copy_row('meal_ingredients',ingredient.row_id,jsonb_build_object('meal_row_id',copy_id,'food_row_id',food_id));
 end loop;
 return copy_id;
end; $$;
do $aggregate$
declare definition text;
begin
 select pg_get_functiondef('private.before_shared_reconcile_cooking_grocery(uuid,date)'::regprocedure) into definition;
 execute replace(definition,'when id like ''gi-cook-%'' then sum(quantity)','when bool_and(id like ''gi-cook-%'') then sum(quantity)');
end; $aggregate$;
revoke all on function private.cooking_copy_food(bigint,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
