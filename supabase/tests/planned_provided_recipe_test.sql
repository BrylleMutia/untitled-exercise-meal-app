begin;
select plan(16);
insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000009301','provided-plan-a@example.test'),
  ('00000000-0000-0000-0000-000000009302','provided-plan-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000009301','Planned Log Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('provided-plan-goal','00000000-0000-0000-0000-000000009301','maintain',3,'2026-10-05');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('provided-plan-target','00000000-0000-0000-0000-000000009301',(select row_id from public.goals where app_id='provided-plan-goal'),1,'2026-10-05',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id)
values('provided-plan-plan','00000000-0000-0000-0000-000000009301',1,'2026-10-05',(select row_id from public.daily_targets where app_id='provided-plan-target'));
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,label,servings,sort_order,slot_key)
values((select row_id from public.meal_plans where app_id='provided-plan-plan'),'00000000-0000-0000-0000-000000009301','2026-10-05','provided-plan-beef','2026-10-07','lunch',(select row_id from public.meals where app_id='meal-korean-beef-bowl'),'Korean Beef Bowl',0.5,1,'date:2026-10-07:slot:lunch:order:1');
create function pg_temp.planned_provided(key text, portion numeric) returns jsonb language sql as $$
select jsonb_build_object('kind','meal','plannedMealId','provided-plan-beef','expectedMealPlanVersion',1,
  'date','2026-10-07','slot','lunch','name','Korean Beef Bowl','sourceMode','saved_meal','loggedMealId',key,
  'meal',jsonb_build_object('id','meal-korean-beef-bowl','name','Korean Beef Bowl','servings',4),
  'ingredients',jsonb_build_array(jsonb_build_object('customName','Client label','servings',portion,'calories',9999,'proteinG',9999,'carbsG',9999,'fatG',9999,'valueSource','user_provided')),
  'idempotencyKey',key);
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009301';
select is((public.log_planned_meal(pg_temp.planned_provided('provided-plan-first',1.5))->>'status'),'completed','planned supplied-macro recipe logs on its first attempt');
select is((select calories from public.nutrition_logs where user_id=auth.uid()),840::numeric,'stored calories scale by actual portion rather than planned portion');
select is((select protein_g from public.nutrition_logs where user_id=auth.uid()),67.5::numeric,'stored supplied protein scales exactly');
select is((select carbs_g from public.nutrition_logs where user_id=auth.uid()),87::numeric,'stored supplied carbs scale exactly');
select is((select fat_g from public.nutrition_logs where user_id=auth.uid()),24::numeric,'stored supplied fat scales exactly');
select is((select planned_meal_app_id from public.logged_meals where user_id=auth.uid()),'provided-plan-beef','grouped log links to its planned entry');
select is((select servings from public.planned_meals where user_id=auth.uid()),0.5::numeric,'logging preserves the planned portion');
select is((public.log_planned_meal(pg_temp.planned_provided('provided-plan-first',1.5))->>'replayed'),'true','planned supplied-macro retry replays original intent');
select is((select count(*)::integer from public.logged_meals where user_id=auth.uid()),1,'retry counts one eaten meal');
select throws_ok($$select public.log_planned_meal(pg_temp.planned_provided('provided-plan-first',2))$$,'P0001',null,'reusing a key for a changed portion fails');
reset role;
update public.meal_plans set version=2 where app_id='provided-plan-plan';
set local role authenticated;
select is((public.log_planned_meal(pg_temp.planned_provided('provided-plan-first',1.5))->>'replayed'),'true','completed retry survives a later plan revision');
select throws_ok($$select public.log_planned_meal(pg_temp.planned_provided('provided-plan-stale',1.5))$$,'P0001',null,'new stale intent still fails');
reset role;
delete from public.mutation_idempotency where user_id='00000000-0000-0000-0000-000000009301' and operation='log_planned_meal';
set local role authenticated;
select is((public.log_planned_meal(pg_temp.planned_provided('provided-plan-first',1.5))->>'replayed'),'true','pre-migration completed claim remains retryable');
select is((select count(*)::integer from public.nutrition_logs where user_id=auth.uid()),1,'legacy retry cannot duplicate intake');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009302';
select throws_ok($$select public.log_planned_meal(jsonb_set(pg_temp.planned_provided('provided-plan-foreign',1),'{expectedMealPlanVersion}','2'))$$,'P0001',null,'cross-account planned intent is denied');
set local role anon;
select throws_ok($$select public.log_planned_meal(pg_temp.planned_provided('provided-plan-anon',1))$$,'42501',null,'anonymous planned logging remains denied');
reset role;
select * from finish();
rollback;
