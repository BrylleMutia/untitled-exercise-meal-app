-- Shared helpers for the authenticated RPC boundary. These functions live in
-- the non-exposed schema and are called only by deliberate public wrappers.

create or replace function private.require_authenticated()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;
  return caller_id;
end;
$$;

create or replace function private.request_hash(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(p_payload, '{}'::jsonb)::text);
$$;

create or replace function private.raise_mutation_error(
  p_code text,
  p_message text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = coalesce(nullif(p_message, ''), p_code);
end;
$$;

create or replace function private.claim_mutation(
  p_user_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_payload jsonb
)
returns table (
  mutation_row_id bigint,
  request_hash text,
  replay boolean,
  status text,
  result_refs jsonb,
  error_code text
)
language plpgsql
set search_path = ''
as $$
declare
  current_hash text := private.request_hash(p_payload);
  existing public.mutation_idempotency%rowtype;
begin
  if p_user_id is null then
    perform private.raise_mutation_error('not_authenticated');
  end if;
  if p_operation is null or btrim(p_operation) = '' then
    perform private.raise_mutation_error('validation_failed', 'operation is required');
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    perform private.raise_mutation_error('validation_failed', 'idempotency_key is required');
  end if;

  insert into public.mutation_idempotency (
    user_id, operation, idempotency_key, request_hash, status
  )
  values (p_user_id, p_operation, p_idempotency_key, current_hash, 'pending')
  on conflict (user_id, operation, idempotency_key) do nothing;

  select *
  into existing
  from public.mutation_idempotency
  where user_id = p_user_id
    and operation = p_operation
    and idempotency_key = p_idempotency_key
  for update;

  if existing.request_hash <> current_hash then
    perform private.raise_mutation_error('idempotency_key_reused');
  end if;

  if existing.status = 'completed' then
    return query
    select existing.row_id, existing.request_hash, true, existing.status,
           existing.result_refs, existing.error_code;
    return;
  end if;

  if existing.status = 'failed' then
    update public.mutation_idempotency
    set status = 'pending', error_code = null, completed_at = null
    where row_id = existing.row_id;
    existing.status := 'pending';
    existing.error_code := null;
  end if;

  return query
  select existing.row_id, existing.request_hash, false, existing.status,
         existing.result_refs, existing.error_code;
end;
$$;

create or replace function private.complete_mutation(
  p_mutation_row_id bigint,
  p_result_refs jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = ''
as $$
  update public.mutation_idempotency
  set status = 'completed',
      result_refs = coalesce(p_result_refs, '{}'::jsonb),
      error_code = null,
      completed_at = now()
  where row_id = p_mutation_row_id;
$$;

create or replace function private.fail_mutation(
  p_mutation_row_id bigint,
  p_error_code text
)
returns void
language sql
set search_path = ''
as $$
  update public.mutation_idempotency
  set status = 'failed', error_code = p_error_code, completed_at = now()
  where row_id = p_mutation_row_id;
$$;

revoke all on function private.require_authenticated() from public, anon, authenticated;
revoke all on function private.request_hash(jsonb) from public, anon, authenticated;
revoke all on function private.raise_mutation_error(text, text) from public, anon, authenticated;
revoke all on function private.claim_mutation(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.complete_mutation(bigint, jsonb) from public, anon, authenticated;
revoke all on function private.fail_mutation(bigint, text) from public, anon, authenticated;
