-- Retained conversion knowledge belongs to the account, not the lifetime of a recipe/food row.
create table public.ingredient_conversions (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 food_identity jsonb not null check(jsonb_typeof(food_identity)='array'),
 food_key text not null,
 unit text not null check(unit in ('ml','l','tsp','tbsp','cup','piece','clove','lemon','carrot','cucumber','serving')),
 grams_per_unit numeric not null check(grams_per_unit>0 and grams_per_unit<=1000000),
 source_recipe_id text not null,
 source_recipe_name text not null,
 created_at timestamptz not null default now(),
 unique(user_id,food_key,unit,grams_per_unit)
);
alter table public.ingredient_conversions enable row level security;
create policy ingredient_conversions_owner_read on public.ingredient_conversions for select to authenticated using((select auth.uid())=user_id);
revoke all on public.ingredient_conversions from public,anon,authenticated;
grant select on public.ingredient_conversions to authenticated;
revoke all on sequence public.ingredient_conversions_id_seq from public,anon,authenticated;

create function private.conversion_unit(p_unit text) returns text language sql immutable set search_path='' as $$
 select case v when 'milliliters' then 'ml' when 'millilitres' then 'ml' when 'milliliter' then 'ml' when 'millilitre' then 'ml'
 when 'litres' then 'l' when 'liters' then 'l' when 'litre' then 'l' when 'liter' then 'l'
 when 'teaspoon' then 'tsp' when 'teaspoons' then 'tsp' when 'tsps' then 'tsp'
 when 'tablespoon' then 'tbsp' when 'tablespoons' then 'tbsp' when 'tbsps' then 'tbsp'
 when 'cups' then 'cup' when 'pieces' then 'piece' when 'piece/s' then 'piece'
 when 'cloves' then 'clove' when 'lemons' then 'lemon' when 'carrots' then 'carrot' when 'cucumbers' then 'cucumber'
 when 'servings' then 'serving' when 'grams' then 'g' when 'gram' then 'g'
 when 'kilograms' then 'kg' when 'kilogram' then 'kg' when 'milligrams' then 'mg' when 'milligram' then 'mg'
 when 'ounces' then 'oz' when 'ounce' then 'oz' when 'pounds' then 'lb' when 'pound' then 'lb' else v end
 from (select regexp_replace(lower(btrim(p_unit)),'\.$','') v) t;
$$;

-- Exact provider identity/revision and preparation; custom foods never match by name.
create function private.conversion_food_identity(p_food public.foods) returns jsonb language sql immutable set search_path='' as $$
 select case when coalesce(p_food.fdc_id,p_food.snapshot_fdc_id) is not null then
 jsonb_build_array('provider',coalesce(p_food.fdc_id,p_food.snapshot_fdc_id),p_food.source,p_food.source_version,p_food.provider_revision,p_food.record_type,p_food.preparation_basis)
 else jsonb_build_array('food',p_food.owner_user_id,p_food.app_id,p_food.source_version,p_food.preparation_basis) end;
$$;

-- Copy the baseline body without renaming its OID or changing existing callers.
do $copy$
declare definition text;
begin
 select pg_get_functiondef('private.valid_cooking_measurement(jsonb)'::regprocedure) into definition;
 execute replace(definition,'private.valid_cooking_measurement(', 'private.valid_cooking_measurement_before_conversions(');
 select pg_get_functiondef('private.build_account_export()'::regprocedure) into definition;
 execute replace(definition,'private.build_account_export(', 'private.build_account_export_before_conversions(');
end;
$copy$;

