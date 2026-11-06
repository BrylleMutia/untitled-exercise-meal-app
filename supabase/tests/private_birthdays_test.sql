begin;
\ir fixtures/calendar_intent.inc
select no_plan();
select has_column('public','profiles','birth_date','owner profile stores optional birthday');
select col_is_null('public','profiles','birth_date','legacy profiles need no birthday');
select is(private.birth_date_age('2000-02-29','2025-02-28'),24,'leap birthday waits until March 1');
select is(private.birth_date_age('2000-02-29','2025-03-01'),25,'leap birthday advances on March 1');
select is(private.birth_date_age('2008-11-06','2026-11-06'),18,'exact adult boundary');
select is(private.birth_date_age('1925-11-07','2026-11-06'),100,'completed years support age 100');
select ok(not has_function_privilege('authenticated','private.persist_birth_date(jsonb)','execute'),'private helper is inaccessible');
select ok(not has_table_privilege('authenticated','public.profiles','update'),'profile direct writes denied');
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000009601','birthday-a@example.test'),
 ('00000000-0000-0000-0000-000000009602','birthday-b@example.test');
create function pg_temp.birthday_payload(extra jsonb default '{}') returns jsonb language sql as $$
 select pg_temp.calendar_intent(jsonb_build_object('effectiveDate','2026-11-06','profile',
   jsonb_build_object('name','Birthday owner','age',30,'birthDate','1996-01-01','sex','female','heightCm',168,'weightKg',68,
   'units','metric','experience','beginner','equipment',jsonb_build_array('none'),'daysPerWeek',3,'sessionMinutes',30,
   'goal','maintain','dietaryPattern','','allergies',jsonb_build_array(),'foodPreferences',jsonb_build_array(),
   'targetEligibility','unsupported','eligibilityVersion','calicoach-eligibility-v1') || coalesce(extra->'profile','{}'),
   'idempotencyKey',coalesce(extra->>'idempotencyKey','birthday-first')) || (extra-'profile'));
