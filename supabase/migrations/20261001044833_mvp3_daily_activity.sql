-- Daily observations use local dates; estimates remain derived in the client.
create table public.daily_step_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  steps integer not null check (steps between 0 and 200000),
  walking_minutes integer check (walking_minutes between 0 and 1440),
  source text not null default 'manual' check (source = 'manual'),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);
alter table public.daily_step_entries enable row level security;
create policy daily_step_entries_owner_read on public.daily_step_entries
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.daily_step_entries from public, anon, authenticated;
grant select on public.daily_step_entries to authenticated;

alter table public.profiles add column celebrations_enabled boolean not null default false;

create function private.save_daily_steps(p_payload jsonb, p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  operation text := case when p_delete then 'delete_daily_steps' else 'save_daily_steps' end;
  entry_day date;
  current_revision integer;
  expected_revision integer;
  result jsonb;
begin
  perform private.assert_json_shape(p_payload, 'payload', 'object');
  perform private.assert_date_key(p_payload->>'date', 'date');
  perform private.assert_nonblank(p_payload->>'idempotencyKey', 'idempotencyKey', 128);
  perform private.assert_finite_number(p_payload->>'expectedRevision', 'expectedRevision', 0, 2147483647);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then
    perform private.raise_mutation_error('validation_failed');
  end if;
  expected_revision := (p_payload->>'expectedRevision')::integer;
  entry_day := (p_payload->>'date')::date;
  if entry_day > current_date + 1 then perform private.raise_mutation_error('validation_failed', 'future steps are not observations'); end if;
  if not p_delete then
    perform private.assert_finite_number(p_payload->>'steps', 'steps', 0, 200000);
    if (p_payload->>'steps')::numeric <> trunc((p_payload->>'steps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if p_payload->>'walkingMinutes' is not null then
      perform private.assert_finite_number(p_payload->>'walkingMinutes', 'walkingMinutes', 0, 1440);
      if (p_payload->>'walkingMinutes')::numeric <> trunc((p_payload->>'walkingMinutes')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    end if;
  end if;
  select * into claim from private.claim_mutation(caller_id, operation, p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || entry_day::text, 0));
  select revision into current_revision from public.daily_step_entries where user_id = caller_id and entry_date = entry_day for update;
  if coalesce(current_revision, 0) <> expected_revision then
    perform private.raise_stale_version('daily_steps', expected_revision, coalesce(current_revision, 0));
  end if;
  if p_delete then
    delete from public.daily_step_entries where user_id = caller_id and entry_date = entry_day;
  else
    insert into public.daily_step_entries(user_id, entry_date, steps, walking_minutes)
    values (caller_id, entry_day, (p_payload->>'steps')::integer, (p_payload->>'walkingMinutes')::integer)
    on conflict (user_id, entry_date) do update set steps = excluded.steps,
      walking_minutes = excluded.walking_minutes, revision = public.daily_step_entries.revision + 1, updated_at = now();
  end if;
  result := jsonb_build_object('status','completed','result_refs',jsonb_build_object('date', entry_day::text));
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$$;
create function public.save_daily_steps(p_payload jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.save_daily_steps(p_payload, false); $$;
create function public.delete_daily_steps(p_payload jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.save_daily_steps(p_payload, true); $$;
revoke all on function private.save_daily_steps(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.save_daily_steps(jsonb), public.delete_daily_steps(jsonb) from public, anon;
grant execute on function public.save_daily_steps(jsonb), public.delete_daily_steps(jsonb) to authenticated;

create function public.set_celebrations(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); claim record; current_revision integer; result jsonb;
begin
  perform private.assert_json_shape(p_payload, 'payload', 'object');
  perform private.assert_nonblank(p_payload->>'idempotencyKey', 'idempotencyKey', 128);
  perform private.assert_finite_number(p_payload->>'expectedRevision', 'expectedRevision', 1, 2147483647);
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then perform private.raise_mutation_error('validation_failed'); end if;
  select * into claim from private.claim_mutation(caller_id, 'set_celebrations', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  select revision into current_revision from public.profiles where id = caller_id for update;
  if current_revision is null then perform private.raise_mutation_error('not_found'); end if;
  if current_revision <> (p_payload->>'expectedRevision')::integer then perform private.raise_stale_version('profile', (p_payload->>'expectedRevision')::integer, current_revision); end if;
  update public.profiles set celebrations_enabled = (p_payload->>'enabled')::boolean where id = caller_id;
  result := jsonb_build_object('status','completed','result_refs',jsonb_build_object('profile_id',caller_id));
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$$;
revoke all on function public.set_celebrations(jsonb) from public, anon;
grant execute on function public.set_celebrations(jsonb) to authenticated;

alter function private.build_account_export() rename to build_account_export_mvp2;
create function private.build_account_export() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated();
begin
  return private.build_account_export_mvp2() || jsonb_build_object('dailySteps', coalesce((
    select jsonb_agg(to_jsonb(s) - 'user_id' order by entry_date) from public.daily_step_entries s where user_id = caller_id
  ), '[]'::jsonb));
end;
$$;
revoke all on function private.build_account_export_mvp2(), private.build_account_export() from public, anon, authenticated;
