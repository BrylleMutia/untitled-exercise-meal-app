begin;
\ir fixtures/calendar_intent.inc
select plan(23);
insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000000901','recipe-a@example.test'),
('00000000-0000-0000-0000-000000000902','recipe-b@example.test');
create function pg_temp.recipe_payload(recipe_id text, food_id text, save_key text) returns jsonb language sql as $$
select jsonb_build_object('meal',jsonb_build_object('id',recipe_id,'name','Custom recipe','complexity','easy','notes','Stir and serve.','reference','Cookbook, page 12','servings',2,'ingredients',jsonb_build_array(jsonb_build_object('foodId',food_id,'servings',1))),
'newFoods',jsonb_build_array(jsonb_build_object('id',food_id,'name','Custom ingredient','servingLabel','100 g','servingGrams',100,'unit','g','calories',100,'proteinG',10,'carbsG',10,'fatG',2,'source','User entered','sourceVersion','1','valueSource','user_provided','estimated',true,'confidence','medium','category','Other','preparationBasis','prepared')),'idempotencyKey',save_key);
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000901';
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.recipe_payload('recipe-test-a','recipe-food-a','recipe-save-a')))$$,'recipe and custom food save atomically');
select is((select count(*)::integer from public.foods where app_id='recipe-food-a'),1,'custom food exists');
select is((select notes from public.meals where app_id='recipe-test-a'),'Stir and serve.','instructions persisted');
select is((select reference from public.meals where app_id='recipe-test-a'),'Cookbook, page 12','reference persisted');
select is((select public.save_recipe(pg_temp.calendar_intent(pg_temp.recipe_payload('recipe-test-a','recipe-food-a','recipe-save-a')))->>'replayed'),'true','same retry replays');
select is((select count(*)::integer from public.meals where app_id='recipe-test-a'),1,'retry cannot duplicate recipe');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.recipe_payload('recipe-test-a','recipe-food-a','recipe-save-a'),'{meal,name}','"Changed"')))$$,'P0001',null,'same key different content rejected');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.recipe_payload('recipe-invalid','recipe-food-invalid','recipe-invalid-save'),'{meal,notes}','" "')))$$,'P0001',null,'blank instructions rejected');
select is((select count(*)::integer from public.foods where app_id='recipe-food-invalid'),0,'invalid instructions leave no food');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.recipe_payload('recipe-numeric-notes','recipe-food-numeric','recipe-numeric-save'),'{meal,notes}','123')))$$,'P0001',null,'numeric instructions rejected');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.recipe_payload('recipe-array-notes','recipe-food-array','recipe-array-save'),'{meal,notes}','["Serve"]')))$$,'P0001',null,'array instructions rejected');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.recipe_payload('recipe-bad-ref','recipe-food-rollback','recipe-rollback'),'{meal,reference}',to_jsonb(repeat('x',2001)))))$$,'P0001',null,'invalid reference rolls back all writes');
select is((select count(*)::integer from public.foods where app_id='recipe-food-rollback'),0,'late failure rolls back custom food');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.recipe_payload('recipe-ai','recipe-food-ai','recipe-ai-key'),'{newFoods,0,valueSource}','"ai_estimate"')))$$,'P0001',null,'AI-only food cannot be authored into recipe');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_build_object('meal',jsonb_build_object('id','recipe-test-a','name','Stale','complexity','easy','notes','Serve.','servings',1,'ingredients',jsonb_build_array(jsonb_build_object('foodId','recipe-food-a','servings',1))),'newFoods','[]'::jsonb,'expectedVersions',jsonb_build_object('recordRevision',999),'idempotencyKey','recipe-stale')))$$,'P0001',null,'stale recipe rejected');
select lives_ok($$select public.save_saved_meal(pg_temp.calendar_intent(' {"meal":{"id":"recipe-legacy","name":"Legacy meal","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"idempotencyKey":"recipe-legacy-key"}'::jsonb))$$,'general saved-meal path keeps instructions optional');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000902';
select is((select count(*)::integer from public.meals where app_id='recipe-test-a'),0,'other account cannot read recipe');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{"meal":{"id":"recipe-test-a","name":"Intrusion","complexity":"easy","notes":"Serve.","servings":1,"ingredients":[{"foodId":"food-egg","servings":1}]},"newFoods":[],"idempotencyKey":"recipe-cross-user"}'::jsonb))$$,'P0001',null,'other account cannot edit recipe');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{"meal":{"id":"recipe-cross-food","name":"Intrusion","complexity":"easy","notes":"Serve.","servings":1,"ingredients":[{"foodId":"recipe-food-a","servings":1}]},"newFoods":[],"idempotencyKey":"recipe-cross-food"}'::jsonb))$$,'P0001',null,'other account cannot use private ingredient');
set local role anon;
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{}'::jsonb))$$,'42501',null,'anonymous recipe save denied');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000901';
select lives_ok($$select public.delete_account('{"confirmation":"DELETE","idempotencyKey":"recipe-cleanup"}'::jsonb)$$,'owner can delete account containing custom recipe');
reset role;
select is((select count(*)::integer from public.foods where app_id='recipe-food-a'),0,'account deletion removes custom ingredient');
select is((select count(*)::integer from public.meals where app_id='recipe-test-a'),0,'account deletion removes recipe');
select * from finish();
rollback;