$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009601';
select lives_ok($$select public.complete_onboarding(pg_temp.birthday_payload())$$,'onboarding saves valid birthday');
select is((select birth_date::text from public.profiles),'1996-01-01','birthday persists on owner row');
select is(public.complete_onboarding(pg_temp.birthday_payload())->>'replayed','true','duplicate submission replays');
select throws_ok($$select public.complete_onboarding(pg_temp.birthday_payload('{"profile":{"birthDate":"2000-02-30"},"idempotencyKey":"invalid-date"}'))$$,'P0001',null,'impossible date rejected');
select throws_ok($$select public.complete_onboarding(pg_temp.birthday_payload('{"profile":{"birthDate":"1996-1-1"},"idempotencyKey":"malformed-date"}'))$$,'P0001',null,'noncanonical date rejected');
select throws_ok($$select public.complete_onboarding(pg_temp.birthday_payload('{"profile":{"age":29},"idempotencyKey":"conflicting-age"}'))$$,'P0001',null,'conflicting age rejected');
select throws_ok($$select public.complete_onboarding(pg_temp.birthday_payload('{"profile":{"birthDate":"2027-01-01"},"idempotencyKey":"future-date"}'))$$,'P0001',null,'future birthday rejected');
select throws_ok($$select public.complete_onboarding(pg_temp.birthday_payload('{"profile":{"birthDate":"2008-11-07","age":18},"idempotencyKey":"too-young"}'))$$,'P0001',null,'one day short of 18 rejected');
select throws_ok($$select public.complete_onboarding(pg_temp.birthday_payload('{"profile":{"birthDate":"1925-11-06","age":100},"idempotencyKey":"too-old"}'))$$,'P0001',null,'age 101 rejected');
select is((select birth_date::text from public.profiles),'1996-01-01','failed mutations preserve birthday');
select lives_ok($$select public.update_profile(pg_temp.birthday_payload('{"profileOnly":true,"profile":{"name":"Renamed"},"expectedVersions":{"profileRevision":2},"idempotencyKey":"birthday-rename"}'))$$,'metadata edit preserves birthday');
select throws_ok($$select public.update_profile(pg_temp.birthday_payload('{"profileOnly":true,"expectedVersions":{"profileRevision":1},"idempotencyKey":"birthday-stale"}'))$$,'P0001',null,'stale profile revision denied');
select lives_ok($$select public.update_profile(jsonb_set(pg_temp.birthday_payload('{"profileOnly":true,"idempotencyKey":"birthday-old-client"}'),'{profile}',(pg_temp.birthday_payload()->'profile')-'birthDate'))$$,'older client may omit birthday');
select is((select birth_date::text from public.profiles),'1996-01-01','omission preserves stored birthday');
select is(public.export_account_data('{"idempotencyKey":"birthday-export"}')->'data'->'profile'->>'birth_date','1996-01-01','owner export contains birthday');
select lives_ok($$select public.update_profile(pg_temp.birthday_payload('{"profileOnly":true,"effectiveDate":"2027-11-06","idempotencyKey":"birthday-name-next-year"}'))$$,'metadata edit may retain age snapshot after rollover');
select is((select age::integer from public.profiles),30,'metadata edit does not refresh saved age');
select lives_ok($$select public.update_profile(pg_temp.birthday_payload('{"effectiveDate":"2027-11-06","profile":{"age":31},"idempotencyKey":"birthday-confirm-next-year"}'))$$,'explicit full update confirms current age');
select is((select age::integer from public.profiles),31,'full update uses current derived age');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000009602';
select is((select count(*)::int from public.profiles),0,'another owner cannot read birthday');
select lives_ok($$select public.complete_onboarding(pg_temp.birthday_payload('{"profile":{"name":"Other owner"},"idempotencyKey":"birthday-other-owner","userId":"00000000-0000-0000-0000-000000009601"}'))$$,'caller identity controls ownership');
select is((select name from public.profiles),'Other owner','other caller only writes own profile');
set local role anon;
select throws_ok($$select public.complete_onboarding('{}')$$,'42501',null,'anonymous onboarding denied');
reset role;
select is((select name from public.profiles where id='00000000-0000-0000-0000-000000009601'),'Birthday owner','other caller did not mutate original owner');
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.cooking_group_command('{"action":"invite","grocerySharingAcknowledgment":"all-weeks-v1","idempotencyKey":"birthday-group"}')$$,'owner can create a group');
select ok(public.get_cooking_group_week('2026-11-02')::text not like '%1996-01-01%','member response excludes birthday value');
select ok(public.get_cooking_group_week('2026-11-02')::text not like '%birth_date%','member response excludes birthday key');
reset role;
create temp table birthday_basis as select private.cooking_basis(private.cooking_group_for('00000000-0000-0000-0000-000000009602'),'2026-11-02') as value, private.cooking_group_for('00000000-0000-0000-0000-000000009602') as gid;
grant select on birthday_basis to service_role;
update public.profiles set birth_date='1996-02-02' where id='00000000-0000-0000-0000-000000009602';
select is(private.cooking_basis(private.cooking_group_for('00000000-0000-0000-0000-000000009602'),'2026-11-02'),(select value from birthday_basis),'birthday and bookkeeping changes do not invalidate group fingerprint');
set local role service_role;
set local "request.jwt.claim.role"='service_role';
select ok(public.get_group_planning_context('00000000-0000-0000-0000-000000009602',jsonb_build_object('reviewPolicyVersion','advisory_v1','groupId',(select gid from birthday_basis),'weekOf','2026-11-02','memberIds',jsonb_build_array('00000000-0000-0000-0000-000000009602'),'selectedDates',jsonb_build_array('2026-11-02'),'mode','fill','recipes','[]'::jsonb,'seed','birthday','overrides','{}'::jsonb))::text not like '%birth_date%','service planning input excludes birthday');
reset role;
select * from finish();
rollback;
