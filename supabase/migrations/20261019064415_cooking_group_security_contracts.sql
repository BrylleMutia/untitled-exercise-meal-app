create index cooking_generations_generator_idx on public.cooking_generations(generated_by);
create index cooking_generation_notices_user_idx on public.cooking_generation_notices(user_id,generation_id);
create index cooking_assignments_generation_idx on public.cooking_assignments(generation_id);

-- Policies use an own-account-only public helper; private implementations stay non-executable.
create function public.current_cooking_group() returns uuid language sql stable security definer set search_path='' as $$
 select private.cooking_group_for((select auth.uid()));
$$;
revoke all on function public.current_cooking_group() from public,anon;
grant execute on function public.current_cooking_group() to authenticated;
revoke all on function private.cooking_group_for(uuid) from authenticated;
alter policy cooking_groups_read on public.cooking_groups using(id=(select public.current_cooking_group()));
alter policy cooking_members_read on public.cooking_group_members using(group_id=(select public.current_cooking_group()));
alter policy cooking_proposals_read on public.cooking_week_proposals using(group_id=(select public.current_cooking_group()));
alter policy cooking_weeks_read on public.cooking_group_weeks using(group_id=(select public.current_cooking_group()));
alter policy cooking_generations_read on public.cooking_generations using(group_id=(select public.current_cooking_group()));
alter policy cooking_assignments_read on public.cooking_assignments using(group_id=(select public.current_cooking_group()) or user_id=(select auth.uid()));
alter policy cooking_transitions_read on public.cooking_calendar_transitions using(group_id=(select public.current_cooking_group()));
alter policy cooking_realtime_read on realtime.messages using(extension='broadcast' and realtime.topic()='cooking:'||(select public.current_cooking_group())::text);

-- This is presentation/fulfilment scope, not nutrition or an actual-history value.
alter table public.planned_meals add column shared_grocery boolean not null default false;
create function private.guard_shared_planned_recipe() returns trigger language plpgsql security definer set search_path='' as $$
declare assignment public.cooking_assignments; previous public.planned_meals;
begin
 select * into assignment from public.cooking_assignments where user_id=new.user_id and id=new.app_id;
 if assignment.id is null or private.cooking_group_for(new.user_id) is distinct from assignment.group_id then new.shared_grocery:=false; return new; end if;
 select pm.* into previous from public.planned_meals pm join public.meal_plans p on p.row_id=pm.meal_plan_row_id where pm.user_id=new.user_id and pm.app_id=new.app_id and pm.row_id<>new.row_id and p.calendar_active order by p.version desc,pm.row_id desc limit 1;
 if previous.row_id is not null and (new.meal_row_id is distinct from previous.meal_row_id or new.food_row_id is distinct from previous.food_row_id) and current_setting('app.cooking_edit',true) is distinct from assignment.group_id::text then
   perform private.raise_mutation_error('conflict','Use the Group view to replace a shared meal.');
 end if;
 if new.servings<.25 or new.servings>4 then perform private.raise_mutation_error('validation_failed','Group portions must be between 0.25 and 4 servings'); end if;
 new.shared_grocery:=true; return new;
end;
$$;
create trigger shared_planned_recipe_guard before insert or update on public.planned_meals for each row execute function private.guard_shared_planned_recipe();
create or replace function private.cooking_plan_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare gid uuid; week date; flag text; member uuid;
begin
 select group_id into gid from public.cooking_assignments where user_id=new.user_id and id=new.app_id;
 if gid is null or private.cooking_group_for(new.user_id) is distinct from gid then return null; end if;
 week:=private.calendar_week(new.meal_date,(select week_starts_on from public.cooking_groups where id=gid));
 flag:='app.cooking_dirty_'||replace(gid::text,'-','')||'_'||replace(week::text,'-','');
 if current_setting(flag,true)='done' then return null; end if;
 perform set_config(flag,'done',true);
 perform private.reconcile_cooking_grocery(gid,week);
 for member in select user_id from public.cooking_group_members where group_id=gid order by user_id loop perform private.reconcile_personal_cooking_grocery(member,week); end loop;
 return null;
end;
$$;
create or replace function private.cooking_member_departed() returns trigger language plpgsql security definer set search_path='' as $$
declare week date;
begin
 perform private.lock_cooking_group(old.group_id);
 update public.cooking_groups set revision=revision+1,archived_at=case when not exists(select 1 from public.cooking_group_members where group_id=old.group_id) then now() else archived_at end where id=old.group_id;
 update public.cooking_week_proposals set status='invalidated' where group_id=old.group_id and status='pending';
 update private.cooking_invitations set consumed_at=now() where created_by=old.user_id;
 update public.planned_meals set shared_grocery=false where user_id=old.user_id and shared_grocery;
 for week in select week_of from public.cooking_group_weeks where group_id=old.group_id loop
   perform private.reconcile_cooking_grocery(old.group_id,week);
   update public.cooking_group_weeks set grocery=grocery||'{"calendarReviewRequired":true}'::jsonb where group_id=old.group_id and week_of=week;
   perform private.reconcile_personal_cooking_grocery(old.user_id,week);
 end loop;
 return old;
