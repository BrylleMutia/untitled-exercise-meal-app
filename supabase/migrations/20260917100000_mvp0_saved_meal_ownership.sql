-- MVP-0 follow-up: protect edits to user-owned saved meals and recipes.
-- This is forward-only; no previously applied migration is modified.

create or replace function private.assert_saved_meal_access(
  p_operation text,
  p_payload jsonb,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  meal_id text := nullif(p_payload->'meal'->>'id', '');
  owner_id uuid;
  is_system_meal boolean;
  actual_revision integer;
  expected_revision integer;
begin
  if p_operation not in ('save_saved_meal', 'save_recipe') or meal_id is null then
    return;
  end if;

  select m.owner_user_id, m.is_system, m.revision
  into owner_id, is_system_meal, actual_revision
  from public.meals as m
  where m.app_id = meal_id
  for update;

  -- New IDs are allowed; the authoritative save function performs the insert.
  if not found then
    return;
  end if;

  -- Keep the existing system-meal conflict message from the save function.
  if is_system_meal then
    return;
  end if;

  if owner_id is distinct from p_user_id then
    perform private.raise_mutation_error('not_found', 'saved meal not found');
  end if;

  if p_payload->'expectedVersions' ? 'recordRevision' then
    expected_revision := (p_payload->'expectedVersions'->>'recordRevision')::integer;
    if expected_revision <> actual_revision then
      perform private.raise_stale_version('saved_meal', expected_revision, actual_revision);
    end if;
  end if;
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
  return null;
end;
$$;

revoke all on function private.assert_saved_meal_access(text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function private.preflight_mutation(text, jsonb)
  from public, anon, authenticated;
