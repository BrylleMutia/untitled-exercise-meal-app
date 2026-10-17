begin;
\ir fixtures/calendar_intent.inc
select no_plan();
insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000001001','recipe-time-a@example.test'),
('00000000-0000-0000-0000-000000001002','recipe-time-b@example.test');

create function pg_temp.time_payload(recipe_id text, save_key text) returns jsonb language sql as $$
  select jsonb_build_object('meal',jsonb_build_object('id',recipe_id,'name','Timed recipe',
    'complexity','easy','notes','Prepare and serve.','servings',1,
    'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))),
    'newFoods','[]'::jsonb,'idempotencyKey',save_key);
$$;
create function pg_temp.custom_time_payload() returns jsonb language sql as $$
  select jsonb_build_object('meal',jsonb_build_object('id','time-rollback','name','Rollback recipe',
    'complexity','easy','notes','Prepare and serve.','servings',1,'totalTimeMinutes',-1,
    'ingredients',jsonb_build_array(jsonb_build_object('foodId','time-rollback-food','servings',1))),
    'newFoods',jsonb_build_array(jsonb_build_object('id','time-rollback-food','name','Custom ingredient',
      'servingLabel','100 g','servingGrams',100,'unit','g','calories',100,'proteinG',10,'carbsG',10,
      'fatG',2,'source','User entered','sourceVersion','1','valueSource','user_provided',
      'estimated',true,'confidence','medium','category','Other','preparationBasis','prepared')),
    'idempotencyKey','time-rollback');
$$;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001001';
select lives_ok($$select public.save_saved_meal(pg_temp.calendar_intent(pg_temp.time_payload('time-legacy','time-legacy')))$$,'older saved meals need no time');
select is((select total_time_minutes from public.meals where app_id='time-legacy'),null::integer,'legacy time remains unknown');
select lives_ok($$select public.save_saved_meal(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-zero','time-zero'),'{meal,totalTimeMinutes}','0')))$$,'explicit zero saves');
select is((select total_time_minutes from public.meals where app_id='time-zero'),0,'zero stays numeric');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-author'),'{meal,totalTimeMinutes}','30')))$$,'authoring persists time');
select is((select total_time_minutes from public.meals where app_id='time-author'),30,'whole-recipe minutes persist');
select is((select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-author'),'{meal,totalTimeMinutes}','30')))->>'replayed'),'true','same submission replays');
select is((select count(*)::integer from public.meals where app_id='time-author'),1,'retries create one recipe');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-author'),'{meal,totalTimeMinutes}','31')))$$,'P0001',null,'retry key cannot change time');
select lives_ok($$select public.save_saved_meal(pg_temp.calendar_intent(pg_temp.time_payload('time-author','time-omit')))$$,'legacy edits may omit time');
select is((select total_time_minutes from public.meals where app_id='time-author'),30,'omission preserves stored time');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-clear'),'{meal,totalTimeMinutes}','null')))$$,'explicit null clears time');
select is((select total_time_minutes from public.meals where app_id='time-author'),null::integer,'cleared time becomes unknown');
select lives_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-update'),'{meal,totalTimeMinutes}','45')))$$,'time can be edited');
select is((select total_time_minutes from public.meals where app_id='time-author'),45,'updated minutes persist');
select lives_ok($$select public.save_saved_meal(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-max','time-max'),'{meal,totalTimeMinutes}','2147483647')))$$,'maximum integer is supported');
select is((select total_time_minutes from public.meals where app_id='time-max'),2147483647,'maximum value remains exact');

select throws_ok(format('select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload(%L,%L),''{meal,totalTimeMinutes}'',%L::jsonb)))','time-invalid-'||label,'time-invalid-'||label,value),'P0001',null,'authoring rejects '||label)
from (values ('negative','-1'),('fraction','1.5'),('overflow','2147483648'),('text','"30"'),('boolean','true'),('array','[]'),('object','{}')) bad(label,value);
select throws_ok(format('select public.save_saved_meal(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload(%L,%L),''{meal,totalTimeMinutes}'',%L::jsonb)))','time-invalid-saved-'||label,'time-invalid-saved-'||label,value),'P0001',null,'saved-meal path rejects '||label)
from (values ('negative','-1'),('fraction','1.5'),('overflow','2147483648'),('text','"30"'),('boolean','true'),('array','[]'),('object','{}')) bad(label,value);
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(pg_temp.custom_time_payload()))$$,'P0001',null,'late time validation rolls back the recipe transaction');
select is((select count(*)::integer from public.foods where app_id='time-rollback-food'),0,'invalid time leaves no pending custom food');
select is((select count(*)::integer from public.meals where app_id='time-rollback'),0,'invalid time leaves no recipe');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-stale')||jsonb_build_object('expectedVersions',jsonb_build_object('recordRevision',999)),'{meal,totalTimeMinutes}','60')))$$,'P0001',null,'stale edit cannot change time');
select is((select total_time_minutes from public.meals where app_id='time-author'),45,'stale edit preserves saved time');
select lives_ok($$select public.save_saved_meal(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-copy','time-copy'),'{meal,totalTimeMinutes}',(select to_jsonb(total_time_minutes) from public.meals where app_id='time-author'))))$$,'duplication saves copied time');
select is((select total_time_minutes from public.meals where app_id='time-copy'),45,'duplicate retains duration');
select is((select m->>'total_time_minutes' from jsonb_array_elements(public.export_account_data('{"idempotencyKey":"time-export"}'::jsonb)->'data'->'savedMeals') m where m->>'app_id'='time-author'),'45','account export includes recipe time');

set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000001002';
select is((select count(*)::integer from public.meals where app_id='time-author'),0,'another account cannot read recipe time');
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-cross-recipe'),'{meal,totalTimeMinutes}','60')))$$,'P0001',null,'another account cannot change time through authoring');
select throws_ok($$select public.save_saved_meal(pg_temp.calendar_intent(jsonb_set(pg_temp.time_payload('time-author','time-cross-meal'),'{meal,totalTimeMinutes}','60')))$$,'P0001',null,'another account cannot change time through saved meals');
select throws_ok($$update public.meals set total_time_minutes=60 where app_id='time-author'$$,'42501',null,'direct writes remain denied');
set local role anon;
select throws_ok($$select public.save_recipe(pg_temp.calendar_intent('{}'::jsonb))$$,'42501',null,'anonymous authoring remains denied');
select throws_ok($$select public.save_saved_meal(pg_temp.calendar_intent('{}'::jsonb))$$,'42501',null,'anonymous meal saving remains denied');
select * from finish();
rollback;