end;
$$;
revoke all on function private.guard_shared_planned_recipe() from public,anon,authenticated;

create or replace function private.cooking_live_assignments(p_group uuid,p_week date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'memberId',a.user_id,'recipeId',a.recipe_id,'recipeRevision',(select revision from public.meals where row_id=a.recipe_snapshot_row_id),'label',pm.label,'date',pm.meal_date,'slot',pm.meal_slot,'servings',pm.servings,'skipped',pm.skipped,
 'protected',exists(select 1 from public.nutrition_logs l where l.user_id=a.user_id and l.planned_meal_app_id=a.id))), '[]'::jsonb)
 from public.cooking_assignments a join public.planned_meals pm on pm.user_id=a.user_id and pm.app_id=a.id
 join public.meal_plans p on p.row_id=pm.meal_plan_row_id
 where a.group_id=p_group and private.cooking_group_for(a.user_id)=p_group and pm.meal_date>=p_week and pm.meal_date<p_week+7 and p.calendar_active
 and p.row_id=(select row_id from public.meal_plans where user_id=a.user_id and week_of=p.week_of and calendar_active order by version desc,row_id desc limit 1);
$$;
create or replace function private.reconcile_personal_cooking_grocery(p_user uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$
declare header public.grocery_lists; generated record; ids text[]:='{}'::text[];
begin
 select * into header from public.grocery_lists where user_id=p_user and week_of=p_week and calendar_active for update;
 if header.row_id is null then return; end if;
 for generated in
 with latest as(select row_id from public.meal_plans where user_id=p_user and week_of=p_week and calendar_active order by version desc,row_id desc limit 1),
 quantities as(select i.food_row_id,i.servings*p.servings/m.servings amount from public.planned_meals p join latest on latest.row_id=p.meal_plan_row_id join public.meals m on m.row_id=p.meal_row_id join public.meal_ingredients i on i.meal_row_id=m.row_id where not p.skipped and not exists(select 1 from public.cooking_assignments a where a.user_id=p_user and a.id=p.app_id and private.cooking_group_for(p_user)=a.group_id)
 union all select p.food_row_id,p.servings from public.planned_meals p join latest on latest.row_id=p.meal_plan_row_id where p.food_row_id is not null and not p.skipped),
 totals as(select food_row_id,sum(amount) amount from quantities group by food_row_id)
 select f.row_id,'gi-'||f.app_id id,f.name,f.category,case when f.serving_unit='piece' then 'pcs' else 'g' end unit,case when f.serving_unit='piece' then ceil(t.amount) else round(t.amount*f.serving_grams) end quantity from totals t join public.foods f on f.row_id=t.food_row_id
 loop
  ids:=ids||generated.id;
  insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,source_food_row_id)
  values(header.row_id,p_user,generated.id,generated.name,generated.category,generated.unit,generated.quantity,generated.quantity,generated.row_id)
  on conflict(grocery_list_row_id,app_id) do update set quantity=case when grocery_items.quantity=grocery_items.generated_quantity then excluded.generated_quantity else grocery_items.quantity end,generated_quantity=excluded.generated_quantity;
 end loop;
 update public.grocery_items set removed=true where grocery_list_row_id=header.row_id and not custom_item and not(app_id=any(ids));
 update public.grocery_lists set updated_at=now() where row_id=header.row_id;
