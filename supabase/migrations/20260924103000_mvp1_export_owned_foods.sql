-- Include user-owned foods in the authoritative account export.
-- System starter catalog rows are shared reference data, not account-owned data.

create or replace function private.build_account_export()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
begin
  return jsonb_set(
    jsonb_set(
      private.build_account_export_without_logged_meals(),
      '{foods}',
      coalesce((
        select jsonb_agg(
          to_jsonb(f) - array['row_id', 'owner_user_id']
          order by f.created_at, f.row_id
        )
        from public.foods f
        where f.owner_user_id = caller_id and not f.is_system
      ), '[]'::jsonb),
      true
    ),
    '{loggedMeals}',
    coalesce((
      select jsonb_agg(
        to_jsonb(lm) - array['row_id', 'user_id', 'meal_row_id']
        order by lm.log_date, lm.row_id
      )
      from public.logged_meals lm
      where lm.user_id = caller_id
    ), '[]'::jsonb),
    true
  );
end;
$$;

revoke all on function private.build_account_export() from public, anon, authenticated;
