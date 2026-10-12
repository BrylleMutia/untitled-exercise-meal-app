-- Additive catalog entry. Existing recipes and saved nutrition retain their values.
alter table public.meals drop constraint meals_image_shape;
alter table public.meals add constraint meals_image_shape check (
  image is null or (jsonb_typeof(image)='object' and (
    (image->>'kind'='asset' and image->>'id' in ('creamy-lemon-chicken','korean-beef-bowl')) or
    (image->>'kind'='url' and jsonb_typeof(image->'url')='string' and char_length(image->>'url')<=2048 and image->>'url' ~ '^https://[^/@[:space:]]+([/?#]|$)') or
    (image->>'kind'='upload' and jsonb_typeof(image->'path')='string' and image->>'path' ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')
  )) is true
);

insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-171790',true,'Beef mince, 5% fat','100 g',100,'g',137,21.41,0,5,0,'Protein','USDA FoodData Central','SR Legacy:171790:reviewed-2026-10-12',false,'high','trusted_catalog','raw',171790,'SR Legacy','{"proteinG":21.41,"fiberG":0,"fatG":5,"carbsG":0,"calories":137}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-168877',true,'Jasmine rice (uncooked; long-grain rice proxy)','100 g',100,'g',365,7.13,79.95,0.66,1.3,'Grains','USDA FoodData Central','SR Legacy:168877:reviewed-2026-10-12',false,'high','trusted_catalog','dry',168877,'SR Legacy','{"fatG":0.66,"carbsG":79.95,"calories":365,"proteinG":7.13,"fiberG":1.3}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-174277',true,'Soy sauce (soy and wheat)','100 g',100,'g',53,8.14,4.93,0.57,0.8,'Pantry','USDA FoodData Central','SR Legacy:174277:reviewed-2026-10-12',false,'high','trusted_catalog','as_labeled',174277,'SR Legacy','{"fatG":0.57,"carbsG":4.93,"proteinG":8.14,"calories":53,"fiberG":0.8}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-171016',true,'Sesame oil','100 g',100,'g',884,0,0,100,0,'Pantry','USDA FoodData Central','SR Legacy:171016:reviewed-2026-10-12',false,'high','trusted_catalog','as_labeled',171016,'SR Legacy','{"proteinG":0,"fiberG":0,"fatG":100,"carbsG":0,"calories":884}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-169230',true,'Garlic','100 g',100,'g',149,6.36,33.06,0.5,2.1,'Produce','USDA FoodData Central','SR Legacy:169230:reviewed-2026-10-12',false,'high','trusted_catalog','raw',169230,'SR Legacy','{"carbsG":33.06,"calories":149,"fiberG":2.1,"proteinG":6.36,"fatG":0.5}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-169231',true,'Ginger (optional)','100 g',100,'g',80,1.82,17.77,0.75,2,'Produce','USDA FoodData Central','SR Legacy:169231:reviewed-2026-10-12',false,'high','trusted_catalog','raw',169231,'SR Legacy','{"fatG":0.75,"proteinG":1.82,"carbsG":17.77,"calories":80,"fiberG":2}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-170393',true,'Carrot','100 g',100,'g',41,0.93,9.58,0.24,2.8,'Produce','USDA FoodData Central','SR Legacy:170393:reviewed-2026-10-12',false,'high','trusted_catalog','raw',170393,'SR Legacy','{"proteinG":0.93,"fatG":0.24,"carbsG":9.58,"calories":41,"fiberG":2.8}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-168409',true,'Cucumber, with peel','100 g',100,'g',15,0.65,3.63,0.11,0.5,'Produce','USDA FoodData Central','SR Legacy:168409:reviewed-2026-10-12',false,'high','trusted_catalog','raw',168409,'SR Legacy','{"carbsG":3.63,"calories":15,"fatG":0.11,"fiberG":0.5,"proteinG":0.65}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-170150',true,'Sesame seeds','100 g',100,'g',573,17.73,23.45,49.67,11.8,'Pantry','USDA FoodData Central','SR Legacy:170150:reviewed-2026-10-12',false,'high','trusted_catalog','as_labeled',170150,'SR Legacy','{"proteinG":17.73,"fiberG":11.8,"fatG":49.67,"carbsG":23.45,"calories":573}'::jsonb);
insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g) values ('food-korean-beef-170005',true,'Spring onion','100 g',100,'g',32,1.83,7.34,0.19,2.6,'Produce','USDA FoodData Central','SR Legacy:170005:reviewed-2026-10-12',false,'high','trusted_catalog','raw',170005,'SR Legacy','{"calories":32,"fatG":0.19,"proteinG":1.83,"fiberG":2.6,"carbsG":7.34}'::jsonb);
insert into public.meals (app_id,is_system,name,servings,notes,reference,complexity,image) values ('meal-korean-beef-bowl',true,'Korean Beef Bowl',4,'Ingredients for 4 servings
600 g beef mince, 5% fat (raw weight)
250 g jasmine rice (uncooked weight)
2 tbsp soy sauce (approximately 32 g)
1 tbsp honey (approximately 21 g)
1 tsp sesame oil (approximately 4.5 g)
2 garlic cloves (approximately 6 g)
1 tsp ginger, optional (approximately 2 g; included in the estimate)
1 carrot, julienned (approximately 61 g)
½ cucumber, sliced (approximately 150 g)
Sesame seeds and spring onion (3 g and 15 g assumed for the whole recipe)

1. Cook the rice according to its package instructions.
2. Brown the mince and drain excess liquid. Cook ground beef through to 71°C (160°F).
3. Add garlic, soy sauce, honey, sesame oil, and ginger if using.
4. Simmer until glossy.
5. Divide the beef and cooked rice equally into 4 portions.
6. Add fresh carrot and cucumber on the side. Finish with sesame seeds and spring onion.

Source-reported macros per serving: approximately 560 kcal, 45 g protein, 58 g carbs, 16 g fat. These are reference estimates supplied with the recipe and have not been independently verified.

App nutrition is calculated from the ingredient amounts above and USDA FoodData Central records. Uncooked long-grain white rice is used as a jasmine-rice proxy. Includes ginger and the assumed garnish weights, and counts all beef fat and sauce as eaten; draining fat, ingredient brands and portion sizes can change the result. The ingredient calculation differs from the source-reported macros. Soy sauce contains soy and wheat; sesame oil and seeds contain sesame. Cooking time was not supplied. The generated cover is illustrative.','https://www.tiktok.com/@lazymealprep8/photo/7685839537762815254?image_index=3','easy','{"kind":"asset","id":"korean-beef-bowl"}'::jsonb);
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings) select m.row_id,f.row_id,q.ordinal,q.quantity from (values ('food-korean-beef-171790',1,6::numeric),('food-korean-beef-168877',2,2.5::numeric),('food-korean-beef-174277',3,0.32::numeric),('food-lemon-chicken-169640',4,0.21::numeric),('food-korean-beef-171016',5,0.045::numeric),('food-korean-beef-169230',6,0.06::numeric),('food-korean-beef-169231',7,0.02::numeric),('food-korean-beef-170393',8,0.61::numeric),('food-korean-beef-168409',9,1.5::numeric),('food-korean-beef-170150',10,0.03::numeric),('food-korean-beef-170005',11,0.15::numeric)) q(food_id,ordinal,quantity) join public.foods f on f.app_id=q.food_id cross join public.meals m where m.app_id='meal-korean-beef-bowl';
create or replace function private.save_saved_meal_without_complexity(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller_id uuid:=private.require_authenticated(); result jsonb;
  recipe jsonb:=p_payload->'meal'; total_minutes numeric; cover jsonb:=recipe->'image'; asset private.recipe_image_assets;
begin
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller_id);
  perform private.assert_saved_meal_access('save_saved_meal',p_payload,caller_id);
  if recipe ? 'reference' and char_length(coalesce(recipe->>'reference',''))>2000 then
    perform private.raise_mutation_error('validation_failed','Reference must be at most 2000 characters');
  end if;
  if recipe ? 'totalTimeMinutes' and recipe->'totalTimeMinutes'<>'null'::jsonb then
    if jsonb_typeof(recipe->'totalTimeMinutes')<>'number' then perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes or null'); end if;
    total_minutes:=(recipe->>'totalTimeMinutes')::numeric;
    if total_minutes<0 or total_minutes>2147483647 or trunc(total_minutes)<>total_minutes then
      perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes between 0 and 2147483647');
    end if;
  end if;
  if cover is not null and cover<>'null'::jsonb then
    if jsonb_typeof(cover)<>'object' or coalesce(cover->>'kind','') not in ('url','upload','asset') then
      perform private.raise_mutation_error('validation_failed','Invalid recipe image');
    end if;
    if cover->>'kind'='url' then
      if jsonb_typeof(cover->'url')<>'string' or char_length(cover->>'url')>2048
        or coalesce(cover->>'url','') !~ '^https://[^/@[:space:]]+([/?#]|$)' then
        perform private.raise_mutation_error('validation_failed','Use a complete HTTPS image URL without credentials');
      end if;
      cover:=jsonb_build_object('kind','url','url',cover->>'url');
    elsif cover->>'kind'='asset' then
      if coalesce(cover->>'id','') not in ('creamy-lemon-chicken','korean-beef-bowl') then
        perform private.raise_mutation_error('validation_failed','Unknown catalog image');
      end if;
      cover:=jsonb_build_object('kind','asset','id',cover->>'id');
    else
      perform pg_advisory_xact_lock(hashtextextended(caller_id::text,0));
      select * into asset from private.recipe_image_assets where path=cover->>'path' and user_id=caller_id for update;
      if not found or asset.state='removing' or not exists(select 1 from storage.objects o where o.bucket_id='recipe-covers' and o.name=asset.path) then
        perform private.raise_mutation_error('validation_failed','The uploaded image is unavailable; upload it again or select the default');
      end if;
      cover:=jsonb_build_object('kind','upload','path',asset.path);
    end if;
  end if;
  result:=private.save_saved_meal_unchecked(p_payload);
  if coalesce((result->>'replayed')::boolean,false) then return result; end if;
  if recipe ? 'reference' or recipe ? 'totalTimeMinutes' or recipe ? 'image' then
    update public.meals set
      reference=case when recipe ? 'reference' then nullif(btrim(recipe->>'reference'),'') else reference end,
      total_time_minutes=case when recipe ? 'totalTimeMinutes' then total_minutes::integer else total_time_minutes end,
      image=case when recipe ? 'image' then nullif(cover,'null'::jsonb) else image end
    where app_id=recipe->>'id' and owner_user_id=caller_id;
  end if;
  if cover->>'kind'='upload' then update private.recipe_image_assets set state='attached' where path=cover->>'path' and user_id=caller_id; end if;
  perform private.reconcile_grocery_items(caller_id,p_payload->'grocery');
  return result;