end;
$$;
CREATE OR REPLACE FUNCTION "private"."regenerate_grocery"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    where calendar_active and user_id = caller_id
      and (
        (nullif(grocery->>'id','') is not null or nullif(grocery->>'weekOf','') is not null) and (nullif(grocery->>'id','') is null or app_id=grocery->>'id') and (nullif(grocery->>'weekOf','') is null or week_of=(grocery->>'weekOf')::date)
      )
    order by row_id desc
    limit 1
    for update;

    if grocery_row_id is null then
      perform private.raise_mutation_error('not_found', 'grocery list not found');
    end if;

    if p_payload ? 'weekOf' then
      -- Sum only the selected week's latest plan; nutrition servings remain canonical.
      with selected_plan as (
        select row_id from public.meal_plans where calendar_active and user_id=caller_id and week_of=(p_payload->>'weekOf')::date order by version desc,row_id desc limit 1
      ), quantities as (
        select i.food_row_id, i.servings * p.servings / m.servings amount
        from public.planned_meals p join selected_plan s on s.row_id=p.meal_plan_row_id
        join public.meals m on m.row_id=p.meal_row_id join public.meal_ingredients i on i.meal_row_id=m.row_id
        where p.user_id=caller_id and not p.skipped and not exists(select 1 from public.cooking_assignments ca where ca.user_id=p.user_id and ca.id=p.app_id and private.cooking_group_for(p.user_id)=ca.group_id)
        union all
        select p.food_row_id,p.servings from public.planned_meals p join selected_plan s on s.row_id=p.meal_plan_row_id
        where p.user_id=caller_id and not p.skipped and not exists(select 1 from public.cooking_assignments ca where ca.user_id=p.user_id and ca.id=p.app_id and private.cooking_group_for(p.user_id)=ca.group_id) and p.food_row_id is not null
      ), totals as (
        select food_row_id,sum(amount) amount from quantities group by food_row_id
      ) select jsonb_set(grocery,'{items}',coalesce(jsonb_agg(jsonb_build_object(
        'id','gi-' || f.app_id,'foodId',f.app_id,'name',f.name,'category',f.category,
        'unit',case when f.serving_unit='piece' then 'pcs' else 'g' end,
        'generatedQuantity',case when f.serving_unit='piece' then ceil(t.amount) else round(t.amount*f.serving_grams) end,
        'quantity',case when f.serving_unit='piece' then ceil(t.amount) else round(t.amount*f.serving_grams) end
      ) order by f.app_id),'[]'::jsonb),true) into grocery
      from totals t join public.foods f on f.row_id=t.food_row_id;
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

    perform private.reconcile_grocery_items(caller_id,grocery);
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
CREATE OR REPLACE FUNCTION "private"."regroup_calendar"("p_user" "uuid", "p_from" integer, "p_to" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
        where pm.meal_plan_row_id=next_plan and not pm.skipped and not exists(select 1 from public.cooking_assignments ca where ca.user_id=pm.user_id and ca.id=pm.app_id and private.cooking_group_for(pm.user_id)=ca.group_id)
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
create or replace function public.get_cooking_group_week(p_week_of date) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); state public.cooking_group_weeks; latest public.cooking_generations;
begin
 if gid is null then return jsonb_build_object('group',null,'weekOf',p_week_of,'recipes','[]'::jsonb,'assignments','[]'::jsonb,'grocery',null,'generation',null,'notices','[]'::jsonb,'revision',0); end if;
 if private.calendar_week(p_week_of,private.account_week_start(caller))<>p_week_of then perform private.raise_mutation_error('validation_failed','Choose the account week'); end if;
 select * into state from public.cooking_group_weeks where group_id=gid and week_of=p_week_of;
 select * into latest from public.cooking_generations where group_id=gid and (week_of=p_week_of or exists(select 1 from public.cooking_assignments a where a.generation_id=cooking_generations.id and a.meal_date>=p_week_of and a.meal_date<p_week_of+7)) order by created_at desc,id desc limit 1;
 return jsonb_build_object('group',private.cooking_group_json(gid),'weekOf',p_week_of,
 'recipes',(select coalesce(jsonb_agg(private.cooking_recipe_json(m) order by m.name,m.app_id),'[]'::jsonb) from public.meals m where m.archived_at is null and (m.is_system or m.owner_user_id in (select user_id from public.cooking_group_members where group_id=gid)) and m.app_id not like 'group-copy-%'),
 'assignments',(select coalesce(jsonb_agg(case when a->>'memberId'=caller::text then a else a-'protected' end),'[]'::jsonb) from jsonb_array_elements(private.cooking_live_assignments(gid,p_week_of)) a),'revision',coalesce(state.revision,0),
 'grocery',case when state.group_id is null then null else state.grocery||jsonb_build_object('id',gid::text||':'||p_week_of::text,'weekOf',p_week_of,'revision',state.revision) end,
 'generation',case when latest.id is null then null else private.cooking_generation_json(latest,caller) end,
 'notices',(select coalesce(jsonb_agg(private.cooking_generation_json(n,caller) order by n.created_at desc,n.id desc),'[]'::jsonb) from public.cooking_generations n join public.cooking_generation_notices r on r.generation_id=n.id and r.user_id=caller where n.group_id=gid and r.acknowledged_at is null));
