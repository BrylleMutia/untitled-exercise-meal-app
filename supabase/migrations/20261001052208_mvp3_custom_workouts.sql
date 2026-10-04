create table public.custom_workout_versions (
  row_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null check (length(btrim(app_id)) between 1 and 128),
  version integer not null check (version > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id,app_id,version), unique (row_id,user_id)
);
create index custom_workout_versions_owner_latest on public.custom_workout_versions (user_id,app_id,version desc);
create table public.custom_workout_sessions (
  row_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null check (length(btrim(app_id)) between 1 and 128),
  workout_version_row_id bigint not null,
  session_date date not null,
  planned jsonb not null,
  actual jsonb not null default '[]' check (jsonb_typeof(actual) = 'array'),
  status text not null default 'in_progress' check (status in ('in_progress','paused','completed','partial','abandoned')),
  revision integer not null default 1 check (revision > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id,app_id),
  foreign key (workout_version_row_id,user_id) references public.custom_workout_versions(row_id,user_id) on delete cascade
);
create index custom_workout_sessions_owner_date on public.custom_workout_sessions (user_id,session_date desc);
create unique index custom_workout_sessions_one_active on public.custom_workout_sessions(user_id) where status in ('in_progress','paused');
alter table public.custom_workout_versions enable row level security;
alter table public.custom_workout_sessions enable row level security;
create policy custom_workout_versions_read on public.custom_workout_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy custom_workout_sessions_read on public.custom_workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.custom_workout_versions,public.custom_workout_sessions from public,anon,authenticated;
grant select on public.custom_workout_versions,public.custom_workout_sessions to authenticated;

