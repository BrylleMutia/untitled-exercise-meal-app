begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000009101','category-owner@example.test'),
 ('00000000-0000-0000-0000-000000009102','category-peer@example.test'),
 ('00000000-0000-0000-0000-000000009103','category-outsider@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000009101','Category owner',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain'),('00000000-0000-0000-0000-000000009102','Category peer',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.grocery_lists(app_id,user_id,week_of) values('category-list','00000000-0000-0000-0000-000000009101','2026-10-19');
create function pg_temp.category_payload(p_key text,p_extra jsonb default '{}') returns jsonb language sql as $$
 select pg_temp.calendar_intent(jsonb_build_object('grocery',jsonb_build_object('id','category-list','weekOf','2026-10-19'),'expectedVersions',jsonb_build_object('groceryRevision',(select revision from public.grocery_lists where app_id='category-list')),'idempotencyKey',p_key)||p_extra);
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009101';
create temp table category_retry as select pg_temp.category_payload('category-add','{"item":{"id":"category-extra","name":"  TOMATOS  ","quantity":2,"unit":"pcs","category":"Produce"},"categoryPreference":{"action":"remember","expectedRevision":0}}') payload;
select lives_ok($$select public.add_custom_grocery_item((select payload from category_retry))$$,'item and personal correction save atomically');
select is(public.add_custom_grocery_item((select payload from category_retry))->>'replayed','true','duplicate retry replays');
select is((public.get_grocery_category_preferences()->0->>'revision')::integer,1,'duplicate retry does not learn twice');
select is(public.get_grocery_category_preferences()->0->>'nameKey','tomatos','name normalization preserves full identity');
select is(public.get_grocery_category_preferences()->0->>'category','Produce','personal correction is readable');
select is(public.add_custom_grocery_item((select payload from category_retry))->'result_refs'->'groceryItem'->>'quantity','2.000','retry retains authoritative saved quantity');
select throws_ok($$insert into public.grocery_category_preferences(scope_key,user_id,name_key,category) values('user:00000000-0000-0000-0000-000000009101',auth.uid(),'soap','Other')$$,'42501',null,'direct preference writes denied');
select throws_ok($$select public.add_custom_grocery_item(pg_temp.category_payload('category-invalid','{"item":{"id":"bad-category","name":"Milk","quantity":1,"unit":"pcs","category":"Invalid"},"categoryPreference":{"action":"remember","expectedRevision":0}}'))$$,'P0001',null,'invalid categories reject the entire mutation');
select throws_ok($$select public.add_custom_grocery_item(pg_temp.category_payload('category-conflict','{"item":{"id":"conflicting-extra","name":"tomatos","quantity":1,"unit":"pcs","category":"Other"},"categoryPreference":{"action":"remember","expectedRevision":0}}'))$$,'P0001',null,'concurrent stale correction rejected');
select is((select count(*) from public.grocery_items where app_id in ('bad-category','conflicting-extra')),0::bigint,'failed preferences leave no added item');
select lives_ok($$select public.set_grocery_quantity(pg_temp.category_payload('category-move','{"itemId":"category-extra","quantity":2,"category":"Other","categoryPreference":{"action":"remember","expectedRevision":1}}'))$$,'manual item can move category');
select is((select category from public.grocery_items where app_id='category-extra'),'Other','manual category updated');
select lives_ok($$select public.set_grocery_quantity(pg_temp.category_payload('category-reset','{"itemId":"category-extra","quantity":2,"category":"Produce","categoryPreference":{"action":"reset","expectedRevision":2}}'))$$,'reset and current category save together');
select is(public.get_grocery_category_preferences()->0->>'category',null::text,'reset returns automatic mode');
select is((public.get_grocery_category_preferences()->0->>'revision')::integer,3,'reset preserves concurrency revision');
select ok(public.export_account_data('{"idempotencyKey":"category-export"}')->'data'->'groceryCategoryPreferences' is not null,'account export includes preferences');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009103';
select is(jsonb_array_length(public.get_grocery_category_preferences()),0,'unrelated user cannot read personal preferences');
select is((select count(*) from public.grocery_category_preferences),0::bigint,'RLS denies personal table reads to others');
reset role;
insert into public.cooking_groups(id,week_starts_on) values('00000000-0000-0000-0000-000000009110',1);
insert into public.cooking_group_members(user_id,group_id) values
 ('00000000-0000-0000-0000-000000009101','00000000-0000-0000-0000-000000009110'),
 ('00000000-0000-0000-0000-000000009102','00000000-0000-0000-0000-000000009110');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009102';
select lives_ok($$select public.mutate_cooking_group_week('{"action":"grocery","groupId":"00000000-0000-0000-0000-000000009110","weekOf":"2026-10-19","revision":0,"operation":"add","name":"Coconut milk","quantity":2,"unit":"pcs","category":"Pantry","categoryPreference":{"action":"remember","expectedRevision":0},"idempotencyKey":"category-group-add"}')$$,'group item and correction save atomically');
select is(public.get_grocery_category_preferences('00000000-0000-0000-0000-000000009110')->0->>'category','Pantry','group member reads shared correction');
select is(jsonb_array_length(public.get_grocery_category_preferences()),0,'group correction does not enter private preferences');
reset role;
delete from public.cooking_group_members where user_id='00000000-0000-0000-0000-000000009102';
set local role authenticated;
select throws_ok($$select public.get_grocery_category_preferences('00000000-0000-0000-0000-000000009110')$$,'P0001',null,'departure revokes group lookup');
set local role anon;
select throws_ok($$select public.get_grocery_category_preferences()$$,'42501',null,'anonymous lookup denied');
reset role;
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity)
select row_id,user_id,'category-generated','Milk','Dairy','ml',100,100 from public.grocery_lists where app_id='category-list';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009101';
select throws_ok($$select public.set_grocery_quantity(pg_temp.category_payload('category-generated-edit','{"itemId":"category-generated","quantity":100,"category":"Other","categoryPreference":{"action":"remember","expectedRevision":0}}'))$$,'P0001',null,'generated rows cannot change category');
reset role;
select is((select category from public.grocery_items where app_id='category-generated'),'Dairy','generated category is preserved after rejected edit');
select is(private.grocery_name_key('  ＭＩＬＫ  '),'milk','server normalization matches client Unicode keys');
select is((select count(*) from public.grocery_category_preferences where name_key='milk'),0::bigint,'rejected generated edit learns nothing');
delete from auth.users where id='00000000-0000-0000-0000-000000009101';
select is((select count(*) from public.grocery_category_preferences where user_id='00000000-0000-0000-0000-000000009101'),0::bigint,'account deletion cascades personal preferences');
select ok(not has_function_privilege('authenticated','private.save_grocery_category_preference(uuid,text,text,jsonb)','execute'),'private preference writer is inaccessible');
select * from finish();
rollback;
