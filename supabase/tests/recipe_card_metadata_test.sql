begin;
select no_plan();
insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000004001','card-a@example.test'),
('00000000-0000-0000-0000-000000004002','card-b@example.test');
insert into public.meals(app_id,owner_user_id,name,servings)
select 'card-'||n,'00000000-0000-0000-0000-000000004001'::uuid,'Card recipe '||n,1 from generate_series(1,7) n;
insert into public.logged_meals(app_id,user_id,log_date,meal_slot,name,meal_row_id,source_mode)
select 'card-eaten-'||n||'-'||k,'00000000-0000-0000-0000-000000004001'::uuid,
  case when n=2 then '2026-10-11'::date else '2026-10-12'::date end,'lunch',m.name,m.row_id,'saved_meal'
from generate_series(1,6) n join public.meals m on m.app_id='card-'||n
cross join lateral generate_series(1,case when n<=2 then 5 else 7-n end) k;
-- Outside-window, future and another user's logs must not affect the ranking.
insert into public.logged_meals(app_id,user_id,log_date,meal_slot,name,meal_row_id,source_mode)
select 'card-old-'||n,'00000000-0000-0000-0000-000000004001'::uuid,'2026-09-12','lunch',m.name,m.row_id,'saved_meal'
from public.meals m cross join generate_series(1,10) n where m.app_id='card-7';
insert into public.logged_meals(app_id,user_id,log_date,meal_slot,name,meal_row_id,source_mode)
select 'card-future','00000000-0000-0000-0000-000000004001'::uuid,'2026-10-13','lunch',m.name,m.row_id,'saved_meal'
from public.meals m where m.app_id='card-7';
create function pg_temp.card_meta(recipe text) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.get_recipe_card_metadata('{"asOfDate":"2026-10-12"}')->'recipes') r where r->>'mealId'=recipe;
$$;
create function pg_temp.favorite_payload(recipe text,desired boolean,version integer,key text) returns jsonb language sql as $$
  select jsonb_build_object('mealId',recipe,'favorite',desired,'expectedRevision',version,'idempotencyKey',key,'asOfDate','2026-10-12');
