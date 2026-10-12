-- Retire predefined choices without removing foreign-key targets or rewriting history.
update public.meals set archived_at=coalesce(archived_at,now())
where is_system and app_id in ('meal-yogurt-bowl','meal-pb-toast','meal-chicken-rice','meal-salmon-potato',
  'meal-mvp3-eggs','meal-mvp3-chicken','meal-mvp3-tofu','meal-mvp3-tofu-almonds');

-- Bundled image IDs are explicit, same-origin assets. Arbitrary relative URLs remain invalid.
alter table public.meals drop constraint meals_image_shape;
alter table public.meals add constraint meals_image_shape check (
  image is null or (jsonb_typeof(image)='object' and (
    (image->>'kind'='asset' and image->>'id'='creamy-lemon-chicken') or
    (image->>'kind'='url' and jsonb_typeof(image->'url')='string' and char_length(image->>'url')<=2048 and image->>'url' ~ '^https://[^/@[:space:]]+([/?#]|$)') or
    (image->>'kind'='upload' and jsonb_typeof(image->'path')='string' and image->>'path' ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')
  )) is true
);

insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,
  category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g,serving_options)
values ('food-lemon-chicken-172385',true,'Chicken thigh fillet, skin-on','100 g',100,'g',221,16.52,0.25,16.61,0,
  'Protein','USDA FoodData Central','SR Legacy:172385:reviewed-2026-10-12',false,'high','trusted_catalog','raw',172385,'SR Legacy','{"fatG":16.61,"proteinG":16.52,"calories":221,"carbsG":0.25,"fiberG":0}'::jsonb,
  null);

insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,
  category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g,serving_options)
values ('food-lemon-chicken-173410',true,'Salted butter','100 g',100,'g',717,0.85,0.06,81.11,0,
  'Dairy','USDA FoodData Central','SR Legacy:173410:reviewed-2026-10-12',false,'high','trusted_catalog','as_labeled',173410,'SR Legacy','{"fatG":81.11,"proteinG":0.85,"calories":717,"carbsG":0.06,"fiberG":0}'::jsonb,
  null);

insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,
  category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g,serving_options)
values ('food-lemon-chicken-171265',true,'Whole milk (3.25% fat)','100 g',100,'g',61,3.15,4.8,3.25,0,
  'Dairy','USDA FoodData Central','SR Legacy:171265:reviewed-2026-10-12',false,'high','trusted_catalog','as_labeled',171265,'SR Legacy','{"fatG":3.25,"proteinG":3.15,"calories":61,"carbsG":4.8,"fiberG":0}'::jsonb,
  '[{"label":"100 ml (approximately 103 g)","unit":"ml","grams":103}]'::jsonb);

insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,
  category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g,serving_options)
values ('food-lemon-chicken-169761',true,'All-purpose wheat flour','100 g',100,'g',364,10.33,76.31,0.98,2.7,
  'Grains','USDA FoodData Central','SR Legacy:169761:reviewed-2026-10-12',false,'high','trusted_catalog','dry',169761,'SR Legacy','{"fatG":0.98,"proteinG":10.33,"calories":364,"carbsG":76.31,"fiberG":2.7}'::jsonb,
  null);

insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,
  category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g,serving_options)
values ('food-lemon-chicken-169640',true,'Honey','100 g',100,'g',304,0.3,82.4,0,null,
  'Pantry','USDA FoodData Central','SR Legacy:169640:reviewed-2026-10-12',false,'high','trusted_catalog','as_labeled',169640,'SR Legacy','{"calories":304,"proteinG":0.3,"carbsG":82.4,"fatG":0}'::jsonb,
  null);

insert into public.foods (app_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,
  category,source,source_version,estimated,confidence,value_source,preparation_basis,fdc_id,record_type,nutrients_per_100g,serving_options)
values ('food-lemon-chicken-167747',true,'Fresh lemon juice','100 g',100,'g',22,0.35,6.9,0.24,null,
  'Produce','USDA FoodData Central','SR Legacy:167747:reviewed-2026-10-12',false,'high','trusted_catalog','raw',167747,'SR Legacy','{"calories":22,"proteinG":0.35,"carbsG":6.9,"fatG":0.24}'::jsonb,
  null);

insert into public.meals (app_id,is_system,name,servings,notes,reference,total_time_minutes,complexity,image)
values ('meal-creamy-lemon-chicken',true,'Creamy Lemon Chicken',2,'Ingredients for 2 servings
400 g chicken thigh fillets, marinated with salt and pepper
25–30 g butter (30 g used for the estimate)
1 tbsp all-purpose flour (approximately 8 g)
300 ml milk (whole milk assumed; approximately 309 g)
Juice of 1 lemon (approximately 47 g)
1 tbsp honey (approximately 21 g)
Salt, pepper, chicken bouillon powder and MSG, to taste

1. Marinate the chicken with salt and pepper. Pan-fry skin-side down over medium heat without oil, letting the natural fat render until the skin is golden brown and crispy.
2. Flip and cook for another 5–10 minutes, or until fully cooked through. Check that the thickest part reaches 74°C (165°F); time varies with thickness. Remove the chicken and keep it aside.
3. In the same pan, melt the butter. Add the flour and cook briefly to form a roux. Slowly pour in the milk while stirring continuously to avoid lumps.
4. Stir in the lemon juice and honey. Season to taste with salt, pepper, chicken bouillon powder and MSG.
5. Return the chicken to the sauce and simmer for 1–2 minutes so everything comes together.

Nutrition estimate: 2 equal servings; 400 g raw boneless skin-on thigh meat, 30 g butter, whole milk, 8 g flour, 47 g lemon juice and 21 g honey. Counts all chicken fat and sauce as eaten. Milk type, butter quantity and discarded rendered fat change the result. Seasonings are unmeasured and excluded from the macro estimate; sodium is not estimated. Rice and other sides are not included. The generated image is illustrative.',
  'https://www.tiktok.com/@madebythewa/video/7647909556240076033',30,'easy','{"kind":"asset","id":"creamy-lemon-chicken"}'::jsonb);
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,q.ordinal,q.quantity
from (values ('food-lemon-chicken-172385',1,4::numeric),('food-lemon-chicken-173410',2,0.3),
  ('food-lemon-chicken-169761',3,0.08),('food-lemon-chicken-171265',4,3.09),
  ('food-lemon-chicken-167747',5,0.47),('food-lemon-chicken-169640',6,0.21)) q(food_id,ordinal,quantity)
join public.foods f on f.app_id=q.food_id cross join public.meals m where m.app_id='meal-creamy-lemon-chicken';

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
      if cover->>'id' is distinct from 'creamy-lemon-chicken' then
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
        ('food-egg','food-chicken','food-salmon','food-greek-yogurt','food-milk','food-cheddar','food-butter','food-honey','food-mvp3-173424','food-mvp3-171477','food-lemon-chicken-172385','food-lemon-chicken-173410','food-lemon-chicken-171265','food-lemon-chicken-169640'))
      or (lower(plan.dietary_pattern) like '%vegetarian%' and app_id in ('food-chicken','food-salmon','food-mvp3-171477','food-lemon-chicken-172385'))
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
notify pgrst,'reload schema';
