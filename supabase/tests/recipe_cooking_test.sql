begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000008801','cooking-owner@example.test'),
 ('00000000-0000-0000-0000-000000008802','cooking-peer@example.test'),
 ('00000000-0000-0000-0000-000000008803','cooking-outsider@example.test');
create function pg_temp.cooking_recipe(p_id text,p_key text) returns jsonb language sql as $$
 select pg_temp.calendar_intent(jsonb_build_object('meal',jsonb_build_object('id',p_id,'name','Cooking without weights','servings',4,'mealSlots',jsonb_build_array('lunch'),'complexity','easy','notes','Cook safely.','ingredients','[]'::jsonb,
 'providedNutrition','{"calories":300,"proteinG":6,"carbsG":60,"fatG":3}'::jsonb,
 'nutritionInput','{"method":"provided","basis":"whole-recipe","values":{"calories":1200,"proteinG":24,"carbsG":240,"fatG":12}}'::jsonb,
 'cookingIngredients','[{"id":"rice","cookingMeasurement":{"kind":"range","name":"Rice","quantity":1,"upperQuantity":2,"unit":"cup"}},{"id":"onion","cookingMeasurement":{"kind":"amount","name":"Onion","quantity":1,"unit":"piece"}}]'::jsonb),'newFoods','[]'::jsonb,'idempotencyKey',p_key));
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000008801';
select lives_ok($$select public.save_recipe(pg_temp.cooking_recipe('cooking-no-food','cooking-save'))$$,'save source macros and cooking rows without food records');
select is((select count(*) from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='cooking-no-food'),0::bigint,'no placeholder nutrition ingredient is fabricated');
select is((select jsonb_array_length(cooking_ingredients) from public.meals where app_id='cooking-no-food'),2,'cooking rows are durable');
select lives_ok($$select public.save_recipe(pg_temp.cooking_recipe('cooking-no-food','cooking-save'))$$,'identical retry succeeds');
select is((select count(*) from public.meals where app_id='cooking-no-food'),1::bigint,'retry does not duplicate recipe');
select is((select count(*) from public.ingredient_conversions),0::bigint,'unlinked cooking names do not teach a conversion identity');
select lives_ok($$select public.save_recipe(jsonb_set(pg_temp.cooking_recipe('cooking-linked','cooking-linked'),'{meal,cookingIngredients}','[{"id":"egg","foodId":"food-egg","cookingMeasurement":{"kind":"amount","name":"Eggs","quantity":2,"unit":"cup","gramsPerUnit":50}}]'))$$,'optional linked food can retain a completed conversion without nutrition servings');
select ok(public.get_ingredient_conversions(array['food-egg']) @> '[{"unit":"cup","gramsPerUnit":50,"source":{"kind":"personal"}}]','cooking metadata teaches the personal library on successful save');
select throws_ok($$select public.save_recipe(jsonb_set(pg_temp.cooking_recipe('cooking-bad','cooking-bad'),'{meal,nutritionInput,values,calories}','1300'))$$,'P0001',null,'inconsistent source and normalized macros reject atomically');
select is((select count(*) from public.meals where app_id='cooking-bad'),0::bigint,'failed recipe creates no partial state');
select throws_ok($$select public.save_recipe(jsonb_set(pg_temp.cooking_recipe('cooking-calc','cooking-calc'),'{meal,providedNutrition}','null'))$$,'P0001',null,'unlinked ingredients cannot masquerade as calculated nutrition');
select throws_ok($$update public.meals set cooking_ingredients='[]' where app_id='cooking-no-food'$$,'42501',null,'direct client writes remain denied');
reset role;
select ok(not private.valid_cooking_ingredients('[{"id":"x","cookingMeasurement":{"kind":"amount","name":"Rice","quantity":-1,"unit":"cup"}}]'),'invalid cooking amounts denied');
select ok(not private.valid_cooking_ingredients('[{"id":"x","cookingMeasurement":{"kind":"amount","name":"Rice","quantity":1,"unit":"cup"}},{"id":"x","cookingMeasurement":{"kind":"amount","name":"Rice","quantity":1,"unit":"cup"}}]'),'duplicate stable row identities denied');
select is((select quantity from public.meals m cross join lateral private.recipe_cooking_grocery(m,1,m.app_id) r where m.app_id='cooking-no-food' and r.name='Rice'),2::numeric,'upper range shopping amount retains cups');
select is((select unit from public.meals m cross join lateral private.recipe_cooking_grocery(m,1,m.app_id) r where m.app_id='cooking-no-food' and r.name='Onion'),'piece','onion retains count unit without grams');
insert into public.cooking_groups(id,week_starts_on) values('00000000-0000-0000-0000-000000008810',1);
insert into public.cooking_group_members(user_id,group_id) values
 ('00000000-0000-0000-0000-000000008801','00000000-0000-0000-0000-000000008810'),
 ('00000000-0000-0000-0000-000000008802','00000000-0000-0000-0000-000000008810');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000008802';
select ok(public.get_ingredient_conversions(array['food-egg']) @> '[{"unit":"cup","gramsPerUnit":50,"source":{"kind":"group"}}]','group lookup includes linked cooking-only factors without exposing the private library');
select ok((public.get_cooking_recipe('cooking-no-food')->'recipes'->0->'cooking_ingredients') is not null,'authorized group recipe read carries cooking metadata');
select lives_ok($$select public.copy_cooking_recipe('{"recipeId":"cooking-no-food","idempotencyKey":"copy-cooking"}')$$,'personal copy requires no fake foods');
select is((select jsonb_array_length(cooking_ingredients) from public.meals where owner_user_id=auth.uid() and name='Cooking without weights (personal copy)'),2,'personal copy retains cooking rows');
reset role;
delete from public.cooking_group_members where user_id='00000000-0000-0000-0000-000000008802';
set local role authenticated;
select throws_ok($$select public.get_cooking_recipe('cooking-no-food')$$,'P0001',null,'leaving revokes source recipe access');
select is((select jsonb_array_length(cooking_ingredients) from public.meals where owner_user_id=auth.uid() and name='Cooking without weights (personal copy)'),2,'own copied cooking measurements survive departure');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000008803';
select throws_ok($$select public.get_cooking_recipe('cooking-no-food')$$,'P0001',null,'unrelated account cannot read cooking recipe');
set local role anon;
select throws_ok($$select public.save_recipe(pg_temp.cooking_recipe('anonymous','anonymous'))$$,'42501',null,'anonymous recipe save denied');
reset role;
select * from finish();
rollback;
