begin;
\ir fixtures/calendar_intent.inc
alter table public.profiles alter column week_starts_on set default 0;
select no_plan();
insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'group-'||i::text||'@example.test' from generate_series(4101,4108) i;
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
select id,'Group '||right(id::text,4),30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain' from auth.users where email like 'group-41%@example.test';
insert into public.goals(app_id,user_id,goal_type,effective_date,weekly_workout_target) select 'group-goal-'||id::text,id,'maintain','2026-09-01',3 from public.profiles where name like 'Group 41%';
insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
select 'group-target-'||user_id::text,user_id,row_id,1,'2026-09-01',2200,120,240,65,1400,23.9,2200,1.5,'test','Estimates only' from public.goals where app_id like 'group-goal-%';
create temp table group_test_state(name text primary key,value jsonb);
grant all on group_test_state to authenticated,service_role;
select ok(not has_table_privilege('authenticated','private.cooking_invitations','select'),'PIN hashes not exposed');
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004101';
insert into group_test_state values('invite',public.cooking_group_command('{"action":"invite","grocerySharingAcknowledgment":"all-weeks-v1","idempotencyKey":"group-invite-one"}'));
select matches((select value->>'pin' from group_test_state where name='invite'),'^[A-Z0-9]{6}$','six-character PIN');
select is(jsonb_array_length(public.get_cooking_group_week('2026-10-18')->'group'->'members'),1,'group starts with one member');
select ok(not has_table_privilege('authenticated','public.cooking_groups','insert'),'no direct group writes');
select ok(not has_function_privilege('authenticated','public.get_group_planning_context(uuid,jsonb)','execute'),'private planning facts are service-only');
select ok(not has_function_privilege('anon','public.get_cooking_group_week(date)','execute'),'anonymous denied');
select throws_ok($$select public.cooking_group_command('{"action":"leave","groupId":"00000000-0000-0000-0000-000000000001","groupRevision":1,"idempotencyKey":"foreign-leave"}')$$,'P0001',null,'cannot leave a foreign group');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004102';
insert into group_test_state values('review',public.cooking_group_command(jsonb_build_object('action','inspect-pin','pin',(select value->>'pin' from group_test_state where name='invite'))));
select is((select value->>'inviter' from group_test_state where name='review'),'Group 4101','review exposes display name');
select is(public.get_cooking_group_week('2026-10-18')->'group','null'::jsonb,'inspection does not join');
insert into group_test_state values('joined',public.cooking_group_command(jsonb_build_object('action','join','grocerySharingAcknowledgment','all-weeks-v1','pin',(select value->>'pin' from group_test_state where name='invite'),'groupRevision',1,'idempotencyKey','group-join-two')));
select is(jsonb_array_length(public.get_cooking_group_week('2026-10-18')->'group'->'members'),2,'two accounts connected');
select is(public.cooking_group_command(jsonb_build_object('action','join','grocerySharingAcknowledgment','all-weeks-v1','pin',(select value->>'pin' from group_test_state where name='invite'),'groupRevision',1,'idempotencyKey','group-join-two'))->>'success','true','duplicate join retries replay');
select is((select count(*) from public.profiles),1::bigint,'other profile remains private');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004103';
select ok(public.cooking_group_command(jsonb_build_object('action','inspect-pin','pin',(select value->>'pin' from group_test_state where name='invite'))) ? 'error','PIN consumed once');
select is((select count(*) from public.cooking_group_members),0::bigint,'outsider cannot read membership');
set local role service_role;
set local "request.jwt.claim.role"='service_role';
insert into group_test_state values('input',jsonb_build_object('reviewPolicyVersion','advisory_v1','groupId',(select value->'group'->>'id' from group_test_state where name='invite'),'weekOf','2026-10-18','memberIds',jsonb_build_array('00000000-0000-0000-0000-000000004101','00000000-0000-0000-0000-000000004102'),'selectedDates',jsonb_build_array('2026-10-18'),'mode','fill','recipes','[]'::jsonb,'seed','test','overrides','{}'::jsonb));
select lives_ok($$insert into group_test_state values('context',public.get_group_planning_context('00000000-0000-0000-0000-000000004101',(select value from group_test_state where name='input')))$$,'service obtains planning basis');
select ok(jsonb_array_length((select value->'recipes' from group_test_state where name='context'))>0,'shared recipes available to planner');
select throws_ok($$select public.get_group_planning_context('00000000-0000-0000-0000-000000004103',(select value from group_test_state where name='input'))$$,'P0001',null,'service helper rejects unrelated actor');
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004101';
select lives_ok($$select public.mutate_cooking_group_week(jsonb_build_object('reviewPolicyVersion','advisory_v1','groupId',(select value->'group'->>'id' from group_test_state where name='invite'),'weekOf','2026-10-18','revision',0,'action','grocery','operation','amount','amount',120550,'idempotencyKey','shared-amount'))$$,'amount-only week saves');
select is((public.get_cooking_group_week('2026-10-18')->'grocery'->>'totalAmountCentavos')::numeric,120550::numeric,'shared amount is recorded');
select throws_ok($$select public.mutate_cooking_group_week(jsonb_build_object('reviewPolicyVersion','advisory_v1','groupId',(select value->'group'->>'id' from group_test_state where name='invite'),'weekOf','2026-10-18','revision',0,'action','grocery','operation','amount','amount',10,'idempotencyKey','stale-amount'))$$,'P0001',null,'stale list revision rejected');
select is((select count(*) from public.grocery_lists),0::bigint,'personal lists untouched');
set local role service_role;
set local "request.jwt.claim.role"='service_role';
update group_test_state set value=jsonb_set(value,'{recipes}',jsonb_build_array(jsonb_build_object('id','meal-korean-beef-bowl','revision',(select revision from public.meals where app_id='meal-korean-beef-bowl'),'maxBatches',2))) where name='input';
insert into group_test_state values('fresh-context',public.get_group_planning_context('00000000-0000-0000-0000-000000004101',(select value from group_test_state where name='input')));
insert into group_test_state values('preview',public.store_group_planning_preview('00000000-0000-0000-0000-000000004101',(select value from group_test_state where name='input'),jsonb_build_object('basis',(select value->>'basis' from group_test_state where name='fresh-context'),'warnings','[]'::jsonb,'replacements','[]'::jsonb,'batches',jsonb_build_array(jsonb_build_object('recipeId','meal-korean-beef-bowl','name','Korean Beef Bowl','yield',4,'portions',3,'batches',1,'leftovers',1)),
'assignments',jsonb_build_array(jsonb_build_object('id','gp-test-a','memberId','00000000-0000-0000-0000-000000004101','recipeId','meal-korean-beef-bowl','date','2026-10-18','slot','lunch','servings',1.5),jsonb_build_object('id','gp-test-b','memberId','00000000-0000-0000-0000-000000004102','recipeId','meal-korean-beef-bowl','date','2026-10-18','slot','lunch','servings',1.5)))));
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.commit_cooking_group_plan(jsonb_build_object('previewId',(select value->>'id' from group_test_state where name='preview'),'acknowledged',true,'idempotencyKey','group-commit'))$$,'group generation commits atomically');
select is(public.commit_cooking_group_plan(jsonb_build_object('previewId',(select value->>'id' from group_test_state where name='preview'),'acknowledged',true,'idempotencyKey','group-commit'))->>'success','true','unchanged commit retry replays');

