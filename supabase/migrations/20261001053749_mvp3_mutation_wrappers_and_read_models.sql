alter function public.save_custom_workout(jsonb) set schema private;
alter function public.start_custom_workout(jsonb) set schema private;
alter function public.save_custom_workout_session(jsonb) set schema private;
create function public.save_custom_workout(p_payload jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.save_custom_workout(p_payload); $$;
create function public.start_custom_workout(p_payload jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.start_custom_workout(p_payload); $$;
create function public.save_custom_workout_session(p_payload jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.save_custom_workout_session(p_payload); $$;
revoke all on function private.save_custom_workout(jsonb),private.start_custom_workout(jsonb),private.save_custom_workout_session(jsonb) from public,anon,authenticated;
revoke all on function public.save_custom_workout(jsonb),public.start_custom_workout(jsonb),public.save_custom_workout_session(jsonb) from public,anon;
grant execute on function public.save_custom_workout(jsonb),public.start_custom_workout(jsonb),public.save_custom_workout_session(jsonb) to authenticated;

alter policy daily_step_entries_owner_read on public.daily_step_entries rename to "users can read their daily steps";
alter policy custom_workout_versions_read on public.custom_workout_versions rename to "users can read their custom workout versions";
alter policy custom_workout_sessions_read on public.custom_workout_sessions rename to "users can read their custom workout sessions";

-- The invoker view keeps RLS and returns one current version per routine.
create view public.current_custom_workouts with (security_invoker = true) as
select distinct on (user_id,app_id) * from public.custom_workout_versions order by user_id,app_id,version desc;
revoke all on public.current_custom_workouts from public,anon,authenticated;
grant select on public.current_custom_workouts to authenticated;

-- A deleted observation must not be recreated by a stale edit (ABA). Retain a
-- monotonic per-date revision independently of the visible observation.
create table private.daily_step_revisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null, revision integer not null check (revision > 0),
  primary key(user_id,entry_date)
);
revoke all on private.daily_step_revisions from public,anon,authenticated;
insert into private.daily_step_revisions select user_id,entry_date,revision from public.daily_step_entries;
alter function private.save_daily_steps(jsonb,boolean) rename to save_daily_steps_initial;
create function private.save_daily_steps(p_payload jsonb,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); result jsonb; previous_revision integer; current_revision integer;
  claim record; operation text := case when p_delete then 'delete_daily_steps' else 'save_daily_steps' end;
begin
  perform private.assert_json_shape(p_payload,'payload','object');
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_date_key(p_payload->>'date','date');
  perform private.assert_finite_number(p_payload->>'expectedRevision','expectedRevision',0,2147483646);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  if (p_payload->>'date')::date < current_date - 366 or (p_payload->>'date')::date > current_date+1 then perform private.raise_mutation_error('validation_failed','date is outside the editable year'); end if;
  if not p_delete then
    perform private.assert_finite_number(p_payload->>'steps','steps',0,200000);
    if (p_payload->>'steps')::numeric <> trunc((p_payload->>'steps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if p_payload->>'walkingMinutes' is not null then
      perform private.assert_finite_number(p_payload->>'walkingMinutes','walkingMinutes',0,1440);
      if (p_payload->>'walkingMinutes')::numeric <> trunc((p_payload->>'walkingMinutes')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    end if;
  end if;
  select * into claim from private.claim_mutation(caller_id,operation,p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || (p_payload->>'date'),0));
  select revision into previous_revision from private.daily_step_revisions where user_id=caller_id and entry_date=(p_payload->>'date')::date;
  select revision into current_revision from public.daily_step_entries where user_id=caller_id and entry_date=(p_payload->>'date')::date;
  -- After deletion the UI submits zero for a new observation. Reject old
  -- nonzero revisions before reaching the initial implementation.
  if coalesce(current_revision,0) <> (p_payload->>'expectedRevision')::integer then
    perform private.raise_stale_version('daily_steps',(p_payload->>'expectedRevision')::integer,coalesce(current_revision,0));
  end if;
  if p_delete then
    delete from public.daily_step_entries where user_id=caller_id and entry_date=(p_payload->>'date')::date;
  else
    current_revision := coalesce(previous_revision,0)+1;
    insert into public.daily_step_entries(user_id,entry_date,steps,walking_minutes,revision)
      values(caller_id,(p_payload->>'date')::date,(p_payload->>'steps')::integer,(p_payload->>'walkingMinutes')::integer,current_revision)
      on conflict(user_id,entry_date) do update set steps=excluded.steps,walking_minutes=excluded.walking_minutes,revision=excluded.revision,updated_at=now();
    insert into private.daily_step_revisions values(caller_id,(p_payload->>'date')::date,current_revision)
      on conflict(user_id,entry_date) do update set revision=excluded.revision;
  end if;
  result := jsonb_build_object('status','completed','result_refs',jsonb_build_object('date',p_payload->>'date','revision',coalesce(current_revision,0)));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;
revoke all on function private.save_daily_steps_initial(jsonb,boolean),private.save_daily_steps(jsonb,boolean) from public,anon,authenticated;
