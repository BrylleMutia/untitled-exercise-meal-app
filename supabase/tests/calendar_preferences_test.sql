begin;
select no_plan();
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000002701','calendar-a@example.test'),('00000000-0000-0000-0000-000000002702','calendar-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal,week_starts_on)
values('00000000-0000-0000-0000-000000002701','Calendar Test',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain',1);
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('calendar-goal','00000000-0000-0000-0000-000000002701','maintain',3,'2026-09-01');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('calendar-target','00000000-0000-0000-0000-000000002701',(select row_id from public.goals where app_id='calendar-goal'),1,'2026-09-01',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id)
values('calendar-original','00000000-0000-0000-0000-000000002701',1,'2026-10-12',(select row_id from public.daily_targets where app_id='calendar-target'));
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,food_row_id,label,servings,expected_calories,slot_key,sort_order)
select p.row_id,p.user_id,p.week_of,d.id,d.day,'lunch',(select row_id from public.foods where app_id='food-egg'),'Original prescription',1,123,'date:'||d.day||':lunch',1
from public.meal_plans p cross join (values('calendar-mon','2026-10-12'::date),('calendar-sun','2026-10-18'::date)) d(id,day) where p.app_id='calendar-original';
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,food_row_id,label,servings,expected_calories,slot_key,sort_order)
select row_id,user_id,week_of,'calendar-banana','2026-10-17','dinner',(select row_id from public.foods where app_id='food-banana'),'Banana',1,99,'date:2026-10-17:dinner',1 from public.meal_plans where app_id='calendar-original';
insert into public.grocery_lists(app_id,user_id,week_of) values('calendar-grocery','00000000-0000-0000-0000-000000002701','2026-10-12');
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,checked,custom_item)
select row_id,user_id,'calendar-extra','Extra','Other','pcs',0,3,true,true from public.grocery_lists where app_id='calendar-grocery';
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,checked,custom_item)
select row_id,user_id,'gi-food-banana','Custom bananas','Other','pcs',0,7,false,true from public.grocery_lists where app_id='calendar-grocery';
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,checked)
select row_id,user_id,'gi-food-egg','Egg','Protein','pcs',2,9,true from public.grocery_lists where app_id='calendar-grocery';
select is(private.calendar_week('2027-01-01',0),'2026-12-27'::date,'SQL Sunday year boundary');
select is(private.calendar_week('2026-10-17',6),'2026-10-17'::date,'SQL Saturday boundary');
select ok((select bool_and(extract(dow from private.calendar_week('2024-02-29',d))=d) from generate_series(0,6) d),'all seven SQL start days');
select ok(not has_function_privilege('authenticated','private.regroup_calendar(uuid,integer,integer)','execute'),'regrouper is internal only');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000002701';
create temp table calendar_intent as select jsonb_build_object('idempotencyKey','calendar-sunday','weekStartsOn',0,'calendarRevision',1,'expectedRevision',(select revision from public.profiles where id=auth.uid())) payload;
select lives_ok($$select public.set_week_start((select payload from calendar_intent))$$,'Sunday transition is atomic');
select is((select week_starts_on from public.profiles where id=auth.uid()),0,'preference saved');
select is(public.set_week_start((select payload from calendar_intent))->>'replayed','true','same retry returns success');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-11')->'plannedMeals'),2,'Monday and Saturday dates are grouped under Sunday');
select is(public.get_nutrition_week('2026-10-11')->'plannedMeals'->0->>'meal_date','2026-10-12','actual meal date is unchanged');
select is((public.get_nutrition_week('2026-10-11')->'plannedMeals'->0->>'expected_calories')::numeric,123::numeric,'stored prescription remains exact');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-18')->'plannedMeals'),1,'split Sunday meal is retained');
select is((select count(*) from public.meal_plans where user_id=auth.uid() and app_id='calendar-original'),1::bigint,'original snapshot retained');
select ok(not (select calendar_active from public.meal_plans where user_id=auth.uid() and app_id='calendar-original'),'original boundary is inactive');
select is((select quantity from public.grocery_items i join public.grocery_lists g on g.row_id=i.grocery_list_row_id where g.user_id=auth.uid() and g.calendar_active and g.week_of='2026-10-11' and i.app_id='gi-food-egg'),9::numeric,'quantity override carried once');
select is((select count(*) from public.grocery_items i join public.grocery_lists g on g.row_id=i.grocery_list_row_id where g.user_id=auth.uid() and g.calendar_active and i.app_id='calendar-extra'),1::bigint,'custom item has one active destination');
select is((select count(*) from public.calendar_transitions where user_id=auth.uid()),1::bigint,'source state and destination audit saved');
select is((select count(*) from public.grocery_items i join public.grocery_lists g on g.row_id=i.grocery_list_row_id where g.user_id=auth.uid() and g.calendar_active and i.name='Custom bananas'),1::bigint,'custom IDs that collide with generated ingredients remain a distinct carried item');
select throws_ok($$select public.get_nutrition_week('2026-10-12')$$,'P0001',null,'wrong account boundary rejected');
select throws_ok($$select public.set_week_start(jsonb_build_object('idempotencyKey','calendar-stale','calendarRevision',1,'weekStartsOn',6,'expectedRevision',1))$$,'P0001',null,'stale tab cannot change calendar');
select throws_ok($$select public.set_week_start(jsonb_build_object('idempotencyKey','calendar-fraction','calendarRevision',2,'weekStartsOn',1.5,'expectedRevision',1))$$,'P0001',null,'fractional day rejected');
select throws_ok($$update public.profiles set week_starts_on=6 where id=auth.uid()$$,'42501',null,'direct preference writes denied');
select lives_ok($$select public.set_week_start(jsonb_build_object('idempotencyKey','calendar-monday','calendarRevision',2,'weekStartsOn',1,'expectedRevision',(select revision from public.profiles where id=auth.uid())))$$,'switch back to Monday');
select is(jsonb_array_length(public.get_nutrition_week('2026-10-12')->'plannedMeals'),3,'switch back combines all original dates');
select is((select count(*) from public.grocery_items i join public.grocery_lists g on g.row_id=i.grocery_list_row_id where g.user_id=auth.uid() and g.calendar_active and i.app_id='calendar-extra'),1::bigint,'repeated regroup never duplicates custom entries');
select throws_ok($$select public.generate_nutrition_week('{"idempotencyKey":"calendar-empty-days","calendarRevision":3,"weekOf":"2026-10-19","selectedDates":[],"assignments":[]}')$$,'P0001',null,'generation requires selected dates');
select throws_ok($$select public.generate_nutrition_week('{"idempotencyKey":"calendar-duplicate-days","calendarRevision":3,"weekOf":"2026-10-19","selectedDates":["2026-10-19","2026-10-19"],"assignments":[]}')$$,'P0001',null,'duplicate generation dates rejected');
select throws_ok($$select public.generate_nutrition_week('{"idempotencyKey":"calendar-outside-days","calendarRevision":3,"weekOf":"2026-10-19","selectedDates":["2026-10-26"],"assignments":[]}')$$,'P0001',null,'selected dates must belong to this week');
select throws_ok($$select public.generate_nutrition_week('{"idempotencyKey":"calendar-outside-assignment","calendarRevision":3,"weekOf":"2026-10-19","selectedDates":["2026-10-19"],"assignments":[{"date":"2026-10-20"}]}')$$,'P0001',null,'assignment outside chosen dates rejected by server');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000002702';
select is((select count(*) from public.calendar_transitions),0::bigint,'another user cannot read transition state');
select throws_ok($$select public.set_week_start('{"idempotencyKey":"other-user","calendarRevision":1,"weekStartsOn":6,"expectedRevision":1}')$$,'P0001',null,'another user cannot update the owner preference');
set local role anon;
select throws_ok($$select public.set_week_start('{"idempotencyKey":"anon","weekStartsOn":6,"expectedRevision":1}')$$,'42501',null,'anonymous mutation denied');
select * from finish();
rollback;
