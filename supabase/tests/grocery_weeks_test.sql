begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000002101','grocery-weeks-a@example.test'),('00000000-0000-0000-0000-000000002102','grocery-weeks-b@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000002101','Grocery Weeks',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.goals(app_id,user_id,goal_type,weekly_workout_target,effective_date)
values('grocery-weeks-goal','00000000-0000-0000-0000-000000002101','maintain',3,'2026-09-01');
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
values('grocery-weeks-target','00000000-0000-0000-0000-000000002101',(select row_id from public.goals where app_id='grocery-weeks-goal'),1,'2026-09-01',2000,120,220,65,1400,23.9,2000,1.5,'test','Estimates only');
insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id)
values('grocery-weeks-plan','00000000-0000-0000-0000-000000002101',1,'2026-10-19',(select row_id from public.daily_targets where app_id='grocery-weeks-target'));
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,label,servings,skipped)
values((select row_id from public.meal_plans where app_id='grocery-weeks-plan'),'00000000-0000-0000-0000-000000002101','2026-10-19','grocery-weeks-recipe','2026-10-19','lunch',(select row_id from public.meals where app_id='meal-sticky-teriyaki-chicken'),'Sticky Teriyaki Chicken',4,false);
insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,food_row_id,label,servings,skipped)
select (select row_id from public.meal_plans where app_id='grocery-weeks-plan'),'00000000-0000-0000-0000-000000002101','2026-10-19',id,'2026-10-19','breakfast',(select row_id from public.foods where app_id='food-egg'),'Egg',amount,skip
from (values('grocery-weeks-food',0.5,false),('grocery-weeks-skipped',999,true)) x(id,amount,skip);
insert into public.grocery_lists(app_id,user_id,week_of)
select 'grocery-weeks-'||d,'00000000-0000-0000-0000-000000002101',d::date from unnest(array['2026-10-05','2026-10-12','2026-10-19']) d;
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity)
select row_id,user_id,'gi-food-egg','Egg','Protein','pcs',1,1 from public.grocery_lists where app_id like 'grocery-weeks-%';
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,checked,removed)
select g.row_id,g.user_id,x.id,x.name,'Pantry','g',100,150,x.checked,x.removed from public.grocery_lists g
cross join (values('gi-food-chicken-prep-171077','Chicken',true,false),('gi-food-korean-beef-168877','Rice',false,true),('gi-food-bread','Obsolete',false,false)) x(id,name,checked,removed)
where g.app_id='grocery-weeks-2026-10-19';
create function pg_temp.grocery_payload(week_date text,key text,extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
select jsonb_build_object('weekOf',week_date,'grocery',jsonb_build_object('id','grocery-weeks-'||week_date,'weekOf',week_date),'expectedVersions',jsonb_strip_nulls(jsonb_build_object('groceryRevision',coalesce((select revision from public.grocery_lists where user_id=auth.uid() and week_of=week_date::date),0),'mealPlanVersion',(select version from public.meal_plans where user_id=auth.uid() and week_of=week_date::date order by version desc,row_id desc limit 1))),'idempotencyKey',key)||extra;
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000002101';
create temp table grocery_retry as select pg_temp.grocery_payload('2026-10-12','grocery-toggle','{"itemId":"gi-food-egg"}') payload;
select lives_ok($$select public.toggle_grocery_item(pg_temp.calendar_intent((select payload from grocery_retry)))$$,'toggle targets the selected current week');
select is((select count(*)::integer from public.grocery_items where app_id='gi-food-egg' and checked),1,'same ingredient ID in other weeks is not toggled');
select is(public.toggle_grocery_item(pg_temp.calendar_intent((select payload from grocery_retry)))->>'replayed','true','lost-response toggle retries replay');
select throws_ok($$select public.toggle_grocery_item(pg_temp.calendar_intent(jsonb_set((select payload from grocery_retry),'{idempotencyKey}','"grocery-stale"')))$$,'P0001',null,'stale selected-list revision rejected');
select lives_ok($$select public.set_grocery_quantity(pg_temp.calendar_intent(pg_temp.grocery_payload('2026-10-19','grocery-quantity','{"itemId":"gi-food-egg","quantity":7}')))$$,'future week quantity can be changed');
select is((select count(*)::integer from public.grocery_items where app_id='gi-food-egg' and quantity=7),1,'future quantity does not change past/current lists');
select lives_ok($$select public.remove_grocery_item(pg_temp.calendar_intent(pg_temp.grocery_payload('2026-10-05','grocery-remove','{"itemId":"gi-food-egg"}')))$$,'past week item can be removed');
select is((select count(*)::integer from public.grocery_items where app_id='gi-food-egg' and removed),1,'past removal remains isolated');
select lives_ok($$select public.add_custom_grocery_item(pg_temp.calendar_intent(pg_temp.grocery_payload('2026-10-19','grocery-custom','{"item":{"id":"grocery-extra","name":"Soap","quantity":2,"unit":"pcs"}}')))$$,'extra items belong to the selected week');
select lives_ok($$select public.regenerate_grocery(pg_temp.calendar_intent(pg_temp.grocery_payload('2026-10-19','grocery-regenerate')))$$,'regeneration computes quantities from authoritative selected-week plans');
select is((select generated_quantity from public.grocery_items where app_id='gi-food-chicken-prep-171077'),600::numeric,'four recipe servings require 600 g raw chicken');
select is((select quantity from public.grocery_items where app_id='gi-food-chicken-prep-171077'),150::numeric,'explicit quantity override survives regeneration');
select ok((select checked from public.grocery_items where app_id='gi-food-chicken-prep-171077'),'checked state survives regeneration');
select is((select generated_quantity from public.grocery_items where app_id='gi-food-korean-beef-168877'),250::numeric,'rice uses whole-batch uncooked grams');
select ok((select removed from public.grocery_items where app_id='gi-food-korean-beef-168877'),'explicit removal survives regeneration');
select ok((select removed from public.grocery_items where app_id='gi-food-bread'),'obsolete generated ingredients are removed');
select is((select quantity from public.grocery_items where app_id='grocery-extra'),2::numeric,'custom quantity survives regeneration');
select is((select generated_quantity from public.grocery_items i join public.grocery_lists g on g.row_id=i.grocery_list_row_id where i.app_id='gi-food-egg' and g.week_of='2026-10-19'),1::numeric,'fractional food rounds up to one piece and skipped food is excluded');
select is((select quantity from public.grocery_items i join public.grocery_lists g on g.row_id=i.grocery_list_row_id where i.app_id='gi-food-egg' and g.week_of='2026-10-19'),7::numeric,'standalone-food user quantity remains separate from generated amount');
select ok(not exists(select 1 from public.grocery_items where name ilike '%spring onion%' or name ilike '%sesame%'),'unmeasured garnishes remain excluded');
select is((select count(*)::integer from public.grocery_items i join public.grocery_lists g on g.row_id=i.grocery_list_row_id where g.week_of<>'2026-10-19' and i.app_id<>'gi-food-egg'),0,'regeneration does not add rows to other weeks');
select lives_ok($$select public.add_custom_grocery_item(pg_temp.calendar_intent(pg_temp.grocery_payload('2026-10-26','grocery-empty-extra','{"item":{"id":"grocery-empty-extra","name":"Towels","quantity":1,"unit":"pcs"}}')))$$,'empty selected week can start a custom list');
select throws_ok($$select public.regenerate_grocery(pg_temp.calendar_intent(pg_temp.grocery_payload('2026-10-19','grocery-mismatch')||'{"weekOf":"2026-10-12"}'::jsonb))$$,'P0001',null,'conflicting week and list identity rejected');
select is((select count(*)::integer from public.planned_meals where app_id like 'grocery-weeks-%'),3,'grocery changes leave plan prescriptions unchanged');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000002102';
select throws_ok($$select public.toggle_grocery_item(pg_temp.calendar_intent(pg_temp.grocery_payload('2026-10-19','grocery-cross','{"itemId":"gi-food-egg"}')))$$,'P0001',null,'cross-account item mutation denied');
reset role;
set local role anon;
select throws_ok($$select public.regenerate_grocery(pg_temp.calendar_intent('{}'))$$,'42501',null,'anonymous grocery mutation denied');
reset role;
select ok(not has_function_privilege('authenticated','private.regenerate_grocery(jsonb)','execute'),'private mutation remains inaccessible');
select * from finish();
rollback;
