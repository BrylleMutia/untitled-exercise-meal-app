begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000001501','recipe-portions@example.test'),
 ('00000000-0000-0000-0000-000000001502','recipe-portions-other@example.test');
create function pg_temp.recipe_log(key text, recipe_id text, portion numeric) returns jsonb language sql as $$
select jsonb_build_object('name',m.name,'date','2026-10-14','slot','snack','sourceMode','saved_meal',
 'loggedMealId',key,'recipeServings',portion,'meal',jsonb_build_object('id',m.app_id,'name',m.name,'servings',m.servings),
 'ingredients',case when m.provided_nutrition is not null then jsonb_build_array(jsonb_build_object('customName',m.name,'servings',portion,'valueSource','user_provided'))
 else (select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings*portion/m.servings) order by i.ingredient_order)
   from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=m.row_id) end,
 'idempotencyKey',key) from public.meals m where m.app_id=recipe_id;
$$;
create function pg_temp.portion_edit(key text, log_id text, portion jsonb, revision integer, previous jsonb default null) returns jsonb language sql as $$
select jsonb_build_object('loggedMeal',jsonb_build_object('id',log_id),'recipeServings',portion,
 'previousRecipeServings',previous,'expectedVersions',jsonb_build_object('recordRevision',revision),'idempotencyKey',key);
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001501';
select lives_ok($$select public.save_reviewed_meal(pg_temp.calendar_intent(pg_temp.recipe_log('chicken-three','meal-creamy-lemon-chicken',3)))$$,'three chicken recipe servings log');
select is((select recipe_servings from public.logged_meals where app_id='chicken-three'),3::numeric,'actual recipe servings persisted separately');
select is((select count(*)::integer from public.nutrition_logs),6,'ingredients remain grouped snapshots');
reset role;
create temp table portion_before as select * from public.nutrition_logs;
grant select on pg_temp.portion_before to authenticated;
create temp table recipe_before as select to_jsonb(m) contents from public.meals m where app_id='meal-creamy-lemon-chicken';
-- Later catalog changes must never become historical correction nutrition.
update public.foods set calories=1 where row_id in (select food_row_id from portion_before);
update public.meals set archived_at=now(), servings=20 where app_id='meal-creamy-lemon-chicken';
set local role authenticated;
select lives_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-half','chicken-three','0.5',1))$$,'archived recipe history edits by whole-meal servings');
select is((select recipe_servings from public.logged_meals where app_id='chicken-three'),0.5::numeric,'fractional recipe portion stored');
select ok((select bool_and(n.calories=round(b.calories/6,2) and n.protein_g=round(b.protein_g/6,2)
 and n.carbs_g=round(b.carbs_g/6,2) and n.fat_g=round(b.fat_g/6,2) and abs(n.servings-b.servings/6)<=0.00051)
 from public.nutrition_logs n join pg_temp.portion_before b using(row_id)),'all saved snapshots scaled independently of changed foods');
