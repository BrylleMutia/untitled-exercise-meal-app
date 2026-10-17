begin;
\ir fixtures/calendar_intent.inc
select plan(27);
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000009701','week-a@example.test'),('00000000-0000-0000-0000-000000009702','week-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000009701','Week Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('week-goal','00000000-0000-0000-0000-000000009701','maintain',3,'2026-09-01');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('week-target','00000000-0000-0000-0000-000000009701',(select row_id from public.goals where app_id='week-goal'),1,'2026-09-01',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id)
select 'week-' || d::text,'00000000-0000-0000-0000-000000009701',1,d,(select row_id from public.daily_targets where app_id='week-target')
from (values ('2026-10-05'::date),('2026-10-12'::date)) dates(d);
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,label,servings,expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,source)
select row_id,user_id,week_of,'beef-' || week_of::text,week_of,'lunch',(select row_id from public.meals where app_id='meal-korean-beef-bowl'),'Korean Beef Bowl',0.5,280,22.5,29,8,'source-provided'
from public.meal_plans where user_id='00000000-0000-0000-0000-000000009701';
insert into public.grocery_lists(app_id,user_id,week_of)
select 'grocery-' || week_of::text,user_id,week_of from public.meal_plans where user_id='00000000-0000-0000-0000-000000009701';
insert into public.nutrition_logs(app_id,user_id,log_date,meal_slot,custom_name,servings,serving_quantity,calories,protein_g,carbs_g,fat_g,estimated,confidence,source,value_source)
select 'week-log-' || n,'00000000-0000-0000-0000-000000009701','2026-10-05','breakfast','User food',1,1,1,0,0,0,false,'high','User','user_provided' from generate_series(1,110) n;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009701';
select ok(has_function_privilege('authenticated','public.get_nutrition_week(date)','EXECUTE'),'authenticated weekly read');
select ok(not has_function_privilege('anon','public.get_nutrition_week(date)','EXECUTE'),'anonymous weekly read denied');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-05')->'nutritionLogs'),110,'weekly logs are not truncated to the snapshot limit');
select is((public.get_nutrition_week('2026-10-05')->'plannedMeals'->0->>'expected_protein_g')::numeric,22.5::numeric,'stored fractional macros retained');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-19')->'plannedMeals'),0,'empty future week is explicit');
select throws_ok($$select public.get_nutrition_week('2026-10-06')$$,'P0001',null,'non-Monday read rejected');
create function pg_temp.week_edit(p_key text, p_version integer, p_skip boolean, p_servings numeric default 0.5) returns jsonb language sql as $$
 select jsonb_build_object('idempotencyKey',p_key,'mealPlan',jsonb_build_object('id','week-2026-10-05','weekOf','2026-10-05','meals',jsonb_build_array(jsonb_build_object('id','beef-2026-10-05','date','2026-10-05','slot','lunch','mealId','meal-korean-beef-bowl','label','Korean Beef Bowl','servings',p_servings,'skipped',p_skip,'expectedCalories',999))),
 'grocery',jsonb_build_object('id','grocery-2026-10-05','weekOf','2026-10-05','items','[]'::jsonb),
 'expectedVersions',jsonb_build_object('mealPlanVersion',p_version,'groceryRevision',(select revision from public.grocery_lists where user_id=auth.uid() and week_of='2026-10-05')));
$$;
create temp table week_retry as select pg_temp.week_edit('week-skip',1,true) payload;
select lives_ok($$select public.edit_meal_plan(pg_temp.calendar_intent((select payload from week_retry)))$$,'older week remains editable after a newer week exists');
select is(public.edit_meal_plan(pg_temp.calendar_intent((select payload from week_retry)))->>'replayed','true','unchanged retry returns authoritative result');
select is((public.get_nutrition_week('2026-10-05')->'mealPlan'->>'version')::int,2,'edit appends selected week version');
select is((public.get_nutrition_week('2026-10-05')->'plannedMeals'->0->>'expected_calories')::numeric,280::numeric,'skip ignores client macro tampering and preserves prescription');
select is((public.get_nutrition_week('2026-10-12')->'mealPlan'->>'version')::int,1,'other week version unchanged');
select is((select count(*)::int from public.nutrition_logs where user_id=auth.uid()),110,'eaten history unchanged');
select throws_ok($$select public.edit_meal_plan(pg_temp.calendar_intent(pg_temp.week_edit('week-stale',1,false)))$$,'P0001',null,'stale selected week version denied');
select lives_ok($$select public.edit_meal_plan(pg_temp.calendar_intent(pg_temp.week_edit('week-portion',2,false,1)))$$,'explicit portion edit is allowed');
select is((public.get_nutrition_week('2026-10-05')->'plannedMeals'->0->>'expected_calories')::numeric,560::numeric,'changed portion uses supplied macros');
select is((select expected_calories from public.planned_meals where meal_plan_row_id=(select row_id from public.meal_plans where user_id=auth.uid() and week_of='2026-10-05' and version=1)),280::numeric,'original prescription version unchanged');
create temp table skip_retry as select pg_temp.week_edit('week-public-skip',3,true,1) payload;
select lives_ok($$select public.skip_planned_meal(pg_temp.calendar_intent((select payload from skip_retry)))$$,'legacy public skip uses selected week');
select is(public.skip_planned_meal(pg_temp.calendar_intent((select payload from skip_retry)))->>'replayed','true','public skip retries preserve their operation receipt');
select is((public.get_nutrition_week('2026-10-05')->'mealPlan'->>'version')::int,4,'retry does not append another plan version');
select ok(position('pg_advisory_xact_lock' in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='log_planned_meal')) > 0,'linked logging shares the week edit lock');
reset role;
update public.meals set archived_at=now(), provided_nutrition=jsonb_set(provided_nutrition,'{calories}','999') where app_id='meal-korean-beef-bowl';
set local role authenticated;
select ok((public.get_nutrition_week('2026-10-05')->'recipes'->0->>'archived_at') is not null,'weekly reads include archived prescription references');
select lives_ok($$select public.edit_meal_plan(pg_temp.calendar_intent(pg_temp.week_edit('week-archived-restore',4,false,1)))$$,'unchanged archived prescription can be restored');
select is((public.get_nutrition_week('2026-10-05')->'plannedMeals'->0->>'expected_calories')::numeric,560::numeric,'current recipe changes do not recalculate saved unchanged nutrition');
select ok(not has_table_privilege('authenticated','public.planned_meals','INSERT'),'direct writes remain denied');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009702';
select is(jsonb_array_length(public.get_nutrition_week('2026-10-04')->'nutritionLogs'),0,'cross-user weekly history not visible');
select throws_ok($$select public.edit_meal_plan(pg_temp.calendar_intent(pg_temp.week_edit('week-foreign',3,false)))$$,'P0001',null,'cross-user plan edit denied');
set local "request.jwt.claim.sub" = '';
select throws_ok($$select public.get_nutrition_week('2026-10-05')$$,'P0001',null,'identity required even for authenticated role');
select * from finish();
rollback;
