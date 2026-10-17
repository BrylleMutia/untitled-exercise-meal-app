alter table public.grocery_lists
  add column total_amount_centavos bigint,
  add column total_amount_carried_from_week date,
  add constraint grocery_total_amount_check check (total_amount_centavos between 0 and 9007199254740991),
  add constraint grocery_total_amount_origin_check check (total_amount_carried_from_week is null or total_amount_centavos is not null);

create function private.set_grocery_total_amount(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := private.require_authenticated(); claim record; selected_week date;
  saved_list public.grocery_lists; expected numeric; amount numeric; refs jsonb;
begin
  perform private.assert_json_shape(p_payload,'payload','object');
  select * into claim from private.claim_mutation(caller,'set_grocery_total_amount',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  perform private.assert_date_key(p_payload->>'weekOf','weekOf');
  selected_week := (p_payload->>'weekOf')::date;
  if not (p_payload ? 'grocery') or not (p_payload ? 'totalAmountCentavos') then
    perform private.raise_mutation_error('validation_failed','Grocery context and amount are required');
  end if;
  if jsonb_typeof(p_payload->'totalAmountCentavos') <> 'null' then
    if jsonb_typeof(p_payload->'totalAmountCentavos') <> 'number' then perform private.raise_mutation_error('validation_failed','Amount must be integer centavos'); end if;
    perform private.assert_finite_number(p_payload->>'totalAmountCentavos','totalAmountCentavos',0,9007199254740991);
    amount := (p_payload->>'totalAmountCentavos')::numeric;
    if amount <> trunc(amount) then perform private.raise_mutation_error('validation_failed','Amount must be integer centavos'); end if;
  end if;
  perform private.assert_finite_number(p_payload->'expectedVersions'->>'groceryRevision','groceryRevision',0,2147483647);
  expected := (p_payload->'expectedVersions'->>'groceryRevision')::numeric;
  if expected <> trunc(expected) then perform private.raise_mutation_error('validation_failed','Grocery revision must be a whole number'); end if;
  perform 1 from public.profiles where id=caller for update;
  if not found then perform private.raise_mutation_error('not_found','Set up your profile first'); end if;
  if private.calendar_week(selected_week,private.account_week_start(caller)) <> selected_week then
    perform private.raise_mutation_error('validation_failed','Choose the account week date');
  end if;
  select * into saved_list from public.grocery_lists where user_id=caller and week_of=selected_week and calendar_active for update;
  if expected <> coalesce(saved_list.revision,0) then
    perform private.raise_stale_version('grocery',expected::integer,coalesce(saved_list.revision,0));
  end if;
  if saved_list.row_id is null then
    delete from public.grocery_items where user_id=caller and grocery_list_row_id in
      (select row_id from public.grocery_lists where user_id=caller and week_of=selected_week and not calendar_active);
    insert into public.grocery_lists(app_id,user_id,week_of,total_amount_centavos)
      values('gl-'||selected_week,caller,selected_week,amount::bigint)
      on conflict (user_id,week_of) do update set calendar_active=true,calendar_review_required=false,
        total_amount_centavos=excluded.total_amount_centavos,total_amount_carried_from_week=null,updated_at=now()
      returning * into saved_list;
  else
    update public.grocery_lists set total_amount_centavos=amount::bigint,total_amount_carried_from_week=null,updated_at=now()
      where row_id=saved_list.row_id;
  end if;
  refs := jsonb_build_object('grocery_list_id',saved_list.app_id);
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$$;
create function public.set_grocery_total_amount(p_payload jsonb) returns jsonb
language sql security definer set search_path='' as $$ select private.set_grocery_total_amount(p_payload); $$;
revoke all on function private.set_grocery_total_amount(jsonb) from public,anon,authenticated;
revoke all on function public.set_grocery_total_amount(jsonb) from public,anon;
grant execute on function public.set_grocery_total_amount(jsonb) to authenticated;
revoke insert,update,delete on public.grocery_lists from anon,authenticated;

create or replace function private.regroup_calendar(p_user uuid,p_from integer,p_to integer) returns void
language plpgsql security definer set search_path='' as $$
declare
  plans jsonb; groceries jsonb; destination_refs jsonb := '[]'::jsonb; transition_id bigint;
  dest date; header public.meal_plans; next_plan bigint; next_version integer; list_id bigint;
  source_list jsonb; item jsonb; previous public.grocery_items; generated record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':calendar',0));
  perform 1 from public.profiles where id=p_user for update;
  select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('meals',coalesce((
    select jsonb_agg(to_jsonb(pm) order by meal_date,meal_slot,sort_order) from public.planned_meals pm where pm.meal_plan_row_id=p.row_id
  ),'[]'::jsonb))),'[]'::jsonb) into plans from (
    select distinct on (week_of) * from public.meal_plans where user_id=p_user and calendar_active
    order by week_of,version desc,row_id desc
  ) p;
  select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('items',coalesce((
    select jsonb_agg(to_jsonb(i)) from public.grocery_items i where i.grocery_list_row_id=g.row_id
  ),'[]'::jsonb))),'[]'::jsonb) into groceries from public.grocery_lists g where user_id=p_user and calendar_active;
  insert into public.calendar_transitions(user_id,from_day,to_day,source_plans,source_groceries)
    values(p_user,p_from,p_to,plans,groceries) returning row_id into transition_id;
  update public.meal_plans set calendar_active=false where user_id=p_user and calendar_active;
  update public.grocery_lists set calendar_active=false where user_id=p_user and calendar_active;

  for dest in
    select distinct private.calendar_week(d,p_to) from (
      select (p->>'week_of')::date d from jsonb_array_elements(plans) p
      union select (m->>'meal_date')::date from jsonb_array_elements(plans) p cross join lateral jsonb_array_elements(p->'meals') m
      union select (g->>'week_of')::date from jsonb_array_elements(groceries) g
    ) dates order by 1
  loop
    next_plan := null;
    select h.* into header from jsonb_array_elements(plans) p
      cross join lateral jsonb_populate_record(null::public.meal_plans,p) h
      where private.calendar_week(h.week_of,p_to)=dest or exists (
        select 1 from jsonb_array_elements(p->'meals') m where private.calendar_week((m->>'meal_date')::date,p_to)=dest)
      order by h.week_of,h.version desc limit 1;
    if header.row_id is not null then
      select coalesce(max(version),0)+1 into next_version from public.meal_plans where user_id=p_user and week_of=dest;
      insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id,supersedes_plan_row_id,dietary_pattern,allergies,total_carb_limit,calendar_transition_row_id)
        values('mp-'||dest,p_user,next_version,dest,header.target_row_id,header.row_id,header.dietary_pattern,header.allergies,header.total_carb_limit,transition_id)
        returning row_id into next_plan;
      insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,food_row_id,label,servings,skipped,
        expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,expected_fiber_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order,created_at,updated_at)
      select next_plan,p_user,dest,m.app_id,m.meal_date,m.meal_slot,m.meal_row_id,m.food_row_id,m.label,m.servings,m.skipped,
        m.expected_calories,m.expected_protein_g,m.expected_carbs_g,m.expected_fat_g,m.expected_fiber_g,m.source,m.source_version,m.assumptions,m.confidence,m.preparation_basis,m.slot_key,m.sort_order,m.created_at,m.updated_at
      from jsonb_array_elements(plans) p cross join lateral jsonb_array_elements(p->'meals') entry
        cross join lateral jsonb_populate_record(null::public.planned_meals,entry) m
      where private.calendar_week(m.meal_date,p_to)=dest;
    end if;
    insert into public.grocery_lists(app_id,user_id,week_of,calendar_active,calendar_review_required)
      values('gl-'||dest,p_user,dest,true,true)
      on conflict (user_id,week_of) do update set calendar_active=true,calendar_review_required=true,
        total_amount_centavos=null,total_amount_carried_from_week=null
      returning row_id into list_id;
    delete from public.grocery_items where grocery_list_row_id=list_id and user_id=p_user;
    -- Match the deterministic client generator's grams/pieces and rounding basis.
    for generated in
      with portions as (
        select i.food_row_id, i.servings*pm.servings/m.servings amount
        from public.planned_meals pm join public.meals m on m.row_id=pm.meal_row_id
          join public.meal_ingredients i on i.meal_row_id=m.row_id
        where pm.meal_plan_row_id=next_plan and not pm.skipped
        union all select food_row_id,servings from public.planned_meals
          where meal_plan_row_id=next_plan and not skipped and food_row_id is not null
      )
      select f.row_id,f.app_id,f.name,f.category,case when f.serving_unit='piece' then 'pcs' else 'g' end unit,
        case when f.serving_unit='piece' then ceil(sum(p.amount)) else round(sum(p.amount*f.serving_grams)) end quantity
      from portions p join public.foods f on f.row_id=p.food_row_id group by f.row_id
    loop
      insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,source_food_row_id)
        values(list_id,p_user,'gi-'||generated.app_id,generated.name,generated.category,generated.unit,generated.quantity,generated.quantity,generated.row_id);
    end loop;
    for source_list in select value from jsonb_array_elements(groceries) where private.calendar_week((value->>'week_of')::date,p_to)=dest loop
      -- Only active source state is carried, including explicit zero; never reuse an inactive destination total.
      update public.grocery_lists set total_amount_centavos=(source_list->>'total_amount_centavos')::bigint,
        total_amount_carried_from_week=case when source_list->>'total_amount_centavos' is not null then (source_list->>'week_of')::date end
        where row_id=list_id;
      for item in select value from jsonb_array_elements(source_list->'items') loop
        select * into previous from public.grocery_items where grocery_list_row_id=list_id and app_id=item->>'app_id';
        if previous.row_id is not null and not (item->>'custom_item')::boolean then
          update public.grocery_items set checked=(item->>'checked')::boolean,removed=(item->>'removed')::boolean,
            quantity=case when (item->>'quantity')::numeric<>(item->>'generated_quantity')::numeric then (item->>'quantity')::numeric else generated_quantity end,
            carried_from_week=(source_list->>'week_of')::date where row_id=previous.row_id;
        elsif (item->>'custom_item')::boolean or (item->>'removed')::boolean or (item->>'checked')::boolean or (item->>'quantity')::numeric<>(item->>'generated_quantity')::numeric then
          insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,checked,removed,custom_item,carried_from_week,source_food_row_id)
            values(list_id,p_user,case when previous.row_id is not null then 'carried-'||transition_id||'-'||(item->>'row_id') else item->>'app_id' end,item->>'name',item->>'category',item->>'unit',0,(item->>'quantity')::numeric,
              (item->>'checked')::boolean,(item->>'removed')::boolean,true,(source_list->>'week_of')::date,(item->>'source_food_row_id')::bigint);
        end if;
      end loop;
    end loop;
    destination_refs:=destination_refs||jsonb_build_array(jsonb_build_object('weekOf',dest,'planRowId',next_plan,'groceryRowId',list_id));
  end loop;
  update public.calendar_transitions set destinations=destination_refs where row_id=transition_id;
  update public.profiles set week_starts_on=p_to,calendar_revision=calendar_revision+1 where id=p_user;
end;
$$;


revoke all on function private.regroup_calendar(uuid,integer,integer) from public,anon,authenticated;
notify pgrst,'reload schema';