create function pg_temp.remove_payload(day date, item_id text, retry_key text) returns jsonb language sql as $sql$
 with plan as(select * from public.meal_plans where user_id=auth.uid() and calendar_active and week_of=day order by version desc limit 1),
 grocery as(select * from public.grocery_lists where user_id=auth.uid() and calendar_active and week_of=day)
 select pg_temp.calendar_intent(jsonb_build_object('mealPlan',jsonb_build_object('id',p.app_id,'weekOf',p.week_of,'meals',coalesce((select jsonb_agg(jsonb_build_object('id',pm.app_id,'date',pm.meal_date,'slot',pm.meal_slot,'label',pm.label,'servings',pm.servings,'skipped',pm.skipped,'mealId',(select app_id from public.meals where row_id=pm.meal_row_id),'foodId',(select app_id from public.foods where row_id=pm.food_row_id),'sortOrder',pm.sort_order,'slotKey',pm.slot_key)) from public.planned_meals pm where pm.meal_plan_row_id=p.row_id and pm.app_id<>item_id),'[]'::jsonb)),
 'grocery',jsonb_build_object('id',coalesce(g.app_id,'remove-test-grocery'),'weekOf',p.week_of,'items','[]'::jsonb),
 'expectedVersions',jsonb_build_object('mealPlanVersion',p.version,'groceryRevision',coalesce(g.revision,0)),'idempotencyKey',retry_key,'removePlannedMealId',item_id))
 from plan p left join grocery g on true;
$sql$;

