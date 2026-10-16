begin;
select no_plan();
insert into auth.users(id,email) values('f1791359-af0d-4435-9443-e9bfbaf6a368','reviewed-legacy-fixture@example.test');
insert into public.foods("app_id","calories","carbs_g","category","confidence","created_at","estimate_range","estimated","fat_g","fdc_id","fiber_g","is_system","name","nutrients_per_100g","owner_user_id","preparation_basis","protein_g","provider_imported_at","provider_revision","record_type","serving_grams","serving_label","serving_options","serving_unit","source","source_version","updated_at","value_source") select r."app_id",r."calories",r."carbs_g",r."category",r."confidence",r."created_at",r."estimate_range",r."estimated",r."fat_g",r."fdc_id",r."fiber_g",r."is_system",r."name",r."nutrients_per_100g",r."owner_user_id",r."preparation_basis",r."protein_g",r."provider_imported_at",r."provider_revision",r."record_type",r."serving_grams",r."serving_label",r."serving_options",r."serving_unit",r."source",r."source_version",r."updated_at",r."value_source" from jsonb_populate_record(null::public.foods,'{"app_id":"food-fdc-2708951","calories":174,"carbs_g":32.5,"category":"Other","confidence":"high","created_at":"2026-09-22T09:25:43.296824+00:00","estimate_range":null,"estimated":false,"fat_g":3.19,"fdc_id":"2708951","fiber_g":1.1,"is_system":false,"name":"Rice, fried, meatless","nutrients_per_100g":{"calories":174,"carbsG":32.5,"fatG":3.19,"fiberG":1.1,"proteinG":3.84},"owner_user_id":"f1791359-af0d-4435-9443-e9bfbaf6a368","preparation_basis":"prepared","protein_g":3.84,"provider_imported_at":null,"provider_revision":"Survey (FNDDS):2708951","record_type":"Survey (FNDDS)","row_id":23,"serving_grams":100,"serving_label":"100 g serving","serving_options":[{"grams":166,"label":"Quantity not specified","unit":"undetermined"},{"grams":166,"label":"1 cup","unit":"undetermined"}],"serving_unit":"g","source":"USDA FoodData Central","source_version":"FoodData Central API verified 2026-09-22","updated_at":"2026-09-22T09:25:43.296824+00:00","value_source":"trusted_catalog"}'::jsonb) r;
insert into public.foods("app_id","calories","carbs_g","category","confidence","created_at","estimate_range","estimated","fat_g","fdc_id","fiber_g","is_system","name","nutrients_per_100g","owner_user_id","preparation_basis","protein_g","provider_imported_at","provider_revision","record_type","serving_grams","serving_label","serving_options","serving_unit","source","source_version","updated_at","value_source") select r."app_id",r."calories",r."carbs_g",r."category",r."confidence",r."created_at",r."estimate_range",r."estimated",r."fat_g",r."fdc_id",r."fiber_g",r."is_system",r."name",r."nutrients_per_100g",r."owner_user_id",r."preparation_basis",r."protein_g",r."provider_imported_at",r."provider_revision",r."record_type",r."serving_grams",r."serving_label",r."serving_options",r."serving_unit",r."source",r."source_version",r."updated_at",r."value_source" from jsonb_populate_record(null::public.foods,'{"app_id":"review-food-d2b382aba3896100dfbe82a26bde7eae","calories":120,"carbs_g":0,"category":"Other","confidence":"low","created_at":"2026-09-22T09:25:44.875607+00:00","estimate_range":{"calories":{"base":120,"high":130,"low":90},"carbsG":{"base":0,"high":0,"low":0},"fatG":{"base":13.5,"high":14.5,"low":10},"fiberG":{"base":0,"high":0,"low":0},"proteinG":{"base":0,"high":0,"low":0}},"estimated":true,"fat_g":13.5,"fdc_id":null,"fiber_g":0,"is_system":false,"name":"cooking oil","nutrients_per_100g":null,"owner_user_id":"f1791359-af0d-4435-9443-e9bfbaf6a368","preparation_basis":"prepared","protein_g":0,"provider_imported_at":null,"provider_revision":null,"record_type":null,"row_id":24,"serving_grams":100,"serving_label":"custom serving","serving_options":null,"serving_unit":"g","source":"DeepSeek estimate","source_version":"deepseek-flash","updated_at":"2026-09-22T09:25:44.875607+00:00","value_source":"ai_estimate"}'::jsonb) r;
insert into public.foods("app_id","calories","carbs_g","category","confidence","created_at","estimate_range","estimated","fat_g","fdc_id","fiber_g","is_system","name","nutrients_per_100g","owner_user_id","preparation_basis","protein_g","provider_imported_at","provider_revision","record_type","serving_grams","serving_label","serving_options","serving_unit","source","source_version","updated_at","value_source") select r."app_id",r."calories",r."carbs_g",r."category",r."confidence",r."created_at",r."estimate_range",r."estimated",r."fat_g",r."fdc_id",r."fiber_g",r."is_system",r."name",r."nutrients_per_100g",r."owner_user_id",r."preparation_basis",r."protein_g",r."provider_imported_at",r."provider_revision",r."record_type",r."serving_grams",r."serving_label",r."serving_options",r."serving_unit",r."source",r."source_version",r."updated_at",r."value_source" from jsonb_populate_record(null::public.foods,'{"app_id":"review-food-0d0026d23355219d2f9c185856e81aa3","calories":10,"carbs_g":1.2,"category":"Other","confidence":"low","created_at":"2026-09-22T09:25:44.875607+00:00","estimate_range":{"calories":{"base":10,"high":15,"low":8},"carbsG":{"base":1.2,"high":2,"low":0.8},"fatG":{"base":0,"high":0.1,"low":0},"fiberG":{"base":0.1,"high":0.3,"low":0},"proteinG":{"base":1.3,"high":2,"low":1}},"estimated":true,"fat_g":0,"fdc_id":null,"fiber_g":0.1,"is_system":false,"name":"soy sauce","nutrients_per_100g":null,"owner_user_id":"f1791359-af0d-4435-9443-e9bfbaf6a368","preparation_basis":"prepared","protein_g":1.3,"provider_imported_at":null,"provider_revision":null,"record_type":null,"row_id":25,"serving_grams":100,"serving_label":"custom serving","serving_options":null,"serving_unit":"g","source":"DeepSeek estimate","source_version":"deepseek-flash","updated_at":"2026-09-22T09:25:44.875607+00:00","value_source":"ai_estimate"}'::jsonb) r;
insert into public.foods("app_id","calories","carbs_g","category","confidence","created_at","estimate_range","estimated","fat_g","fdc_id","fiber_g","is_system","name","nutrients_per_100g","owner_user_id","preparation_basis","protein_g","provider_imported_at","provider_revision","record_type","serving_grams","serving_label","serving_options","serving_unit","source","source_version","updated_at","value_source") select r."app_id",r."calories",r."carbs_g",r."category",r."confidence",r."created_at",r."estimate_range",r."estimated",r."fat_g",r."fdc_id",r."fiber_g",r."is_system",r."name",r."nutrients_per_100g",r."owner_user_id",r."preparation_basis",r."protein_g",r."provider_imported_at",r."provider_revision",r."record_type",r."serving_grams",r."serving_label",r."serving_options",r."serving_unit",r."source",r."source_version",r."updated_at",r."value_source" from jsonb_populate_record(null::public.foods,'{"app_id":"review-food-a09bfb9d2256117d00575ae1b2115104","calories":30,"carbs_g":6,"category":"Other","confidence":"low","created_at":"2026-09-22T09:25:44.875607+00:00","estimate_range":{"calories":{"base":30,"high":55,"low":15},"carbsG":{"base":6,"high":10,"low":3},"fatG":{"base":0.3,"high":1,"low":0},"fiberG":{"base":2,"high":3.5,"low":1},"proteinG":{"base":1.5,"high":3,"low":0.5}},"estimated":true,"fat_g":0.3,"fdc_id":null,"fiber_g":2,"is_system":false,"name":"vegetables","nutrients_per_100g":null,"owner_user_id":"f1791359-af0d-4435-9443-e9bfbaf6a368","preparation_basis":"prepared","protein_g":1.5,"provider_imported_at":null,"provider_revision":null,"record_type":null,"row_id":26,"serving_grams":100,"serving_label":"custom serving","serving_options":null,"serving_unit":"g","source":"DeepSeek estimate","source_version":"deepseek-flash","updated_at":"2026-09-22T09:25:44.875607+00:00","value_source":"ai_estimate"}'::jsonb) r;
insert into public.meals("app_id","archived_at","complexity","created_at","image","is_system","meal_slots","name","notes","nutrition_notes","owner_user_id","provided_nutrition","reference","revision","servings","source_url","total_time_minutes","unmeasured_ingredients","updated_at") select r."app_id",r."archived_at",r."complexity",r."created_at",r."image",r."is_system",r."meal_slots",r."name",r."notes",r."nutrition_notes",r."owner_user_id",r."provided_nutrition",r."reference",r."revision",r."servings",r."source_url",r."total_time_minutes",r."unmeasured_ingredients",r."updated_at" from jsonb_populate_record(null::public.meals,'{"app_id":"meal-5d103340-278e-4e88-a0be-8f3fe230a27c","archived_at":null,"complexity":"medium","created_at":"2026-10-08T08:47:12.662188+00:00","image":null,"is_system":false,"meal_slots":[],"name":"test11","notes":"test1","nutrition_notes":null,"owner_user_id":"f1791359-af0d-4435-9443-e9bfbaf6a368","provided_nutrition":null,"reference":null,"revision":3,"row_id":27,"servings":3,"source_url":null,"total_time_minutes":null,"unmeasured_ingredients":null,"updated_at":"2026-10-12T08:51:10.654653+00:00"}'::jsonb) r;
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-5d103340-278e-4e88-a0be-8f3fe230a27c'),(select row_id from public.foods where app_id='food-egg'),1,6,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-5d103340-278e-4e88-a0be-8f3fe230a27c'),(select row_id from public.foods where app_id='food-peanut-butter'),2,3,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-5d103340-278e-4e88-a0be-8f3fe230a27c'),(select row_id from public.foods where app_id='food-egg'),3,1,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-5d103340-278e-4e88-a0be-8f3fe230a27c'),(select row_id from public.foods where app_id='food-peanut-butter'),4,2.5,'null'::jsonb);
insert into public.meals("app_id","archived_at","complexity","created_at","image","is_system","meal_slots","name","notes","nutrition_notes","owner_user_id","provided_nutrition","reference","revision","servings","source_url","total_time_minutes","unmeasured_ingredients","updated_at") select r."app_id",r."archived_at",r."complexity",r."created_at",r."image",r."is_system",r."meal_slots",r."name",r."notes",r."nutrition_notes",r."owner_user_id",r."provided_nutrition",r."reference",r."revision",r."servings",r."source_url",r."total_time_minutes",r."unmeasured_ingredients",r."updated_at" from jsonb_populate_record(null::public.meals,'{"app_id":"meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a","archived_at":null,"complexity":"medium","created_at":"2026-09-22T09:02:58.512096+00:00","image":null,"is_system":false,"meal_slots":[],"name":"Toast","notes":null,"nutrition_notes":null,"owner_user_id":"f1791359-af0d-4435-9443-e9bfbaf6a368","provided_nutrition":null,"reference":null,"revision":2,"row_id":5,"servings":1,"source_url":null,"total_time_minutes":null,"unmeasured_ingredients":null,"updated_at":"2026-10-12T08:51:10.652435+00:00"}'::jsonb) r;
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'),(select row_id from public.foods where app_id='food-bread'),1,1,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'),(select row_id from public.foods where app_id='food-peanut-butter'),2,1,'null'::jsonb);
insert into public.meals("app_id","archived_at","complexity","created_at","image","is_system","meal_slots","name","notes","nutrition_notes","owner_user_id","provided_nutrition","reference","revision","servings","source_url","total_time_minutes","unmeasured_ingredients","updated_at") select r."app_id",r."archived_at",r."complexity",r."created_at",r."image",r."is_system",r."meal_slots",r."name",r."notes",r."nutrition_notes",r."owner_user_id",r."provided_nutrition",r."reference",r."revision",r."servings",r."source_url",r."total_time_minutes",r."unmeasured_ingredients",r."updated_at" from jsonb_populate_record(null::public.meals,'{"app_id":"meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5","archived_at":null,"complexity":"medium","created_at":"2026-09-22T09:25:44.875607+00:00","image":null,"is_system":false,"meal_slots":[],"name":"Fried Rice","notes":null,"nutrition_notes":null,"owner_user_id":"f1791359-af0d-4435-9443-e9bfbaf6a368","provided_nutrition":null,"reference":null,"revision":2,"row_id":6,"servings":1,"source_url":null,"total_time_minutes":null,"unmeasured_ingredients":null,"updated_at":"2026-10-12T08:51:10.65455+00:00"}'::jsonb) r;
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),(select row_id from public.foods where app_id='food-fdc-2708951'),1,3.32,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),(select row_id from public.foods where app_id='review-food-d2b382aba3896100dfbe82a26bde7eae'),2,1,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),(select row_id from public.foods where app_id='review-food-0d0026d23355219d2f9c185856e81aa3'),3,1,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),(select row_id from public.foods where app_id='food-egg'),4,1,'null'::jsonb);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings,cooking_measurement) values((select row_id from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),(select row_id from public.foods where app_id='review-food-a09bfb9d2256117d00575ae1b2115104'),5,0.5,'null'::jsonb);

