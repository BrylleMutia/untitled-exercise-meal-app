begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000001801','preset-a@example.test'),('00000000-0000-0000-0000-000000001802','preset-b@example.test');
create function pg_temp.image_recipe(key text,recipe_id text,cover jsonb) returns jsonb language sql as $$
select jsonb_build_object('meal',jsonb_build_object('id',recipe_id,'name','Image preset recipe','servings',1,'complexity','easy','notes','Prepare and serve.',
 'providedNutrition',jsonb_build_object('calories',560,'proteinG',45,'carbsG',58,'fatG',16),'image',cover,
 'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))), 'newFoods','[]'::jsonb,'idempotencyKey',key);
$$;
select ok(not has_function_privilege('authenticated','private.save_saved_meal_without_complexity(jsonb)','execute'),'image compatibility function stays private');
select ok(not has_function_privilege('anon','public.save_recipe(jsonb)','execute'),'anonymous recipe saves denied');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001801';
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-breakfast','preset-recipe','{"kind":"asset","id":"breakfast-egg-salad"}')))$$,'Breakfast preset can be created');
select is((select image->>'id' from public.meals where app_id='preset-recipe'),'breakfast-egg-salad','Breakfast preset stored');
select is(public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-breakfast','preset-recipe','{"kind":"asset","id":"breakfast-egg-salad"}')))->>'replayed','true','same intent replays');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-snack','preset-recipe','{"kind":"asset","id":"snack-sandwich"}')))$$,'Snack preset can replace cover');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-dinner','preset-recipe','{"kind":"asset","id":"dinner-curry-omelette"}')))$$,'Dinner preset can replace cover');
select is((select image->>'id' from public.meals where app_id='preset-recipe'),'dinner-curry-omelette','Dinner preset stored');
select is((select provided_nutrition from public.meals where app_id='preset-recipe'),'{"calories":560,"proteinG":45,"carbsG":58,"fatG":16}'::jsonb,'image edits preserve supplied macros');
select is((select i.servings from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='preset-recipe'),1::numeric,'ingredient amount preserved');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.image_recipe('preset-stale','preset-recipe','{"kind":"asset","id":"snack-sandwich"}'),'{expectedVersions}','{"recordRevision":1}')))$$,'P0001',null,'stale image edit rejected');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-invalid','preset-invalid','{"kind":"asset","id":"unknown"}')))$$,'P0001',null,'unregistered preset rejected');
select is((select count(*)::integer from public.meals where app_id='preset-invalid'),0,'invalid preset creates no recipe');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-reset','preset-recipe','null')))$$,'Lunch resets to null');
select ok((select image is null from public.meals where app_id='preset-recipe'),'Lunch uses existing default representation');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-catalog-a','preset-catalog-a','{"kind":"asset","id":"creamy-lemon-chicken"}')))$$,'existing chicken asset remains valid');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-catalog-b','preset-catalog-b','{"kind":"asset","id":"korean-beef-bowl"}')))$$,'existing beef asset remains valid');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-url','preset-url','{"kind":"url","url":"https://example.com/recipe.png"}')))$$,'HTTPS cover stays compatible');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-http','preset-http','{"kind":"url","url":"http://example.com/recipe.png"}')))$$,'P0001',null,'unsafe image URL rejected');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-foreign-upload','preset-foreign-upload','{"kind":"upload","path":"00000000-0000-0000-0000-000000001802/00000000-0000-0000-0000-000000001803.webp"}')))$$,'P0001',null,'unowned upload rejected');
select throws_ok($$update public.meals set image='{"kind":"asset","id":"snack-sandwich"}' where app_id='preset-recipe'$$,'42501',null,'direct image writes denied');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001802';
select is((select count(*)::integer from public.meals where app_id='preset-recipe'),0,'other owner cannot read personal preset recipe');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.image_recipe('preset-cross','preset-recipe','{"kind":"asset","id":"snack-sandwich"}')))$$,'P0001',null,'other owner cannot edit preset recipe');
reset role;
set local role anon;
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{}'))$$,'42501',null,'anonymous public RPC denied');
reset role;
select * from finish();
rollback;
