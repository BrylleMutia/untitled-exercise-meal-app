begin;
select plan(19);

select has_function('public','log_planned_meal',array['jsonb'],'planned logs have an authenticated RPC');
select ok(has_function_privilege('authenticated','public.log_planned_meal(jsonb)','EXECUTE'),'authenticated users may log a planned meal');
select ok(not has_function_privilege('anon','public.log_planned_meal(jsonb)','EXECUTE'),'anonymous users cannot log a planned meal');
select ok(not has_function_privilege('authenticated','private.log_planned_meal(jsonb)','EXECUTE'),'private implementation is not directly callable');

insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000009201','planned-log-a@example.test'),
  ('00000000-0000-0000-0000-000000009202','planned-log-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000009201','Planned Log Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('planned-log-goal','00000000-0000-0000-0000-000000009201','maintain',3,'2026-10-05');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('planned-log-target','00000000-0000-0000-0000-000000009201',(select row_id from public.goals where app_id='planned-log-goal'),1,'2026-10-05',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id)
values('planned-log-plan','00000000-0000-0000-0000-000000009201',1,'2026-10-05',(select row_id from public.daily_targets where app_id='planned-log-target'));
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,food_row_id,label,servings,sort_order,slot_key)
values
  ((select row_id from public.meal_plans where app_id='planned-log-plan'), '00000000-0000-0000-0000-000000009201','2026-10-05','planned-egg-one','2026-10-07','breakfast',(select row_id from public.foods where app_id='food-egg'),'Egg',1,1,'date:2026-10-07:slot:breakfast:order:1'),
  ((select row_id from public.meal_plans where app_id='planned-log-plan'), '00000000-0000-0000-0000-000000009201','2026-10-05','planned-egg-two','2026-10-07','breakfast',(select row_id from public.foods where app_id='food-egg'),'Egg',1,2,'date:2026-10-07:slot:breakfast:order:2');
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,label,servings,sort_order,slot_key)
values((select row_id from public.meal_plans where app_id='planned-log-plan'), '00000000-0000-0000-0000-000000009201','2026-10-05','planned-yogurt','2026-10-07','lunch',(select row_id from public.meals where app_id='meal-yogurt-bowl'),'Greek Yogurt Berry Bowl',1,1,'date:2026-10-07:slot:lunch:order:1');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009201';

select is((public.log_planned_meal($json${
  "kind":"food","plannedMealId":"planned-egg-two","expectedMealPlanVersion":1,
  "entry":{"id":"eaten-egg-one","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":2,"calories":144,"proteinG":12.6,"carbsG":0.8,"fatG":9.6,"source":"Starter Food Catalog"},
  "idempotencyKey":"planned-egg-log-one"
}$json$::jsonb)->>'status'),'completed','food log succeeds from the selected planned row');
select is((select planned_meal_app_id from public.nutrition_logs where app_id='eaten-egg-one'),'planned-egg-two','food history stores the exact planned item ID');
select is((select count(*)::int from public.planned_meals where user_id=auth.uid()),3,'logging leaves all versioned planned rows intact');
select is((public.log_planned_meal($json${
  "kind":"food","plannedMealId":"planned-egg-two","expectedMealPlanVersion":1,
  "entry":{"id":"eaten-egg-one","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":2,"calories":144,"proteinG":12.6,"carbsG":0.8,"fatG":9.6,"source":"Starter Food Catalog"},
  "idempotencyKey":"planned-egg-log-one"
}$json$::jsonb)->>'replayed'),'true','retry replays the same planned log');
select is((select count(*)::int from public.nutrition_logs where planned_meal_app_id='planned-egg-two'),1,'retry does not duplicate intake');

select is((public.log_planned_meal($json${
  "kind":"food","plannedMealId":"planned-egg-two","expectedMealPlanVersion":1,
  "entry":{"id":"eaten-egg-two","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":1,"calories":72,"proteinG":6.3,"carbsG":0.4,"fatG":4.8,"source":"Starter Food Catalog"},
  "idempotencyKey":"planned-egg-log-two"
}$json$::jsonb)->>'status'),'completed','a separately confirmed second portion is allowed');
select is((select count(*)::int from public.nutrition_logs where planned_meal_app_id='planned-egg-two'),2,'both portions remain linked to the same plan item');
select throws_ok($$select public.log_planned_meal('{"kind":"food","plannedMealId":"planned-egg-one","expectedMealPlanVersion":2,"entry":{"id":"stale-egg","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":1,"calories":72,"proteinG":6.3,"carbsG":0.4,"fatG":4.8,"source":"Catalog"},"idempotencyKey":"stale-egg-key"}'::jsonb)$$,'P0001',null,'stale plan version is rejected');
select throws_ok($$select public.log_planned_meal('{"kind":"food","plannedMealId":"planned-egg-one","expectedMealPlanVersion":1,"entry":{"id":"wrong-slot","date":"2026-10-07","slot":"dinner","foodId":"food-egg","servings":1,"calories":72,"proteinG":6.3,"carbsG":0.4,"fatG":4.8,"source":"Catalog"},"idempotencyKey":"wrong-slot-key"}'::jsonb)$$,'P0001',null,'wrong slot cannot consume the planned row');
select throws_ok($$select public.log_planned_meal('{"kind":"food","plannedMealId":"planned-egg-one","expectedMealPlanVersion":1,"entry":{"id":"wrong-food","date":"2026-10-07","slot":"breakfast","foodId":"food-oats","servings":1,"calories":72,"proteinG":6.3,"carbsG":0.4,"fatG":4.8,"source":"Catalog"},"idempotencyKey":"wrong-food-key"}'::jsonb)$$,'P0001',null,'wrong food cannot consume the planned row');

select is((public.log_planned_meal($json${
  "kind":"meal","plannedMealId":"planned-yogurt","expectedMealPlanVersion":1,
  "date":"2026-10-07","slot":"lunch","name":"Greek Yogurt Berry Bowl","sourceMode":"saved_meal",
  "loggedMealId":"eaten-yogurt-one","meal":{"id":"meal-yogurt-bowl","name":"Greek Yogurt Berry Bowl","servings":1},
  "ingredients":[{"id":"eaten-yogurt-ingredient","foodId":"food-greek-yogurt","servings":1}],
  "idempotencyKey":"planned-yogurt-log-one"
}$json$::jsonb)->>'status'),'completed','grouped saved meal logs from its planned row');
select is((select planned_meal_app_id from public.logged_meals where app_id='eaten-yogurt-one'),'planned-yogurt','grouped Eaten row stores the plan link');
select is((select count(*)::int from public.nutrition_logs where logged_meal_row_id=(select row_id from public.logged_meals where app_id='eaten-yogurt-one')),1,'grouped nutrition history remains separate');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009202';
select throws_ok($$select public.log_planned_meal('{"kind":"food","plannedMealId":"planned-egg-one","expectedMealPlanVersion":1,"entry":{"id":"foreign-egg","date":"2026-10-07","slot":"breakfast","foodId":"food-egg","servings":1,"calories":72,"proteinG":6.3,"carbsG":0.4,"fatG":4.8,"source":"Catalog"},"idempotencyKey":"foreign-egg-key"}'::jsonb)$$,'P0001',null,'another account cannot consume a planned row');
select is((select count(*)::int from public.nutrition_logs where app_id='foreign-egg'),0,'failed foreign attempt leaves no log');

select * from finish();
rollback;