end;
$$;
create function private.cooking_group_command(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid; group_row public.cooking_groups; invitation private.cooking_invitations;
 action text:=p_payload->>'action'; claim record; pin text; random_byte integer; result jsonb; proposal public.cooking_week_proposals;
 member uuid; old_start integer; source_state jsonb; destination_state jsonb; 
begin
 perform private.assert_json_shape(p_payload,'payload','object');
 gid:=private.cooking_group_for(caller);
 if action='inspect-pin' then
   insert into private.cooking_pin_attempts values(caller,now(),1) on conflict(user_id) do update set
     attempts=case when cooking_pin_attempts.started_at<now()-interval '15 minutes' then 1 else cooking_pin_attempts.attempts+1 end,
     started_at=case when cooking_pin_attempts.started_at<now()-interval '15 minutes' then now() else cooking_pin_attempts.started_at end;
   if (select attempts from private.cooking_pin_attempts where user_id=caller)>10 then return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.'); end if;
   select * into invitation from private.cooking_invitations where pin_hash=encode(extensions.digest(upper(btrim(p_payload->>'pin')),'sha256'),'hex') and consumed_at is null and expires_at>now();
   if invitation.id is null or invitation.created_by=caller or gid is not null then return jsonb_build_object('error','This PIN is invalid or expired.'); end if;
   select * into group_row from public.cooking_groups where id=invitation.group_id and archived_at is null;
   if group_row.id is null then return jsonb_build_object('error','This PIN is invalid or expired.'); end if;
   if private.account_week_start(caller)<>group_row.week_starts_on then return jsonb_build_object('error','Match the group Start of week in Settings before connecting.'); end if;
   insert into private.cooking_pin_reviews(user_id,invitation_id,expires_at) values(caller,invitation.id,least(invitation.expires_at,now()+interval '5 minutes')) on conflict(user_id) do update set invitation_id=excluded.invitation_id,expires_at=excluded.expires_at;
   return jsonb_build_object('group',private.cooking_group_json(group_row.id),'inviter',(select name from public.profiles where id=invitation.created_by));
 end if;
 -- Group lock precedes all existing account locks, including idempotency receipts.
 if action='join' then
   select * into invitation from private.cooking_invitations where pin_hash=encode(extensions.digest(upper(btrim(p_payload->>'pin')),'sha256'),'hex'); gid:=invitation.group_id;
 end if;
 if gid is not null then perform private.lock_cooking_group(gid); end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':calendar',0));
 select * into claim from private.claim_mutation(caller,'cooking_group_'||action,p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 if action='invite' then
   if gid is null then
     if not exists(select 1 from public.profiles where id=caller) then perform private.raise_mutation_error('validation_failed','Finish onboarding first'); end if;
     insert into public.cooking_groups(week_starts_on) values(private.account_week_start(caller)) returning id into gid;
     insert into public.cooking_group_members(user_id,group_id) values(caller,gid);
   end if;
   if (select count(*) from public.cooking_group_members where group_id=gid)>=6 then perform private.raise_mutation_error('validation_failed','This group already has six members'); end if;
   update private.cooking_invitations set consumed_at=now() where created_by=caller and consumed_at is null;
   loop
     pin:=''; while length(pin)<6 loop random_byte:=get_byte(extensions.gen_random_bytes(1),0); if random_byte<252 then pin:=pin||substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',(random_byte%36)+1,1); end if; end loop;
     exit when not exists(select 1 from private.cooking_invitations where pin_hash=encode(extensions.digest(pin,'sha256'),'hex'));
   end loop;
   insert into private.cooking_invitations(group_id,created_by,pin_hash,expires_at) values(gid,caller,encode(extensions.digest(pin,'sha256'),'hex'),now()+interval '15 minutes');
   -- Receipt retains no recoverable PIN; an unchanged retry issues a replacement.
   result:=jsonb_build_object('group',private.cooking_group_json(gid),'expiresAt',now()+interval '15 minutes','success',true);
 elsif action='join' then
   select * into invitation from private.cooking_invitations where id=invitation.id for update;
   if not exists(select 1 from private.cooking_pin_reviews where user_id=caller and invitation_id=invitation.id and expires_at>now()) or invitation.id is null or invitation.consumed_at is not null or invitation.expires_at<=now() or private.cooking_group_for(caller) is not null then perform private.raise_mutation_error('validation_failed','This PIN is invalid or expired.'); end if;
   select * into group_row from public.cooking_groups where id=gid and archived_at is null for update;
   if group_row.revision is distinct from (p_payload->>'groupRevision')::integer then perform private.raise_mutation_error('stale_version','Group changed. Review the connection again.'); end if;
   if private.account_week_start(caller)<>group_row.week_starts_on or (select count(*) from public.cooking_group_members where group_id=gid)>=6 then perform private.raise_mutation_error('validation_failed','Match the week start and check group capacity.'); end if;
   insert into public.cooking_group_members(user_id,group_id) values(caller,gid);
   update private.cooking_invitations set consumed_at=now() where id=invitation.id;
   update public.cooking_week_proposals set status='invalidated' where group_id=gid and status='pending';
   update public.cooking_groups set revision=revision+1 where id=gid;
   result:=jsonb_build_object('group',private.cooking_group_json(gid),'success',true);
 elsif action='leave' then
   if gid is null or gid::text is distinct from p_payload->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
   if (select revision from public.cooking_groups where id=gid) is distinct from (p_payload->>'groupRevision')::integer then perform private.raise_mutation_error('stale_version','Group changed. Refresh and review.'); end if;
   delete from public.cooking_group_members where user_id=caller;
   update private.cooking_invitations set consumed_at=now() where created_by=caller;
   update public.cooking_week_proposals set status='invalidated' where group_id=gid and status='pending';
   update public.cooking_groups set revision=revision+1,archived_at=case when not exists(select 1 from public.cooking_group_members where group_id=gid) then now() else null end where id=gid;
   result:='{"success":true}'::jsonb;
 elsif action='acknowledge' then
   update public.cooking_generation_notices set acknowledged_at=coalesce(acknowledged_at,now()) where user_id=caller and generation_id=(p_payload->>'generationId')::uuid;
   result:='{"success":true}'::jsonb;
 elsif action in ('propose-week','vote-week') then
   if gid is null then perform private.raise_mutation_error('not_found','Group not found'); end if;
   select * into group_row from public.cooking_groups where id=gid for update;
   if group_row.revision is distinct from (p_payload->>'groupRevision')::integer then perform private.raise_mutation_error('stale_version','Group changed. Refresh and review.'); end if;
   if action='propose-week' then
     perform private.assert_finite_number(p_payload->>'day','day',0,6);
     if (p_payload->>'day')::numeric<>trunc((p_payload->>'day')::numeric) then perform private.raise_mutation_error('validation_failed','Choose a weekday'); end if;
     update public.cooking_week_proposals set status='invalidated' where group_id=gid and status='pending';
     insert into public.cooking_week_proposals(group_id,day,approvals) values(gid,(p_payload->>'day')::integer,array[caller]) returning * into proposal;
   else
     select * into proposal from public.cooking_week_proposals where id=(p_payload->>'proposalId')::uuid and group_id=gid and status='pending' for update;
     if proposal.id is null then perform private.raise_mutation_error('stale_version','Proposal changed. Refresh and review.'); end if;
     if (p_payload->>'approve')::boolean then update public.cooking_week_proposals set approvals=array(select distinct unnest(approvals||caller)) where id=proposal.id returning * into proposal;
     else update public.cooking_week_proposals set status='rejected' where id=proposal.id; end if;
   end if;
   if not exists(select 1 from public.cooking_group_members where group_id=gid and not(user_id=any(proposal.approvals))) and coalesce((p_payload->>'approve')::boolean,true) then
     select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) into source_state from public.cooking_group_weeks w where group_id=gid;
     perform set_config('app.cooking_calendar_transition','true',true);
     for member in select user_id from public.cooking_group_members where group_id=gid order by user_id loop
       old_start:=private.account_week_start(member);
       perform private.regroup_calendar(member,old_start,proposal.day);
       update public.profiles set week_starts_on=proposal.day,calendar_revision=calendar_revision+1 where id=member;
     end loop;
     perform private.regroup_cooking_calendar(gid,source_state,proposal.day);
     update public.cooking_groups set week_starts_on=proposal.day where id=gid;
     update public.cooking_week_proposals set status='applied' where id=proposal.id;
     select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) into destination_state from public.cooking_group_weeks w where group_id=gid;
     insert into public.cooking_calendar_transitions(group_id,source_state,destination_state) values(gid,source_state,destination_state);
   end if;
   update public.cooking_groups set revision=revision+1 where id=gid;
   result:=jsonb_build_object('group',private.cooking_group_json(gid),'success',true);
 else perform private.raise_mutation_error('validation_failed','Unknown cooking group action'); end if;
 perform private.complete_mutation(claim.mutation_row_id,result);
 if action='invite' then return result||jsonb_build_object('pin',pin); end if;
 return result;