end;
$$;
revoke all on function private.save_saved_meal_without_complexity(jsonb) from public,anon,authenticated;

create or replace function private.check_meal_constraints() returns trigger
language plpgsql security definer set search_path = '' as $$
declare plan public.meal_plans%rowtype; day_carbs numeric; forbidden boolean;
begin
  select * into plan from public.meal_plans where row_id = new.meal_plan_row_id;
  if plan.total_carb_limit is null then return null; end if;
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
-- A preference hides a catalog recipe for one account. Replacement recipes
-- are independently owned identities; old plans and eaten history keep theirs.
create table public.recipe_catalog_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_meal_row_id bigint not null references public.meals(row_id) on delete cascade,
  replacement_meal_row_id bigint references public.meals(row_id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,catalog_meal_row_id),
  check (catalog_meal_row_id is distinct from replacement_meal_row_id)
);
create index recipe_catalog_preferences_catalog_idx on public.recipe_catalog_preferences(catalog_meal_row_id);
create index recipe_catalog_preferences_replacement_idx on public.recipe_catalog_preferences(replacement_meal_row_id);
alter table public.recipe_catalog_preferences enable row level security;
create policy "users can read their catalog preferences" on public.recipe_catalog_preferences
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.recipe_catalog_preferences from public,anon,authenticated;
grant select on public.recipe_catalog_preferences to authenticated;

