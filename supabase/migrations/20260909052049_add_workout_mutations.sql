-- Workout session lifecycle mutations. All writes are routed through
-- authenticated wrappers; planned snapshots come from the persisted plan.

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
begin
  for log_record in
    select value from jsonb_array_elements(coalesce(p_logs, '[]'::jsonb))
  loop
    planned_app_id := coalesce(
      nullif(log_record->>'plannedExerciseId', ''),
      nullif(log_record->>'exerciseId', '')
    );
    actual_app_id := coalesce(
      nullif(log_record->>'actualExerciseId', ''),
      nullif(log_record->>'exerciseId', '')
    );
    log_status := coalesce(log_record->>'status', 'completed');

    select pe.*
    into planned_record
    from public.planned_exercises pe
    join public.workout_sessions ws
      on ws.planned_workout_row_id = pe.planned_workout_row_id
     and ws.user_id = pe.user_id
    where ws.row_id = p_session_row_id
      and ws.user_id = p_user_id
      and pe.user_id = p_user_id
      and pe.app_id = planned_app_id;

    if planned_record.row_id is null then
      perform private.raise_mutation_error('not_found', 'planned exercise not found');
    end if;

    select e.*
    into actual_record
    from public.exercises e
    where e.app_id = actual_app_id
      and e.is_system;

    if actual_record.row_id is null then
      perform private.raise_mutation_error('not_found', 'actual exercise not found');
    end if;

    if log_status = 'skipped' then
      actual_sets := null;
      actual_reps := null;
      actual_hold_seconds := null;
    else
      actual_sets := nullif(log_record->'actual'->>'sets', '')::smallint;
      if actual_record.measure = 'reps' then
        actual_reps := nullif(log_record->'actual'->>'reps', '')::smallint;
        actual_hold_seconds := null;
      else
        actual_reps := null;
        actual_hold_seconds := nullif(
          log_record->'actual'->>'holdSeconds', ''
        )::smallint;
      end if;
    end if;

    insert into public.exercise_logs (
      session_row_id,
      user_id,
      planned_exercise_row_id,
      actual_exercise_row_id,
      planned_exercise_app_id,
      planned_exercise_name_snapshot,
      planned_measure,
      planned_sets,
      planned_reps,
      planned_hold_seconds,
      actual_measure,
      actual_sets,
      actual_reps,
      actual_hold_seconds,
      status,
      rpe,
      manageable,
      pain,
      note
    )
    values (
      p_session_row_id,
      p_user_id,
      planned_record.row_id,
      actual_record.row_id,
      planned_record.app_id,
      planned_record.exercise_name_snapshot,
      planned_record.measure_snapshot,
      planned_record.sets,
      planned_record.reps,
      planned_record.hold_seconds,
      actual_record.measure,
      actual_sets,
      actual_reps,
      actual_hold_seconds,
      log_status,
      nullif(log_record->>'rpe', '')::smallint,
      (log_record->>'manageable')::boolean,
      (log_record->>'pain')::boolean,
      nullif(log_record->>'note', '')
    )
    on conflict (session_row_id, planned_exercise_row_id) do update set
      actual_exercise_row_id = excluded.actual_exercise_row_id,
      actual_measure = excluded.actual_measure,
      actual_sets = excluded.actual_sets,
      actual_reps = excluded.actual_reps,
      actual_hold_seconds = excluded.actual_hold_seconds,
      status = excluded.status,
      rpe = excluded.rpe,
      manageable = excluded.manageable,
      pain = excluded.pain,
      note = excluded.note;
  end loop;
end;
$$;

