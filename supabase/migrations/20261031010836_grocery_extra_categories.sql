-- Categories are shopping organization only; preferences never establish food identity.
create table public.grocery_category_preferences (
 scope_key text not null,
 name_key text not null check (length(name_key) between 1 and 256),
 user_id uuid references auth.users(id) on delete cascade,
 group_id uuid references public.cooking_groups(id) on delete cascade,
 category text check (category in ('Produce','Protein','Dairy','Grains','Pantry','Other')),
 revision integer not null default 1 check (revision > 0),
 updated_at timestamptz not null default now(),
 primary key(scope_key,name_key),
 check ((user_id is not null and group_id is null and scope_key='user:'||user_id::text) or
        (group_id is not null and user_id is null and scope_key='group:'||group_id::text))
);
create index grocery_category_preferences_user on public.grocery_category_preferences(user_id) where user_id is not null;
create index grocery_category_preferences_group on public.grocery_category_preferences(group_id) where group_id is not null;
alter table public.grocery_category_preferences enable row level security;
revoke all on public.grocery_category_preferences from public,anon,authenticated;
grant select on public.grocery_category_preferences to authenticated;
create policy category_preferences_read on public.grocery_category_preferences for select to authenticated
 using (user_id=(select auth.uid()) or group_id in(select m.group_id from public.cooking_group_members m where m.user_id=(select auth.uid())));

create function private.grocery_name_key(p_name text) returns text language sql immutable set search_path='' as $$
 select lower(btrim(regexp_replace(normalize(p_name,NFKC),'[[:space:]]+',' ','g')));
$$;
create function private.save_grocery_category_preference(p_group uuid,p_name text,p_category text,p_intent jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); scope text; key text:=private.grocery_name_key(p_name); current_revision integer;
begin
 if p_category is null or p_category not in ('Produce','Protein','Dairy','Grains','Pantry','Other') then perform private.raise_mutation_error('validation_failed','Choose a valid grocery category'); end if;
 if p_intent is null then return; end if;
 if jsonb_typeof(p_intent)<>'object' or coalesce(p_intent->>'action','') not in ('remember','reset') then perform private.raise_mutation_error('validation_failed','Choose a category preference action'); end if;
 perform private.assert_finite_number(p_intent->>'expectedRevision','category preference revision',0,2147483647);
 if (p_intent->>'expectedRevision')::numeric<>trunc((p_intent->>'expectedRevision')::numeric) then perform private.raise_mutation_error('validation_failed','Invalid category revision'); end if;
 if p_group is not null and private.cooking_group_for(caller) is distinct from p_group then perform private.raise_mutation_error('not_found','Group not found'); end if;
 scope:=case when p_group is null then 'user:'||caller::text else 'group:'||p_group::text end;
 perform pg_advisory_xact_lock(hashtextextended(scope||':category:'||key,0));
 select revision into current_revision from public.grocery_category_preferences where scope_key=scope and name_key=key for update;
 if coalesce(current_revision,0)<>(p_intent->>'expectedRevision')::integer then perform private.raise_mutation_error('stale_version','Saved category changed. Refresh categories and review your choice.'); end if;
 -- A null category is a revisioned reset tombstone, preventing stale edits after reset.
 insert into public.grocery_category_preferences(scope_key,name_key,user_id,group_id,category)
 values(scope,key,case when p_group is null then caller end,p_group,case when p_intent->>'action'='remember' then p_category end)
 on conflict(scope_key,name_key) do update set category=excluded.category,revision=grocery_category_preferences.revision+1,updated_at=now();
end; $$;
create function public.get_grocery_category_preferences(p_group_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); scope text;
begin
 if p_group_id is not null then
  perform private.lock_cooking_group(p_group_id);
  if private.cooking_group_for(caller) is distinct from p_group_id then perform private.raise_mutation_error('not_found','Group not found'); end if;
 end if;
 scope:=case when p_group_id is null then 'user:'||caller::text else 'group:'||p_group_id::text end;
 return coalesce((select jsonb_agg(jsonb_build_object('nameKey',name_key,'category',category,'revision',revision) order by name_key) from public.grocery_category_preferences where scope_key=scope),'[]'::jsonb);