select lives_ok($$select public.mutate_cooking_group_week(jsonb_build_object('action','grocery','operation','add','groupId',(public.get_cooking_group_week('2026-10-18')->'group'->>'id'),'weekOf','2026-10-18','revision',(public.get_cooking_group_week('2026-10-18')->>'revision')::integer,'name','Shared tea','quantity',2,'unit','pcs','idempotencyKey','shared-tea'))$$,'shared custom grocery fixture is saved');
insert into group_test_state values('removal',pg_temp.remove_payload('2026-10-18',(select a->>'id' from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'assignments') a where a->>'memberId'=auth.uid()::text limit 1),'remove-own-a'));
select lives_ok($$select public.edit_meal_plan((select value from group_test_state where name='removal'))$$,'remove the viewer final shared assignment');
select is(jsonb_array_length(public.get_cooking_group_week('2026-10-18')->'assignments'),1,'other member assignment stays available');
select is((select count(*)::int from public.planned_meals pm join public.meal_plans p on p.row_id=pm.meal_plan_row_id where p.user_id=auth.uid() and p.week_of='2026-10-18' and p.version=2),0,'new version contains no removed assignment');
select is((select count(*)::int from public.planned_meals pm join public.meal_plans p on p.row_id=pm.meal_plan_row_id where p.user_id=auth.uid() and p.week_of='2026-10-18' and p.version=1),1,'historical plan version keeps the original assignment');
select ok((public.get_cooking_group_week('2026-10-18')->>'revision')::integer>1,'last-entry removal refreshes shared grocery revision');
select is((public.edit_meal_plan((select value from group_test_state where name='removal')))->>'replayed','true','removal retry is replayed');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004102';
select throws_ok($$select public.edit_meal_plan((select value || jsonb_build_object('idempotencyKey','foreign-removal') from group_test_state where name='removal'))$$,'P0001',null,'another member cannot apply the viewer removal payload');
select lives_ok($$select public.edit_meal_plan(pg_temp.remove_payload('2026-10-18',(select a->>'id' from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'assignments') a where a->>'memberId'=auth.uid()::text limit 1),'remove-own-b'))$$,'second viewer may remove only their own remaining assignment');
select is(jsonb_array_length(public.get_cooking_group_week('2026-10-18')->'assignments'),0,'all removed current assignments leave the shared live plan empty');
select is((select count(*)::int from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'grocery'->'items') item where not coalesce((item->>'removed')::boolean,false) and not coalesce((item->>'custom')::boolean,false)),0,'removing final shared assignment removes generated grocery requirements');
select is((select count(*)::int from public.cooking_assignments),2,'saved generation assignment history is retained');
select is((public.get_cooking_group_week('2026-10-18')->'grocery'->>'totalAmountCentavos')::numeric,120550::numeric,'removal preserves shared spending');
select ok(exists(select 1 from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'grocery'->'items') item where item->>'name'='Shared tea' and (item->>'custom')::boolean),'removal preserves custom groceries');
-- A later private addition must not resurrect removed shared assignments or groceries.
select lives_ok($$select public.add_planned_meal(pg_temp.calendar_intent(jsonb_build_object(
 'idempotencyKey','private-add-after-removal','reviewAcknowledged',true,'reviewPolicyVersion','advisory_v1',
 'mealPlan',jsonb_build_object('id',(select app_id from public.meal_plans where user_id=auth.uid() and week_of='2026-10-18' order by version desc limit 1),'weekOf','2026-10-18','targetId','group-target-'||auth.uid()::text),
 'plannedMeal',jsonb_build_object('id','private-egg','date','2026-10-18','slot','snack','foodId','food-egg','servings',1),
 'grocery',jsonb_build_object('id',(select app_id from public.grocery_lists where user_id=auth.uid() and week_of='2026-10-18'),'weekOf','2026-10-18','items','[]'::jsonb),
 'expectedVersions',jsonb_build_object('profileRevision',(select revision from public.profiles where id=auth.uid()),'mealPlanVersion',(select max(version) from public.meal_plans where user_id=auth.uid() and week_of='2026-10-18'),'groceryRevision',(select revision from public.grocery_lists where user_id=auth.uid() and week_of='2026-10-18'))
)))$$,'reviewed private addition works after shared removals');
select is(jsonb_array_length(public.get_cooking_group_week('2026-10-18')->'assignments'),0,'private addition does not restore removed shared assignments');
select is((select count(*)::int from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'grocery'->'items') item where not coalesce((item->>'removed')::boolean,false) and not coalesce((item->>'custom')::boolean,false)),0,'private addition does not restore shared grocery requirements');
select is((public.get_cooking_group_week('2026-10-18')->'grocery'->>'totalAmountCentavos')::numeric,120550::numeric,'private addition retains shared spending');
select ok(exists(select 1 from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'grocery'->'items') item where item->>'name'='Shared tea' and (item->>'custom')::boolean),'private addition retains shared custom groceries');
select * from finish();
rollback;