end;
$$;
revoke all on function private.cooking_group_command(jsonb) from public,anon,authenticated;
create or replace function public.cooking_group_command(p_payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.cooking_group_command(p_payload); $$;

create function private.commit_cooking_group_plan(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); preview private.cooking_previews; claim record; gen uuid;
 member uuid; old_plan public.meal_plans; next_plan bigint; target bigint; item jsonb; source_recipe public.meals; copy_recipe bigint; normalized jsonb; existing public.planned_meals;
 result jsonb; position integer;
begin
 if gid is null then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 select * into claim from private.claim_mutation(caller,'commit_cooking_group_plan',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 select * into preview from private.cooking_previews where id=(p_payload->>'previewId')::uuid and group_id=gid and created_by=caller for update;
 if preview.id is null or preview.expires_at<=now() or private.cooking_basis(gid,preview.week_of) is distinct from preview.basis then perform private.raise_mutation_error('stale_version','Planning details changed. Refresh and review the preview.'); end if;
 if coalesce((p_payload->>'acknowledged')::boolean,false)=false then perform private.raise_mutation_error('validation_failed','Review replacements, portions, and leftovers before saving'); end if;
 if jsonb_array_length(preview.preview->'assignments')=0 then perform private.raise_mutation_error('validation_failed','No assignments to save'); end if;
 insert into public.cooking_generations(group_id,week_of,generated_by,generator_name,member_ids,summary)
 values(gid,preview.week_of,caller,(select name from public.profiles where id=caller),array(select jsonb_array_elements_text(preview.request->'memberIds')::uuid),preview.preview) returning id into gen;
 for member in select jsonb_array_elements_text(preview.request->'memberIds')::uuid order by 1 loop
   if private.cooking_group_for(member) is distinct from gid then perform private.raise_mutation_error('stale_version','Membership changed. Review the preview.'); end if;
   select * into old_plan from public.meal_plans where user_id=member and week_of=preview.week_of and calendar_active order by version desc,row_id desc limit 1 for update;
   if old_plan.row_id is null then
     select row_id into target from public.daily_targets where user_id=member and effective_date<=preview.week_of+6 order by effective_date desc,version desc limit 1;
     if target is null then perform private.raise_mutation_error('validation_failed','An eligible target is required'); end if;
     insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id) values('mp-'||preview.week_of::text,member,coalesce((select max(version)+1 from public.meal_plans where user_id=member and week_of=preview.week_of),1),preview.week_of,target) returning row_id into next_plan;
   else
     next_plan:=private.cooking_copy_row('meal_plans',old_plan.row_id,jsonb_build_object('version',old_plan.version+1,'supersedes_plan_row_id',old_plan.row_id,'created_at',now()));
     for existing in select * from public.planned_meals where meal_plan_row_id=old_plan.row_id loop
       if not exists(select 1 from jsonb_array_elements(preview.preview->'replacements') r where r->>'memberId'=member::text and r->>'id'=existing.app_id) then
         perform private.cooking_copy_row('planned_meals',existing.row_id,jsonb_build_object('meal_plan_row_id',next_plan));
       end if;
     end loop;
   end if;
   position:=coalesce((select max(sort_order) from public.planned_meals where meal_plan_row_id=next_plan),0);
   for item in select value from jsonb_array_elements(preview.preview->'assignments') where value->>'memberId'=member::text loop
     if not (preview.request->'selectedDates' ? (item->>'date')) then perform private.raise_mutation_error('validation_failed','Assignment outside selected days'); end if;
     select * into source_recipe from public.meals where app_id=item->>'recipeId' and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid));
     if source_recipe.row_id is null then perform private.raise_mutation_error('stale_version','Recipe unavailable'); end if;
     perform private.assert_generation_recipe(source_recipe,(select p from public.profiles p where id=member));
     copy_recipe:=private.cooking_copy_recipe(source_recipe.row_id,member);
     normalized:=private.normalize_planned_meal_record(jsonb_build_object('mealId',(select app_id from public.meals where row_id=copy_recipe),'servings',item->'servings'),member);
     position:=position+1;
     insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,label,servings,expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order)
     values(next_plan,member,preview.week_of,item->>'id',(item->>'date')::date,item->>'slot',copy_recipe,source_recipe.name,(item->>'servings')::numeric,(normalized->>'expectedCalories')::numeric,(normalized->>'expectedProteinG')::numeric,(normalized->>'expectedCarbsG')::numeric,(normalized->>'expectedFatG')::numeric,normalized->>'source',normalized->>'sourceVersion',normalized->>'assumptions',normalized->>'confidence',normalized->>'preparationBasis','group:'||(item->>'id'),position);
     insert into public.cooking_assignments(id,user_id,group_id,generation_id,recipe_id,recipe_snapshot_row_id,meal_date,meal_slot) values(item->>'id',member,gid,gen,source_recipe.app_id,copy_recipe,(item->>'date')::date,item->>'slot');
     update public.planned_meals set shared_grocery=true where meal_plan_row_id=next_plan and app_id=item->>'id';
   end loop;
   insert into public.cooking_generation_notices(generation_id,user_id) values(gen,member);
   perform private.reconcile_personal_cooking_grocery(member,preview.week_of);
 end loop;
 insert into public.cooking_generation_notices(generation_id,user_id) values(gen,caller) on conflict do nothing;
 perform private.reconcile_cooking_grocery(gid,preview.week_of);
 result:=jsonb_build_object('success',true,'generationId',gen);
 perform private.complete_mutation(claim.mutation_row_id,result);
 return result;
