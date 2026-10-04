create or replace function private.raise_mutation_error(p_code text,p_message text default null)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using message=coalesce(nullif(p_message,''),p_code), detail=jsonb_build_object('code',p_code)::text;
end;
$$;
revoke all on function private.raise_mutation_error(text,text) from public,anon,authenticated;
