begin;
select plan(40);

select ok(not has_function_privilege('authenticated','private.normalize_planned_meal_record(jsonb,uuid)','EXECUTE'),'normalizer remains private');
select ok(not has_function_privilege('anon','private.check_meal_constraints()','EXECUTE'),'constraint implementation remains private');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.normalize_planned_meal_record(jsonb,uuid)'::regprocedure),'normalizer retains controlled definer search path');

insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000008401','provided-planning-a@example.test'),
('00000000-0000-0000-0000-000000008402','provided-planning-b@example.test'),
('00000000-0000-0000-0000-000000008403','provided-planning-keto@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal,dietary_pattern)
values('00000000-0000-0000-0000-000000008401','Plan Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain','No restrictions'),
('00000000-0000-0000-0000-000000008403','Keto Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain','Keto-style');
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('provided-planning-goal','00000000-0000-0000-0000-000000008401','maintain',3,'2026-10-05'),
('provided-planning-keto-goal','00000000-0000-0000-0000-000000008403','maintain',3,'2026-10-05');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('provided-planning-target','00000000-0000-0000-0000-000000008401',(select row_id from public.goals where app_id='provided-planning-goal'),1,'2026-10-05',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only'),
('provided-planning-keto-target','00000000-0000-0000-0000-000000008403',(select row_id from public.goals where app_id='provided-planning-keto-goal'),1,'2026-10-05',2000,120,40,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.meals(app_id,owner_user_id,is_system,name,servings,notes,complexity,provided_nutrition)
values('provided-planning-personal','00000000-0000-0000-0000-000000008401',false,'Personal supplied recipe',2,'Serve.','easy','{"calories":100,"proteinG":10,"carbsG":5,"fatG":4}'),
('provided-planning-legacy','00000000-0000-0000-0000-000000008401',false,'Ingredient recipe',2,'Serve.','medium',null);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,1,2 from public.meals m cross join public.foods f where m.app_id in ('provided-planning-personal','provided-planning-legacy') and f.app_id='food-egg';
create temporary table provided_result as select private.normalize_planned_meal_record('{"mealId":"meal-korean-beef-bowl","label":"Custom label","servings":0.5,"expectedCalories":1,"expectedProteinG":1,"expectedCarbsG":1,"expectedFatG":1,"expectedFiberG":55}', '00000000-0000-0000-0000-000000008401') as value;
select is((select (value->>'expectedCalories')::numeric from provided_result),280::numeric,'half recipe uses original calories');
select is((select (value->>'expectedProteinG')::numeric from provided_result),22.5::numeric,'half recipe preserves protein fraction');
select is((select (value->>'expectedCarbsG')::numeric from provided_result),29::numeric,'half recipe preserves supplied carbs');
select is((select (value->>'expectedFatG')::numeric from provided_result),8::numeric,'half recipe preserves supplied fat');
select is((select value->>'source' from provided_result),'source-provided','supplied macros are not labeled trusted catalog');
select ok((select value->>'sourceVersion' like 'recipe:meal-korean-beef-bowl:revision:%' from provided_result),'source references authoritative recipe revision');
select ok((select value->>'assumptions' like '%not independently verified%' from provided_result),'uncertainty remains explicit');
select is((select value->>'label' from provided_result),'Custom label','explicit planned labels remain editable');
select ok((select not value ? 'expectedFiberG' from provided_result),'unknown supplied fiber never uses client or ingredient values');
select is((private.normalize_planned_meal_record('{"mealId":"provided-planning-personal","servings":0.25}', '00000000-0000-0000-0000-000000008401')->>'expectedCalories')::numeric,25::numeric,'owned recipes use their manually supplied values');
select is((private.normalize_planned_meal_record('{"mealId":"provided-planning-legacy","servings":0.5}', '00000000-0000-0000-0000-000000008401')->>'expectedCalories')::numeric,(select calories*0.5 from public.foods where app_id='food-egg'),'recipes without supplied macros retain ingredient calculations');
select is((private.normalize_planned_meal_record('{"foodId":"food-egg","servings":0.5}', '00000000-0000-0000-0000-000000008401')->>'expectedCalories')::numeric,(select calories*0.5 from public.foods where app_id='food-egg'),'food-only planning is unchanged');
select throws_ok($$select private.normalize_planned_meal_record('{"mealId":"provided-planning-personal","servings":1}', '00000000-0000-0000-0000-000000008402')$$,'P0001',null,'foreign personal recipes are denied');
select throws_ok($$select private.normalize_planned_meal_record('{"mealId":"meal-korean-beef-bowl","servings":0}', '00000000-0000-0000-0000-000000008401')$$,'P0001',null,'zero portions remain invalid');

create function pg_temp.provided_add(key text, recipe_id text default 'meal-korean-beef-bowl', target_id text default 'provided-planning-target') returns jsonb language sql as $$
select jsonb_build_object('mealPlan',jsonb_build_object('id',key||'-plan','weekOf','2026-10-05','targetId',target_id),
'plannedMeal',jsonb_build_object('id',key||'-meal','date','2026-10-07','slot','lunch','mealId',recipe_id,'servings',0.5,'expectedCalories',1),
'grocery',jsonb_build_object('id',key||'-grocery','weekOf','2026-10-05','items','[]'::jsonb),'expectedVersions',jsonb_build_object('mealPlanVersion',0),'idempotencyKey',key);
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000008401';
select is((public.add_planned_meal(pg_temp.provided_add('provided-new'))->>'status'),'completed','new supplied recipe plan persists atomically');
select is((select expected_calories from public.planned_meals where user_id=auth.uid()),280::numeric,'new plan stores supplied calories despite client tampering');
select is((select expected_protein_g from public.planned_meals where user_id=auth.uid()),22.5::numeric,'new plan stores supplied fractional protein');
select is((select expected_fiber_g from public.planned_meals where user_id=auth.uid()),null::numeric,'new plan leaves unsupplied fiber unknown');
select is((public.add_planned_meal(pg_temp.provided_add('provided-new'))->>'replayed'),'true','new plan retry replays once');
select is((select count(*)::integer from public.planned_meals where user_id=auth.uid()),1,'retry does not duplicate prescriptions');
select is((select count(*)::integer from public.nutrition_logs where user_id=auth.uid()),0,'planning does not create eaten intake');
create temporary table provided_edit as select jsonb_build_object('mealPlan',jsonb_build_object('id','provided-new-plan','weekOf','2026-10-05','targetId','provided-planning-target',
'meals',jsonb_build_array(jsonb_build_object('id','provided-new-meal','date','2026-10-07','slot','lunch','mealId','meal-korean-beef-bowl','label','Korean Beef Bowl','servings',1.5))),
'grocery',jsonb_build_object('id','provided-new-grocery','weekOf','2026-10-05','items','[]'::jsonb),
'expectedVersions',jsonb_build_object('mealPlanVersion',1,'groceryRevision',(select revision from public.grocery_lists where user_id=auth.uid())),'idempotencyKey','provided-edit') as payload;
select is((public.edit_meal_plan((select payload from provided_edit))->>'status'),'completed','editing creates a new prescribed version');
select is((select expected_calories from public.planned_meals where user_id=auth.uid() order by meal_plan_row_id desc limit 1),840::numeric,'edited portion stores supplied calories');
select is((select expected_protein_g from public.planned_meals where user_id=auth.uid() order by meal_plan_row_id desc limit 1),67.5::numeric,'edited portion retains fractional protein');
select is((select expected_calories from public.planned_meals where user_id=auth.uid() order by meal_plan_row_id limit 1),280::numeric,'previous prescribed version is preserved');
select is((public.edit_meal_plan((select payload from provided_edit))->>'replayed'),'true','edit retry replays without a new version');
select is((select count(*)::integer from public.meal_plans where user_id=auth.uid()),2,'edit retry does not duplicate versions');
select throws_ok($$select public.edit_meal_plan((select jsonb_set(payload,'{idempotencyKey}','"provided-stale"') from provided_edit))$$,'P0001',null,'fresh stale edit is rejected');
select throws_ok($$update public.planned_meals set expected_calories=1 where user_id=auth.uid()$$,'42501',null,'direct writes still cannot bypass normalization');
reset role;
update public.meals set archived_at=now() where app_id='provided-planning-personal';
select throws_ok($$select private.normalize_planned_meal_record('{"mealId":"provided-planning-personal","servings":1}', '00000000-0000-0000-0000-000000008401')$$,'P0001',null,'archived supplied recipes are denied');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000008402';
select throws_ok($$select public.add_planned_meal(pg_temp.provided_add('provided-foreign'))$$,'P0001',null,'another account cannot use the owned target');
set local role anon;
select throws_ok($$select public.add_planned_meal(pg_temp.provided_add('provided-anon'))$$,'42501',null,'anonymous planning is denied');
reset role;
set constraints all immediate;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000008403';
select throws_ok($$select public.add_planned_meal(pg_temp.provided_add('provided-keto','meal-korean-beef-bowl','provided-planning-keto-target'))$$,'P0001',null,'carb-limited planning rejects unverified supplied macros even with trusted ingredients');
select is((select count(*)::integer from public.meal_plans where user_id=auth.uid()),0,'ineligible recipe failure rolls back its plan');
select is((select count(*)::integer from public.grocery_lists where user_id=auth.uid()),0,'ineligible recipe failure rolls back groceries');
reset role;
select is((select servings from public.meals where app_id='meal-korean-beef-bowl'),4::numeric,'recipe yield is unchanged');
select is((select provided_nutrition from public.meals where app_id='meal-korean-beef-bowl'),'{"calories":560,"proteinG":45,"carbsG":58,"fatG":16}'::jsonb,'original recipe macros are unchanged');
select * from finish();
rollback;