end;
$$;
revoke all on function private.commit_cooking_group_plan(jsonb) from public,anon,authenticated;
create or replace function public.commit_cooking_group_plan(p_payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.commit_cooking_group_plan(p_payload); $$;

create function private.mutate_cooking_group_week(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); week date; state public.cooking_group_weeks;
 claim record; items jsonb; item jsonb; amount numeric; quantity numeric; result jsonb; assignment public.cooking_assignments; pm public.planned_meals; plan public.meal_plans; next_plan bigint; normalized jsonb; chosen public.meals; recipe_to_use bigint;
begin
 if gid is null or gid::text is distinct from p_payload->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 select * into claim from private.claim_mutation(caller,'mutate_cooking_group_week',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 perform private.assert_date_key(p_payload->>'weekOf','weekOf'); week:=(p_payload->>'weekOf')::date;
 if private.calendar_week(week,private.account_week_start(caller))<>week then perform private.raise_mutation_error('stale_version','Calendar changed. Return to the newly grouped list.'); end if;
 insert into public.cooking_group_weeks(group_id,week_of) values(gid,week) on conflict do nothing;
 select * into state from public.cooking_group_weeks where group_id=gid and week_of=week for update;
 if state.revision is distinct from (p_payload->>'revision')::integer then perform private.raise_mutation_error('stale_version','Shared list changed. Refresh and review the latest value.'); end if;
 if p_payload->>'action'='edit-assignment' then
   perform set_config('app.cooking_edit',gid::text,true);
   select * into assignment from public.cooking_assignments where group_id=gid and id=p_payload->>'assignmentId';
   if assignment.id is null or private.cooking_group_for(assignment.user_id) is distinct from gid then perform private.raise_mutation_error('not_found','Assignment not found'); end if;
   select * into plan from public.meal_plans where user_id=assignment.user_id and week_of=week and calendar_active order by version desc,row_id desc limit 1 for update;
   select * into pm from public.planned_meals where meal_plan_row_id=plan.row_id and app_id=assignment.id;
   if pm.row_id is null then perform private.raise_mutation_error('stale_version','Assignment changed. Refresh and review.'); end if;
   if exists(select 1 from public.nutrition_logs where user_id=assignment.user_id and planned_meal_app_id=assignment.id) then perform private.raise_mutation_error('conflict','This saved assignment is protected. Refresh your plan or choose another meal.'); end if;
   perform private.assert_finite_number(p_payload->>'servings','servings',.25,4);
   if (p_payload->>'servings')::numeric*4<>trunc((p_payload->>'servings')::numeric*4) then perform private.raise_mutation_error('validation_failed','Choose quarter servings'); end if;
   recipe_to_use:=pm.meal_row_id;
   if nullif(p_payload->>'recipeId','') is not null and p_payload->>'recipeId'<>assignment.recipe_id then
     select * into chosen from public.meals where app_id=p_payload->>'recipeId' and archived_at is null and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid));
     if chosen.row_id is null or not(pm.meal_slot=any(chosen.meal_slots)) then perform private.raise_mutation_error('validation_failed','Choose an available recipe for this meal'); end if;
     perform private.assert_generation_recipe(chosen,(select p from public.profiles p where id=assignment.user_id));
     recipe_to_use:=private.cooking_copy_recipe(chosen.row_id,assignment.user_id);
     update public.cooking_assignments set recipe_id=chosen.app_id,recipe_snapshot_row_id=recipe_to_use where user_id=assignment.user_id and id=assignment.id;
   end if;
   normalized:=private.normalize_planned_meal_record(jsonb_build_object('mealId',(select app_id from public.meals where row_id=recipe_to_use),'servings',p_payload->'servings'),assignment.user_id);
   if private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) is not null and (normalized->>'expectedCarbsG')::numeric+coalesce((select sum(expected_carbs_g) from public.planned_meals where meal_plan_row_id=plan.row_id and meal_date=pm.meal_date and not skipped and row_id<>pm.row_id),0)>private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) then perform private.raise_mutation_error('validation_failed','Portion exceeds this member’s planning limits'); end if;
   next_plan:=private.cooking_copy_row('meal_plans',plan.row_id,jsonb_build_object('version',plan.version+1,'supersedes_plan_row_id',plan.row_id,'created_at',now()));
   for item in select to_jsonb(p) from public.planned_meals p where meal_plan_row_id=plan.row_id loop
     perform private.cooking_copy_row('planned_meals',(item->>'row_id')::bigint,jsonb_build_object('meal_plan_row_id',next_plan)||case when item->>'app_id'=assignment.id then jsonb_build_object('meal_row_id',recipe_to_use,'label',normalized->'label','source',normalized->'source','source_version',normalized->'sourceVersion','assumptions',normalized->'assumptions','servings',p_payload->'servings','skipped',(p_payload->>'skipped')::boolean,'expected_calories',normalized->'expectedCalories','expected_protein_g',normalized->'expectedProteinG','expected_carbs_g',normalized->'expectedCarbsG','expected_fat_g',normalized->'expectedFatG') else '{}'::jsonb end);
   end loop;
   perform private.reconcile_cooking_grocery(gid,week);
 elsif p_payload->>'operation'='refresh' then perform private.reconcile_cooking_grocery(gid,week);
 elsif p_payload->>'operation'='amount' then
   if jsonb_typeof(p_payload->'amount') is distinct from 'null' then
     perform private.assert_finite_number(p_payload->>'amount','amount',0,9007199254740991);
     amount:=(p_payload->>'amount')::numeric;
     if amount<>trunc(amount) then perform private.raise_mutation_error('validation_failed','Use integer centavos'); end if;
   end if;
   update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('totalAmountCentavos',amount,'totalAmountCarriedFromWeek',null),revision=revision+1 where group_id=gid and week_of=week;
 else
   items:='[]';
   if p_payload->>'operation'='add' then
     perform private.assert_nonblank(p_payload->>'name','name',256); perform private.assert_nonblank(p_payload->>'unit','unit',32);
     perform private.assert_finite_number(p_payload->>'quantity','quantity',0,1000000);
     items:=state.grocery->'items'||jsonb_build_array(jsonb_build_object('id','custom-'||gen_random_uuid()::text,'name',btrim(p_payload->>'name'),'unit',p_payload->>'unit','category','Other','quantity',(p_payload->>'quantity')::numeric,'generatedQuantity',0,'custom',true,'checked',false));
   else
     if not exists(select 1 from jsonb_array_elements(state.grocery->'items') i where i->>'id'=p_payload->>'itemId') then perform private.raise_mutation_error('not_found','Item not found'); end if;
     for item in select value from jsonb_array_elements(state.grocery->'items') loop
       if item->>'id'=p_payload->>'itemId' then
         case p_payload->>'operation'
         when 'quantity' then
           perform private.assert_finite_number(p_payload->>'quantity','quantity',0,1000000); quantity:=(p_payload->>'quantity')::numeric;
           item:=item||jsonb_build_object('quantity',quantity);
         when 'toggle' then item:=item||jsonb_build_object('checked',not coalesce((item->>'checked')::boolean,false));
         when 'remove' then item:=item||'{"removed":true}'::jsonb;
         else perform private.raise_mutation_error('validation_failed','Choose a grocery action'); end case;
       end if;
       items:=items||jsonb_build_array(item);
     end loop;
   end if;
   update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('items',items),revision=revision+1 where group_id=gid and week_of=week;
 end if;
 result:='{"success":true}'::jsonb; perform private.complete_mutation(claim.mutation_row_id,result); return result;
