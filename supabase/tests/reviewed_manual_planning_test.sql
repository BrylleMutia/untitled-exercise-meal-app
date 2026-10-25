begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000009401','manual-review-a@example.test'),('00000000-0000-0000-0000-000000009402','manual-review-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal,dietary_pattern,allergies,cooking_time_minutes)
values('00000000-0000-0000-0000-000000009401','Manual review',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain','Vegan low-carb',array['soy'],0);
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('manual-goal','00000000-0000-0000-0000-000000009401','maintain',3,'2026-10-05');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('manual-target','00000000-0000-0000-0000-000000009401',(select row_id from public.goals where app_id='manual-goal'),1,'2026-10-05',2000,120,130,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.foods(app_id,owner_user_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,category,source,source_version,estimated,confidence,value_source,estimate_range)
values('manual-ai','00000000-0000-0000-0000-000000009401',false,'Estimated chicken','one serving',100,'g',200,10,20,8,'Other','AI estimate','model-v1',true,'low','ai_estimate','{"calories":{"low":180,"base":200,"high":220},"proteinG":{"low":8,"base":10,"high":12},"carbsG":{"low":18,"base":20,"high":22},"fatG":{"low":6,"base":8,"high":10}}');
insert into public.meals(app_id,owner_user_id,is_system,name,servings,notes) values('manual-empty','00000000-0000-0000-0000-000000009401',false,'Missing nutrition',1,'Draft');
create function pg_temp.manual_add(key text, food text default null, recipe text default null, amount numeric default 1, week_key date default '2026-10-05') returns jsonb language sql as $$
select pg_temp.calendar_intent(jsonb_build_object(
 'idempotencyKey',key,'reviewAcknowledged',true,'reviewPolicyVersion','advisory_v1',
 'mealPlan',jsonb_build_object('id','manual-plan-'||week_key,'weekOf',week_key,'targetId','manual-target'),
 'plannedMeal',jsonb_strip_nulls(jsonb_build_object('id',key,'date',week_key+2,'slot','lunch','foodId',food,'mealId',recipe,'servings',amount)),
 'grocery',jsonb_build_object('id','manual-grocery-'||week_key,'weekOf',week_key,'items','[]'::jsonb),
 'expectedVersions',jsonb_strip_nulls(jsonb_build_object('profileRevision',(select revision from public.profiles where id=auth.uid()),'recordRevision',(select revision from public.meals where app_id=recipe),'mealPlanVersion',coalesce((select max(version) from public.meal_plans where user_id=auth.uid() and week_of=week_key),0),'groceryRevision',(select revision from public.grocery_lists where user_id=auth.uid() and week_of=week_key)))
)); $$;
create temp table manual_intents(payload jsonb); grant all on manual_intents to authenticated;
set constraints all immediate;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009401';
select throws_ok($$select public.add_planned_meal(pg_temp.manual_add('legacy',null,'meal-korean-beef-bowl')-'reviewAcknowledged'-'reviewPolicyVersion')$$,'P0001',null,'legacy supplied recipe still blocked by enforced preferences');
select throws_ok($$select public.add_planned_meal(jsonb_set(pg_temp.manual_add('no-ack','food-egg'),'{reviewAcknowledged}','false'))$$,'P0001',null,'false acknowledgment is rejected');
select throws_ok($$select public.add_planned_meal(jsonb_set(pg_temp.manual_add('bad-policy','food-egg'),'{reviewPolicyVersion}','"forged"'))$$,'P0001',null,'unknown review policy rejected');
select throws_ok($$select public.add_planned_meal(pg_temp.manual_add('no-profile','food-egg') #- '{expectedVersions,profileRevision}')$$,'P0001',null,'review must include profile revision');
select throws_ok($$select public.add_planned_meal(jsonb_set(pg_temp.manual_add('stale-profile','food-egg'),'{expectedVersions,profileRevision}','999'))$$,'P0001',null,'stale profile rejected');
select throws_ok($$select public.add_planned_meal(jsonb_set(pg_temp.manual_add('stale-recipe',null,'meal-korean-beef-bowl'),'{expectedVersions,recordRevision}','999'))$$,'P0001',null,'stale recipe rejected');
select throws_ok($$select public.add_planned_meal(pg_temp.manual_add('bad-portion','food-egg',null,0))$$,'P0001',null,'invalid portion still blocked');
select throws_ok($$select public.add_planned_meal(pg_temp.manual_add('missing-nutrition',null,'manual-empty'))$$,'P0001',null,'missing nutrition does not become zero');
select throws_ok($$select public.add_planned_meal(pg_temp.manual_add('missing-food','does-not-exist'))$$,'P0001',null,'unavailable food still blocked');
insert into manual_intents values(pg_temp.manual_add('reviewed-recipe',null,'meal-korean-beef-bowl',2.5));
select lives_ok($$select public.add_planned_meal((select payload from manual_intents))$$,'reviewed recipe with time diet allergy source and carb conflicts saves');
select is((select preference_policy from public.meal_plans where user_id=auth.uid() order by version desc limit 1),'advisory_v1','empty week is server-owned advisory');
select is((select expected_carbs_g from public.planned_meals where user_id=auth.uid() and app_id='reviewed-recipe'),145::numeric,'fractional supplied recipe is not reduced to meet carbohydrate preference');
select is((select count(*) from public.nutrition_logs where user_id=auth.uid()),0::bigint,'planning never records intake');
select is(public.add_planned_meal((select payload from manual_intents))->>'replayed','true','exact retry replays');
select is((select count(*) from public.meal_plans where user_id=auth.uid()),1::bigint,'retry creates no new version');
select lives_ok($$select public.add_planned_meal(pg_temp.manual_add('reviewed-ai','manual-ai'))$$,'usable estimated food saves after review');
select throws_ok($$select public.add_planned_meal(pg_temp.manual_add('legacy-ai','manual-ai')-'reviewAcknowledged'-'reviewPolicyVersion')$$,'P0001',null,'legacy AI request stays restricted even in advisory week');
select is((select dietary_pattern from public.profiles where id=auth.uid()),'Vegan low-carb','profile preferences are never cleared');
reset role;
insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id)
values('manual-plan-2026-10-12','00000000-0000-0000-0000-000000009401',1,'2026-10-12',(select row_id from public.daily_targets where app_id='manual-target'));
set local role authenticated;
select lives_ok($$select public.add_planned_meal(pg_temp.manual_add('upgrade',null,'meal-korean-beef-bowl',3,'2026-10-12'))$$,'reviewed addition upgrades enforced week through a new version');
select is((select preference_policy from public.meal_plans where week_of='2026-10-12' and version=1),'enforced','old enforced version preserved');
select is((select preference_policy from public.meal_plans where week_of='2026-10-12' and version=2),'advisory_v1','new version advisory');
select is(current_setting('app.generation_preference_policy',true),'','temporary policy authority restored after addition');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009402';
select throws_ok($$select public.add_planned_meal(pg_temp.manual_add('foreign',null,'meal-korean-beef-bowl'))$$,'P0001',null,'another account cannot use owner target');
select is((select count(*) from public.planned_meals),0::bigint,'RLS hides owner plans');
set local role anon;
select throws_ok($$select public.add_planned_meal('{}'::jsonb)$$,'42501',null,'anonymous addition denied');
reset role;
select ok(not has_function_privilege('authenticated','private.add_planned_meal(jsonb)','execute'),'private helper remains inaccessible');
select ok(not has_function_privilege('authenticated','private.reject_ai_only_planned_foods()','execute'),'private trigger remains inaccessible');
select * from finish(); rollback;
