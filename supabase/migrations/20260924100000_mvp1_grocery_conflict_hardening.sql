-- MVP-1 conflict hardening: every grocery item mutation advances the parent
-- grocery-list revision so expected groceryRevision values cannot silently
-- accept stale edits.

create or replace function private.bump_grocery_list_revision(p_user_id uuid, p_item_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.grocery_lists
  set updated_at = now()
  where user_id = p_user_id
    and row_id in (
      select grocery_list_row_id
      from public.grocery_items
      where user_id = p_user_id and app_id = p_item_id
    );
end;
$$;

create or replace function private.toggle_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'toggle_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'toggle_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    update public.grocery_items
    set checked = not checked
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id in (select row_id from public.grocery_lists where user_id = caller_id);
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;
    perform private.bump_grocery_list_revision(caller_id, item_id);

    result := jsonb_build_object('status', 'completed', 'operation', 'toggle_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.set_grocery_quantity(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  item_quantity numeric := (p_payload->>'quantity')::numeric;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'set_grocery_quantity', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'set_grocery_quantity', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    if item_quantity < 0 then
      perform private.raise_mutation_error('validation_failed', 'quantity must be non-negative');
    end if;
    update public.grocery_items
    set quantity = item_quantity
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id in (select row_id from public.grocery_lists where user_id = caller_id);
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;
    perform private.bump_grocery_list_revision(caller_id, item_id);

    result := jsonb_build_object('status', 'completed', 'operation', 'set_grocery_quantity', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.remove_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'remove_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'remove_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    update public.grocery_items
    set removed = true
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id in (select row_id from public.grocery_lists where user_id = caller_id);
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;
    perform private.bump_grocery_list_revision(caller_id, item_id);

    result := jsonb_build_object('status', 'completed', 'operation', 'remove_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function private.add_custom_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  grocery jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  item jsonb := coalesce(p_payload->'item', '{}'::jsonb);
  grocery_row_id bigint;
  item_id text := item->>'id';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'add_custom_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'add_custom_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    select row_id into grocery_row_id
    from public.grocery_lists
    where user_id = caller_id
      and (app_id = nullif(grocery->>'id', '') or week_of = (grocery->>'weekOf')::date)
    order by row_id desc
    limit 1
    for update;
    if grocery_row_id is null then
      perform private.raise_mutation_error('not_found', 'grocery list not found');
    end if;

    insert into public.grocery_items (
      grocery_list_row_id, user_id, app_id, name, category, unit,
      generated_quantity, quantity, checked, custom_item, removed
    )
    values (
      grocery_row_id, caller_id, item_id, btrim(item->>'name'),
      coalesce(item->>'category', 'Other'), btrim(item->>'unit'),
      (item->>'quantity')::numeric(12,3), (item->>'quantity')::numeric(12,3),
      false, true, false
    );
    update public.grocery_lists set updated_at = now() where row_id = grocery_row_id and user_id = caller_id;

    result := jsonb_build_object('status', 'completed', 'operation', 'add_custom_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id, 'grocery_list_id', grocery->>'id'));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

revoke all on function private.bump_grocery_list_revision(uuid, text) from public, anon, authenticated;
