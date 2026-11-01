begin;
select no_plan();
insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'attribution-'||i||'@example.test' from generate_series(9401,9403) i;
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
select id,'Author '||right(id::text,4),30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain' from auth.users where email like 'attribution-%@example.test';
insert into public.cooking_groups(id,week_starts_on) values('00000000-0000-0000-0000-000000009410',0);
insert into public.cooking_group_members(user_id,group_id) select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000009410' from generate_series(9401,9402) i;
insert into public.cooking_group_weeks(group_id,week_of) values('00000000-0000-0000-0000-000000009410','2026-10-25');
create temp table attribution_state(name text primary key,value jsonb);
grant all on attribution_state to authenticated;
create function pg_temp.attribution_command(extra jsonb) returns jsonb language sql as $$
 select public.mutate_cooking_group_week(jsonb_build_object('action','grocery','groupId','00000000-0000-0000-0000-000000009410','weekOf','2026-10-25','revision',(select revision from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410' and week_of='2026-10-25'))||extra);
$$;
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009401';
insert into attribution_state values('add-payload','{"action":"grocery","groupId":"00000000-0000-0000-0000-000000009410","weekOf":"2026-10-25","revision":0,"operation":"add","name":"Banana","quantity":500,"unit":"g","category":"Produce","addedByUserId":"00000000-0000-0000-0000-000000009402","idempotencyKey":"author-add"}');
insert into attribution_state values('added',public.mutate_cooking_group_week((select value from attribution_state where name='add-payload')));
select is((select value#>>'{groceryItem,addedByUserId}' from attribution_state where name='added'),'00000000-0000-0000-0000-000000009401','authority stamps original caller and ignores forged authorship');
select is(public.mutate_cooking_group_week((select value from attribution_state where name='add-payload')),(select value from attribution_state where name='added'),'duplicate Add replays identical attributed result');
select is(jsonb_array_length((select grocery->'items' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410')),1,'duplicate retry creates one item');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009402';
select is(public.get_cooking_group_week('2026-10-25')#>>'{grocery,items,0,addedByUserId}','00000000-0000-0000-0000-000000009401','another member sees original actor');
select throws_ok($$select pg_temp.attribution_command('{"operation":"quantity","revision":0,"itemId":"missing","quantity":1,"idempotencyKey":"author-stale"}')$$,'P0001',null,'concurrent stale baseline is rejected');
select is(pg_temp.attribution_command(jsonb_build_object('operation','quantity','itemId',(select value#>>'{groceryItem,id}' from attribution_state where name='added'),'quantity',600,'category','Other','addedByUserId','00000000-0000-0000-0000-000000009402','idempotencyKey','author-edit'))#>>'{groceryItem,addedByUserId}','00000000-0000-0000-0000-000000009401','another member cannot replace author through quantity or category edit');
select lives_ok($$select pg_temp.attribution_command(jsonb_build_object('operation','toggle','itemId',(select value#>>'{groceryItem,id}' from attribution_state where name='added'),'idempotencyKey','author-check'))$$,'checking succeeds');
select lives_ok($$select pg_temp.attribution_command('{"operation":"refresh","idempotencyKey":"author-regenerate"}')$$,'regeneration succeeds');
select is((select grocery#>>'{items,0,addedByUserId}' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),'00000000-0000-0000-0000-000000009401','regeneration preserves author');
select is((select grocery#>>'{items,0,checked}' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),'true','regeneration preserves checked state');
select throws_ok($$update public.cooking_group_weeks set grocery='{}'$$,'42501',null,'direct shared writes denied');
reset role;
delete from public.cooking_group_members where user_id='00000000-0000-0000-0000-000000009402';
set local role authenticated;
select is(public.get_cooking_group_week('2026-10-25')->'group','null'::jsonb,'departed member cannot read shared week');
select throws_ok($$select pg_temp.attribution_command('{"operation":"add","name":"Hidden","quantity":1,"unit":"pcs","idempotencyKey":"author-left"}')$$,'P0001',null,'departed member cannot add');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009403';
select throws_ok($$select pg_temp.attribution_command('{"operation":"add","name":"Hidden","quantity":1,"unit":"pcs","idempotencyKey":"author-outsider"}')$$,'P0001',null,'unrelated user cannot add');
set local role anon;
select throws_ok($$select public.mutate_cooking_group_week('{}')$$,'42501',null,'anonymous mutation denied');
reset role;

insert into attribution_state values('calendar-source',(select to_jsonb(w) from public.cooking_group_weeks w where group_id='00000000-0000-0000-0000-000000009410'));
update public.cooking_groups set week_starts_on=1 where id='00000000-0000-0000-0000-000000009410';
select lives_ok($$select private.regroup_cooking_calendar('00000000-0000-0000-0000-000000009410',jsonb_build_array((select value from attribution_state where name='calendar-source')),1)$$,'calendar regrouping accepts attributed manual rows');
select is((select grocery#>>'{items,0,addedByUserId}' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),'00000000-0000-0000-0000-000000009401','calendar regrouping retains original adder');
select is((select grocery#>>'{items,0,carriedFromWeek}' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),'2026-10-25','calendar regrouping retains carried-week notice');
select is((select grocery#>>'{items,0,quantity}' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),'600','calendar regrouping preserves shopping quantity');
delete from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410';
insert into public.cooking_group_weeks select (jsonb_populate_record(null::public.cooking_group_weeks,(select value from attribution_state where name='calendar-source'))).*;
update public.cooking_groups set week_starts_on=0 where id='00000000-0000-0000-0000-000000009410';

-- Exercise the actual forward backfill against synthetic historical receipts.
insert into attribution_state values('item-base','{"name":"Legacy","category":"Produce","unit":"pcs","quantity":2,"generatedQuantity":0,"custom":true,"checked":true,"removed":true,"carriedFromWeek":"2026-10-18"}');
update public.cooking_group_weeks set grocery=jsonb_build_object('items',jsonb_build_array(
 (select value from attribution_state where name='item-base')||'{"id":"custom-known"}',
 (select value from attribution_state where name='item-base')||'{"id":"custom-ambiguous"}',
 (select value from attribution_state where name='item-base')||'{"id":"custom-edit-only"}',
 (select value from attribution_state where name='item-base')||'{"id":"custom-unknown"}',
 (select value from attribution_state where name='item-base')||'{"id":"custom-generated","personalGenerated":true}',
 (select value from attribution_state where name='item-base')||'{"id":"custom-existing","addedByUserId":"00000000-0000-0000-0000-000000009402"}'
)) where group_id='00000000-0000-0000-0000-000000009410';
insert into public.mutation_idempotency(user_id,operation,idempotency_key,request_hash,status,result_refs)
select ('00000000-0000-0000-0000-'||lpad(actor::text,12,'0'))::uuid,'mutate_cooking_group_week',key,md5(key),'completed',jsonb_build_object('success',true,'groceryItem',(select value from attribution_state where name='item-base')||jsonb_build_object('id',item_id),'previousCategory',previous_category)
from (values
 (9401,'legacy-known','custom-known',null::text),
 (9401,'legacy-ambiguous-a','custom-ambiguous',null),
 (9403,'legacy-ambiguous-b','custom-ambiguous',null),
 (9401,'legacy-edit','custom-edit-only','Produce'),
 (9401,'legacy-generated','custom-generated',null),
 (9401,'legacy-existing','custom-existing',null)
) as fixtures(actor,key,item_id,previous_category);
insert into attribution_state values('receipts-before',(select jsonb_agg(to_jsonb(r) order by row_id) from public.mutation_idempotency r where idempotency_key like 'legacy-%'));
insert into attribution_state values('revision-before',to_jsonb((select revision from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410')));
select is(private.backfill_shared_grocery_item_authors(),1::bigint,'one legacy week is enriched');
select is((select grocery#>>'{items,0,addedByUserId}' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),'00000000-0000-0000-0000-000000009401','exact completed Add receipt supplies original actor');
select is((select (grocery#>'{items,0}')-'addedByUserId' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),(select value||'{"id":"custom-known"}' from attribution_state where name='item-base'),'backfill preserves every other item property');
select is((select count(*)::integer from public.cooking_group_weeks w cross join lateral jsonb_array_elements(w.grocery->'items') item where w.group_id='00000000-0000-0000-0000-000000009410' and item ? 'addedByUserId'),2,'ambiguous, edit-only, unknown and Generated rows remain unattributed');
select is((select grocery#>>'{items,5,addedByUserId}' from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),'00000000-0000-0000-0000-000000009402','existing attribution is not replaced');
select is((select revision from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),(select (value::text)::integer+1 from attribution_state where name='revision-before'),'backfill increments touched week revision once');
select is((select jsonb_agg(to_jsonb(r) order by row_id) from public.mutation_idempotency r where idempotency_key like 'legacy-%'),(select value from attribution_state where name='receipts-before'),'backfill never rewrites retry receipts');
insert into attribution_state values('revision-after',to_jsonb((select revision from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410')));
select is(private.backfill_shared_grocery_item_authors(),0::bigint,'backfill changes no already-attributed weeks');
select is((select revision from public.cooking_group_weeks where group_id='00000000-0000-0000-0000-000000009410'),(select (value::text)::integer from attribution_state where name='revision-after'),'repeated backfill is a no-op');
select ok(not has_function_privilege('authenticated','private.mutate_cooking_group_week(jsonb)','execute'),'private authority remains inaccessible');
select ok(not has_function_privilege('authenticated','private.backfill_shared_grocery_item_authors()','execute'),'backfill is owner-only');
select * from finish();
rollback;
