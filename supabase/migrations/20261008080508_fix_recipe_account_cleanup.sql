-- Account deletion must remove recipe/food references before owner cascades.
create or replace function private.delete_account(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'delete_account',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_account',
      'replayed', true,
      'result_refs', claim.result_refs,
      'clear_cache', true
    );
  end if;

  begin
    -- Remove owned references before the auth cascade deletes private foods.
    -- RESTRICT checks otherwise run before recipe ingredient cascades finish.
    delete from public.nutrition_logs where user_id = caller_id;
    delete from public.logged_meals where user_id = caller_id;
    delete from public.planned_meals where user_id = caller_id;
    delete from public.grocery_items where user_id = caller_id;
    delete from public.meal_ingredients i using public.meals m
      where i.meal_row_id = m.row_id and m.owner_user_id = caller_id;
    delete from auth.users where id = caller_id;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_account',
      'result_refs', jsonb_build_object('user_id', caller_id::text),
      'clear_cache', true
    );
    -- The mutation row is removed by the auth.users cascade, so this update is
    -- intentionally best-effort and does not change the deletion result.
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

revoke all on function private.delete_account(jsonb) from public,anon,authenticated;
