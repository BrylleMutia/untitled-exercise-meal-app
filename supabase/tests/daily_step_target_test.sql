begin;
select no_plan();
select has_column('public', 'profiles', 'daily_step_target', 'profile owns the optional daily step target');
select col_type_is('public', 'profiles', 'daily_step_target', 'integer', 'target is an integer');
select col_is_null('public', 'profiles', 'daily_step_target', 'legacy profiles may have no target');
select ok(not has_function_privilege('anon', 'public.set_daily_step_target(jsonb)', 'execute'), 'anonymous RPC execution is denied');
select ok(has_function_privilege('authenticated', 'public.set_daily_step_target(jsonb)', 'execute'), 'authenticated RPC execution is allowed');
select ok(not has_function_privilege('authenticated', 'private.set_daily_step_target(jsonb)', 'execute'), 'internal mutation is not directly callable');
select ok(not has_function_privilege('authenticated', 'private.resolve_daily_step_target(jsonb,integer)', 'execute'), 'internal validation is not directly callable');

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000004001','target-a@example.test'),
 ('00000000-0000-0000-0000-000000004002','target-b@example.test'),
 ('00000000-0000-0000-0000-000000004003','target-onboarding@example.test');
insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal,eligibility_status)
values ('00000000-0000-0000-0000-000000004001','Target A',30,'female',168,68,'metric','beginner',array['none'],3,30,'maintain','unsupported'),
 ('00000000-0000-0000-0000-000000004002','Target B',30,'female',168,68,'metric','beginner',array['none'],3,30,'maintain','unsupported');
select is((select daily_step_target from public.profiles where id='00000000-0000-0000-0000-000000004001'),null::integer,'existing profile starts unset with no backfill');
select throws_ok($$update public.profiles set daily_step_target=0$$,'23514',null,'constraint rejects zero even at a privileged write boundary');
select throws_ok($$update public.profiles set daily_step_target=200001$$,'23514',null,'constraint rejects values above the storage ceiling');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004001';
select lives_ok($$select public.set_daily_step_target('{"target":1,"expectedRevision":1,"idempotencyKey":"target-min"}')$$,'minimum target is valid');
select is((select daily_step_target from public.profiles),1,'minimum target is saved');
select is((select revision from public.profiles),2,'target save bumps profile revision once');
select lives_ok($$select public.set_daily_step_target('{"target":1,"expectedRevision":1,"idempotencyKey":"target-min"}')$$,'retry replays against the original revision');
select is((select revision from public.profiles),2,'retry does not bump revision again');
select throws_ok($$select public.set_daily_step_target('{"target":2,"expectedRevision":1,"idempotencyKey":"target-min"}')$$,'P0001','idempotency_key_reused','changed payload cannot reuse a receipt');
select lives_ok($$select public.set_daily_step_target('{"target":200000,"expectedRevision":2,"idempotencyKey":"target-max"}')$$,'maximum target is valid');
select is((select daily_step_target from public.profiles),200000,'maximum target is saved');
select throws_ok($$select public.set_daily_step_target('{"target":8000,"expectedRevision":2,"idempotencyKey":"target-stale"}')$$,'P0001','stale_version','stale target cannot overwrite a newer preference');
select throws_ok($$select public.set_daily_step_target('{"target":0,"expectedRevision":3,"idempotencyKey":"target-zero"}')$$,'P0001',null,'zero target is rejected');
select throws_ok($$select public.set_daily_step_target('{"target":-1,"expectedRevision":3,"idempotencyKey":"target-negative"}')$$,'P0001',null,'negative target is rejected');
select throws_ok($$select public.set_daily_step_target('{"target":1.5,"expectedRevision":3,"idempotencyKey":"target-fraction"}')$$,'P0001','validation_failed','fractional target is rejected');
select throws_ok($$select public.set_daily_step_target('{"target":200001,"expectedRevision":3,"idempotencyKey":"target-large"}')$$,'P0001',null,'out-of-range target is rejected');
select throws_ok($$select public.set_daily_step_target('{"target":"NaN","expectedRevision":3,"idempotencyKey":"target-nan"}')$$,'P0001',null,'non-finite target is rejected');
select throws_ok($$select public.set_daily_step_target('{"target":"Infinity","expectedRevision":3,"idempotencyKey":"target-infinity"}')$$,'P0001',null,'infinite target is rejected');
select throws_ok($$select public.set_daily_step_target('{"target":"8000","expectedRevision":3,"idempotencyKey":"target-string"}')$$,'P0001',null,'numeric strings are not the typed target contract');
select throws_ok($$select public.set_daily_step_target('{"expectedRevision":3,"idempotencyKey":"target-omitted"}')$$,'P0001',null,'dedicated target mutation requires an explicit value or null');
select throws_ok($$select public.set_daily_step_target('{"target":8000,"expectedRevision":3.1,"idempotencyKey":"revision-fraction"}')$$,'P0001','validation_failed','fractional revision is rejected');
select throws_ok($$select public.set_daily_step_target('{"target":8000,"expectedRevision":0,"idempotencyKey":"revision-zero"}')$$,'P0001',null,'invalid revision is rejected');
select throws_ok($$update public.profiles set daily_step_target=8000$$,'42501',null,'direct owner writes are denied');
select lives_ok($$select public.set_daily_step_target('{"target":null,"expectedRevision":3,"idempotencyKey":"target-clear"}')$$,'null explicitly clears the target');
select is((select daily_step_target from public.profiles),null::integer,'cleared target is unset');