end; $$;
revoke all on function private.grocery_name_key(text),private.save_grocery_category_preference(uuid,text,text,jsonb),public.get_grocery_category_preferences(uuid) from public,anon,authenticated;
grant execute on function public.get_grocery_category_preferences(uuid) to authenticated;
CREATE OR REPLACE FUNCTION private.add_custom_grocery_item(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    perform private.assert_nonblank(item->>'name','name',256);
    perform private.save_grocery_category_preference(null,item->>'name',coalesce(item->>'category','Other'),p_payload->'categoryPreference');
    select row_id into grocery_row_id
    from public.grocery_lists
    where calendar_active and user_id = caller_id
      and (nullif(grocery->>'id','') is not null or nullif(grocery->>'weekOf','') is not null) and (nullif(grocery->>'id','') is null or app_id=grocery->>'id') and (nullif(grocery->>'weekOf','') is null or week_of=(grocery->>'weekOf')::date)
    order by row_id desc
    limit 1
    for update;
    if grocery_row_id is null and p_payload ? 'weekOf' then
      insert into public.grocery_lists(app_id,user_id,week_of) values(grocery->>'id',caller_id,(grocery->>'weekOf')::date) returning row_id into grocery_row_id;
    end if;
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

    result := jsonb_build_object('status', 'completed', 'operation', 'add_custom_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id, 'grocery_list_id', grocery->>'id', 'groceryItem', item||jsonb_build_object('name',btrim(item->>'name'),'category',coalesce(item->>'category','Other'),'quantity',(item->>'quantity')::numeric(12,3))));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$function$;
CREATE OR REPLACE FUNCTION private.set_grocery_quantity(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  item_quantity numeric := (p_payload->>'quantity')::numeric;
  result jsonb; saved public.grocery_items; previous_category text;
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
    select * into saved from public.grocery_items where user_id=caller_id and app_id=item_id
      and grocery_list_row_id=(select row_id from public.grocery_lists where calendar_active and user_id=caller_id
       and app_id=p_payload->'grocery'->>'id' and week_of=(p_payload->'grocery'->>'weekOf')::date limit 1) for update;
    previous_category:=saved.category;
    if p_payload ? 'category' then
      if saved.row_id is null or not saved.custom_item then perform private.raise_mutation_error('validation_failed','Only manually added items can change category'); end if;
      perform private.save_grocery_category_preference(null,saved.name,p_payload->>'category',p_payload->'categoryPreference');
    elsif p_payload ? 'categoryPreference' then perform private.raise_mutation_error('validation_failed','Category is required'); end if;
    update public.grocery_items
    set category=coalesce(p_payload->>'category',category), quantity = item_quantity
    where user_id = caller_id and app_id = item_id
      and grocery_list_row_id = (select row_id from public.grocery_lists where calendar_active and user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);
    if not found then
      perform private.raise_mutation_error('not_found', 'grocery item not found');
    end if;
    update public.grocery_lists set updated_at=now() where user_id=caller_id and row_id=(select row_id from public.grocery_lists where calendar_active and user_id = caller_id
        and (p_payload->'grocery'->>'weekOf' is null or week_of=(p_payload->'grocery'->>'weekOf')::date)
        and (p_payload->'grocery'->>'id' is null or app_id=p_payload->'grocery'->>'id')
        order by week_of desc,row_id desc limit 1);

    result := jsonb_build_object('status', 'completed', 'operation', 'set_grocery_quantity', 'result_refs', jsonb_build_object('grocery_item_id', item_id, 'previousCategory',previous_category,'groceryItem',(select jsonb_build_object('id',app_id,'name',name,'quantity',quantity,'unit',unit,'category',category) from public.grocery_items where row_id=saved.row_id)));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$function$;
CREATE OR REPLACE FUNCTION private.mutate_cooking_group_week(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); week date; state public.cooking_group_weeks;
 claim record; items jsonb; item jsonb; amount numeric; quantity numeric; result jsonb; assignment public.cooking_assignments; pm public.planned_meals; plan public.meal_plans; next_plan bigint; normalized jsonb; chosen public.meals; recipe_to_use bigint; saved_item jsonb; previous_category text;
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
          if plan.preference_policy='advisory_v1' then perform private.assert_generation_recipe(chosen,(select p from public.profiles p where id=assignment.user_id)); else perform private.assert_enforced_generation_recipe(chosen,(select p from public.profiles p where id=assignment.user_id)); end if;
     recipe_to_use:=private.cooking_copy_recipe(chosen.row_id,assignment.user_id);
     update public.cooking_assignments set recipe_id=chosen.app_id,recipe_snapshot_row_id=recipe_to_use where user_id=assignment.user_id and id=assignment.id;
   end if;
   normalized:=private.normalize_planned_meal_record(jsonb_build_object('mealId',(select app_id from public.meals where row_id=recipe_to_use),'servings',p_payload->'servings'),assignment.user_id);
   if plan.preference_policy<>'advisory_v1' and private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) is not null and (normalized->>'expectedCarbsG')::numeric+coalesce((select sum(expected_carbs_g) from public.planned_meals where meal_plan_row_id=plan.row_id and meal_date=pm.meal_date and not skipped and row_id<>pm.row_id),0)>private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) then perform private.raise_mutation_error('validation_failed','Portion exceeds this member’s planning limits'); end if;
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
     perform private.save_grocery_category_preference(gid,p_payload->>'name',coalesce(p_payload->>'category','Other'),p_payload->'categoryPreference');
     saved_item:=jsonb_build_object('id','custom-'||gen_random_uuid()::text,'name',btrim(p_payload->>'name'),'unit',p_payload->>'unit','category',coalesce(p_payload->>'category','Other'),'quantity',(p_payload->>'quantity')::numeric,'generatedQuantity',0,'custom',true,'checked',false);
     items:=state.grocery->'items'||jsonb_build_array(saved_item);
   else
     if not exists(select 1 from jsonb_array_elements(state.grocery->'items') i where i->>'id'=p_payload->>'itemId') then perform private.raise_mutation_error('not_found','Item not found'); end if;
     for item in select value from jsonb_array_elements(state.grocery->'items') loop
       if item->>'id'=p_payload->>'itemId' then
         case p_payload->>'operation'
         when 'quantity' then
           perform private.assert_finite_number(p_payload->>'quantity','quantity',0,1000000); quantity:=(p_payload->>'quantity')::numeric;
           previous_category:=item->>'category';
           if p_payload ? 'category' then
             if (case when jsonb_typeof(item->'personalGenerated')='boolean' then (item->>'personalGenerated')::boolean else not coalesce((item->>'custom')::boolean,false) end) then perform private.raise_mutation_error('validation_failed','Only manually added items can change category'); end if;
             perform private.save_grocery_category_preference(gid,item->>'name',p_payload->>'category',p_payload->'categoryPreference');
             item:=item||jsonb_build_object('category',p_payload->>'category');
           elsif p_payload ? 'categoryPreference' then perform private.raise_mutation_error('validation_failed','Category is required'); end if;
           item:=item||jsonb_build_object('quantity',quantity); saved_item:=item;
         when 'toggle' then item:=item||jsonb_build_object('checked',not coalesce((item->>'checked')::boolean,false));
         when 'remove' then item:=item||'{"removed":true}'::jsonb;
         else perform private.raise_mutation_error('validation_failed','Choose a grocery action'); end case;
       end if;
       items:=items||jsonb_build_array(item);
     end loop;
   end if;
   update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('items',items),revision=revision+1 where group_id=gid and week_of=week;
 end if;
 result:='{"success":true}'::jsonb||case when saved_item is not null then jsonb_build_object('groceryItem',saved_item,'previousCategory',previous_category) else '{}'::jsonb end; perform private.complete_mutation(claim.mutation_row_id,result); return result;
end;
$function$;
alter function private.build_account_export() rename to build_account_export_before_grocery_categories;
create function private.build_account_export() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated();
begin
 return private.build_account_export_before_grocery_categories()||jsonb_build_object('groceryCategoryPreferences',coalesce((select jsonb_agg(to_jsonb(p) order by name_key) from public.grocery_category_preferences p where user_id=caller),'[]'::jsonb));
end; $$;
revoke all on function private.build_account_export(),private.build_account_export_before_grocery_categories(),private.add_custom_grocery_item(jsonb),private.set_grocery_quantity(jsonb),private.mutate_cooking_group_week(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