end;
$$;
revoke all on function private.mutate_cooking_group_week(jsonb) from public,anon,authenticated;
create or replace function public.mutate_cooking_group_week(p_payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.mutate_cooking_group_week(p_payload); $$;

create function private.copy_cooking_recipe(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); recipe public.meals; retained bigint; copied bigint; ingredient public.meal_ingredients; app text; claim record; result jsonb;
begin
 if gid is not null then perform private.lock_cooking_group(gid); end if;
 select * into claim from private.claim_mutation(caller,'copy_cooking_recipe',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 select * into recipe from public.meals where app_id=p_payload->>'recipeId' and (is_system or owner_user_id=caller or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid));
 if recipe.row_id is null then perform private.raise_mutation_error('not_found','Recipe unavailable'); end if;
 retained:=private.cooking_copy_recipe(recipe.row_id,caller); app:='meal-'||gen_random_uuid()::text;
 copied:=private.cooking_copy_row('meals',retained,jsonb_build_object('app_id',app,'name',recipe.name||' (personal copy)'));
 for ingredient in select * from public.meal_ingredients where meal_row_id=retained loop perform private.cooking_copy_row('meal_ingredients',ingredient.row_id,jsonb_build_object('meal_row_id',copied)); end loop;
 result:=jsonb_build_object('success',true,'recipeId',app); perform private.complete_mutation(claim.mutation_row_id,result); return result;
end;
$$;
revoke all on function private.copy_cooking_recipe(jsonb) from public,anon,authenticated;
create or replace function public.copy_cooking_recipe(p_payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.copy_cooking_recipe(p_payload); $$;
