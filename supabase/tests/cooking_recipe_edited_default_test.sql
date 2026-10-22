begin;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000005101','edited-owner@example.test'),
 ('00000000-0000-0000-0000-000000005102','edited-member@example.test'),
 ('00000000-0000-0000-0000-000000005103','edited-outsider@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
select id,'Edited fixture',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain' from auth.users where email in ('edited-owner@example.test','edited-member@example.test','edited-outsider@example.test');
create temp table edited_recipe_state(name text primary key,value jsonb);
grant all on edited_recipe_state to authenticated;
insert into edited_recipe_state values('edited-row',to_jsonb(private.cooking_copy_row('meals',(select row_id from public.meals where app_id='meal-korean-beef-bowl'),jsonb_build_object('app_id','edited-default-test','owner_user_id','00000000-0000-0000-0000-000000005101','is_system',false,'name','Renamed customized supper'))));
insert into edited_recipe_state values('plain-row',to_jsonb(private.cooking_copy_row('meals',(select row_id from public.meals where app_id='meal-korean-beef-bowl'),jsonb_build_object('app_id','same-name-test','owner_user_id','00000000-0000-0000-0000-000000005101','is_system',false,'revision',99))));
insert into public.recipe_catalog_preferences(user_id,catalog_meal_row_id,replacement_meal_row_id)
select '00000000-0000-0000-0000-000000005101',row_id,(select value::text::bigint from edited_recipe_state where name='edited-row') from public.meals where app_id='meal-korean-beef-bowl';
select is((select provolatile::text from pg_proc where oid='private.cooking_library_recipe_json(public.meals)'::regprocedure),'v','recipe helper preserves volatile declaration');
select ok(not has_function_privilege('authenticated','private.cooking_library_recipe_json(public.meals)','execute'),'members cannot call private recipe helper');
select ok(not has_function_privilege('anon','private.cooking_library_recipe_json(public.meals)','execute'),'anonymous cannot call private recipe helper');
select ok(not has_function_privilege('anon','public.get_cooking_group_week(date)','execute'),'anonymous cannot call shared read model');
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000005101';
insert into edited_recipe_state values('invite',public.cooking_group_command('{"action":"invite","idempotencyKey":"edited-invite"}'));
select is((select (r->>'isEditedDefault')::boolean from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'recipes') r where r->>'id'='edited-default-test'),true,'owner sees confirmed customization provenance');
select is((select r->>'name' from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'recipes') r where r->>'id'='edited-default-test'),'Renamed customized supper','read model does not rename the stored recipe');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000005102';
insert into edited_recipe_state values('review',public.cooking_group_command(jsonb_build_object('action','inspect-pin','pin',(select value->>'pin' from edited_recipe_state where name='invite'))));
select lives_ok($$select public.cooking_group_command(jsonb_build_object('action','join','pin',(select value->>'pin' from edited_recipe_state where name='invite'),'groupRevision',1,'idempotencyKey','edited-join'))$$,'second member joins with explicit recipe sharing');
select is((select count(*) from public.recipe_catalog_preferences),0::bigint,'other member catalog preferences remain private');
select is((select (r->>'isEditedDefault')::boolean from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'recipes') r where r->>'id'='edited-default-test'),true,'shared recipe exposes only the derived edited flag');
select is((select (r->>'isEditedDefault')::boolean from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'recipes') r where r->>'id'='same-name-test'),false,'same name and high revision are not customization evidence');
select is((select (r->>'isEditedDefault')::boolean from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'recipes') r where r->>'id'='meal-korean-beef-bowl'),false,'untouched system default is not labeled edited');
insert into edited_recipe_state values('before-read',public.get_cooking_group_week('2026-10-18'));
select is(public.get_cooking_group_week('2026-10-18'),(select value from edited_recipe_state where name='before-read'),'provenance reads change no shared state');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000005103';
select is((select count(*) from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'recipes') r where r->>'id' in ('edited-default-test','same-name-test')),0::bigint,'nonmember cannot see customized shared recipes');
reset role;
delete from public.recipe_catalog_preferences where user_id='00000000-0000-0000-0000-000000005101';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000005102';
select is((select (r->>'isEditedDefault')::boolean from jsonb_array_elements(public.get_cooking_group_week('2026-10-18')->'recipes') r where r->>'id'='edited-default-test'),false,'flag is derived from current confirmed link');
select * from finish();
rollback;
