begin;
select no_plan();
insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000003001','recipe-cover-a@example.test'),
('00000000-0000-0000-0000-000000003002','recipe-cover-b@example.test');
create function pg_temp.cover_payload(recipe_id text, save_key text, cover jsonb) returns jsonb language sql as $$
  select jsonb_build_object('meal',jsonb_build_object('id',recipe_id,'name','Cover recipe','complexity','easy','notes','Prepare and serve.',
    'servings',1,'image',cover,'ingredients',jsonb_build_array(jsonb_build_object('foodId','food-egg','servings',1))),
    'newFoods','[]'::jsonb,'idempotencyKey',save_key);
$$;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000003001';
select lives_ok($$select public.save_recipe(pg_temp.cover_payload('cover-url','cover-url','{"kind":"url","url":"https://example.com/cover.webp"}'))$$,'HTTPS covers save atomically');
select is((select image->>'url' from public.meals where app_id='cover-url'),'https://example.com/cover.webp','URL persists');
select lives_ok($$select public.save_recipe(pg_temp.cover_payload('cover-url','cover-default','null'))$$,'explicit default resets cover');
select is((select image from public.meals where app_id='cover-url'),null::jsonb,'default is null');
select throws_ok(format('select public.save_recipe(pg_temp.cover_payload(%L,%L,%L::jsonb))','bad-'||label,'bad-'||label,cover),'P0001',null,'invalid cover rejected: '||label)
from (values ('http','{"kind":"url","url":"http://example.com/a"}'),('credential','{"kind":"url","url":"https://user:pass@example.com/a"}'),('unknown','{"kind":"other"}'),('cross-path','{"kind":"upload","path":"00000000-0000-0000-0000-000000003002/00000000-0000-0000-0000-000000000001.webp"}')) bad(label,cover);
select lives_ok($$select public.register_recipe_image('{"uploadId":"00000000-0000-0000-0000-000000000001","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')$$,'owner registers stable upload');
select lives_ok($$select public.register_recipe_image('{"uploadId":"00000000-0000-0000-0000-000000000001","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')$$,'same image upload retries');
select throws_ok($$select public.register_recipe_image('{"uploadId":"00000000-0000-0000-0000-000000000001","checksum":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}')$$,'P0001',null,'retry cannot swap content');
select throws_ok($$select public.save_recipe(pg_temp.cover_payload('cover-upload','cover-upload-missing','{"kind":"upload","path":"00000000-0000-0000-0000-000000003001/00000000-0000-0000-0000-000000000001.webp"}'))$$,'P0001',null,'missing storage object cannot attach');
select throws_ok($$select public.claim_recipe_image_cleanup('{"mode":"account"}')$$,'P0001',null,'client cannot claim attached images for account deletion');
select throws_ok($$select public.claim_recipe_image_cleanup('{}')$$,'P0001',null,'missing cleanup mode rejected');
select throws_ok($$select public.claim_deleted_recipe_images('{}')$$,'42501',null,'authenticated clients cannot drain deletion jobs');
select throws_ok($$update public.meals set image=null where app_id='cover-url'$$,'42501',null,'direct image writes denied');

reset role;
insert into storage.objects(bucket_id,name,owner,owner_id) values ('recipe-covers','00000000-0000-0000-0000-000000003001/00000000-0000-0000-0000-000000000001.webp','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000003001');
set local role authenticated;
select lives_ok($$select public.save_recipe(pg_temp.cover_payload('cover-upload','cover-upload','{"kind":"upload","path":"00000000-0000-0000-0000-000000003001/00000000-0000-0000-0000-000000000001.webp"}'))$$,'registered storage cover attaches');
select is(public.recipe_image_access('00000000-0000-0000-0000-000000003001/00000000-0000-0000-0000-000000000001.webp',false),true,'owner can read attached cover');
select is(public.recipe_image_access('00000000-0000-0000-0000-000000003001/00000000-0000-0000-0000-000000000001.webp',true),false,'attached image cannot be overwritten');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000003002';
select is(public.recipe_image_access('00000000-0000-0000-0000-000000003001/00000000-0000-0000-0000-000000000001.webp',false),false,'cross-user storage read denied');
select is((select count(*)::integer from storage.objects where bucket_id='recipe-covers'),0,'RLS hides another owner cover');
set local role anon;
select throws_ok($$select public.register_recipe_image('{}')$$,'42501',null,'anonymous upload registration denied');

reset role;
-- Simulate a late account-deletion failure: the subtransaction must restore
-- both the account and its image ownership, with no committed cleanup job.
create function pg_temp.failed_cover_deletion() returns void language plpgsql as $$
begin
  delete from auth.users where id='00000000-0000-0000-0000-000000003001';
  raise exception 'simulated deletion failure';
end;
$$;
select throws_ok($$select pg_temp.failed_cover_deletion()$$,'P0001','simulated deletion failure','failed deletion rolls back cleanup queue');
select is((select count(*)::integer from auth.users where id='00000000-0000-0000-0000-000000003001'),1,'account survives failed deletion');
select is((select count(*)::integer from private.deleted_recipe_images),0,'failed deletion queues no media removal');
select is((select owner_id from storage.objects where bucket_id='recipe-covers'),'00000000-0000-0000-0000-000000003001','failed deletion preserves cover ownership');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000003001';
select lives_ok($$select public.delete_account('{"confirmation":"DELETE","idempotencyKey":"cover-delete-account"}')$$,'account deletion commits with a cover');
reset role;
select is((select count(*)::integer from private.deleted_recipe_images),1,'committed deletion queues Storage removal');
select is((select owner_id from storage.objects where bucket_id='recipe-covers'),null::text,'committed deletion releases Storage ownership');
select is((select count(*)::integer from storage.objects where bucket_id='recipe-covers'),1,'database never deletes Storage metadata');
select * from finish();
rollback;