create or replace function private.valid_cooking_measurement(p_value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare basis jsonb;
begin
 if p_value is null or p_value='null'::jsonb then return true; end if;
 if jsonb_typeof(p_value)<>'object' then return false; end if;
 if not private.valid_cooking_measurement_before_conversions(p_value-'conversionBases') then return false; end if;
 if p_value ? 'conversionBases' then
   if jsonb_typeof(p_value->'conversionBases')<>'array' or jsonb_array_length(p_value->'conversionBases')>32 then return false; end if;
   for basis in select value from jsonb_array_elements(p_value->'conversionBases') loop
     if jsonb_typeof(basis)<>'object' or exists(select 1 from jsonb_object_keys(basis) k where k not in ('unit','gramsPerUnit')) then return false; end if;
     if jsonb_typeof(basis->'unit') is distinct from 'string' or private.conversion_unit(basis->>'unit') not in
       ('g','kg','mg','oz','lb','ml','l','tsp','tbsp','cup','piece','clove','lemon','carrot','cucumber','serving') then return false; end if;
     if jsonb_typeof(basis->'gramsPerUnit') is distinct from 'number' or (basis->>'gramsPerUnit')::numeric<=0 or (basis->>'gramsPerUnit')::numeric>1000000 then return false; end if;
   end loop;
 end if;
 return true;
end;
$$;

create function private.measurement_conversion_bases(p_measurement jsonb) returns table(unit text,grams_per_unit numeric) language sql immutable set search_path='' as $$
 select private.conversion_unit(b->>'unit'),(b->>'gramsPerUnit')::numeric
 from jsonb_array_elements(coalesce(p_measurement->'conversionBases','[]'::jsonb)||case when p_measurement ? 'gramsPerUnit' then
 jsonb_build_array(jsonb_build_object('unit',p_measurement->>'unit','gramsPerUnit',p_measurement->'gramsPerUnit')) else '[]'::jsonb end) b
 where private.conversion_unit(b->>'unit') in ('ml','l','tsp','tbsp','cup','piece','clove','lemon','carrot','cucumber','serving');
$$;

create function private.remember_ingredient_conversions(p_ingredient public.meal_ingredients) returns void language plpgsql security definer set search_path='' as $$
declare recipe public.meals; food public.foods; identity jsonb; key text; basis record;
begin
 select * into recipe from public.meals where row_id=p_ingredient.meal_row_id;
 -- Frozen plan snapshots are not an explicit personal recipe save.
 if recipe.owner_user_id is null or recipe.is_system or recipe.app_id like 'group-copy-%' then return; end if;
 select * into food from public.foods where row_id=p_ingredient.food_row_id;
 identity:=private.conversion_food_identity(food); key:=md5(identity::text);
 for basis in select * from private.measurement_conversion_bases(p_ingredient.cooking_measurement) order by unit,grams_per_unit loop
   perform pg_advisory_xact_lock(hashtextextended(recipe.owner_user_id::text||key||basis.unit,0));
   if not exists(select 1 from public.ingredient_conversions c where c.user_id=recipe.owner_user_id and c.food_key=key and c.food_identity=identity and c.unit=basis.unit
     and abs(c.grams_per_unit-basis.grams_per_unit)<=greatest(c.grams_per_unit,basis.grams_per_unit)*0.000001) then
     insert into public.ingredient_conversions(user_id,food_identity,food_key,unit,grams_per_unit,source_recipe_id,source_recipe_name)
       values(recipe.owner_user_id,identity,key,basis.unit,basis.grams_per_unit,recipe.app_id,recipe.name) on conflict do nothing;
   end if;
 end loop;
end;
$$;
create function private.remember_recipe_conversion_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.remember_ingredient_conversions(new);
 return new;
end;
$$;
create trigger remember_recipe_conversions after insert or update of cooking_measurement on public.meal_ingredients for each row execute function private.remember_recipe_conversion_trigger();
do $backfill$
declare ingredient public.meal_ingredients;
begin
 for ingredient in select i.* from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id
   where m.owner_user_id is not null and not m.is_system and m.app_id not like 'group-copy-%' and i.cooking_measurement is not null order by m.owner_user_id,m.row_id,i.ingredient_order loop
   perform private.remember_ingredient_conversions(ingredient);
 end loop;
end;
$backfill$;

create function private.get_ingredient_conversions(p_food_ids text[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); result jsonb;
begin
 if p_food_ids is null or cardinality(p_food_ids)>100 or exists(select 1 from unnest(p_food_ids) id where id is null or length(id)=0 or length(id)>256) then
   perform private.raise_mutation_error('validation_failed','Choose at most 100 valid food identifiers.');
 end if;
 with wanted as (
   select f.app_id,private.conversion_food_identity(f) identity from public.foods f where f.app_id=any(p_food_ids)
     and (f.is_system or f.owner_user_id=caller or exists(select 1 from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id
       where i.food_row_id=f.row_id and m.archived_at is null and m.owner_user_id in(select user_id from public.cooking_group_members where group_id=gid)))
 ), candidates as (
   select w.app_id food_id,c.unit,c.grams_per_unit,'personal'::text kind,c.source_recipe_name recipe_name
   from wanted w join public.ingredient_conversions c on c.user_id=caller and c.food_key=md5(w.identity::text) and c.food_identity=w.identity
   union all
   select w.app_id,b.unit,b.grams_per_unit,case when m.is_system then 'default' else 'group' end,m.name
   from wanted w join public.foods f on private.conversion_food_identity(f)=w.identity
   join public.meal_ingredients i on i.food_row_id=f.row_id join public.meals m on m.row_id=i.meal_row_id
   cross join lateral private.measurement_conversion_bases(i.cooking_measurement) b
   where m.archived_at is null and m.app_id not like 'group-copy-%' and (m.is_system or m.owner_user_id<>caller and m.owner_user_id in(select user_id from public.cooking_group_members where group_id=gid))
 ) select coalesce(jsonb_agg(jsonb_build_object('foodId',food_id,'unit',unit,'gramsPerUnit',grams_per_unit,'source',jsonb_build_object('kind',kind,'recipeName',recipe_name)) order by food_id,unit,grams_per_unit,kind,recipe_name),'[]'::jsonb)
 into result from (select distinct * from candidates) c;
 return result;
end;
$$;
create function public.get_ingredient_conversions(p_food_ids text[]) returns jsonb language sql stable security invoker set search_path='' as $$
 select private.get_ingredient_conversions(p_food_ids);
$$;
-- The private implementation verifies auth.uid() and every requested food's visibility.
grant execute on function private.get_ingredient_conversions(text[]) to authenticated;
revoke all on function public.get_ingredient_conversions(text[]) from public,anon;
grant execute on function public.get_ingredient_conversions(text[]) to authenticated;

create or replace function private.build_account_export() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated();
begin
 return private.build_account_export_before_conversions()||jsonb_build_object('ingredientConversions',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.ingredient_conversions c where user_id=caller),'[]'::jsonb));
end;
$$;
revoke all on function private.conversion_unit(text),private.conversion_food_identity(public.foods),private.valid_cooking_measurement_before_conversions(jsonb),
 private.measurement_conversion_bases(jsonb),private.remember_ingredient_conversions(public.meal_ingredients),private.remember_recipe_conversion_trigger(),
 private.build_account_export_before_conversions() from public,anon,authenticated;
revoke all on function private.get_ingredient_conversions(text[]) from public,anon;
-- No new private helpers are a public API; existing invoker read wrappers need authenticated access only to the authorized implementation.
revoke all on function private.valid_cooking_measurement(jsonb),private.build_account_export() from public,anon,authenticated;
notify pgrst,'reload schema';