create or replace function private.start_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  session_record public.workout_sessions%rowtype;
  plan_row_id bigint;
  workout_row_id bigint;
  session_app_id text := p_payload->'session'->>'id';
  workout_app_id text := p_payload->'session'->>'plannedWorkoutId';
  session_date date := (p_payload->'session'->>'date')::date;
  started_at timestamptz := coalesce(
    nullif(p_payload->'session'->>'startedAt', '')::timestamptz,
    now()
  );
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'start_workout_session',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'start_workout_session',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if session_app_id is null or btrim(session_app_id) = '' then
      perform private.raise_mutation_error('validation_failed', 'session id is required');
    end if;
    if workout_app_id is null or btrim(workout_app_id) = '' then
      perform private.raise_mutation_error('validation_failed', 'workout id is required');
    end if;

    select pw.row_id, pw.plan_row_id
    into workout_row_id, plan_row_id
    from public.planned_workouts pw
    where pw.user_id = caller_id
      and pw.app_id = workout_app_id
    order by pw.row_id desc
    limit 1
    for update;

    if workout_row_id is null then
      perform private.raise_mutation_error('not_found', 'planned workout not found');
    end if;

    select *
    into session_record
    from public.workout_sessions
    where user_id = caller_id
      and planned_workout_row_id = workout_row_id
      and status = 'in_progress'
    order by row_id desc
    limit 1
    for update;

    if session_record.row_id is null then
      insert into public.workout_sessions (
        app_id, user_id, planned_workout_row_id, planned_plan_row_id,
        planned_plan_version, session_date, started_at, status, idempotency_key
      )
      select
        session_app_id,
        caller_id,
        workout_row_id,
        wp.row_id,
        wp.version,
        coalesce(session_date, current_date),
        started_at,
        'in_progress',
        p_payload->>'idempotencyKey'
      from public.workout_plans wp
      where wp.row_id = plan_row_id
        and wp.user_id = caller_id
      returning * into session_record;
    end if;

    if session_record.row_id is null then
      perform private.raise_mutation_error('not_found', 'workout plan not found');
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'start_workout_session',
      'result_refs', jsonb_build_object(
        'session_id', session_record.app_id
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.save_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  session_row_id bigint;
  session_app_id text := p_payload->'session'->>'id';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'save_workout_session',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'save_workout_session',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    select row_id into session_row_id
    from public.workout_sessions
    where user_id = caller_id and app_id = session_app_id
    for update;

    if session_row_id is null then
      perform private.raise_mutation_error('not_found', 'workout session not found');
    end if;

    perform private.upsert_exercise_logs(
      caller_id,
      session_row_id,
      p_payload->'session'->'logs'
    );

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'save_workout_session',
      'result_refs', jsonb_build_object(
        'session_id', session_app_id
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.finish_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  session_record public.workout_sessions%rowtype;
  is_complete boolean;
  result jsonb;
  session_finished_at timestamptz := coalesce(
    nullif(p_payload->'session'->>'finishedAt', '')::timestamptz,
    now()
  );
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'finish_workout_session',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'finish_workout_session',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    select *
    into session_record
    from public.workout_sessions
    where user_id = caller_id
      and app_id = p_payload->'session'->>'id'
    for update;

    if session_record.row_id is null then
      perform private.raise_mutation_error('not_found', 'workout session not found');
    end if;
    if session_record.status = 'completed' then
      perform private.raise_mutation_error('already_completed');
    end if;
    if session_record.status = 'abandoned' then
      perform private.raise_mutation_error('conflict', 'abandoned session cannot finish');
    end if;

    perform private.upsert_exercise_logs(
      caller_id,
      session_record.row_id,
      p_payload->'session'->'logs'
    );

    select not exists (
      select 1
      from public.planned_exercises pe
      left join public.exercise_logs el
        on el.planned_exercise_row_id = pe.row_id
       and el.session_row_id = session_record.row_id
       and el.user_id = caller_id
      where pe.planned_workout_row_id = session_record.planned_workout_row_id
        and pe.user_id = caller_id
        and (
          el.row_id is null
          or el.status <> 'completed'
          or coalesce(el.actual_sets, 0) <= 0
          or coalesce(el.pain, false)
        )
    ) into is_complete;

    update public.workout_sessions
    set status = case when is_complete then 'completed' else 'partial' end,
        finished_at = session_finished_at
    where row_id = session_record.row_id
      and user_id = caller_id;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'finish_workout_session',
      'result_refs', jsonb_build_object(
        'session_id', session_record.app_id,
        'session_status', case when is_complete then 'completed' else 'partial' end
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.abandon_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  session_app_id text := p_payload->'session'->>'id';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'abandon_workout_session',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'abandon_workout_session',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    update public.workout_sessions
    set status = 'abandoned', finished_at = coalesce(finished_at, now())
    where user_id = caller_id
      and app_id = session_app_id
      and status = 'in_progress';

    if not found then
      perform private.raise_mutation_error('not_found', 'in-progress workout session not found');
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'abandon_workout_session',
      'result_refs', jsonb_build_object(
        'session_id', session_app_id
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.start_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.start_workout_session(p_payload);
end;
$$;

create or replace function public.save_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.save_workout_session(p_payload);
end;
$$;

create or replace function public.finish_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.finish_workout_session(p_payload);
end;
$$;

create or replace function public.abandon_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.abandon_workout_session(p_payload);
end;
$$;

revoke all on function private.upsert_exercise_logs(uuid, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function private.start_workout_session(jsonb)
  from public, anon, authenticated;
revoke all on function private.save_workout_session(jsonb)
  from public, anon, authenticated;
revoke all on function private.finish_workout_session(jsonb)
  from public, anon, authenticated;
revoke all on function private.abandon_workout_session(jsonb)
  from public, anon, authenticated;

revoke all on function public.start_workout_session(jsonb) from public, anon;
revoke all on function public.save_workout_session(jsonb) from public, anon;
revoke all on function public.finish_workout_session(jsonb) from public, anon;
revoke all on function public.abandon_workout_session(jsonb) from public, anon;

grant execute on function public.start_workout_session(jsonb) to authenticated;
grant execute on function public.save_workout_session(jsonb) to authenticated;
grant execute on function public.finish_workout_session(jsonb) to authenticated;
grant execute on function public.abandon_workout_session(jsonb) to authenticated;
