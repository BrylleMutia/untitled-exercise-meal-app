begin;
\ir fixtures/calendar_intent.inc
select plan(21);
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000001301','provided-macros@example.test');
create function pg_temp.provided_log(key text, quantity numeric) returns jsonb language sql as $$
select jsonb_build_object('name','Korean Beef Bowl','date','2026-10-12','slot','lunch','sourceMode','saved_meal',
 'loggedMealId',key,'meal',jsonb_build_object('id','meal-korean-beef-bowl','name','Korean Beef Bowl','servings',4),
 'ingredients',jsonb_build_array(jsonb_build_object('customName','Client label','servings',quantity,'calories',9999,'proteinG',9999,'carbsG',9999,'fatG',9999,'valueSource','user_provided')),'idempotencyKey',key);
$$;
select is((select provided_nutrition from public.meals where app_id='meal-korean-beef-bowl'),'{"calories":560,"proteinG":45,"carbsG":58,"fatG":16}'::jsonb,'original provided macros stored');
select ok((select nutrition_notes like '%without recalculating%' from public.meals where app_id='meal-korean-beef-bowl'),'provided macro basis visible in Details');
select throws_ok($$update public.meals set provided_nutrition='{"calories":"560","proteinG":45,"carbsG":58,"fatG":16}' where app_id='meal-korean-beef-bowl'$$,'23514',null,'nonnumeric macros rejected');
select throws_ok($$update public.meals set provided_nutrition='{"calories":-1,"proteinG":45,"carbsG":58,"fatG":16}' where app_id='meal-korean-beef-bowl'$$,'23514',null,'negative macros rejected');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001301';
select lives_ok($$select public.save_reviewed_meal(pg_temp.calendar_intent(pg_temp.provided_log('provided-two',2)))$$,'two provided recipe portions log');
select is((select calories from public.nutrition_logs),1120::numeric,'server uses stored calories and ignores payload tampering');
select is((select protein_g from public.nutrition_logs),90::numeric,'protein scales by portion');
select is((select carbs_g from public.nutrition_logs),116::numeric,'carbs scale by portion');
select is((select fat_g from public.nutrition_logs),32::numeric,'fat scales by portion');
select is((select value_source from public.nutrition_logs),'user_provided','provided values remain explicit');
select is((select public.save_reviewed_meal(pg_temp.calendar_intent(pg_temp.provided_log('provided-two',2)))->>'replayed'),'true','provided log retry replays');
select is((select count(*)::integer from public.nutrition_logs),1,'retry cannot duplicate intake');
select throws_ok($$select public.save_reviewed_meal(pg_temp.calendar_intent(pg_temp.provided_log('provided-zero',0)))$$,'P0001',null,'zero portions rejected');
select lives_ok($$select public.save_reviewed_meal(pg_temp.calendar_intent(pg_temp.provided_log('provided-half',0.5)))$$,'fractional portions log');
select is((select calories from public.nutrition_logs where idempotency_key='provided-half:1'),280::numeric,'half portion scales exactly');
select is((select count(*)::integer from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='meal-korean-beef-bowl'),11,'logging does not change recipe ingredients');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent('{"meal":{"id":"provided-personal","name":"Provided personal recipe","complexity":"easy","notes":"Serve.","servings":2,"ingredients":[{"foodId":"food-egg","servings":2}],"providedNutrition":{"calories":100,"proteinG":10,"carbsG":5,"fatG":4}},"newFoods":[],"idempotencyKey":"provided-save"}'))$$,'authoring persists supplied macros');
select is((select provided_nutrition->>'calories' from public.meals where app_id='provided-personal'),'100','provided metadata persisted');
select lives_ok($$select public.save_saved_meal(pg_temp.calendar_intent('{"meal":{"id":"provided-personal","name":"Provided personal recipe","servings":2,"ingredients":[{"foodId":"food-egg","servings":2}]},"idempotencyKey":"provided-omit"}'))$$,'legacy save remains compatible');
select is((select provided_nutrition->>'calories' from public.meals where app_id='provided-personal'),'100','omission preserves provided metadata');
select is((select sum(calories) from public.nutrition_logs),1400::numeric,'later recipe saves do not recalculate saved intake');
select * from finish();
rollback;
