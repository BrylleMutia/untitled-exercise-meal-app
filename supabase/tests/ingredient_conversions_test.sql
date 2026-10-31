begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000007701','conversion-owner@example.test'),
 ('00000000-0000-0000-0000-000000007702','conversion-peer@example.test'),
 ('00000000-0000-0000-0000-000000007703','conversion-outsider@example.test');
create function pg_temp.conversion_recipe(p_id text,p_key text,p_factor numeric default 200) returns jsonb language sql as $$
 select pg_temp.calendar_intent(jsonb_build_object('meal',jsonb_build_object('id',p_id,'name','Conversion recipe '||p_id,'servings',2,'complexity','medium','notes','Prepare safely.',
 'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',100/serving_grams,'cookingMeasurement',
 jsonb_build_object('kind','amount','quantity',100,'unit','g','gramsPerUnit',1,'conversionBases',jsonb_build_array(jsonb_build_object('unit','cup','gramsPerUnit',p_factor),jsonb_build_object('unit','piece','gramsPerUnit',50)))))),
 'newFoods','[]'::jsonb,'idempotencyKey',p_key)) from public.foods where app_id='food-egg' and is_system;
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000007701';
select lives_ok($$select public.save_recipe(pg_temp.conversion_recipe('conversion-one','conversion-one'))$$,'save learns completed alternate bases atomically');
select is((select count(*) from public.ingredient_conversions),2::bigint,'all non-mass alternate conversions remembered');
select is((select jsonb_array_length(cooking_measurement->'conversionBases') from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='conversion-one'),2,'recipe retains both alternate bases');
select lives_ok($$select public.save_recipe(pg_temp.conversion_recipe('conversion-one','conversion-one'))$$,'same recipe intent replays');
select is((select count(*) from public.ingredient_conversions),2::bigint,'retry does not duplicate library');
select lives_ok($$select public.save_recipe(pg_temp.conversion_recipe('conversion-two','conversion-two',201))$$,'different confirmed factor remains available');
select is((select count(*) from public.ingredient_conversions where unit='cup'),2::bigint,'conflicting saved factors are not overwritten');
select lives_ok($$select public.save_recipe(pg_temp.conversion_recipe('conversion-three','conversion-three',200.00001))$$,'equivalent factor is accepted');
select is((select count(*) from public.ingredient_conversions where unit='cup'),2::bigint,'relative tolerance deduplicates equivalent factors');
select throws_ok($$select public.save_recipe(pg_temp.conversion_recipe('invalid-conversion','invalid-conversion',0))$$,'P0001',null,'invalid alternate weight rejects recipe');
select is((select count(*) from public.meals where app_id='invalid-conversion'),0::bigint,'invalid conversion leaves no partial recipe');
select is((select count(*) from public.ingredient_conversions),3::bigint,'failed recipe does not teach library');
select ok((select public.get_ingredient_conversions(array['food-egg']) @> '[{"foodId":"food-egg","unit":"cup","gramsPerUnit":200,"source":{"kind":"personal"}}]'),'focused RPC returns matching own food conversion');
select is(public.get_ingredient_conversions(array['not-a-visible-food']),'[]'::jsonb,'unknown food returns no inferred name match');
select throws_ok($$select public.get_ingredient_conversions(array_fill('food-egg'::text,array[101]))$$,'P0001',null,'lookup rejects unbounded food batches');
select throws_ok($$insert into public.ingredient_conversions(user_id,food_key,food_identity,unit,grams_per_unit,source_recipe_id,source_recipe_name) values(auth.uid(),'x','[]','cup',5,'x','x')$$,'42501',null,'direct library writes denied');
select throws_ok($$select private.get_ingredient_conversions(array['food-egg'])$$,'42501',null,'private lookup implementation is not a client API');
select ok((public.export_account_data('{"idempotencyKey":"conversion-export"}')->'data'->'ingredientConversions') @> '[{"unit":"cup","grams_per_unit":200}]','account export contains retained conversion facts');
reset role;
update public.meals set archived_at=now() where app_id='conversion-one';
delete from public.meals where app_id='conversion-one';
set local role authenticated;
select ok(public.get_ingredient_conversions(array['food-egg']) @> '[{"unit":"cup","gramsPerUnit":200,"source":{"kind":"personal"}}]','learned conversion survives source recipe deletion');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000007702';
select is((select count(*) from public.ingredient_conversions),0::bigint,'peer cannot read another personal library');
select ok(not public.get_ingredient_conversions(array['food-egg']) @> '[{"unit":"cup","gramsPerUnit":201}]','unrelated account cannot look up private recipes');
reset role;
insert into public.cooking_groups(id,week_starts_on) values('00000000-0000-0000-0000-000000007710',1);
insert into public.cooking_group_members(user_id,group_id) values
 ('00000000-0000-0000-0000-000000007701','00000000-0000-0000-0000-000000007710'),
 ('00000000-0000-0000-0000-000000007702','00000000-0000-0000-0000-000000007710');
