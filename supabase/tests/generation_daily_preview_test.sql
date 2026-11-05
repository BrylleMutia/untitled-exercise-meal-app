begin;
select no_plan();
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000006101','advisory-a@example.test'),('00000000-0000-0000-0000-000000006102','advisory-b@example.test'),('00000000-0000-0000-0000-000000006103','advisory-outside@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal,dietary_pattern,allergies,cooking_time_minutes,meal_budget)
select id,'Same name',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain',case when email='advisory-a@example.test' then 'Vegan low-carb' else 'No restrictions' end,case when email='advisory-a@example.test' then array['soy'] else array['cucumber'] end,0,4 from auth.users where email like 'advisory-%@example.test';
insert into public.goals(app_id,user_id,goal_type,effective_date,weekly_workout_target) select 'advisory-goal-'||id,id,'maintain','2026-09-01',3 from public.profiles where id::text like '%00610_';
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
select 'advisory-target-'||user_id,user_id,row_id,1,'2026-09-01',2400,120,100,65,1400,23.9,2400,1.5,'test','Estimates only' from public.goals where app_id like 'advisory-goal-%';
create temp table advisory_state(name text primary key,value jsonb);
grant all on advisory_state to authenticated,service_role;
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000006101';
insert into advisory_state values('invite',public.cooking_group_command('{"action":"invite","grocerySharingAcknowledgment":"all-weeks-v1","idempotencyKey":"advisory-invite"}'));
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000006102';
select public.cooking_group_command(jsonb_build_object('action','inspect-pin','pin',(select value->>'pin' from advisory_state where name='invite')));
select public.cooking_group_command(jsonb_build_object('action','join','grocerySharingAcknowledgment','all-weeks-v1','pin',(select value->>'pin' from advisory_state where name='invite'),'groupRevision',1,'idempotencyKey','advisory-join'));
set local role service_role;
set local "request.jwt.claim.role"='service_role';
insert into advisory_state values('input',jsonb_build_object('reviewPolicyVersion','advisory_v1','groupId',(select value->'group'->>'id' from advisory_state where name='invite'),'weekOf','2026-10-18','memberIds',jsonb_build_array('00000000-0000-0000-0000-000000006101','00000000-0000-0000-0000-000000006102'),'selectedDates',jsonb_build_array('2026-10-18'),'mode','fill','recipes',jsonb_build_array(jsonb_build_object('id','meal-korean-beef-bowl','revision',(select revision from public.meals where app_id='meal-korean-beef-bowl'),'maxBatches',2)),'seed','test','overrides','{}'::jsonb));

reset role;
update public.profiles set dietary_pattern='No restrictions',allergies='{}';
insert into public.meal_plans(app_id,user_id,week_of,target_row_id,version,preference_policy)
select 'daily-preview-plan-'||id,id,'2026-10-18',(select row_id from public.daily_targets t where t.user_id=p.id),1,'advisory_v1' from public.profiles p where id::text like '%00610_';
insert into public.planned_meals(app_id,meal_plan_row_id,user_id,week_of,meal_date,meal_slot,meal_row_id,label,servings,expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,source,sort_order,skipped)
select 'kept-'||id||'-'||slot, (select row_id from public.meal_plans where user_id=p.id),id,'2026-10-18',day::date,slot,(select row_id from public.meals where app_id='meal-korean-beef-bowl'),'Saved planned portion',1.25,321,22,33,11,'Saved estimate',0,slot='snack'
from public.profiles p cross join (values('breakfast','2026-10-18'),('lunch','2026-10-18'),('snack','2026-10-18'),('dinner','2026-10-19')) slots(slot,day) where id::text like '%00610_';
set local role service_role;
set local "request.jwt.claim.role"='service_role';
insert into advisory_state values('context',public.get_group_planning_context('00000000-0000-0000-0000-000000006101',(select value from advisory_state where name='input')));
insert into advisory_state values('preview',public.store_group_planning_preview('00000000-0000-0000-0000-000000006101',(select value from advisory_state where name='input'),jsonb_build_object('basis',(select value->>'basis' from advisory_state where name='context'),'warnings','[]'::jsonb,'batches','[]'::jsonb,'replacements',jsonb_build_array(jsonb_build_object('memberId','00000000-0000-0000-0000-000000006102','id','kept-00000000-0000-0000-0000-000000006102-lunch')),'assignments',jsonb_build_array(jsonb_build_object('id','new-preview','memberId','00000000-0000-0000-0000-000000006102','recipeId','meal-korean-beef-bowl','date','2026-10-18','slot','dinner','servings',1.5)))));
select is(jsonb_array_length((select value->'resultingMeals' from advisory_state where name='preview')),4,'three retained entries plus one new assignment, excluding replacement skipped and other dates');
select is((select count(*) from advisory_state s cross join lateral jsonb_array_elements(value->'resultingMeals') m where name='preview' and m->>'memberId'='00000000-0000-0000-0000-000000006103'),0::bigint,'unselected outside member never exposed');
select is((select (m->>'expectedCalories')::numeric from advisory_state s cross join lateral jsonb_array_elements(value->'resultingMeals') m where name='preview' and m->>'id'='kept-00000000-0000-0000-0000-000000006102-breakfast'),321::numeric,'kept portion retains saved nutrition, without rescaling');
select is((select (m->>'servings')::numeric from advisory_state s cross join lateral jsonb_array_elements(value->'resultingMeals') m where name='preview' and m->>'status'='new'),1.5::numeric,'new estimate preserved');
select ok(not exists(select 1 from advisory_state s cross join lateral jsonb_array_elements(value->'resultingMeals') m cross join lateral jsonb_object_keys(m) k where name='preview' and k in ('protected','allergies','targets','memberReviews','remainingCalories','logs','confidence','preparationBasis')),'meal rows expose presentation fields only');
select is((select value->'resultingMeals'->3->>'id' from advisory_state where name='preview'),(select value->'assignments'->0->>'id' from advisory_state where name='preview'),'new row identity matches stored assignment suffix');
select throws_ok($$select public.store_group_planning_preview('00000000-0000-0000-0000-000000006103',(select value from advisory_state where name='input'),(select value from advisory_state where name='preview'))$$,'P0001',null,'outsider denied');
select throws_ok($$select public.store_group_planning_preview('00000000-0000-0000-0000-000000006101',jsonb_set((select value from advisory_state where name='input'),'{memberIds}','["00000000-0000-0000-0000-000000006103"]'),(select value from advisory_state where name='preview'))$$,'P0001',null,'forged member denied');
select throws_ok($$select public.store_group_planning_preview('00000000-0000-0000-0000-000000006101',jsonb_set((select value from advisory_state where name='input'),'{selectedDates}','["2026-10-25"]'),(select value from advisory_state where name='preview'))$$,'P0001',null,'outside-week date denied');
select throws_ok($$select public.store_group_planning_preview('00000000-0000-0000-0000-000000006101',(select value from advisory_state where name='input'),jsonb_set((select value from advisory_state where name='preview'),'{basis}','"stale"'))$$,'P0001',null,'stale basis denied');
reset role;
select ok(not has_function_privilege('anon','public.store_group_planning_preview(uuid,jsonb,jsonb)','execute'),'anonymous preview access denied');
select ok(not has_function_privilege('authenticated','private.cooking_resulting_meals(uuid,jsonb,jsonb)','execute'),'direct private helper denied');
select ok(not has_function_privilege('authenticated','public.store_group_planning_preview(uuid,jsonb,jsonb)','execute'),'authenticated callers cannot impersonate actor through service RPC');
select * from finish();
rollback;
