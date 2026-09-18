-- M1.2 hardening: keep the extended recipe-save implementation behind the
-- same ownership and expected-version boundary as its public wrappers. The
-- prior forward migration added grocery reconciliation to the private body;
-- this wrapper makes the invariant explicit even if another private caller
-- is introduced later.

alter function private.save_saved_meal(jsonb)
  rename to save_saved_meal_unchecked;

create or replace function private.save_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := private.require_authenticated();
  perform private.assert_expected_versions('save_saved_meal', p_payload, caller_id);
  perform private.assert_saved_meal_access('save_saved_meal', p_payload, caller_id);
  return private.save_saved_meal_unchecked(p_payload);
end;
$$;

revoke all on function private.save_saved_meal(jsonb)
  from public, anon, authenticated;
revoke all on function private.save_saved_meal_unchecked(jsonb)
  from public, anon, authenticated;
