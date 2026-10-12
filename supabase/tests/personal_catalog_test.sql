begin;
select plan(33);
insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000001201','catalog-a@example.test'),
('00000000-0000-0000-0000-000000001202','catalog-b@example.test');
create function pg_temp.catalog_edit(key text, recipe_id text default 'catalog-personal-test', pref integer default 0) returns jsonb language sql as $$
select jsonb_build_object('catalog',jsonb_build_object('mealId','meal-korean-beef-bowl','recordRevision',2,'preferenceRevision',pref),
 'meal',jsonb_build_object('id',recipe_id,'name','My Korean Beef Bowl','servings',4,'complexity','easy','notes','Cook and portion.','image',jsonb_build_object('kind','asset','id','korean-beef-bowl'),
 'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-korean-beef-171790','servings',6),jsonb_build_object('foodId','food-korean-beef-168877','servings',2.5))),
 'newFoods','[]'::jsonb,'idempotencyKey',key);
$$;
select is((select servings::integer from public.meals where app_id='meal-korean-beef-bowl'),4,'four-serving catalog entry');
select is((select complexity from public.meals where app_id='meal-korean-beef-bowl'),'easy','catalog complexity');
select ok((select total_time_minutes is null from public.meals where app_id='meal-korean-beef-bowl'),'missing cooking time stays unset');
select is((select count(*)::integer from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='meal-korean-beef-bowl'),11,'all measured ingredients');
select is((select round(sum(f.calories*i.servings)/max(m.servings))::integer from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id join public.foods f on f.row_id=i.food_row_id where m.app_id='meal-korean-beef-bowl'),484,'calculated calories match client');
select ok((select notes like '%560 kcal, 45 g protein, 58 g carbs, 16 g fat%' from public.meals where app_id='meal-korean-beef-bowl'),'quoted estimates kept separate');
select ok(not has_table_privilege('authenticated','public.recipe_catalog_preferences','INSERT'),'direct inserts denied');
select ok(not has_table_privilege('authenticated','public.recipe_catalog_preferences','UPDATE'),'direct updates denied');
select ok(not has_table_privilege('authenticated','public.recipe_catalog_preferences','DELETE'),'direct deletes denied');
select ok(not has_function_privilege('authenticated','private.lock_catalog_preference(text,jsonb,jsonb)','EXECUTE'),'private boundary denied');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001201';
select throws_ok($$select public.save_recipe(jsonb_set(pg_temp.catalog_edit('catalog-invalid','catalog-invalid'),'{meal,complexity}','null'))$$,'P0001',null,'missing complexity rejects edit');
select is((select count(*)::integer from public.recipe_catalog_preferences),0,'failed edit leaves original visible');
select throws_ok($$select public.save_recipe(jsonb_set(pg_temp.catalog_edit('catalog-no-rev','catalog-no-rev'),'{catalog,preferenceRevision}','null'))$$,'P0001',null,'catalog concurrency version required');
select lives_ok($$select public.save_recipe(pg_temp.catalog_edit('catalog-edit'))$$,'save creates personal version atomically');
select is((select count(*)::integer from public.recipe_catalog_preferences),1,'one owner preference');
select is((select owner_user_id::text from public.meals where app_id='catalog-personal-test'),'00000000-0000-0000-0000-000000001201','personal recipe belongs to caller');
select is((select name from public.meals where app_id='meal-korean-beef-bowl'),'Korean Beef Bowl','global contents unchanged');
select is((select revision from public.meals where app_id='meal-korean-beef-bowl'),2,'global revision unchanged');
select is((select public.save_recipe(pg_temp.catalog_edit('catalog-edit'))->>'replayed'),'true','retry replays before stale checks');
select is((select revision from public.recipe_catalog_preferences),1,'retry cannot increment preference twice');
select throws_ok($$select public.save_recipe(pg_temp.catalog_edit('catalog-stale','catalog-stale'))$$,'P0001',null,'competing first edit is stale');
select is((select count(*)::integer from public.meals where app_id='catalog-stale'),0,'conflict leaves no orphan recipe');
select throws_ok($$select public.save_recipe(pg_temp.catalog_edit('catalog-second','catalog-second',1))$$,'P0001',null,'second edit must use personal version');
select ok(not exists(select 1 from jsonb_array_elements(public.get_recipe_card_metadata('{"asOfDate":"2026-10-12"}')->'recipes') r where r->>'mealId'='meal-korean-beef-bowl'),'hidden original excluded from favorites and popularity');
select throws_ok($$select public.set_recipe_favorite('{"mealId":"meal-korean-beef-bowl","favorite":true,"expectedRevision":0,"asOfDate":"2026-10-12","idempotencyKey":"hidden-fav"}')$$,'P0001',null,'hidden original cannot be favorited');
select is(jsonb_array_length(public.export_account_data('{"idempotencyKey":"catalog-export"}')->'data'->'recipeCatalogPreferences'),1,'preferences included in export');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001202';
select is((select count(*)::integer from public.recipe_catalog_preferences),0,'other user cannot read preferences');
select lives_ok($$select public.archive_saved_meal('{"mealId":"meal-korean-beef-bowl","expectedVersions":{"recordRevision":2},"catalogPreferenceRevision":0,"idempotencyKey":"catalog-archive"}')$$,'archive is per user');
select is((select public.archive_saved_meal('{"mealId":"meal-korean-beef-bowl","expectedVersions":{"recordRevision":2},"catalogPreferenceRevision":0,"idempotencyKey":"catalog-archive"}')->>'replayed'),'true','archive retry is idempotent');
select ok((select archived_at is null from public.meals where app_id='meal-korean-beef-bowl'),'catalog remains globally active');
set local role anon;
select throws_ok($$select public.archive_saved_meal('{}')$$,'42501',null,'anonymous archival denied');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001201';
select lives_ok($$select public.delete_account('{"confirmation":"DELETE","idempotencyKey":"catalog-delete"}')$$,'delete account with catalog preference and personal recipe');
reset role;
select is((select count(*)::integer from public.recipe_catalog_preferences where user_id='00000000-0000-0000-0000-000000001201'),0,'account deletion removes preferences');
select * from finish();
rollback;
