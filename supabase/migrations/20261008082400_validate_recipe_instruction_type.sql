-- Required authoring instructions must be text, not JSON serialized as text.
create or replace function public.save_recipe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_authenticated();
  perform private.assert_json_shape(p_payload->'meal'->'notes', 'Instructions', 'string');
  return private.save_authored_recipe(p_payload);
end;
$$;

revoke all on function public.save_recipe(jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb) to authenticated;
