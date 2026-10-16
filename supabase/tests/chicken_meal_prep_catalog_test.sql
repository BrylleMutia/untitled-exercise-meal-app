begin;
select no_plan();
select is((select count(*)::int from public.meals where is_system and archived_at is null),4,'four active recipes');
select is((select count(*)::int from public.foods where app_id like 'food-chicken-prep-%' and value_source='trusted_catalog'),9,'nine reviewed USDA foods');
select is((select meal_slots from public.meals where app_id='meal-sticky-teriyaki-chicken'),array['lunch','dinner'],'teriyaki slots');
select is((select meal_slots from public.meals where app_id='meal-chicken-burrito-protein-boxes'),array['breakfast','lunch'],'burrito slots');
select ok((select bool_and(servings=4 and complexity='easy' and provided_nutrition is null) from public.meals where app_id in ('meal-sticky-teriyaki-chicken','meal-chicken-burrito-protein-boxes')),'ingredient calculations with four servings');
select is((select total_time_minutes from public.meals where app_id='meal-sticky-teriyaki-chicken'),30,'teriyaki time');
select is((select total_time_minutes from public.meals where app_id='meal-chicken-burrito-protein-boxes'),20,'burrito time');
select is((select round(sum(f.calories*i.servings)/max(m.servings))::int from public.meals m join public.meal_ingredients i on i.meal_row_id=m.row_id join public.foods f on f.row_id=i.food_row_id where m.app_id='meal-sticky-teriyaki-chicken'),449,'calculated teriyaki calories');
select is((select round(sum(f.calories*i.servings)/max(m.servings))::int from public.meals m join public.meal_ingredients i on i.meal_row_id=m.row_id join public.foods f on f.row_id=i.food_row_id where m.app_id='meal-chicken-burrito-protein-boxes'),327,'calculated burrito calories');
select is((select i.cooking_measurement->>'unit' from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='meal-sticky-teriyaki-chicken' and ingredient_order=3),'ml','80ml sauce original unit');
select is((select i.servings from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='meal-sticky-teriyaki-chicken' and ingredient_order=3),0.96::numeric,'sauce converts to 96g');
select is((select i.cooking_measurement->>'text' from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='meal-chicken-burrito-protein-boxes' and ingredient_order=2),'1 tin (240 g drained)','confirmed bean assumption');
select ok((select nutrition_notes like '%520 kcal, 48 g protein%' and jsonb_array_length(unmeasured_ingredients)=2 from public.meals where app_id='meal-sticky-teriyaki-chicken'),'quoted macros and garnishes retained separately');
select ok((select nutrition_notes like '%480 kcal, 50 g protein%' and nutrition_notes like '%No rice, tortilla%' from public.meals where app_id='meal-chicken-burrito-protein-boxes'),'burrito original macros retained as comparison');
select ok((select fiber_g is null and record_type='Foundation' from public.foods where app_id='food-chicken-prep-2644285'),'unknown bean fiber stays unknown');

insert into auth.users(id,email) values('00000000-0000-0000-0000-000000007901','chicken-catalog@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000007901','Chicken catalog',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date) values('chicken-goal','00000000-0000-0000-0000-000000007901','maintain',3,'2026-09-01');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('chicken-target','00000000-0000-0000-0000-000000007901',(select row_id from public.goals where app_id='chicken-goal'),1,'2026-09-01',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only');
create function pg_temp.check_chicken(recipe_id text,pattern text default 'No restrictions',allergies text[] default '{}',minutes int default 45,budget int default 12) returns void language plpgsql as $$
declare recipe public.meals; profile public.profiles;
begin select * into recipe from public.meals where app_id=recipe_id; select * into profile from public.profiles where id='00000000-0000-0000-0000-000000007901'; profile.dietary_pattern:=pattern;profile.allergies:=allergies;profile.cooking_time_minutes:=minutes;profile.meal_budget:=budget;perform private.assert_generation_recipe(recipe,profile);end;$$;
select lives_ok($$select pg_temp.check_chicken('meal-sticky-teriyaki-chicken')$$,'teriyaki eligible normally');
select lives_ok($$select pg_temp.check_chicken('meal-chicken-burrito-protein-boxes')$$,'burrito eligible normally');
select throws_ok($$select pg_temp.check_chicken('meal-sticky-teriyaki-chicken','Vegetarian')$$,'P0001',null,'new raw chicken denied for vegetarian');
select throws_ok($$select pg_temp.check_chicken('meal-chicken-burrito-protein-boxes','Vegan')$$,'P0001',null,'new raw chicken denied for vegan');
select throws_ok($$select pg_temp.check_chicken('meal-sticky-teriyaki-chicken','No restrictions',array['sesame'])$$,'P0001',null,'unmeasured sesame still checked for allergies');
select throws_ok($$select pg_temp.check_chicken('meal-sticky-teriyaki-chicken','No restrictions',array['wheat'])$$,'P0001',null,'sauce wheat allergy checked');
select throws_ok($$select pg_temp.check_chicken('meal-sticky-teriyaki-chicken','No restrictions','{}',29)$$,'P0001',null,'thirty minute recipe excluded at twenty nine minutes');
select throws_ok($$select pg_temp.check_chicken('meal-chicken-burrito-protein-boxes','No restrictions','{}',45,6)$$,'P0001',null,'relative budget enforced');

create function pg_temp.chicken_generation() returns jsonb language sql as $$
with recipes as (select * from public.meals where app_id in ('meal-sticky-teriyaki-chicken','meal-chicken-burrito-protein-boxes')),
entries as (select jsonb_agg(jsonb_build_object('id',r.app_id||'-'||n,'date',('2026-10-19'::date+n-1)::text,'slot',case when r.app_id='meal-sticky-teriyaki-chicken' then 'lunch' else 'breakfast' end,'mealId',r.app_id,'label',r.name,'servings',1)) rows from recipes r cross join generate_series(1,4) n)
select jsonb_build_object('weekOf','2026-10-19','idempotencyKey','chicken-generation','recipes',(select jsonb_agg(jsonb_build_object('id',app_id,'revision',revision)) from recipes),'assignments',(select rows from entries),
'mealPlan',jsonb_build_object('id','chicken-plan','weekOf','2026-10-19','targetId','chicken-target','meals',(select rows from entries)),
'grocery',jsonb_build_object('id','chicken-grocery','weekOf','2026-10-19','items','[]'::jsonb),
'expectedVersions',jsonb_build_object('profileRevision',(select revision from public.profiles where id=auth.uid()),'mealPlanVersion',0,'groceryRevision',0));$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000007901';
select lives_ok($$select public.generate_nutrition_week(pg_temp.chicken_generation())$$,'both recipes generate through authorized transaction');
select is(public.generate_nutrition_week(pg_temp.chicken_generation())->>'replayed','true','generation retries do not duplicate');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-19')->'plannedMeals'),8,'four occurrences each');
select is((select count(*)::int from public.nutrition_logs where user_id=auth.uid()),0,'generation does not record intake');
select ok(not exists(select 1 from public.grocery_items where user_id=auth.uid() and lower(name)~'sesame|spring onion|coriander'),'unmeasured garnishes excluded from grocery quantities');
select throws_ok($$update public.meals set servings=2 where app_id='meal-sticky-teriyaki-chicken'$$,'42501',null,'direct catalog writes denied');
reset role;
select * from finish();
rollback;
