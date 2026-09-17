-- MVP-0 follow-up: reject ambiguous workout measurement payloads.
-- This is forward-only; no previously applied migration is modified.

create or replace function private.assert_workout_log_shape(
  p_operation text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  log_record jsonb;
  actual_record jsonb;
begin
  if p_operation not in ('save_workout_session', 'finish_workout_session') then
    return;
  end if;

  for log_record in
    select value from jsonb_array_elements(coalesce(p_payload->'session'->'logs', '[]'::jsonb))
  loop
    actual_record := log_record->'actual';
    if jsonb_typeof(actual_record) = 'object'
       and actual_record ? 'reps'
       and actual_record ? 'holdSeconds' then
      perform private.raise_mutation_error(
        'validation_failed',
        'exercise log cannot include both reps and holdSeconds'
      );
    end if;
  end loop;
end;
$$;

create or replace function private.preflight_mutation(
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
begin
  caller_id := private.require_authenticated();
  select * into claim from private.claim_mutation(
    caller_id, p_operation, p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', p_operation, 'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;
  perform private.validate_mutation_payload(p_operation, p_payload);
  perform private.assert_expected_versions(p_operation, p_payload, caller_id);
  perform private.assert_saved_meal_access(p_operation, p_payload, caller_id);
  perform private.assert_workout_log_shape(p_operation, p_payload);
  return null;
end;
$$;

revoke all on function private.assert_workout_log_shape(text, jsonb)
  from public, anon, authenticated;
revoke all on function private.preflight_mutation(text, jsonb)
  from public, anon, authenticated;
