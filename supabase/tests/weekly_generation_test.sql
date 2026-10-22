begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000001901','generation-a@example.test'),('00000000-0000-0000-0000-000000001902','generation-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000001901','Generation Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
update public.profiles set dietary_pattern='Vegan Keto-style',allergies=array['soy'],cooking_time_minutes=0,meal_budget=4 where id='00000000-0000-0000-0000-000000001901';
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('generation-goal','00000000-0000-0000-0000-000000001901','maintain',3,'2026-09-01');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('generation-target','00000000-0000-0000-0000-000000001901',(select row_id from public.goals where app_id='generation-goal'),1,'2026-09-01',2000,120,40,65,1400,23.9,2000,1.5,'test','Estimates only');
create function pg_temp.generation(key text, additions jsonb, week_date date default '2026-10-12') returns jsonb language sql as $$
with plan as (select * from public.meal_plans where user_id=auth.uid() and week_of=week_date order by version desc limit 1),
prior as (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',p.app_id,'date',p.meal_date,'slot',p.meal_slot,'label',p.label,'servings',p.servings,'skipped',p.skipped,'mealId',m.app_id,'foodId',f.app_id))),'[]') meals
  from public.planned_meals p left join public.meals m on m.row_id=p.meal_row_id left join public.foods f on f.row_id=p.food_row_id where meal_plan_row_id=(select row_id from plan))
select jsonb_build_object('reviewPolicyVersion','advisory_v1','reviewAcknowledged',true,'weekOf',week_date,'idempotencyKey',key,'recipes',jsonb_build_array(jsonb_build_object('id','meal-korean-beef-bowl','revision',(select revision from public.meals where app_id='meal-korean-beef-bowl'))),'assignments',additions,
 'mealPlan',jsonb_build_object('id',coalesce((select app_id from plan),'generated-'||week_date),'weekOf',week_date,'targetId','generation-target','meals',(select meals from prior)||additions),
 'grocery',jsonb_build_object('id','generated-grocery-'||week_date,'weekOf',week_date,'items','[]'::jsonb),
 'expectedVersions',jsonb_build_object('profileRevision',(select revision from public.profiles where id=auth.uid()),'mealPlanVersion',coalesce((select version from plan),0),'groceryRevision',coalesce((select revision from public.grocery_lists where user_id=auth.uid() and week_of=week_date),0)));