create function private.lock_catalog_preference(p_catalog_id text,p_record_revision jsonb,p_preference_revision jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); catalog public.meals; current_revision integer; expected integer;
begin
  perform private.assert_nonblank(p_catalog_id,'catalog mealId',128);
  for expected in 1..2 loop
    if jsonb_typeof(case when expected=1 then p_record_revision else p_preference_revision end) is distinct from 'number' then
      perform private.raise_mutation_error('validation_failed','Catalog versions are required');
    end if;
    if (case when expected=1 then p_record_revision else p_preference_revision end)::numeric not between 0 and 2147483647
      or trunc((case when expected=1 then p_record_revision else p_preference_revision end)::numeric)
        <> (case when expected=1 then p_record_revision else p_preference_revision end)::numeric then
      perform private.raise_mutation_error('validation_failed','Invalid catalog version');
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':'||p_catalog_id,0));
  select * into catalog from public.meals where app_id=p_catalog_id and is_system and archived_at is null for share;
  if not found then perform private.raise_mutation_error('not_found','Catalog recipe is unavailable'); end if;
  if catalog.revision<>(p_record_revision::text)::integer then
    perform private.raise_mutation_error('stale_version','The catalog recipe changed; reopen the editor');
  end if;
  select revision into current_revision from public.recipe_catalog_preferences
    where user_id=caller and catalog_meal_row_id=catalog.row_id for update;
  if coalesce(current_revision,0)<>(p_preference_revision::text)::integer then
    perform private.raise_mutation_error('stale_version','This recipe changed elsewhere; refresh and retry');
  end if;
  return catalog.row_id;