create function private.validate_custom_workout(p_definition jsonb, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare movement jsonb; result jsonb := '[]'; ids text[] := '{}'; catalog public.exercises%rowtype;
  profile public.profiles%rowtype; duration numeric := 8; seconds numeric;
begin
  perform private.assert_json_shape(p_definition,'workout','object');
  perform private.assert_nonblank(p_definition->>'name','name',100);
  perform private.assert_json_shape(p_definition->'movements','movements','array');
  if jsonb_array_length(p_definition->'movements') not between 1 and 24 then perform private.raise_mutation_error('validation_failed','choose 1 to 24 movements'); end if;
  select * into profile from public.profiles where id = p_user_id;
  if profile.id is null then perform private.raise_mutation_error('not_found'); end if;
  for movement in select value from jsonb_array_elements(p_definition->'movements') loop
    perform private.assert_json_shape(movement,'movement','object');
    perform private.assert_nonblank(movement->>'id','movement id',128);
    if movement->>'id' = any(ids) then perform private.raise_mutation_error('validation_failed','duplicate movement id'); end if;
    ids := array_append(ids,movement->>'id');
    perform private.assert_nonblank(movement->>'name','movement name',100);
    perform private.assert_finite_number(movement->>'sets','sets',1,6);
    perform private.assert_finite_number(movement->>'restSeconds','restSeconds',15,180);
    if (movement->>'sets')::numeric <> trunc((movement->>'sets')::numeric)
      or (movement->>'restSeconds')::numeric <> trunc((movement->>'restSeconds')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if (movement->>'reps' is null) = (movement->>'holdSeconds' is null) then perform private.raise_mutation_error('validation_failed','choose reps or hold time'); end if;
    if movement->>'reps' is not null then
      perform private.assert_finite_number(movement->>'reps','reps',1,50);
      if (movement->>'reps')::numeric <> trunc((movement->>'reps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
      seconds := (movement->>'reps')::numeric * 4;
    else
      perform private.assert_finite_number(movement->>'holdSeconds','holdSeconds',5,120);
      if (movement->>'holdSeconds')::numeric <> trunc((movement->>'holdSeconds')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
      seconds := (movement->>'holdSeconds')::numeric;
    end if;
    if nullif(movement->>'exerciseId','') is not null then
      select * into catalog from public.exercises where app_id = movement->>'exerciseId';
      if catalog.row_id is null then perform private.raise_mutation_error('not_found','exercise not found'); end if;
      if not catalog.equipment <@ (profile.equipment || array['none']) then perform private.raise_mutation_error('validation_failed','equipment unavailable'); end if;
      if catalog.difficulty > (case profile.experience when 'beginner' then 2 when 'intermediate' then 4 else 5 end) then perform private.raise_mutation_error('validation_failed','exercise exceeds selected experience'); end if;
      if (catalog.measure = 'reps') <> (movement->>'reps' is not null) then perform private.raise_mutation_error('validation_failed','exercise measure mismatch'); end if;
      movement := movement || jsonb_build_object('name',catalog.name);
    end if;
    duration := duration + (movement->>'sets')::numeric * (seconds + (movement->>'restSeconds')::numeric) / 60;
    result := result || jsonb_build_array(movement - 'automaticProgression');
  end loop;
  if ceil(duration) > profile.session_minutes then perform private.raise_mutation_error('validation_failed','routine exceeds available workout time'); end if;
  return jsonb_build_object('name',btrim(p_definition->>'name'),'movements',result,'estimatedMinutes',ceil(duration),
    'warmup',jsonb_build_array('5 min easy movement and comfortable joint mobility'),
    'cooldown',jsonb_build_array('3 min easy breathing and comfortable stretches'),
    'safety','Choose familiar movements. Stop for pain, dizziness, or unusual breathlessness. User movements are text-only and receive no automatic progression.');
end;
$$;
create function public.save_custom_workout(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); claim record; current_version integer; definition jsonb; refs jsonb;
begin
  perform private.assert_nonblank(p_payload->>'id','id',128);
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_finite_number(p_payload->>'expectedVersion','expectedVersion',0,2147483646);
  if (p_payload->>'expectedVersion')::numeric <> trunc((p_payload->>'expectedVersion')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  select * into claim from private.claim_mutation(caller_id,'save_custom_workout',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':custom:' || (p_payload->>'id'),0));
  select coalesce(max(version),0) into current_version from public.custom_workout_versions where user_id = caller_id and app_id = p_payload->>'id';
  if current_version <> (p_payload->>'expectedVersion')::integer then perform private.raise_stale_version('custom_workout', (p_payload->>'expectedVersion')::integer,current_version); end if;
  definition := private.validate_custom_workout(p_payload->'definition',caller_id);
  insert into public.custom_workout_versions(user_id,app_id,version,definition) values(caller_id,p_payload->>'id',current_version+1,definition);
  refs := jsonb_build_object('workout_id',p_payload->>'id','version',current_version+1);
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$$;
create function public.start_custom_workout(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); claim record; template public.custom_workout_versions%rowtype; refs jsonb;
begin
  perform private.assert_json_shape(p_payload,'payload','object');
  perform private.assert_nonblank(p_payload->>'id','session id',128);
  perform private.assert_nonblank(p_payload->>'workoutId','workout id',128);
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_date_key(p_payload->>'date','date');
  perform private.assert_finite_number(p_payload->>'expectedVersion','expectedVersion',1,2147483647);
  if (p_payload->>'expectedVersion')::numeric <> trunc((p_payload->>'expectedVersion')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  if (p_payload->>'date')::date > current_date+1 then perform private.raise_mutation_error('validation_failed'); end if;
  select * into claim from private.claim_mutation(caller_id,'start_custom_workout',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  select * into template from public.custom_workout_versions where user_id=caller_id and app_id=p_payload->>'workoutId' order by version desc limit 1;
  if template.row_id is null then perform private.raise_mutation_error('not_found'); end if;
  if template.version <> (p_payload->>'expectedVersion')::integer then perform private.raise_stale_version('custom_workout',(p_payload->>'expectedVersion')::integer,template.version); end if;
  perform private.validate_custom_workout(template.definition,caller_id);
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':custom-session',0));
  if exists(select 1 from public.custom_workout_sessions where user_id=caller_id and status in ('in_progress','paused')) then perform private.raise_mutation_error('conflict','resume the active custom workout'); end if;
  insert into public.custom_workout_sessions(user_id,app_id,workout_version_row_id,session_date,planned)
    values(caller_id,p_payload->>'id',template.row_id,(p_payload->>'date')::date,template.definition);
  refs := jsonb_build_object('session_id',p_payload->>'id');
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$$;
create function public.save_custom_workout_session(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); claim record; session public.custom_workout_sessions%rowtype; prescription jsonb;
  entry jsonb; ids text[] := '{}'; desired_status text := p_payload->>'status'; refs jsonb;
begin
  perform private.assert_nonblank(p_payload->>'id','id',128);
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_finite_number(p_payload->>'expectedRevision','expectedRevision',1,2147483646);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  perform private.assert_enum(desired_status,'status',array['in_progress','paused','completed','partial','abandoned']);
  perform private.assert_json_shape(p_payload->'actual','actual','array');
  select * into claim from private.claim_mutation(caller_id,'save_custom_workout_session',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  select * into session from public.custom_workout_sessions where user_id=caller_id and app_id=p_payload->>'id' for update;
  if session.row_id is null then perform private.raise_mutation_error('not_found'); end if;
  if session.revision <> (p_payload->>'expectedRevision')::integer then perform private.raise_stale_version('custom_session',(p_payload->>'expectedRevision')::integer,session.revision); end if;
  if session.status not in ('in_progress','paused') then perform private.raise_mutation_error('already_completed'); end if;
  for entry in select value from jsonb_array_elements(p_payload->'actual') loop
    perform private.assert_json_shape(entry,'entry','object');
    perform private.assert_nonblank(entry->>'movementId','movementId',128);
    if entry->>'movementId'=any(ids) or not exists(select 1 from jsonb_array_elements(session.planned->'movements') movement where movement->>'id'=entry->>'movementId') then perform private.raise_mutation_error('validation_failed','movement mismatch'); end if;
    ids := array_append(ids,entry->>'movementId');
    select value into prescription from jsonb_array_elements(session.planned->'movements') where value->>'id'=entry->>'movementId';
    perform private.assert_enum(entry->>'status','movement status',array['completed','modified','skipped']);
    perform private.assert_finite_number(entry->>'sets','actual sets',0,20);
    if (entry->>'sets')::numeric <> trunc((entry->>'sets')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if entry->>'reps' is not null then
      perform private.assert_finite_number(entry->>'reps','actual reps',0,500);
      if (entry->>'reps')::numeric <> trunc((entry->>'reps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    end if;
    if entry->>'holdSeconds' is not null then perform private.assert_finite_number(entry->>'holdSeconds','actual holdSeconds',0,3600); end if;
    if entry->>'status' <> 'skipped' and ((prescription->>'reps' is not null and (entry->>'reps' is null or entry->>'holdSeconds' is not null))
      or (prescription->>'holdSeconds' is not null and (entry->>'holdSeconds' is null or entry->>'reps' is not null))) then
      perform private.raise_mutation_error('validation_failed','actual measure differs from prescription');
    end if;
    if entry->>'status'='completed' and ((entry->>'sets')::numeric < (prescription->>'sets')::numeric
      or coalesce((entry->>'reps')::numeric,(entry->>'holdSeconds')::numeric) < coalesce((prescription->>'reps')::numeric,(prescription->>'holdSeconds')::numeric)) then
      perform private.raise_mutation_error('validation_failed','mark reduced work as modified');
    end if;
    if entry->>'rpe' is not null then perform private.assert_finite_number(entry->>'rpe','rpe',1,10); end if;
    if length(coalesce(entry->>'note','')) > 500 then perform private.raise_mutation_error('validation_failed','note too long'); end if;
  end loop;
  if desired_status='completed' and (cardinality(ids) <> jsonb_array_length(session.planned->'movements') or exists(select 1 from jsonb_array_elements(p_payload->'actual') e where e->>'status'<>'completed')) then perform private.raise_mutation_error('validation_failed','use partial completion for modified or unfinished work'); end if;
  if desired_status in ('partial','completed') and cardinality(ids)=0 then perform private.raise_mutation_error('validation_failed','record what happened before finishing'); end if;
  update public.custom_workout_sessions set actual=p_payload->'actual',status=desired_status,revision=revision+1,updated_at=now(),
    finished_at=case when desired_status in ('completed','partial','abandoned') then now() else null end where row_id=session.row_id;
  refs := jsonb_build_object('session_id',session.app_id);
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$$;
revoke all on function private.validate_custom_workout(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.save_custom_workout(jsonb),public.start_custom_workout(jsonb),public.save_custom_workout_session(jsonb) from public,anon;
grant execute on function public.save_custom_workout(jsonb),public.start_custom_workout(jsonb),public.save_custom_workout_session(jsonb) to authenticated;

alter function private.build_account_export() rename to build_account_export_daily_activity;
create function private.build_account_export() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated();
begin
  return private.build_account_export_daily_activity() || jsonb_build_object(
    'customWorkoutVersions',coalesce((select jsonb_agg(to_jsonb(v)-'user_id' order by row_id) from public.custom_workout_versions v where user_id=caller_id),'[]'::jsonb),
    'customWorkoutSessions',coalesce((select jsonb_agg(to_jsonb(s)-'user_id' order by row_id) from public.custom_workout_sessions s where user_id=caller_id),'[]'::jsonb));
end;
$$;
revoke all on function private.build_account_export_daily_activity(),private.build_account_export() from public,anon,authenticated;

create function private.capture_plan_program() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.supersedes_plan_row_id is not null then
    select training_program into new.training_program from public.workout_plans where row_id=new.supersedes_plan_row_id and user_id=new.user_id;
  else
    select training_program into new.training_program from public.profiles where id=new.user_id;
  end if;
  new.training_program := coalesce(new.training_program,'calisthenics');
  return new;
end;
$$;
create trigger workout_plans_capture_program before insert on public.workout_plans
for each row execute function private.capture_plan_program();
revoke all on function private.capture_plan_program() from public,anon,authenticated;
