-- MVP-1 notification preference.
-- Reminder delivery is intentionally outside MVP-1; this stores an explicit
-- user opt-in without adding a scheduler, email, or push side effect.

alter table public.profiles
  add column if not exists notifications_enabled boolean not null default false;

create or replace function private.update_notification_preference(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  enabled boolean;
  result jsonb;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    perform private.raise_mutation_error('validation_failed', 'payload must be an object');
  end if;
  if nullif(btrim(p_payload->>'idempotencyKey'), '') is null then
    perform private.raise_mutation_error('validation_failed', 'idempotencyKey is required');
  end if;
  if jsonb_typeof(p_payload->'expectedVersions') is distinct from 'object' then
    perform private.raise_mutation_error('validation_failed', 'expectedVersions must be an object');
  end if;
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then
    perform private.raise_mutation_error('validation_failed', 'enabled must be a boolean');
  end if;

  select * into claim
  from private.claim_mutation(
    caller_id,
    'update_notification_preference',
    p_payload->>'idempotencyKey',
    p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'update_notification_preference',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    perform private.assert_expected_versions('update_notification_preference', p_payload, caller_id);
    enabled := (p_payload->>'enabled')::boolean;

    update public.profiles
    set notifications_enabled = enabled
    where id = caller_id;

    if not found then
      perform private.raise_mutation_error('not_found', 'profile not found');
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'update_notification_preference',
      'result_refs', jsonb_build_object(
        'profile_id', caller_id::text,
        'notifications_enabled', enabled::text
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

create or replace function public.update_notification_preference(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.update_notification_preference(p_payload);
end;
$$;

revoke all on function private.update_notification_preference(jsonb) from public, anon, authenticated;
revoke all on function public.update_notification_preference(jsonb) from public, anon;
grant execute on function public.update_notification_preference(jsonb) to authenticated;
