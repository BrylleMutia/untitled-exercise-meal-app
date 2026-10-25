begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000009501','recipe-log-owner@example.test'),
  ('00000000-0000-0000-0000-000000009502','recipe-log-other@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal)
values('00000000-0000-0000-0000-000000009501','Recipe log',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain');
insert into public.meals(app_id,owner_user_id,is_system,name,servings)
values('recipe-log-100','00000000-0000-0000-0000-000000009501',false,'Hundred ingredients',4);
insert into public.meal_ingredients(meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,n,1 from public.meals m cross join public.foods f cross join generate_series(1,100) n
where m.app_id='recipe-log-100' and f.app_id='food-egg';
create function pg_temp.recipe_log_payload(recipe_id text, key text) returns jsonb language sql as $$
select pg_temp.calendar_intent(jsonb_build_object('date','2026-10-07','slot','dinner','name',m.name,
  'sourceMode','saved_meal','recipeServings',1,'idempotencyKey',key,'loggedMealId',key,
  'meal',jsonb_build_object('id',m.app_id,'name',m.name,'servings',m.servings),
  'ingredients',(select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings/m.servings) order by i.ingredient_order)
    from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=m.row_id)))
from public.meals m where m.app_id=recipe_id;
$$;
select ok(not has_function_privilege('authenticated','private.save_reviewed_meal_before_provided_nutrition(jsonb)','EXECUTE'),'implementation remains private');
select ok(not has_function_privilege('anon','public.save_reviewed_meal(jsonb)','EXECUTE'),'anonymous RPC access remains denied');
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009501';
select is((public.save_reviewed_meal(pg_temp.recipe_log_payload('meal-default-hainanese-chicken-rice','hainanese-log'))->>'status'),'completed','actual eleven-ingredient Hainanese recipe logs');
select is((select count(*)::int from public.nutrition_logs where logged_meal_row_id=(select row_id from public.logged_meals where app_id='hainanese-log')),11,'every measured ingredient retains its historical snapshot');
select is((select calories from public.nutrition_logs where logged_meal_row_id=(select row_id from public.logged_meals where app_id='hainanese-log') and calories=0 limit 1),0::numeric,'zero-calorie water is retained');
select is((public.save_reviewed_meal(pg_temp.recipe_log_payload('meal-default-hainanese-chicken-rice','hainanese-log'))->>'replayed'),'true','same intent replays without duplicate intake');
select is((public.save_reviewed_meal(pg_temp.recipe_log_payload('recipe-log-100','hundred-log'))->>'status'),'completed','full supported recipe ingredient count logs');
select is((select count(*)::int from public.nutrition_logs where logged_meal_row_id=(select row_id from public.logged_meals where app_id='hundred-log')),100,'all hundred historical entries are saved');
select throws_ok($$select public.save_reviewed_meal(jsonb_set(pg_temp.recipe_log_payload('recipe-log-100','too-many-log'),'{ingredients}',(pg_temp.recipe_log_payload('recipe-log-100','too-many-log')->'ingredients')||jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))))$$,'P0001',null,'101 saved ingredients are rejected');
select throws_ok($$select public.save_reviewed_meal(jsonb_set(pg_temp.recipe_log_payload('meal-default-hainanese-chicken-rice','ai-eleven'),'{sourceMode}','"ai_assisted"'))$$,'P0001',null,'AI reviews still reject eleven ingredients');
select throws_ok($$select public.save_reviewed_meal(jsonb_set(pg_temp.recipe_log_payload('meal-default-hainanese-chicken-rice','empty-log'),'{ingredients}','[]'))$$,'P0001',null,'empty reviewed meals remain invalid');
select throws_ok($$select public.save_reviewed_meal(jsonb_set(pg_temp.recipe_log_payload('meal-default-hainanese-chicken-rice','negative-log'),'{ingredients,0,servings}','-1'))$$,'P0001',null,'invalid portions remain rejected');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009502';
select is((select count(*)::int from public.logged_meals where app_id='hainanese-log'),0,'other account cannot read saved meal history');
select is((select count(*)::int from public.nutrition_logs where logged_meal_row_id in (select row_id from public.logged_meals where app_id='hundred-log')),0,'other account cannot read ingredient snapshots');
select * from finish();
rollback;