create temp table legacy_recipe_before as select app_id,to_jsonb(m)-'meal_slots'-'revision'-'updated_at' value from public.meals m;
create temp table legacy_ingredient_before as select jsonb_agg(to_jsonb(i) order by row_id) value from public.meal_ingredients i;
create function pg_temp.apply_reviewed_assignments() returns void language plpgsql as $test_function$ begin execute $migration$-- Apply only the three user-reviewed legacy assignments. Other installations
-- have no matching records. Never infer assignments from arbitrary recipe names.
do $assignments$
declare item jsonb; recipe public.meals; actual_ingredients jsonb; slots text[];
begin
 for item in select value from jsonb_array_elements($reviewed_recipe_assignments$[
  {
    "id": "meal-5d103340-278e-4e88-a0be-8f3fe230a27c",
    "owner": "f1791359-af0d-4435-9443-e9bfbaf6a368",
    "recipe": {
      "app_id": "meal-5d103340-278e-4e88-a0be-8f3fe230a27c",
      "archived_at": null,
      "complexity": "medium",
      "image": null,
      "is_system": false,
      "meal_slots": [],
      "name": "test11",
      "notes": "test1",
      "nutrition_notes": null,
      "owner_user_id": "f1791359-af0d-4435-9443-e9bfbaf6a368",
      "provided_nutrition": null,
      "reference": null,
      "revision": 3,
      "servings": 3,
      "source_url": null,
      "total_time_minutes": null,
      "unmeasured_ingredients": null
    },
    "ingredients": [
      {
        "cooking": null,
        "foodId": "food-egg",
        "order": 1,
        "servings": 6
      },
      {
        "cooking": null,
        "foodId": "food-peanut-butter",
        "order": 2,
        "servings": 3
      },
      {
        "cooking": null,
        "foodId": "food-egg",
        "order": 3,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "food-peanut-butter",
        "order": 4,
        "servings": 2.5
      }
    ],
    "slots": [
      "breakfast",
      "snack"
    ]
  },
  {
    "id": "meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a",
    "owner": "f1791359-af0d-4435-9443-e9bfbaf6a368",
    "recipe": {
      "app_id": "meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a",
      "archived_at": null,
      "complexity": "medium",
      "image": null,
      "is_system": false,
      "meal_slots": [],
      "name": "Toast",
      "notes": null,
      "nutrition_notes": null,
      "owner_user_id": "f1791359-af0d-4435-9443-e9bfbaf6a368",
      "provided_nutrition": null,
      "reference": null,
      "revision": 2,
      "servings": 1,
      "source_url": null,
      "total_time_minutes": null,
      "unmeasured_ingredients": null
    },
    "ingredients": [
      {
        "cooking": null,
        "foodId": "food-bread",
        "order": 1,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "food-peanut-butter",
        "order": 2,
        "servings": 1
      }
    ],
    "slots": [
      "breakfast",
      "lunch",
      "snack"
    ]
  },
  {
    "id": "meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5",
    "owner": "f1791359-af0d-4435-9443-e9bfbaf6a368",
    "recipe": {
      "app_id": "meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5",
      "archived_at": null,
      "complexity": "medium",
      "image": null,
      "is_system": false,
      "meal_slots": [],
      "name": "Fried Rice",
      "notes": null,
      "nutrition_notes": null,
      "owner_user_id": "f1791359-af0d-4435-9443-e9bfbaf6a368",
      "provided_nutrition": null,
      "reference": null,
      "revision": 2,
      "servings": 1,
      "source_url": null,
      "total_time_minutes": null,
      "unmeasured_ingredients": null
    },
    "ingredients": [
      {
        "cooking": null,
        "foodId": "food-fdc-2708951",
        "order": 1,
        "servings": 3.32
      },
      {
        "cooking": null,
        "foodId": "review-food-d2b382aba3896100dfbe82a26bde7eae",
        "order": 2,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "review-food-0d0026d23355219d2f9c185856e81aa3",
        "order": 3,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "food-egg",
        "order": 4,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "review-food-a09bfb9d2256117d00575ae1b2115104",
        "order": 5,
        "servings": 0.5
      }
    ],
    "slots": [
      "lunch",
      "dinner"
    ]
  }
]$reviewed_recipe_assignments$::jsonb) loop
  select * into recipe from public.meals where app_id=item->>'id' and owner_user_id=(item->>'owner')::uuid for update;
  if not found then
   if exists(select 1 from public.meals where app_id=item->>'id') then raise exception 'Reviewed recipe owner changed: %',item->>'id'; end if;
   continue;
  end if;
  select array_agg(value order by ordinal) into slots from jsonb_array_elements_text(item->'slots') with ordinality as s(value,ordinal);
  if recipe.meal_slots=slots then continue; end if;
  if cardinality(recipe.meal_slots)<>0 or (to_jsonb(recipe)-'row_id'-'created_at'-'updated_at') is distinct from item->'recipe' then
   raise exception 'Reviewed recipe changed; assignment backfill stopped: %',item->>'id';
  end if;
  select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings,'order',i.ingredient_order,'cooking',i.cooking_measurement) order by i.ingredient_order)
   into actual_ingredients from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=recipe.row_id;
  if actual_ingredients is distinct from item->'ingredients' then raise exception 'Reviewed ingredients changed; assignment backfill stopped: %',item->>'id'; end if;
  update public.meals set meal_slots=slots where row_id=recipe.row_id;
 end loop;
