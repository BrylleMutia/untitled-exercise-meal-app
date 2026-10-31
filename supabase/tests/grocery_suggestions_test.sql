begin;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000009201','suggest-owner@example.test'),
 ('00000000-0000-0000-0000-000000009202','suggest-peer@example.test'),
 ('00000000-0000-0000-0000-000000009203','suggest-outsider@example.test');
insert into public.grocery_lists(app_id,user_id,week_of,calendar_active) values
 ('suggest-active','00000000-0000-0000-0000-000000009201','2026-10-25',true),
 ('suggest-past','00000000-0000-0000-0000-000000009201','2026-10-18',true),
 ('suggest-inactive','00000000-0000-0000-0000-000000009201','2026-10-11',false),
 ('suggest-other','00000000-0000-0000-0000-000000009203','2026-10-25',true);
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,quantity,generated_quantity,checked,custom_item,removed)
select g.row_id,g.user_id,x.id,x.name,'Other','pcs',1,1,x.checked,x.custom,x.removed from public.grocery_lists g
join (values
 ('suggest-active','generated','Coconut milk',true,false,false),
 ('suggest-active','manual','Milk Brand UHT',false,true,false),
 ('suggest-active','removed','Milk removed',false,true,true),
 ('suggest-past','old','MILK Brand UHT',false,true,false),
 ('suggest-inactive','archived','Milk archived',false,true,false),
 ('suggest-other','private','Milk private',false,true,false),
 ('suggest-active','wildcard','100% milk',false,true,false)
) x(list,id,name,checked,custom,removed) on g.app_id=x.list;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009201';
select ok(public.get_grocery_name_suggestions('milk') @> '[{"name":"Coconut milk"}]','checked generated ingredients supply word-prefix suggestions');
select ok(public.get_grocery_name_suggestions('milk') @> '[{"name":"Milk Brand UHT","occurrences":2}]','manual history is deduplicated ignoring case');
select is((public.get_grocery_name_suggestions('milk')->0->>'occurrences')::integer,2,'phrase prefixes rank before word matches');
select is(jsonb_array_length(public.get_grocery_name_suggestions('removed')),0,'removed rows are excluded');
select is(jsonb_array_length(public.get_grocery_name_suggestions('archived')),0,'inactive calendar/transfer headers are excluded');
select is(jsonb_array_length(public.get_grocery_name_suggestions('private')),0,'unrelated personal history is excluded');
select is(jsonb_array_length(public.get_grocery_name_suggestions('m ')),0,'two non-whitespace characters are required');
select is(jsonb_array_length(public.get_grocery_name_suggestions('不存在')),0,'no match returns an empty array');
select is(jsonb_array_length(public.get_grocery_name_suggestions('%%')),0,'wildcards are literal text');
select ok(public.get_grocery_name_suggestions('100%') @> '[{"name":"100% milk"}]','literal punctuation prefixes remain usable');
select throws_ok($$select public.get_grocery_name_suggestions(repeat('x',257))$$,'P0001',null,'oversized queries reject');
reset role;
insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,quantity,generated_quantity)
select g.row_id,g.user_id,'bounded-'||n,'Suggestion '||n,'Other','pcs',1,1 from public.grocery_lists g cross join generate_series(1,30) n where app_id='suggest-active';
set local role authenticated;
select is(jsonb_array_length(public.get_grocery_name_suggestions('suggestion')),12,'history reads are bounded to twelve candidates');
reset role;
insert into public.cooking_groups(id,week_starts_on) values('00000000-0000-0000-0000-000000009210',0);
insert into public.cooking_group_members(user_id,group_id) values
 ('00000000-0000-0000-0000-000000009201','00000000-0000-0000-0000-000000009210'),
 ('00000000-0000-0000-0000-000000009202','00000000-0000-0000-0000-000000009210');
insert into public.cooking_group_weeks(group_id,week_of,grocery) values('00000000-0000-0000-0000-000000009210','2026-10-25',
 '{"items":[{"id":"g1","name":"Group milk generated","quantity":1,"generatedQuantity":1,"unit":"pcs","checked":true},{"id":"g2","name":"Group milk manual","quantity":1,"generatedQuantity":0,"unit":"pcs","custom":true},{"id":"g3","name":"Group milk removed","quantity":1,"unit":"pcs","removed":true}]}'::jsonb);
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009202';
select is(jsonb_array_length(public.get_grocery_name_suggestions('milk','00000000-0000-0000-0000-000000009210')),2,'group members see generated and manual history including checked items');
select is(jsonb_array_length(public.get_grocery_name_suggestions('brand','00000000-0000-0000-0000-000000009210')),0,'group lookup does not include private member history');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009203';
select throws_ok($$select public.get_grocery_name_suggestions('milk','00000000-0000-0000-0000-000000009210')$$,'P0001',null,'unrelated account cannot query group history');
reset role;
delete from public.cooking_group_members where user_id='00000000-0000-0000-0000-000000009202';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009202';
select throws_ok($$select public.get_grocery_name_suggestions('milk','00000000-0000-0000-0000-000000009210')$$,'P0001',null,'departure revokes future history reads');
set local role anon;
select throws_ok($$select public.get_grocery_name_suggestions('milk')$$,'42501',null,'anonymous history reads are denied');
reset role;
select ok(not has_function_privilege('authenticated','private.grocery_name_match_tier(text,text)','execute'),'private helper remains inaccessible');
select * from finish();
rollback;
