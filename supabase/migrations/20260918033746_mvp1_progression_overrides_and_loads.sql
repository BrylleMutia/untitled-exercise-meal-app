-- MVP-1 workout progression foundation.
--
-- Planned exercises keep a durable slot identity across plan versions. A
-- future edit clones the current plan, so completed sessions continue to
-- reference the prescription that was shown when they were performed.

alter table public.planned_exercises
  add column if not exists slot_key text;

alter table public.workout_plan_overrides
  add column if not exists slot_key text;

update public.planned_exercises pe
set slot_key = 'day:' || pw.day_of_week::text || ':exercise:' || pe.sort_order::text
from public.planned_workouts pw
where pw.row_id = pe.planned_workout_row_id
  and pe.slot_key is null;

update public.workout_plan_overrides po
set slot_key = pe.slot_key
from public.planned_exercises pe
where pe.row_id = po.planned_exercise_row_id
  and po.slot_key is null;

alter table public.planned_exercises
  alter column slot_key set not null;

alter table public.workout_plan_overrides
  alter column slot_key set not null;

create unique index if not exists planned_exercises_plan_slot_idx
  on public.planned_exercises (planned_workout_row_id, slot_key);

create index if not exists workout_plan_overrides_user_slot_idx
  on public.workout_plan_overrides (user_id, slot_key)
  where active;

create or replace function private.set_planned_exercise_slot_key()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  day_value smallint;
begin
  if nullif(btrim(new.slot_key), '') is null then
    select day_of_week into day_value
    from public.planned_workouts
    where row_id = new.planned_workout_row_id
      and user_id = new.user_id;
    if day_value is null then
      raise exception using errcode = '23503', message = 'planned workout not found';
    end if;
    new.slot_key := 'day:' || day_value::text || ':exercise:' || new.sort_order::text;
  end if;
  return new;
end;
$$;

create or replace function private.set_workout_override_slot_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(btrim(new.slot_key), '') is null then
    select slot_key into new.slot_key
    from public.planned_exercises
    where row_id = new.planned_exercise_row_id
      and user_id = new.user_id;
  end if;
  if nullif(btrim(new.slot_key), '') is null then
    raise exception using errcode = '23503', message = 'planned exercise slot not found';
  end if;
  return new;
end;
$$;

drop trigger if exists planned_exercises_set_slot_key on public.planned_exercises;
create trigger planned_exercises_set_slot_key
before insert or update of planned_workout_row_id, sort_order, slot_key
on public.planned_exercises
for each row execute function private.set_planned_exercise_slot_key();

drop trigger if exists workout_plan_overrides_set_slot_key on public.workout_plan_overrides;
create trigger workout_plan_overrides_set_slot_key
before insert or update of planned_exercise_row_id, slot_key
on public.workout_plan_overrides
for each row execute function private.set_workout_override_slot_key();

alter table public.exercise_logs
  add column if not exists actual_load numeric(8,2),
  add column if not exists actual_load_unit text;

alter table public.exercise_logs
  drop constraint if exists exercise_logs_actual_load_check,
  drop constraint if exists exercise_logs_actual_load_unit_check;

alter table public.exercise_logs
  add constraint exercise_logs_actual_load_check
    check (actual_load is null or (actual_load >= 0 and actual_load <= 1000)),
  add constraint exercise_logs_actual_load_unit_check
    check (actual_load_unit is null or actual_load_unit in ('kg', 'lb'));

create table if not exists public.progression_decisions (
  row_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  slot_key text not null,
  planned_exercise_app_id text not null,
  action text not null,
  decision text not null,
  rule_version text not null,
  source_session_ids text[] not null default '{}',
  proposed_replacement_exercise_id text,
  proposed_sets smallint,
  proposed_reps smallint,
  proposed_hold_seconds smallint,
  created_at timestamptz not null default now(),
  constraint progression_decisions_app_id_unique unique (user_id, app_id),
  constraint progression_decisions_action_check check (action in ('progress', 'hold', 'regress')),
  constraint progression_decisions_decision_check check (decision in ('accepted', 'rejected')),
  constraint progression_decisions_rule_check check (btrim(rule_version) <> ''),
  constraint progression_decisions_slot_check check (btrim(slot_key) <> ''),
  constraint progression_decisions_sets_check check (proposed_sets is null or proposed_sets between 1 and 10),
  constraint progression_decisions_reps_check check (proposed_reps is null or proposed_reps between 1 and 100),
  constraint progression_decisions_hold_check check (proposed_hold_seconds is null or proposed_hold_seconds between 1 and 600)
);