end;
$$;

alter function private.save_authored_recipe(jsonb) rename to save_authored_recipe_before_catalog;
create function private.save_authored_recipe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); claim record; catalog_id bigint; replacement_id bigint; result jsonb;
begin
  if not p_payload ? 'catalog' then return private.save_authored_recipe_before_catalog(p_payload); end if;
  if jsonb_typeof(p_payload->'catalog') is distinct from 'object' then
    perform private.raise_mutation_error('validation_failed','Invalid catalog edit');
  end if;
  select * into claim from private.claim_mutation(caller,'customize_catalog_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_recipe','replayed',true,'result_refs',claim.result_refs); end if;
  catalog_id:=private.lock_catalog_preference(p_payload->'catalog'->>'mealId',p_payload->'catalog'->'recordRevision',p_payload->'catalog'->'preferenceRevision');
  -- First edit creates a new identity. Later edits must target the personal recipe.
  if exists(select 1 from public.recipe_catalog_preferences where user_id=caller and catalog_meal_row_id=catalog_id and replacement_meal_row_id is not null)
    or exists(select 1 from public.meals where app_id=p_payload->'meal'->>'id') then
    perform private.raise_mutation_error('conflict','Open your saved personal version to edit this recipe');
  end if;
  result:=private.save_authored_recipe_before_catalog(p_payload);
  select row_id into replacement_id from public.meals where app_id=p_payload->'meal'->>'id' and owner_user_id=caller and not is_system;
  if replacement_id is null then perform private.raise_mutation_error('validation_failed','Personal recipe was not saved'); end if;
  insert into public.recipe_catalog_preferences(user_id,catalog_meal_row_id,replacement_meal_row_id)
    values(caller,catalog_id,replacement_id) on conflict(user_id,catalog_meal_row_id) do update
    set replacement_meal_row_id=excluded.replacement_meal_row_id,revision=public.recipe_catalog_preferences.revision+1,updated_at=now();
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;

alter function private.archive_saved_meal(jsonb) rename to archive_saved_meal_before_catalog;
create function private.archive_saved_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); claim record; catalog_id bigint; result jsonb;
begin
  if not exists(select 1 from public.meals where app_id=p_payload->>'mealId' and is_system) then
    return private.archive_saved_meal_before_catalog(p_payload);
  end if;
  select * into claim from private.claim_mutation(caller,'archive_catalog_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','archive_saved_meal','replayed',true,'result_refs',claim.result_refs); end if;
  catalog_id:=private.lock_catalog_preference(p_payload->>'mealId',p_payload->'expectedVersions'->'recordRevision',p_payload->'catalogPreferenceRevision');
  insert into public.recipe_catalog_preferences(user_id,catalog_meal_row_id) values(caller,catalog_id)
    on conflict(user_id,catalog_meal_row_id) do update set revision=public.recipe_catalog_preferences.revision+1,updated_at=now();
  result:=jsonb_build_object('status','completed','operation','archive_saved_meal','result_refs',jsonb_build_object('meal_id',p_payload->>'mealId'));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;

alter function private.build_account_export() rename to build_account_export_before_catalog;
create function private.build_account_export() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated();
begin
  return private.build_account_export_before_catalog() || jsonb_build_object('recipeCatalogPreferences',coalesce((
    select jsonb_agg(jsonb_build_object('mealId',m.app_id,'replacementMealId',r.app_id,'revision',cp.revision,'updatedAt',cp.updated_at) order by m.app_id)
    from public.recipe_catalog_preferences cp join public.meals m on m.row_id=cp.catalog_meal_row_id
    left join public.meals r on r.row_id=cp.replacement_meal_row_id where cp.user_id=caller
  ),'[]'::jsonb));