select is((select count(*)::integer from public.nutrition_logs),6,'correction preserves child identities and count');
select is((public.update_logged_meal(pg_temp.portion_edit('chicken-half','chicken-three','0.5',1))->>'replayed'),'true','lost-response correction replay is stable');
select is((select recipe_servings from public.logged_meals where app_id='chicken-three'),0.5::numeric,'replay cannot scale twice');
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-half','chicken-three','1',2))$$,'P0001',null,'retry key cannot change intent');
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-stale','chicken-three','1',1))$$,'P0001',null,'stale revision rejected');
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-zero','chicken-three','0',2))$$,'P0001',null,'zero servings rejected');
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-negative','chicken-three','-1',2))$$,'P0001',null,'negative servings rejected');
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-string','chicken-three','"3"',2))$$,'P0001',null,'string servings rejected');
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-null','chicken-three','null',2))$$,'P0001',null,'null servings rejected');
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('chicken-large','chicken-three','10001',2))$$,'P0001',null,'oversized servings rejected');
select lives_ok($$select public.save_reviewed_meal(pg_temp.calendar_intent(pg_temp.recipe_log('beef-three','meal-korean-beef-bowl',3)))$$,'source-provided recipe logs');
select lives_ok($$select public.update_logged_meal(pg_temp.portion_edit('beef-half','beef-three','0.5',1))$$,'provided recipe servings corrected');
select is((select calories from public.nutrition_logs n join public.logged_meals l on l.row_id=n.logged_meal_row_id where l.app_id='beef-three'),280::numeric,'half provided calories exact');
select is((select protein_g from public.nutrition_logs n join public.logged_meals l on l.row_id=n.logged_meal_row_id where l.app_id='beef-three'),22.5::numeric,'half provided protein exact');
select is((select carbs_g from public.nutrition_logs n join public.logged_meals l on l.row_id=n.logged_meal_row_id where l.app_id='beef-three'),29::numeric,'half provided carbs exact');
select is((select fat_g from public.nutrition_logs n join public.logged_meals l on l.row_id=n.logged_meal_row_id where l.app_id='beef-three'),8::numeric,'half provided fat exact');
select is((public.save_reviewed_meal(pg_temp.calendar_intent(pg_temp.recipe_log('beef-three','meal-korean-beef-bowl',3)))->>'replayed'),'true','original log retry stays completed after a correction');
select is((select recipe_servings from public.logged_meals where app_id='beef-three'),0.5::numeric,'original log retry cannot overwrite corrected portion');
select throws_ok($$update public.logged_meals set recipe_servings=2 where app_id='beef-three'$$,'42501',null,'direct portion write denied');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001502';
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('foreign-edit','beef-three','1',2))$$,'P0001',null,'other account cannot edit recipe servings');
select is((select count(*)::integer from public.logged_meals),0,'other account cannot read grouped history');
set local role anon;
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('anon-edit','beef-three','1',2))$$,'42501',null,'anonymous correction denied');
reset role;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001501';
-- Legacy supplied macros and proportional ingredient logs remain recoverable.
select private.save_reviewed_meal_before_recipe_servings(pg_temp.recipe_log('legacy-beef','meal-korean-beef-bowl',3)-'recipeServings');
select is(private.infer_logged_recipe_servings((select row_id from public.logged_meals where app_id='legacy-beef')),3::numeric,'legacy provided count recovered from canonical serving food');
update public.meals set archived_at=null, servings=2 where app_id='meal-creamy-lemon-chicken';
select private.save_reviewed_meal_before_recipe_servings(pg_temp.recipe_log('legacy-chicken','meal-creamy-lemon-chicken',3)-'recipeServings');
select is(private.infer_logged_recipe_servings((select row_id from public.logged_meals where app_id='legacy-chicken')),3::numeric,'legacy ingredient portion recovered only across all ingredients');
update public.nutrition_logs set servings=servings*2 where logged_meal_row_id=(select row_id from public.logged_meals where app_id='legacy-chicken') and ingredient_order=1;
select is(private.infer_logged_recipe_servings((select row_id from public.logged_meals where app_id='legacy-chicken')),null::numeric,'non-proportional legacy portion remains unknown');
set local role authenticated;
select throws_ok($$select public.update_logged_meal(pg_temp.portion_edit('legacy-missing','legacy-chicken','1',1))$$,'P0001',null,'unknown original count requires confirmation');
select lives_ok($$select public.update_logged_meal(pg_temp.portion_edit('legacy-confirmed','legacy-chicken','1',1,'3'))$$,'owner can confirm an unknown legacy basis');
select lives_ok($$select public.update_logged_meal(pg_temp.portion_edit('legacy-beef-edit','legacy-beef','0.5',1))$$,'legacy provided count used without changing recipe');
reset role;
select ok(not has_function_privilege('authenticated','private.infer_logged_recipe_servings(bigint)','execute'),'inference helper remains private');
select * from finish();
rollback;