alter table public.progression_decisions enable row level security;

create policy "users can read their progression decisions"
  on public.progression_decisions for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists progression_decisions_user_slot_idx
  on public.progression_decisions (user_id, slot_key, created_at desc);

revoke insert, update, delete on public.progression_decisions from public, anon, authenticated;
grant select on public.progression_decisions to authenticated;

create or replace function private.clone_workout_plan_with_change(
  p_user_id uuid,
  p_slot_key text,
  p_replacement_exercise_id text default null,
  p_sets smallint default null,
  p_reps smallint default null,
  p_hold_seconds smallint default null,
  p_rest_seconds smallint default null,
  p_remove boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.workout_plans%rowtype;
  previous_plan public.workout_plans%rowtype;
  current_workout public.planned_workouts%rowtype;
  current_exercise public.planned_exercises%rowtype;
  previous_exercise public.planned_exercises%rowtype;
  current_override public.workout_plan_overrides%rowtype;
  previous_override public.workout_plan_overrides%rowtype;
  replacement public.exercises%rowtype;
  effective_exercise_row_id bigint;
  effective_measure text;
  effective_sets smallint;
  effective_reps smallint;
  effective_hold smallint;
  effective_rest smallint;
  new_plan_row_id bigint;
  new_workout_row_id bigint;
  new_exercise_row_id bigint;
  target_found boolean := false;
  is_target boolean;
  new_plan_app_id text;
  new_version integer;
  override_app_id text;
  target_override_app_id text;
begin
  select * into current_plan
  from public.workout_plans
  where user_id = p_user_id
  order by created_at desc, row_id desc
  limit 1
  for update;
  if current_plan.row_id is null then
    perform private.raise_mutation_error('not_found', 'workout plan not found');
  end if;

  if p_remove then
    if current_plan.supersedes_plan_row_id is not null then
      select * into previous_plan
      from public.workout_plans
      where row_id = current_plan.supersedes_plan_row_id
        and user_id = p_user_id;
    end if;
  end if;

  new_plan_app_id := current_plan.app_id;
  new_version := current_plan.version + 1;
  insert into public.workout_plans (
    app_id, user_id, version, target_row_id, supersedes_plan_row_id
  ) values (
    new_plan_app_id, p_user_id, new_version, current_plan.target_row_id, current_plan.row_id
  ) returning row_id into new_plan_row_id;

  for current_workout in
    select * from public.planned_workouts
    where plan_row_id = current_plan.row_id and user_id = p_user_id
    order by sort_order
  loop
    insert into public.planned_workouts (
      plan_row_id, user_id, app_id, day_of_week, title, focus, warmup,
      cooldown, estimated_minutes, sort_order
    ) values (
      new_plan_row_id, p_user_id, current_workout.app_id, current_workout.day_of_week,
      current_workout.title, current_workout.focus, current_workout.warmup,
      current_workout.cooldown, current_workout.estimated_minutes, current_workout.sort_order
    ) returning row_id into new_workout_row_id;

    for current_exercise in
      select * from public.planned_exercises
      where planned_workout_row_id = current_workout.row_id
        and user_id = p_user_id
      order by sort_order
    loop
      is_target := current_exercise.slot_key = p_slot_key;
      if is_target then target_found := true; end if;

      select * into current_override
      from public.workout_plan_overrides
      where user_id = p_user_id
        and planned_exercise_row_id = current_exercise.row_id
        and active
      limit 1;

      effective_exercise_row_id := coalesce(current_override.replacement_exercise_row_id, current_exercise.exercise_row_id);
      effective_measure := coalesce(current_override.measure_override, current_exercise.measure_snapshot);
      effective_sets := coalesce(current_override.sets_override, current_exercise.sets);
      effective_reps := coalesce(current_override.reps_override, current_exercise.reps);
      effective_hold := coalesce(current_override.hold_seconds_override, current_exercise.hold_seconds);
      effective_rest := coalesce(current_override.rest_seconds_override, current_exercise.rest_seconds);

      if is_target and p_remove and previous_plan.row_id is not null then
        select pe.* into previous_exercise
        from public.planned_exercises pe
        join public.planned_workouts pw on pw.row_id = pe.planned_workout_row_id and pw.user_id = p_user_id
        where pw.plan_row_id = previous_plan.row_id
          and pe.user_id = p_user_id
          and pe.slot_key = p_slot_key
        limit 1;
        if previous_exercise.row_id is not null then
          select * into previous_override
          from public.workout_plan_overrides
          where user_id = p_user_id
            and planned_exercise_row_id = previous_exercise.row_id
            and active
          limit 1;
          effective_exercise_row_id := coalesce(previous_override.replacement_exercise_row_id, previous_exercise.exercise_row_id);
          effective_measure := coalesce(previous_override.measure_override, previous_exercise.measure_snapshot);
          effective_sets := coalesce(previous_override.sets_override, previous_exercise.sets);
          effective_reps := coalesce(previous_override.reps_override, previous_exercise.reps);
          effective_hold := coalesce(previous_override.hold_seconds_override, previous_exercise.hold_seconds);
          effective_rest := coalesce(previous_override.rest_seconds_override, previous_exercise.rest_seconds);
        end if;
      elsif is_target and not p_remove then
        if p_replacement_exercise_id is not null then
          select * into replacement
          from public.exercises
          where app_id = p_replacement_exercise_id and is_system;
          if replacement.row_id is null then
            perform private.raise_mutation_error('not_found', 'replacement exercise not found');
          end if;
          if not (replacement.equipment <@ coalesce((select array_append(equipment, 'none') from public.profiles where id = p_user_id), array['none']::text[])) then
            perform private.raise_mutation_error('validation_failed', 'replacement exercise requires unavailable equipment');
          end if;
          effective_exercise_row_id := replacement.row_id;
          effective_measure := replacement.measure;
          effective_reps := null;
          effective_hold := null;
        end if;
        effective_sets := coalesce(p_sets, effective_sets);
        effective_rest := coalesce(p_rest_seconds, effective_rest);
        if coalesce(p_hold_seconds, 0) > 0 then
          effective_measure := 'hold';
          effective_reps := null;
          effective_hold := p_hold_seconds;
        elsif coalesce(p_reps, 0) > 0 then
          effective_measure := 'reps';
          effective_hold := null;
          effective_reps := p_reps;
        end if;
      end if;

      insert into public.planned_exercises (
        planned_workout_row_id, user_id, app_id, exercise_row_id, sort_order,
        exercise_name_snapshot, measure_snapshot, catalog_source_version,
        sets, reps, hold_seconds, rest_seconds, slot_key,
        regression_reference_snapshot, progression_reference_snapshot
      )
      select
        new_workout_row_id, p_user_id, current_exercise.app_id, e.row_id, current_exercise.sort_order,
        e.name, e.measure, e.source_version,
        effective_sets,
        case when effective_measure = 'reps' then effective_reps else null end,
        case when effective_measure = 'hold' then effective_hold else null end,
        effective_rest, current_exercise.slot_key, e.regression_reference, e.progression_reference
      from public.exercises e
      where e.row_id = effective_exercise_row_id
      returning row_id into new_exercise_row_id;

      if new_exercise_row_id is null then
        perform private.raise_mutation_error('not_found', 'exercise catalog row not found');
      end if;

      if current_override.row_id is not null and not is_target then
        override_app_id := 'override-' || md5(p_user_id::text || ':' || new_plan_row_id::text || ':' || current_exercise.slot_key);
        insert into public.workout_plan_overrides (
          user_id, app_id, planned_exercise_row_id, slot_key, replacement_exercise_row_id,
          measure_override, sets_override, reps_override, hold_seconds_override,
          rest_seconds_override, active, effective_at
        ) values (
          p_user_id, override_app_id, new_exercise_row_id, current_exercise.slot_key,
          current_override.replacement_exercise_row_id, current_override.measure_override,
          current_override.sets_override, current_override.reps_override,
          current_override.hold_seconds_override, current_override.rest_seconds_override,
          true, current_override.effective_at
        );
      end if;

      if is_target and not p_remove then
        override_app_id := 'override-' || md5(p_user_id::text || ':' || new_plan_row_id::text || ':' || current_exercise.slot_key);
        target_override_app_id := override_app_id;
        insert into public.workout_plan_overrides (
          user_id, app_id, planned_exercise_row_id, slot_key, replacement_exercise_row_id,
          measure_override, sets_override, reps_override, hold_seconds_override,
          rest_seconds_override, active, effective_at
        ) values (
          p_user_id, override_app_id, new_exercise_row_id, current_exercise.slot_key,
          case when effective_exercise_row_id <> current_exercise.exercise_row_id then effective_exercise_row_id else null end,
          case when effective_measure <> current_exercise.measure_snapshot or p_replacement_exercise_id is not null then effective_measure else null end,
          case when p_sets is not null then p_sets else null end,
          case when effective_measure = 'reps' and p_reps is not null then p_reps else null end,
          case when effective_measure = 'hold' and p_hold_seconds is not null then p_hold_seconds else null end,
          case when p_rest_seconds is not null then p_rest_seconds else null end,
          true, now()
        );
      end if;
    end loop;
  end loop;

  if not target_found then
    perform private.raise_mutation_error('not_found', 'workout exercise slot not found');
  end if;

  return jsonb_build_object(
    'plan_id', new_plan_app_id,
    'plan_version', new_version,
    'planned_exercise_id', p_slot_key,
    'override_id', target_override_app_id
  );
end;
$$;

create or replace function private.apply_workout_override(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  current_plan public.workout_plans%rowtype;
  result jsonb;
  override_id text;
begin
  caller_id := private.require_authenticated();
  select * into claim from private.claim_mutation(
    caller_id, 'apply_workout_override', p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'apply_workout_override', 'replayed', true, 'result_refs', claim.result_refs);
  end if;
  begin
    perform private.assert_expected_versions('apply_workout_override', p_payload, caller_id);
    if nullif(p_payload->>'slotKey', '') is null then
      perform private.raise_mutation_error('validation_failed', 'slotKey is required');
    end if;
    select * into current_plan from public.workout_plans
    where user_id = caller_id order by created_at desc, row_id desc limit 1 for update;
    if current_plan.row_id is null then perform private.raise_mutation_error('not_found', 'workout plan not found'); end if;
    result := private.clone_workout_plan_with_change(
      caller_id,
      p_payload->>'slotKey',
      nullif(p_payload->>'replacementExerciseId', ''),
      nullif(p_payload->>'sets', '')::smallint,
      nullif(p_payload->>'reps', '')::smallint,
      nullif(p_payload->>'holdSeconds', '')::smallint,
      nullif(p_payload->>'restSeconds', '')::smallint,
      false
    );
    update public.workout_plan_overrides po
    set active = false, ended_at = now()
    where po.user_id = caller_id and po.active
      and exists (
        select 1
        from public.planned_exercises pe
        join public.planned_workouts pw on pw.row_id = pe.planned_workout_row_id and pw.user_id = caller_id
        where pe.row_id = po.planned_exercise_row_id and pw.plan_row_id = current_plan.row_id
      );
    override_id := result->>'override_id';
    result := jsonb_build_object('status', 'completed', 'operation', 'apply_workout_override', 'result_refs', result || jsonb_build_object('override_id', override_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.remove_workout_override(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  current_plan public.workout_plans%rowtype;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim from private.claim_mutation(
    caller_id, 'remove_workout_override', p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'remove_workout_override', 'replayed', true, 'result_refs', claim.result_refs);
  end if;
  begin
    perform private.assert_expected_versions('remove_workout_override', p_payload, caller_id);
    if nullif(p_payload->>'slotKey', '') is null then
      perform private.raise_mutation_error('validation_failed', 'slotKey is required');
    end if;
    select * into current_plan from public.workout_plans
    where user_id = caller_id order by created_at desc, row_id desc limit 1 for update;
    result := private.clone_workout_plan_with_change(caller_id, p_payload->>'slotKey', null, null, null, null, null, true);
    update public.workout_plan_overrides po
    set active = false, ended_at = now()
    where po.user_id = caller_id and po.active
      and exists (
        select 1
        from public.planned_exercises pe
        join public.planned_workouts pw on pw.row_id = pe.planned_workout_row_id and pw.user_id = caller_id
        where pe.row_id = po.planned_exercise_row_id and pw.plan_row_id = current_plan.row_id
      );
    result := jsonb_build_object('status', 'completed', 'operation', 'remove_workout_override', 'result_refs', result);
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.apply_progression_decision(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  current_plan public.workout_plans%rowtype;
  decision_id text := 'progression-' || md5(coalesce(p_payload->>'idempotencyKey', p_payload::text));
  action_value text := coalesce(nullif(p_payload->>'action', ''), 'hold');
  decision_value text := coalesce(nullif(p_payload->>'decision', ''), 'rejected');
  result jsonb := '{}'::jsonb;
  source_ids text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'sourceSessionIds', '[]'::jsonb))), '{}');
begin
  caller_id := private.require_authenticated();
  select * into claim from private.claim_mutation(
    caller_id, 'apply_progression_decision', p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'apply_progression_decision', 'replayed', true, 'result_refs', claim.result_refs);
  end if;
  begin
    perform private.assert_expected_versions('apply_progression_decision', p_payload, caller_id);
    if action_value not in ('progress', 'hold', 'regress') then perform private.raise_mutation_error('validation_failed', 'invalid progression action'); end if;
    if decision_value not in ('accepted', 'rejected') then perform private.raise_mutation_error('validation_failed', 'invalid progression decision'); end if;
    if nullif(p_payload->>'slotKey', '') is null or nullif(p_payload->>'plannedExerciseId', '') is null then
      perform private.raise_mutation_error('validation_failed', 'progression slot and exercise are required');
    end if;
    if decision_value = 'accepted' and action_value = 'hold' then
      perform private.raise_mutation_error('validation_failed', 'hold recommendations cannot be accepted as a change');
    end if;
    if decision_value = 'accepted' then
      select * into current_plan from public.workout_plans
      where user_id = caller_id order by created_at desc, row_id desc limit 1 for update;
      result := private.clone_workout_plan_with_change(
        caller_id,
        p_payload->>'slotKey',
        nullif(p_payload->>'replacementExerciseId', ''),
        nullif(p_payload->>'sets', '')::smallint,
        nullif(p_payload->>'reps', '')::smallint,
        nullif(p_payload->>'holdSeconds', '')::smallint,
        nullif(p_payload->>'restSeconds', '')::smallint,
        false
      );
      update public.workout_plan_overrides po
      set active = false, ended_at = now()
      where po.user_id = caller_id and po.active
        and exists (
          select 1
          from public.planned_exercises pe
          join public.planned_workouts pw on pw.row_id = pe.planned_workout_row_id and pw.user_id = caller_id
          where pe.row_id = po.planned_exercise_row_id and pw.plan_row_id = current_plan.row_id
        );
    end if;
    insert into public.progression_decisions (
      user_id, app_id, slot_key, planned_exercise_app_id, action, decision,
      rule_version, source_session_ids, proposed_replacement_exercise_id,
      proposed_sets, proposed_reps, proposed_hold_seconds
    ) values (
      caller_id, decision_id, p_payload->>'slotKey', p_payload->>'plannedExerciseId',
      action_value, decision_value, coalesce(nullif(p_payload->>'ruleVersion', ''), 'mvp1-rpe-v1'),
      source_ids, nullif(p_payload->>'replacementExerciseId', ''),
      nullif(p_payload->>'sets', '')::smallint,
      nullif(p_payload->>'reps', '')::smallint,
      nullif(p_payload->>'holdSeconds', '')::smallint
    ) on conflict (user_id, app_id) do nothing;
    result := jsonb_build_object(
      'status', 'completed', 'operation', 'apply_progression_decision',
      'result_refs', result || jsonb_build_object('decision_id', decision_id)
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.apply_workout_override(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return private.apply_workout_override(p_payload); end; $$;

create or replace function public.remove_workout_override(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return private.remove_workout_override(p_payload); end; $$;

create or replace function public.apply_progression_decision(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return private.apply_progression_decision(p_payload); end; $$;

revoke all on function private.set_planned_exercise_slot_key() from public, anon, authenticated;
revoke all on function private.set_workout_override_slot_key() from public, anon, authenticated;
revoke all on function private.clone_workout_plan_with_change(uuid, text, text, smallint, smallint, smallint, smallint, boolean) from public, anon, authenticated;
revoke all on function private.apply_workout_override(jsonb) from public, anon, authenticated;
revoke all on function private.remove_workout_override(jsonb) from public, anon, authenticated;
revoke all on function private.apply_progression_decision(jsonb) from public, anon, authenticated;
revoke all on function public.apply_workout_override(jsonb) from public, anon;
revoke all on function public.remove_workout_override(jsonb) from public, anon;
revoke all on function public.apply_progression_decision(jsonb) from public, anon;
grant execute on function public.apply_workout_override(jsonb) to authenticated;
grant execute on function public.remove_workout_override(jsonb) to authenticated;
grant execute on function public.apply_progression_decision(jsonb) to authenticated;

-- Extend the existing session upsert without opening direct table writes.
create or replace function private.upsert_exercise_logs(
  p_user_id uuid,
  p_session_row_id bigint,
  p_logs jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  log_record jsonb;
  planned_record public.planned_exercises%rowtype;
  actual_record public.exercises%rowtype;
  planned_app_id text;
  actual_app_id text;
  log_status text;
  actual_sets smallint;
  actual_reps smallint;
  actual_hold_seconds smallint;
  actual_load numeric(8,2);
  actual_load_unit text;
begin
  for log_record in select value from jsonb_array_elements(coalesce(p_logs, '[]'::jsonb))
  loop
    planned_app_id := coalesce(nullif(log_record->>'plannedExerciseId', ''), nullif(log_record->>'exerciseId', ''));
    actual_app_id := coalesce(nullif(log_record->>'actualExerciseId', ''), nullif(log_record->>'exerciseId', ''));
    log_status := coalesce(log_record->>'status', 'completed');

    select pe.* into planned_record
    from public.planned_exercises pe
    join public.workout_sessions ws on ws.planned_workout_row_id = pe.planned_workout_row_id and ws.user_id = pe.user_id
    where ws.row_id = p_session_row_id and ws.user_id = p_user_id
      and pe.user_id = p_user_id and pe.app_id = planned_app_id;
    if planned_record.row_id is null then perform private.raise_mutation_error('not_found', 'planned exercise not found'); end if;

    select e.* into actual_record from public.exercises e where e.app_id = actual_app_id and e.is_system;
    if actual_record.row_id is null then perform private.raise_mutation_error('not_found', 'actual exercise not found'); end if;

    if log_status = 'skipped' then
      actual_sets := null; actual_reps := null; actual_hold_seconds := null;
      actual_load := null; actual_load_unit := null;
    else
      actual_sets := nullif(log_record->'actual'->>'sets', '')::smallint;
      if actual_record.measure = 'reps' then
        actual_reps := nullif(log_record->'actual'->>'reps', '')::smallint;
        actual_hold_seconds := null;
      else
        actual_reps := null;
        actual_hold_seconds := nullif(log_record->'actual'->>'holdSeconds', '')::smallint;
      end if;
      actual_load := nullif(log_record->'actual'->>'load', '')::numeric(8,2);
      actual_load_unit := nullif(log_record->'actual'->>'loadUnit', '');
    end if;

    insert into public.exercise_logs (
      session_row_id, user_id, planned_exercise_row_id, actual_exercise_row_id,
      planned_exercise_app_id, planned_exercise_name_snapshot, planned_measure,
      planned_sets, planned_reps, planned_hold_seconds, actual_measure,
      actual_sets, actual_reps, actual_hold_seconds, actual_load, actual_load_unit,
      status, rpe, manageable, pain, note
    ) values (
      p_session_row_id, p_user_id, planned_record.row_id, actual_record.row_id,
      planned_record.app_id, planned_record.exercise_name_snapshot, planned_record.measure_snapshot,
      planned_record.sets, planned_record.reps, planned_record.hold_seconds, actual_record.measure,
      actual_sets, actual_reps, actual_hold_seconds, actual_load, actual_load_unit,
      log_status, nullif(log_record->>'rpe', '')::smallint,
      (log_record->>'manageable')::boolean, (log_record->>'pain')::boolean, nullif(log_record->>'note', '')
    ) on conflict (session_row_id, planned_exercise_row_id) do update set
      actual_exercise_row_id = excluded.actual_exercise_row_id,
      actual_measure = excluded.actual_measure,
      actual_sets = excluded.actual_sets,
      actual_reps = excluded.actual_reps,
      actual_hold_seconds = excluded.actual_hold_seconds,
      actual_load = excluded.actual_load,
      actual_load_unit = excluded.actual_load_unit,
      status = excluded.status,
      rpe = excluded.rpe,
      manageable = excluded.manageable,
      pain = excluded.pain,
      note = excluded.note;
  end loop;
end;
$$;

revoke all on function private.upsert_exercise_logs(uuid, bigint, jsonb)
  from public, anon, authenticated;