$$;
create function pg_temp.assignment(id text,date_key text,slot text default 'lunch') returns jsonb language sql as $$
select jsonb_build_array(jsonb_build_object('id',id,'date',date_key,'slot',slot,'mealId','meal-korean-beef-bowl','label','Korean Beef Bowl','servings',1));
$$;
select is((select meal_slots from public.meals where app_id='meal-korean-beef-bowl'),array['lunch','dinner'],'known catalog defaults');
select ok(not exists(select 1 from public.meals where servings<>trunc(servings)),'recipe yields normalized');
select ok(not has_function_privilege('authenticated','private.generate_nutrition_week(jsonb)','execute'),'private generator inaccessible');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001901';
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(pg_temp.generation('wrong-slot',pg_temp.assignment('wrong','2026-10-12','breakfast'))))$$,'P0001',null,'recipe meal eligibility enforced');
create temp table generation_retry as select pg_temp.generation('batch-one',pg_temp.assignment('a','2026-10-12')||pg_temp.assignment('b','2026-10-13')||pg_temp.assignment('c','2026-10-14')) payload;
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent((select payload-'reviewAcknowledged' from generation_retry)))$$,'P0001',null,'legacy individual client must refresh review');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent((select jsonb_set(payload,'{reviewPolicyVersion}','"old-policy"') from generation_retry)))$$,'P0001',null,'legacy policy version cannot be acknowledged');
select lives_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent((select payload from generation_retry)))$$,'empty week can receive an atomic generated batch');
select is((select preference_policy from public.meal_plans where user_id=auth.uid() order by version desc limit 1),'advisory_v1','individual generation accepts source macros above keto cap with diet and allergy warnings');
select is(public.generate_nutrition_week(pg_temp.calendar_intent((select payload from generation_retry)))->>'replayed','true','lost-response retry replays');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-12')->'plannedMeals'),3,'retry creates exactly three assignments');
select is((public.get_nutrition_week('2026-10-12')->'plannedMeals'->0->>'expected_calories')::numeric,560::numeric,'server supplies authoritative recipe macros');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(jsonb_set((select payload from generation_retry),'{idempotencyKey}','"stale-batch"')))$$,'P0001',null,'stale week rejected');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(pg_temp.generation('occupied',pg_temp.assignment('occupied','2026-10-12'))))$$,'P0001',null,'occupied planned slot rejected');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(pg_temp.generation('over-yield',pg_temp.assignment('d','2026-10-15')||pg_temp.assignment('e','2026-10-16'))))$$,'P0001',null,'existing usage reduces capacity');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(pg_temp.generation('fraction',jsonb_set(pg_temp.assignment('d','2026-10-15'),'{0,servings}','0.5'))))$$,'P0001',null,'generated portions must be one whole serving');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(pg_temp.generation('duplicate',pg_temp.assignment('d','2026-10-15')||pg_temp.assignment('e','2026-10-15'))))$$,'P0001',null,'duplicate slot rejected');
select lives_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(pg_temp.generation('last-serving',pg_temp.assignment('d','2026-10-15'))))$$,'remaining fourth serving can be added');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-12')->'plannedMeals'),4,'yield is shared across all generation attempts');
select lives_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(pg_temp.generation('future-week',pg_temp.assignment('future','2026-10-19'),'2026-10-19')))$$,'another selected week has separate capacity');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-12')->'plannedMeals'),4,'other week unchanged');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(jsonb_set(pg_temp.generation('stale-recipe',pg_temp.assignment('future2','2026-10-20'),'2026-10-19'),'{recipes,0,revision}','0')))$$,'P0001',null,'changed recipe revision rejected');
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent(jsonb_set(pg_temp.generation('tamper',pg_temp.assignment('future2','2026-10-20'),'2026-10-19'),'{mealPlan,meals,0,servings}','2')))$$,'P0001',null,'generation cannot modify existing prescriptions');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{"idempotencyKey":"fractional-recipe","newFoods":[],"meal":{"id":"fractional-recipe","name":"Test","servings":2.5,"complexity":"easy","notes":"Prepare.","mealSlots":["lunch"],"ingredients":[{"foodId":"food-egg","servings":1}]}}'))$$,'P0001',null,'authoring rejects fractional yield');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{"idempotencyKey":"empty-slots","newFoods":[],"meal":{"id":"empty-slots","name":"Test","servings":2,"complexity":"easy","notes":"Prepare.","mealSlots":[],"ingredients":[{"foodId":"food-egg","servings":1}]}}'))$$,'P0001',null,'explicit empty assignments rejected');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{"idempotencyKey":"duplicate-slots","newFoods":[],"meal":{"id":"duplicate-slots","name":"Test","servings":2,"complexity":"easy","notes":"Prepare.","mealSlots":["lunch","lunch"],"ingredients":[{"foodId":"food-egg","servings":1}]}}'))$$,'P0001',null,'duplicate assignments rejected');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent('{"idempotencyKey":"assigned-recipe","newFoods":[],"meal":{"id":"assigned-recipe","name":"Test","servings":2,"complexity":"easy","notes":"Prepare.","mealSlots":["breakfast","snack"],"ingredients":[{"foodId":"food-egg","servings":1}]}}'))$$,'multiple meal assignments saved');
select is((select meal_slots from public.meals where app_id='assigned-recipe'),array['breakfast','snack'],'saved assignments round trip');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_build_object('idempotencyKey','legacy-edit','newFoods','[]'::jsonb,'expectedVersions',jsonb_build_object('recordRevision',(select revision from public.meals where app_id='assigned-recipe')),'meal',jsonb_build_object('id','assigned-recipe','name','Legacy edit','servings',2,'complexity','easy','notes','Prepare.','ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))))))$$,'older client edit remains compatible');
select is((select meal_slots from public.meals where app_id='assigned-recipe'),array['breakfast','snack'],'older edit preserves meal assignments');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_build_object('idempotencyKey','scoped-recipe-grocery','newFoods','[]'::jsonb,
 'grocery',jsonb_build_object('id','generated-grocery-2026-10-12','weekOf','2026-10-12','items','[]'::jsonb),
 'expectedVersions',jsonb_build_object('recordRevision',(select revision from public.meals where app_id='assigned-recipe'),'groceryRevision',(select revision from public.grocery_lists where user_id=auth.uid() and week_of='2026-10-12')),
 'meal',jsonb_build_object('id','assigned-recipe','name','Scoped grocery edit','servings',2,'complexity','easy','notes','Prepare.','mealSlots',jsonb_build_array('breakfast','snack'),'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))))))$$,'recipe revision check uses submitted grocery week after future generation');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_build_object('idempotencyKey','stale-scoped-recipe-grocery','newFoods','[]'::jsonb,
 'grocery',jsonb_build_object('id','generated-grocery-2026-10-12','weekOf','2026-10-12','items','[]'::jsonb),
 'expectedVersions',jsonb_build_object('recordRevision',(select revision from public.meals where app_id='assigned-recipe'),'groceryRevision',0),
 'meal',jsonb_build_object('id','assigned-recipe','name','Stale grocery edit','servings',2,'complexity','easy','notes','Prepare.','mealSlots',jsonb_build_array('breakfast','snack'),'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))))))$$,'P0001',null,'submitted grocery week retains stale-write protection');
select throws_ok($$update public.meals set meal_slots=array['dinner'] where app_id='assigned-recipe'$$,'42501',null,'direct meal preference write denied');
select lives_ok($$select public.edit_meal_plan(pg_temp.calendar_intent(jsonb_set(pg_temp.generation('advisory-ordinary-edit','[]'),'{mealPlan,preferencePolicy}','"enforced"')))$$,'ordinary edits preserve advisory policy despite payload marker');
select is((select preference_policy from public.meal_plans where user_id=auth.uid() and week_of='2026-10-12' order by version desc limit 1),'advisory_v1','ordinary edit inherits advisory parent policy');
set constraints all immediate;
select throws_ok($$select public.add_planned_meal(pg_temp.calendar_intent(jsonb_build_object('idempotencyKey','forged-new-policy','preferencePolicy','advisory_v1','mealPlan',jsonb_build_object('id','forged-plan','weekOf','2026-10-26','targetId','generation-target','preferencePolicy','advisory_v1'),'plannedMeal',jsonb_build_object('id','forged','date','2026-10-26','slot','lunch','mealId','meal-korean-beef-bowl','servings',1),'grocery',jsonb_build_object('id','forged-grocery','weekOf','2026-10-26','items','[]'::jsonb),'expectedVersions',jsonb_build_object('mealPlanVersion',0))))$$,'P0001',null,'ordinary client cannot forge advisory policy on enforced new plan');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001902';
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent((select payload from generation_retry)))$$,'P0001',null,'cross-owner generation denied');
reset role;
set local role anon;
select throws_ok($$select public.generate_nutrition_week(pg_temp.calendar_intent('{}'))$$,'42501',null,'anonymous generation denied');
reset role;
select * from finish();
rollback;