end;
$assignments$;
-- No schema or privilege changes; all existing RLS and authorized writers remain.
$migration$; end; $test_function$;
create function pg_temp.stale_reviewed_assignment() returns void language plpgsql as $$ begin update public.meals set name='Concurrent edit' where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'; perform pg_temp.apply_reviewed_assignments(); end; $$;
select throws_ok($$select pg_temp.stale_reviewed_assignment()$$,'P0001',null,'changed reviewed record aborts the complete backfill');
create function pg_temp.changed_reviewed_ingredient() returns void language plpgsql as $$ begin update public.meal_ingredients set servings=servings+1 where meal_row_id=(select row_id from public.meals where name='Toast' and app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'); perform pg_temp.apply_reviewed_assignments(); end; $$;
select throws_ok($$select pg_temp.changed_reviewed_ingredient()$$,'P0001',null,'changed ingredient amount aborts the correction');
create function pg_temp.changed_reviewed_owner() returns void language plpgsql as $$ declare other_owner uuid:=gen_random_uuid(); begin insert into auth.users(id,email) values(other_owner,'other-'||other_owner||'@example.test'); update public.meals set owner_user_id=other_owner where app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'; perform pg_temp.apply_reviewed_assignments(); end; $$;
select throws_ok($$select pg_temp.changed_reviewed_owner()$$,'P0001',null,'different owner aborts the correction');
create function pg_temp.already_assigned_differently() returns void language plpgsql as $$ begin update public.meals set meal_slots=array['dinner'] where app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'; perform pg_temp.apply_reviewed_assignments(); end; $$;
select throws_ok($$select pg_temp.already_assigned_differently()$$,'P0001',null,'existing user assignments are not overwritten');
select ok(not exists(select 1 from public.meals where app_id in ('meal-5d103340-278e-4e88-a0be-8f3fe230a27c','meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a','meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5') and cardinality(meal_slots)>0),'failed backfill leaves all assignments unchanged');
select lives_ok($$select pg_temp.apply_reviewed_assignments()$$,'reviewed assignment backfill succeeds');
select is((select meal_slots from public.meals where app_id='meal-5d103340-278e-4e88-a0be-8f3fe230a27c'),array['breakfast','snack'],'test11 assignments match user selection');
select is((select revision from public.meals where app_id='meal-5d103340-278e-4e88-a0be-8f3fe230a27c'),4,'test11 revision advances once');
select is((select meal_slots from public.meals where app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'),array['breakfast','lunch','snack'],'Toast assignments match user selection');
select is((select revision from public.meals where app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'),3,'Toast revision advances once');
select is((select meal_slots from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),array['lunch','dinner'],'Fried Rice assignments match user selection');
select is((select revision from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),3,'Fried Rice revision advances once');
select is((select jsonb_agg(to_jsonb(i) order by row_id) from public.meal_ingredients i),(select value from legacy_ingredient_before),'ingredient rows remain identical');
select ok(not exists(select 1 from public.meals m join legacy_recipe_before b using(app_id) where (to_jsonb(m)-'meal_slots'-'revision'-'updated_at') is distinct from b.value),'all other recipe fields are preserved');
select lives_ok($$select pg_temp.apply_reviewed_assignments()$$,'repeating the data correction is harmless');
select is((select revision from public.meals where app_id='meal-5d103340-278e-4e88-a0be-8f3fe230a27c'),4,'repeat does not advance test11 revision');
select is((select revision from public.meals where app_id='meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a'),3,'repeat does not advance Toast revision');
select is((select revision from public.meals where app_id='meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5'),3,'repeat does not advance Fried Rice revision');
select * from finish();
rollback;
