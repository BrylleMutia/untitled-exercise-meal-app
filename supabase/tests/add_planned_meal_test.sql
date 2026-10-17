begin;
\ir fixtures/calendar_intent.inc
select plan(18);

select has_function('public','add_planned_meal',array['jsonb'],'planning has an authorized RPC');
select ok(has_function_privilege('authenticated','public.add_planned_meal(jsonb)','EXECUTE'),'authenticated users may add a planned meal');
select ok(not has_function_privilege('anon','public.add_planned_meal(jsonb)','EXECUTE'),'anonymous users cannot add a planned meal');
select ok(not has_function_privilege('authenticated','private.add_planned_meal(jsonb)','EXECUTE'),'private implementation cannot be called directly');

insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000009101','meal-plan-a@example.test'),
  ('00000000-0000-0000-0000-000000009102','meal-plan-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000009101','Meal Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('meal-goal-a','00000000-0000-0000-0000-000000009101','maintain',3,'2026-10-05');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('meal-target-a','00000000-0000-0000-0000-000000009101',(select row_id from public.goals where app_id='meal-goal-a'),1,'2026-10-05',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.foods(app_id,owner_user_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,category,source,source_version,estimated,confidence,value_source,estimate_range)
values('existing-ai-food','00000000-0000-0000-0000-000000009101',false,'Uncertain dish','one serving',100,'g',200,10,20,8,'Other','AI estimate','model-v1',true,'low','ai_estimate',
  '{"calories":{"low":180,"base":200,"high":220},"proteinG":{"low":8,"base":10,"high":12},"carbsG":{"low":18,"base":20,"high":22},"fatG":{"low":6,"base":8,"high":10}}');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009101';

select is((public.add_planned_meal(pg_temp.calendar_intent($json${
  "mealPlan":{"id":"meal-plan-a","weekOf":"2026-10-05","targetId":"meal-target-a"},
  "plannedMeal":{"id":"planned-egg-a","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","label":"Egg","servings":1},
  "grocery":{"id":"meal-grocery-a","weekOf":"2026-10-05","items":[{"id":"egg-item","name":"Egg","category":"Protein","unit":"piece","generatedQuantity":1,"quantity":1,"foodId":"food-egg"}]},
  "expectedVersions":{"mealPlanVersion":0},"idempotencyKey":"add-egg-a"
}$json$::jsonb))->>'status'),'completed','first addition creates a weekly plan');
select is((select count(*)::int from public.meal_plans where user_id=auth.uid() and week_of='2026-10-05'),1,'new week has one plan version');
select is((select count(*)::int from public.planned_meals where user_id=auth.uid() and meal_date='2026-10-07' and meal_slot='breakfast'),1,'first planned row is stored');
select is((select count(*)::int from public.grocery_items where user_id=auth.uid() and app_id='egg-item'),1,'grocery row is created atomically');
select is((public.add_planned_meal(pg_temp.calendar_intent($json${
  "mealPlan":{"id":"meal-plan-a","weekOf":"2026-10-05","targetId":"meal-target-a"},
  "plannedMeal":{"id":"planned-egg-a","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","label":"Egg","servings":1},
  "grocery":{"id":"meal-grocery-a","weekOf":"2026-10-05","items":[{"id":"egg-item","name":"Egg","category":"Protein","unit":"piece","generatedQuantity":1,"quantity":1,"foodId":"food-egg"}]},
  "expectedVersions":{"mealPlanVersion":0},"idempotencyKey":"add-egg-a"
}$json$::jsonb))->>'replayed'),'true','retry of the same intent replays');
select is((select count(*)::int from public.planned_meals where user_id=auth.uid() and app_id='planned-egg-a'),1,'retry does not duplicate the row');

select is((public.add_planned_meal(pg_temp.calendar_intent($json${
  "mealPlan":{"id":"meal-plan-a","weekOf":"2026-10-05","targetId":"meal-target-a"},
  "plannedMeal":{"id":"planned-egg-b","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","label":"Egg","servings":2},
  "grocery":{"id":"meal-grocery-a","weekOf":"2026-10-05","items":[{"id":"egg-item","name":"Egg","category":"Protein","unit":"piece","generatedQuantity":3,"quantity":3,"foodId":"food-egg"}]},
  "expectedVersions":{"mealPlanVersion":1,"groceryRevision":2},"idempotencyKey":"add-egg-b"
}$json$::jsonb))->>'status'),'completed','same slot accepts a second planned row');
select is((select count(*)::int from public.planned_meals where meal_plan_row_id=(select row_id from public.meal_plans where user_id=auth.uid() and week_of='2026-10-05' order by version desc limit 1) and meal_slot='breakfast'),2,'new version keeps both same-slot rows');
select is((select count(*)::int from public.nutrition_logs where user_id=auth.uid()),0,'planning does not write eaten history');
select throws_ok($$select public.add_planned_meal(pg_temp.calendar_intent('{"mealPlan":{"id":"meal-plan-a","weekOf":"2026-10-05","targetId":"meal-target-a"},"plannedMeal":{"id":"stale","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":1},"grocery":{"id":"meal-grocery-a","weekOf":"2026-10-05","items":[]},"expectedVersions":{"mealPlanVersion":1},"idempotencyKey":"stale-add"}'::jsonb))$$,'P0001',null,'stale version is rejected');
select throws_ok($$select public.add_planned_meal(pg_temp.calendar_intent('{"mealPlan":{"id":"meal-plan-a","weekOf":"2026-10-05","targetId":"missing-target"},"plannedMeal":{"id":"no-target","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":1},"grocery":{"id":"meal-grocery-a","weekOf":"2026-10-05","items":[]},"expectedVersions":{"mealPlanVersion":2},"idempotencyKey":"no-target-add"}'::jsonb))$$,'P0001',null,'planning requires an owned eligible target');
select throws_ok($$select public.add_planned_meal(pg_temp.calendar_intent('{"mealPlan":{"id":"meal-plan-a","weekOf":"2026-10-05","targetId":"meal-target-a"},"plannedMeal":{"id":"ai-only","date":"2026-10-07","slot":"breakfast","foodId":"ai-food","servings":1},"newFoods":[{"id":"ai-food","valueSource":"ai_estimate"}],"grocery":{"id":"meal-grocery-a","weekOf":"2026-10-05","items":[]},"expectedVersions":{"mealPlanVersion":2},"idempotencyKey":"ai-only-add"}'::jsonb))$$,'P0001',null,'AI-only estimate cannot be added to plan');
select throws_ok($$select public.add_planned_meal(pg_temp.calendar_intent('{"mealPlan":{"id":"meal-plan-a","weekOf":"2026-10-05","targetId":"meal-target-a"},"plannedMeal":{"id":"existing-ai-only","date":"2026-10-07","slot":"breakfast","foodId":"existing-ai-food","servings":1},"grocery":{"id":"meal-grocery-a","weekOf":"2026-10-05","items":[]},"expectedVersions":{"mealPlanVersion":2},"idempotencyKey":"existing-ai-add"}'::jsonb))$$,'P0001',null,'previously saved AI-only food is also rejected by planning');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009102';
select throws_ok($$select public.add_planned_meal(pg_temp.calendar_intent('{"mealPlan":{"id":"meal-plan-b","weekOf":"2026-10-05","targetId":"meal-target-a"},"plannedMeal":{"id":"foreign","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":1},"grocery":{"id":"meal-grocery-b","weekOf":"2026-10-05","items":[]},"expectedVersions":{"mealPlanVersion":0},"idempotencyKey":"foreign-add"}'::jsonb))$$,'P0001',null,'another account cannot use the first account target');

select * from finish();
rollback;