end;
$$;
revoke all on function private.lock_catalog_preference(text,jsonb,jsonb),private.save_authored_recipe(jsonb),
  private.save_authored_recipe_before_catalog(jsonb),private.archive_saved_meal(jsonb),private.archive_saved_meal_before_catalog(jsonb),
  private.build_account_export(),private.build_account_export_before_catalog() from public,anon,authenticated;
create or replace function public.get_recipe_card_metadata(p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare caller uuid:=(select auth.uid()); as_of date;
begin
  if caller is null then raise exception 'not_authenticated: Sign in to load favorites'; end if;
  if jsonb_typeof(p_payload->'asOfDate') is distinct from 'string' or coalesce(p_payload->>'asOfDate','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'validation_failed: Invalid local date';
  end if;
  as_of:=(p_payload->>'asOfDate')::date;
  return (
    with eligible as (
      select row_id,app_id from public.meals where archived_at is null and (is_system or owner_user_id=caller) and not exists (select 1 from public.recipe_catalog_preferences cp where cp.user_id=caller and cp.catalog_meal_row_id=meals.row_id)
    ), usage as (
      select e.row_id,count(*) as uses,max(lm.log_date) as last_eaten
      from public.logged_meals lm join eligible e on e.row_id=lm.meal_row_id
      where lm.user_id=caller and lm.log_date between as_of-29 and as_of group by e.row_id
    ), popular as (
      select u.row_id,u.uses,row_number() over(order by u.uses desc,u.last_eaten desc,e.app_id asc) as rank
      from usage u join eligible e on e.row_id=u.row_id
      order by u.uses desc,u.last_eaten desc,e.app_id asc limit 5
    )
    select jsonb_build_object('asOfDate',as_of::text,'recipes',coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object('mealId',e.app_id,'favorite',coalesce(f.favorite,false),
        'favoriteRevision',coalesce(f.revision,0),'popularRank',p.rank,'usageCount',coalesce(u.uses,0))) order by e.app_id),'[]'::jsonb))
    from eligible e left join public.recipe_favorites f on f.meal_row_id=e.row_id and f.user_id=caller
      left join popular p on p.row_id=e.row_id left join usage u on u.row_id=e.row_id
  );
end;
$$;


create or replace function private.set_recipe_favorite(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe_row bigint; current_revision integer; claim record; result jsonb;
begin
  perform private.assert_nonblank(p_payload->>'mealId','mealId',128);
  if jsonb_typeof(p_payload->'favorite') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number'
    or (p_payload->>'expectedRevision')::numeric<0
    or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric)
    or (p_payload->>'expectedRevision')::numeric>2147483647 then
    perform private.raise_mutation_error('validation_failed','Invalid favorite state or version');
  end if;
  -- Validate the date before any mutation; read-model construction is atomic.
  perform public.get_recipe_card_metadata(jsonb_build_object('asOfDate',p_payload->>'asOfDate'));
  select * into claim from private.claim_mutation(caller,'set_recipe_favorite',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return public.get_recipe_card_metadata(jsonb_build_object('asOfDate',p_payload->>'asOfDate')); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':'||(p_payload->>'mealId'),0));
  select row_id into recipe_row from public.meals where app_id=p_payload->>'mealId'
    and archived_at is null and (is_system or owner_user_id=caller) for share;
  if recipe_row is null or exists(select 1 from public.recipe_catalog_preferences where user_id=caller and catalog_meal_row_id=recipe_row) then perform private.raise_mutation_error('not_found','Recipe is unavailable'); end if;
  select revision into current_revision from public.recipe_favorites where user_id=caller and meal_row_id=recipe_row for update;
  if coalesce(current_revision,0)<>(p_payload->>'expectedRevision')::integer then
    perform private.raise_mutation_error('stale_version','Favorites changed elsewhere');
  end if;
  insert into public.recipe_favorites(user_id,meal_row_id,favorite) values(caller,recipe_row,(p_payload->>'favorite')::boolean)
    on conflict(user_id,meal_row_id) do update set favorite=excluded.favorite,revision=public.recipe_favorites.revision+1,updated_at=now();
  perform private.complete_mutation(claim.mutation_row_id,jsonb_build_object('meal_id',p_payload->>'mealId'));
  result:=public.get_recipe_card_metadata(jsonb_build_object('asOfDate',p_payload->>'asOfDate'));
  return result;
end;
$$;

notify pgrst,'reload schema';