set local role authenticated;
select ok(public.get_ingredient_conversions(array['food-egg']) @> '[{"unit":"cup","gramsPerUnit":201,"source":{"kind":"group"}}]','member reads alternate bases from accessible active shared recipes');
select ok(not public.get_ingredient_conversions(array['food-egg']) @> '[{"unit":"cup","gramsPerUnit":200,"source":{"kind":"personal"}}]','sharing does not expose private retained library');
reset role;
do $provider_fixture$
declare source_food bigint; target_food bigint; source_recipe bigint; ingredient public.meal_ingredients;
begin
 select private.cooking_copy_row('foods',row_id,'{"app_id":"conversion-provider-source","owner_user_id":"00000000-0000-0000-0000-000000007701","is_system":false,"fdc_id":"999991","source_version":"conversion-v1","provider_revision":"revision-1","record_type":"test","preparation_basis":"raw"}') into source_food from public.foods where app_id='food-egg';
 target_food:=private.cooking_copy_row('foods',source_food,'{"app_id":"conversion-provider-target","owner_user_id":"00000000-0000-0000-0000-000000007702","provider_revision":"revision-2"}');
 select private.cooking_copy_row('meals',row_id,'{"app_id":"conversion-provider-recipe","name":"Provider basis recipe"}') into source_recipe from public.meals where app_id='conversion-two';
 select i.* into ingredient from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id='conversion-two';
 perform private.cooking_copy_row('meal_ingredients',ingredient.row_id,jsonb_build_object('meal_row_id',source_recipe,'food_row_id',source_food,'cooking_measurement','{"kind":"amount","quantity":100,"unit":"g","gramsPerUnit":1,"conversionBases":[{"unit":"cup","gramsPerUnit":77.5}]}'::jsonb));
end;
$provider_fixture$;
set local role authenticated;
select is(public.get_ingredient_conversions(array['conversion-provider-target']),'[]'::jsonb,'provider revision mismatch does not borrow a shared conversion');
reset role;
update public.foods set provider_revision='revision-1',preparation_basis='cooked' where app_id='conversion-provider-target';
set local role authenticated;
select is(public.get_ingredient_conversions(array['conversion-provider-target']),'[]'::jsonb,'cooked food never borrows raw-food density');
reset role;
update public.foods set preparation_basis='raw' where app_id='conversion-provider-target';
set local role authenticated;
select ok(public.get_ingredient_conversions(array['conversion-provider-target']) @> '[{"unit":"cup","gramsPerUnit":77.5,"source":{"kind":"group"}}]','matching exact provider revision and preparation can reuse a shared conversion');
reset role;
update public.foods set snapshot_fdc_id=fdc_id,fdc_id=null where app_id='conversion-provider-target';
set local role authenticated;
select ok(public.get_ingredient_conversions(array['conversion-provider-target']) @> '[{"unit":"cup","gramsPerUnit":77.5}]','frozen provider snapshots match their original source identity');
select lives_ok($$select public.copy_cooking_recipe('{"recipeId":"conversion-two","idempotencyKey":"conversion-personal-copy"}')$$,'explicit personal copy learns its saved conversions');
select is((select count(*) from public.ingredient_conversions where unit='cup' and grams_per_unit=201),1::bigint,'personal copy remembers the conversion');
reset role;
delete from public.cooking_group_members where user_id='00000000-0000-0000-0000-000000007702';
set local role authenticated;
select ok(not public.get_ingredient_conversions(array['food-egg']) @> '[{"source":{"kind":"group"}}]','leaving revokes live shared lookup');
select ok(public.get_ingredient_conversions(array(select f.app_id from public.foods f join public.meal_ingredients i on i.food_row_id=f.row_id join public.meals m on m.row_id=i.meal_row_id where m.owner_user_id=auth.uid() and m.name like '%(personal copy)')) @> '[{"unit":"cup","gramsPerUnit":201,"source":{"kind":"personal"}}]','explicitly copied values remain personal after leaving');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000007703';
select is((select count(*) from public.ingredient_conversions),0::bigint,'outsider reads no conversion library rows');
set local role anon;
select throws_ok($$select public.get_ingredient_conversions(array['food-egg'])$$,'42501',null,'anonymous lookup denied');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000007702';
select lives_ok($$select public.delete_account('{"idempotencyKey":"conversion-delete-account"}')$$,'authorized account deletion succeeds');
reset role;
select ok(not private.valid_cooking_measurement('{"kind":"amount","unit":"g","quantity":1,"conversionBases":[{"unit":"made-up","gramsPerUnit":2}]}'),'unknown alternate unit denied');
select ok(not private.valid_cooking_measurement('{"kind":"amount","unit":"g","quantity":1,"conversionBases":[{"unit":"cup","gramsPerUnit":2,"extra":true}]}'),'extra alternate payload fields denied');
select is((select count(*) from public.ingredient_conversions where user_id='00000000-0000-0000-0000-000000007702'),0::bigint,'account deletion clears its permanent library');
select * from finish();
rollback;