$$;
create function pg_temp.card_recipe(recipe text,key text) returns jsonb language sql as $$
  select jsonb_build_object('meal',jsonb_build_object('id',recipe,'name','Complexity recipe','notes','Serve.',
    'servings',1,'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))),
    'newFoods','[]'::jsonb,'idempotencyKey',key);
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004001';
select is((pg_temp.card_meta('card-1')->>'popularRank')::integer,1,'most recent eaten date resolves usage ties');
select is((pg_temp.card_meta('card-2')->>'popularRank')::integer,2,'older tied meal ranks second');
select is((pg_temp.card_meta('card-1')->>'usageCount')::integer,5,'counts grouped eaten records once');
select is((select count(*)::integer from jsonb_array_elements(public.get_recipe_card_metadata('{"asOfDate":"2026-10-12"}')->'recipes') r where r ? 'popularRank'),5,'only top five receive Popular');
select ok(not (pg_temp.card_meta('card-6') ? 'popularRank'),'sixth recipe is not Popular');
select ok(not (pg_temp.card_meta('card-7') ? 'popularRank'),'outside-window and future logs do not count');
select is((pg_temp.card_meta('card-7')->>'usageCount')::integer,0,'outside-window and future usage is zero');
select is((pg_temp.card_meta('card-6')->>'usageCount')::integer,1,'non-Popular recipe retains truthful positive usage');
select is((select count(*)::integer from jsonb_array_elements(public.get_recipe_card_metadata('{"asOfDate":"2026-09-13"}')->'recipes') r where r ? 'popularRank'),1,'fewer than five eligible recipes returns only positive usage');
select is((select count(*)::integer from jsonb_array_elements(public.get_recipe_card_metadata('{"asOfDate":"2026-09-11"}')->'recipes') r where r ? 'popularRank'),0,'no eaten recipes returns no Popular badges');
select lives_ok($$select public.set_recipe_favorite(pg_temp.favorite_payload('card-1',true,0,'card-favorite-1'))$$,'favorite saves through RPC');
select is(pg_temp.card_meta('card-1')->>'favorite','true','favorite state persists');
select is(pg_temp.card_meta('card-1')->>'popularRank','1','favorite does not change usage rank');
select lives_ok($$select public.set_recipe_favorite(pg_temp.favorite_payload('card-1',true,0,'card-favorite-1'))$$,'retry with same key is idempotent');
select is((pg_temp.card_meta('card-1')->>'favoriteRevision')::integer,1,'retry does not increase favorite version');
select throws_ok($$select public.set_recipe_favorite(pg_temp.favorite_payload('card-1',false,0,'card-stale'))$$,'P0001',null,'stale favorite version is rejected');
select lives_ok($$select public.set_recipe_favorite(pg_temp.favorite_payload('card-1',false,1,'card-unfavorite'))$$,'favorite can be removed');
select is((pg_temp.card_meta('card-1')->>'favoriteRevision')::integer,2,'removal keeps concurrency history');
select is(pg_temp.card_meta('card-1')->>'favorite','false','removal persists');
select throws_ok($$insert into public.recipe_favorites(user_id,meal_row_id) select auth.uid(),row_id from public.meals limit 1$$,'42501',null,'direct favorite writes denied');
select throws_ok($$select public.save_recipe(pg_temp.card_recipe('card-unknown','card-unknown'))$$,'P0001',null,'authoring requires complexity');
select lives_ok($$select public.save_saved_meal(pg_temp.card_recipe('card-legacy','card-legacy'))$$,'legacy saves remain compatible');
select is((select complexity from public.meals where app_id='card-legacy'),'medium','legacy recipes default to Medium');
select lives_ok($$select public.save_recipe(jsonb_set(pg_temp.card_recipe('card-authored','card-authored'),'{meal,complexity}','"medium"'))$$,'authoring saves manual complexity');
select is((select complexity from public.meals where app_id='card-authored'),'medium','manual complexity persists');
select lives_ok($$select public.save_saved_meal(pg_temp.card_recipe('card-authored','card-omit'))$$,'legacy mutation can omit complexity');
select is((select complexity from public.meals where app_id='card-authored'),'medium','omission preserves authored complexity');
select throws_ok($$select public.save_recipe(jsonb_set(pg_temp.card_recipe('card-invalid','card-invalid'),'{meal,complexity}','"automatic"'))$$,'P0001',null,'unsupported complexity rejected');
select ok((public.export_account_data('{"idempotencyKey":"card-export"}')->'data') ? 'recipeFavorites','account export includes favorites');
reset role;
insert into public.logged_meals(app_id,user_id,log_date,meal_slot,name,meal_row_id,source_mode)
select 'card-boundary','00000000-0000-0000-0000-000000004001'::uuid,'2026-09-13','lunch',m.name,m.row_id,'saved_meal' from public.meals m where m.app_id='card-7';
update public.meals set archived_at=now() where app_id='card-1';
set local role authenticated;
select is(pg_temp.card_meta('card-1'),null::jsonb,'archived recipe excluded');
select is((pg_temp.card_meta('card-2')->>'popularRank')::integer,1,'archival refreshes rankings');
select is((pg_temp.card_meta('card-7')->>'usageCount')::integer,1,'inclusive thirty-day boundary retained in read model');
reset role;
update public.logged_meals set log_date='2026-10-12' where meal_row_id=(select row_id from public.meals where app_id='card-2');
insert into public.logged_meals(app_id,user_id,log_date,meal_slot,name,meal_row_id,source_mode)
select 'card-tied-'||n,'00000000-0000-0000-0000-000000004001'::uuid,'2026-10-12','lunch',m.name,m.row_id,'saved_meal'
from public.meals m cross join generate_series(1,1) n where m.app_id='card-3';
set local role authenticated;
select is((pg_temp.card_meta('card-2')->>'popularRank')::integer,1,'stable recipe ID breaks equal count and date ties');
select is((pg_temp.card_meta('card-3')->>'popularRank')::integer,2,'tied recipe with later identity ranks next');
reset role;
delete from public.logged_meals where meal_row_id=(select row_id from public.meals where app_id='card-2');
set local role authenticated;
select ok(not (pg_temp.card_meta('card-2') ? 'popularRank'),'deleted eaten records remove Popular status');
select is((pg_temp.card_meta('card-2')->>'usageCount')::integer,0,'deleted records remove usage count');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004002';
select is((select count(*)::integer from public.recipe_favorites),0,'another user cannot read favorites');
select is(pg_temp.card_meta('card-2'),null::jsonb,'another user cannot read owned recipe metadata');
select throws_ok($$select public.set_recipe_favorite(pg_temp.favorite_payload('card-2',true,0,'card-cross-user'))$$,'P0001',null,'another user cannot favorite a private recipe');
select lives_ok($$select public.set_recipe_favorite(pg_temp.favorite_payload('meal-creamy-lemon-chicken',true,0,'card-catalog'))$$,'active catalog recipe can be personally favorited');
select is((select count(*)::integer from public.recipe_favorites),1,'second user owns a real favorite before deletion');
set local role anon;
select throws_ok($$select public.get_recipe_card_metadata('{"asOfDate":"2026-10-12"}')$$,'42501',null,'anonymous usage read denied');
select throws_ok($$select public.set_recipe_favorite('{}')$$,'42501',null,'anonymous favorite mutation denied');
select throws_ok($$select * from public.recipe_favorites$$,'42501',null,'anonymous table read denied');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-000000004002';
select is((select count(*)::integer from public.recipe_favorites where user_id='00000000-0000-0000-0000-000000004002'),0,'deleted accounts retain no favorite metadata');
select * from finish();
rollback;
