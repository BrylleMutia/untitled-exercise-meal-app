-- Every committed ingredient owns a frozen nutrition basis, including catalog foods.
create or replace function private.cooking_copy_recipe(p_source bigint,p_user uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare recipe public.meals; ingredient public.meal_ingredients; food public.foods; copy_id bigint; food_id bigint; app text;
begin
 select * into recipe from public.meals where row_id=p_source;
 app:='group-copy-'||p_user::text||'-'||p_source::text||'-'||recipe.revision::text;
 select row_id into copy_id from public.meals where app_id=app;
 if copy_id is not null then return copy_id; end if;
 copy_id:=private.cooking_copy_row('meals',p_source,jsonb_build_object('app_id',app,'owner_user_id',p_user,'is_system',false,'archived_at',null));
 for ingredient in select * from public.meal_ingredients where meal_row_id=p_source order by ingredient_order loop
   select * into food from public.foods where row_id=ingredient.food_row_id;
   app:='group-copy-'||p_user::text||'-food-'||food.row_id::text||'-'||md5(to_jsonb(food)::text);
   select row_id into food_id from public.foods where app_id=app;
   if food_id is null then
     food_id:=private.cooking_copy_row('foods',food.row_id,jsonb_build_object('app_id',app,'owner_user_id',p_user,'is_system',false));
     insert into public.food_serving_options(food_row_id,label,unit,grams,provider_revision,created_at)
       select food_id,label,unit,grams,provider_revision,created_at from public.food_serving_options where food_row_id=food.row_id;
   end if;
   perform private.cooking_copy_row('meal_ingredients',ingredient.row_id,jsonb_build_object('meal_row_id',copy_id,'food_row_id',food_id));
 end loop;
 return copy_id;
end;
$$;

-- A changed ingredient basis is a new recipe revision for subsequent previews and batches.
create function private.cooking_food_basis_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (to_jsonb(new)-array['updated_at','created_at']) is distinct from (to_jsonb(old)-array['updated_at','created_at']) then
   update public.meals set revision=revision+1,updated_at=now()
     where app_id not like 'group-copy-%' and row_id in(select meal_row_id from public.meal_ingredients where food_row_id=new.row_id);
 end if;
 return null;
end;
$$;
create trigger cooking_food_basis_changed after update on public.foods for each row execute function private.cooking_food_basis_changed();
revoke all on function private.cooking_copy_recipe(bigint,uuid),private.cooking_food_basis_changed() from public,anon,authenticated;