select lives_ok($$select public.save_daily_steps(jsonb_build_object('date',current_date::text,'steps',6500,'walkingMinutes',35,'expectedRevision',0,'idempotencyKey','target-observation'))$$,'saved activity remains separate');
select lives_ok($$select public.set_daily_step_target('{"target":8000,"expectedRevision":4,"idempotencyKey":"target-reset"}')$$,'new preference can be chosen independently');
select is((select steps from public.daily_step_entries),6500,'target change preserves the saved count');
select is((select walking_minutes from public.daily_step_entries),35,'target change preserves saved walking time');
select is((select public.export_account_data('{"idempotencyKey":"target-export"}')->'data'->'profile'->>'daily_step_target'),'8000','existing profile-row export includes the target');

select lives_ok($$select public.update_profile(jsonb_build_object('profileOnly',true,'profile',jsonb_build_object('name','Target A renamed','age',30,'sex','female','heightCm',168,'weightKg',68,'units','metric','experience','beginner','equipment',jsonb_build_array('none'),'daysPerWeek',3,'sessionMinutes',30,'goal','maintain','dietaryPattern','','allergies',jsonb_build_array(),'foodPreferences',jsonb_build_array()),'expectedVersions',jsonb_build_object('profileRevision',(select revision from public.profiles)),'idempotencyKey','target-old-client'))$$,'older profile payload without the target is accepted');
select is((select daily_step_target from public.profiles),8000,'omitted preference is preserved by profile-only update');
select lives_ok($$select public.update_profile(jsonb_build_object('profileOnly',true,'profile',jsonb_build_object('name','Target A renamed','age',30,'sex','female','heightCm',168,'weightKg',68,'units','metric','experience','beginner','equipment',jsonb_build_array('none'),'daysPerWeek',3,'sessionMinutes',30,'goal','maintain','dietaryPattern','','allergies',jsonb_build_array(),'foodPreferences',jsonb_build_array(),'dailyStepTarget',null),'expectedVersions',jsonb_build_object('profileRevision',(select revision from public.profiles)),'idempotencyKey','target-profile-clear'))$$,'explicit null in profile-only update clears the preference');
select is((select daily_step_target from public.profiles),null::integer,'profile-only null clearing persists');

set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004002';
select lives_ok($$select public.set_daily_step_target('{"target":12000,"expectedRevision":1,"userId":"00000000-0000-0000-0000-000000004001","idempotencyKey":"target-owner"}')$$,'caller identity owns the mutation regardless of client userId');
select is((select daily_step_target from public.profiles),12000,'caller can update only their own preference');
select is((select count(*)::int from public.profiles where id='00000000-0000-0000-0000-000000004001'),0,'other profile remains invisible under RLS');

set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000004003';
select lives_ok($$select public.complete_onboarding('{"profile":{"name":"Target onboarding","age":30,"sex":"female","heightCm":168,"weightKg":68,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain","targetEligibility":"unsupported","dailyStepTarget":9000},"idempotencyKey":"target-onboard"}')$$,'onboarding persists optional target atomically');
select is((select daily_step_target from public.profiles),9000,'onboarding target survives the profile transaction');
select throws_ok($$select public.complete_onboarding('{"profile":{"name":"Invalid must roll back","age":30,"sex":"female","heightCm":168,"weightKg":68,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain","targetEligibility":"unsupported","dailyStepTarget":0},"idempotencyKey":"target-onboard-invalid"}')$$,'P0001',null,'invalid target rolls back the entire profile transaction');
select is((select name from public.profiles),'Target onboarding','failed onboarding does not partially change the profile');
select lives_ok($$select public.complete_onboarding('{"profile":{"name":"Legacy onboarding","age":30,"sex":"female","heightCm":168,"weightKg":68,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain","targetEligibility":"unsupported"},"idempotencyKey":"target-onboard-legacy"}')$$,'legacy onboarding payload remains compatible');
select is((select daily_step_target from public.profiles),9000,'omitted target survives onboarding/profile bundle persistence');
select lives_ok($$select public.complete_onboarding('{"profile":{"name":"Legacy onboarding","age":30,"sex":"female","heightCm":168,"weightKg":68,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain","targetEligibility":"unsupported","dailyStepTarget":null},"idempotencyKey":"target-onboard-clear"}')$$,'onboarding supports explicit null clearing');
select is((select daily_step_target from public.profiles),null::integer,'explicit null survives onboarding persistence');

set local role anon;
select throws_ok($$select public.set_daily_step_target('{}')$$,'42501',null,'anonymous target mutation is denied');
reset role;
select is((select daily_step_target from public.profiles where id='00000000-0000-0000-0000-000000004001'),null::integer,'another caller cannot alter the first owner target');
select * from finish();
rollback;
