-- Grocery mutations preserve user-owned state independently from generated
-- quantities. Regeneration only updates the generated side of an item.

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
  from private.claim_mutation(
    caller_id, 'toggle_grocery_item',
    p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', 'toggle_grocery_item',
      'replayed', true, 'result_refs', claim.result_refs
    );
  end if;

  begin
    update public.grocery_items
    set checked = not checked
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id in (
        select row_id from public.grocery_lists where user_id = caller_id
      );
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;

    result := jsonb_build_object(
      'status', 'completed', 'operation', 'toggle_grocery_item',
      'result_refs', jsonb_build_object('grocery_item_id', item_id)
    );
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
  from private.claim_mutation(
    caller_id, 'set_grocery_quantity',
    p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', 'set_grocery_quantity',
      'replayed', true, 'result_refs', claim.result_refs
    );
  end if;

  begin
    if item_quantity < 0 then
      perform private.raise_mutation_error('validation_failed', 'quantity must be non-negative');
    end if;

    update public.grocery_items
    set quantity = item_quantity
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id in (
        select row_id from public.grocery_lists where user_id = caller_id
      );
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;

    result := jsonb_build_object(
      'status', 'completed', 'operation', 'set_grocery_quantity',
      'result_refs', jsonb_build_object('grocery_item_id', item_id)
    );
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
  from private.claim_mutation(
    caller_id, 'remove_grocery_item',
    p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', 'remove_grocery_item',
      'replayed', true, 'result_refs', claim.result_refs
    );
  end if;

  begin
    update public.grocery_items
    set removed = true
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id in (
        select row_id from public.grocery_lists where user_id = caller_id
      );
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;

    result := jsonb_build_object(
      'status', 'completed', 'operation', 'remove_grocery_item',
      'result_refs', jsonb_build_object('grocery_item_id', item_id)
    );
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
  from private.claim_mutation(
    caller_id, 'add_custom_grocery_item',
    p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', 'add_custom_grocery_item',
      'replayed', true, 'result_refs', claim.result_refs
    );
  end if;

  begin
    select row_id into grocery_row_id
    from public.grocery_lists
    where user_id = caller_id
      and (
        app_id = nullif(grocery->>'id', '')
        or week_of = (grocery->>'weekOf')::date
      )
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
      grocery_row_id,
      caller_id,
      item_id,
      btrim(item->>'name'),
      coalesce(item->>'category', 'Other'),
      btrim(item->>'unit'),
      (item->>'quantity')::numeric(12,3),
      (item->>'quantity')::numeric(12,3),
      false,
      true,
      false
    );

    result := jsonb_build_object(
      'status', 'completed', 'operation', 'add_custom_grocery_item',
      'result_refs', jsonb_build_object(
        'grocery_item_id', item_id,
        'grocery_list_id', grocery->>'id'
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

create or replace function private.regenerate_grocery(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  grocery jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  item jsonb;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  new_generated_quantity numeric;
  next_quantity numeric;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'regenerate_grocery',
    p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object(
      'status', 'completed', 'operation', 'regenerate_grocery',
      'replayed', true, 'result_refs', claim.result_refs
    );
  end if;

  begin
    select row_id into grocery_row_id
    from public.grocery_lists
    where user_id = caller_id
      and (
        app_id = nullif(grocery->>'id', '')
        or week_of = (grocery->>'weekOf')::date
      )
    order by row_id desc
    limit 1
    for update;

    if grocery_row_id is null then
      perform private.raise_mutation_error('not_found', 'grocery list not found');
    end if;

    for item in
      select value from jsonb_array_elements(coalesce(grocery->'items', '[]'::jsonb))
    loop
      new_generated_quantity := (item->>'generatedQuantity')::numeric(12,3);
      select *
      into previous_item
      from public.grocery_items
      where grocery_list_row_id = grocery_row_id
        and app_id = item->>'id'
      for update;

      if previous_item.row_id is null then
        next_quantity := coalesce(
          nullif(item->>'quantity', '')::numeric,
          new_generated_quantity
        );
        insert into public.grocery_items (
          grocery_list_row_id, user_id, app_id, name, category, unit,
          generated_quantity, quantity, checked, custom_item, removed,
          source_food_row_id
        )
        values (
          grocery_row_id,
          caller_id,
          item->>'id',
          btrim(item->>'name'),
          item->>'category',
          btrim(item->>'unit'),
          new_generated_quantity,
          next_quantity,
          coalesce((item->>'checked')::boolean, false),
          coalesce((item->>'custom')::boolean, false),
          coalesce((item->>'removed')::boolean, false),
          (select f.row_id from public.foods f where f.app_id = item->>'foodId')
        );
      else
        next_quantity := case
          when previous_item.quantity = previous_item.generated_quantity
            then new_generated_quantity
          else previous_item.quantity
        end;
        update public.grocery_items
        set generated_quantity = new_generated_quantity,
            quantity = next_quantity
        where row_id = previous_item.row_id
          and user_id = caller_id;
      end if;
    end loop;

    update public.grocery_lists
    set updated_at = now()
    where row_id = grocery_row_id and user_id = caller_id;

    result := jsonb_build_object(
      'status', 'completed', 'operation', 'regenerate_grocery',
      'result_refs', jsonb_build_object('grocery_list_id', grocery->>'id')
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.toggle_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$ begin return private.toggle_grocery_item(p_payload); end; $$;

create or replace function public.set_grocery_quantity(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$ begin return private.set_grocery_quantity(p_payload); end; $$;

create or replace function public.remove_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$ begin return private.remove_grocery_item(p_payload); end; $$;

create or replace function public.add_custom_grocery_item(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$ begin return private.add_custom_grocery_item(p_payload); end; $$;

create or replace function public.regenerate_grocery(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$ begin return private.regenerate_grocery(p_payload); end; $$;

revoke all on function private.toggle_grocery_item(jsonb) from public, anon, authenticated;
revoke all on function private.set_grocery_quantity(jsonb) from public, anon, authenticated;
revoke all on function private.remove_grocery_item(jsonb) from public, anon, authenticated;
revoke all on function private.add_custom_grocery_item(jsonb) from public, anon, authenticated;
revoke all on function private.regenerate_grocery(jsonb) from public, anon, authenticated;

revoke all on function public.toggle_grocery_item(jsonb) from public, anon;
revoke all on function public.set_grocery_quantity(jsonb) from public, anon;
revoke all on function public.remove_grocery_item(jsonb) from public, anon;
revoke all on function public.add_custom_grocery_item(jsonb) from public, anon;
revoke all on function public.regenerate_grocery(jsonb) from public, anon;

grant execute on function public.toggle_grocery_item(jsonb) to authenticated;
grant execute on function public.set_grocery_quantity(jsonb) to authenticated;
grant execute on function public.remove_grocery_item(jsonb) to authenticated;
grant execute on function public.add_custom_grocery_item(jsonb) to authenticated;
grant execute on function public.regenerate_grocery(jsonb) to authenticated;
