-- Preserve account deletion, recipe-version cooking quantities, and regrouped attribution.
CREATE OR REPLACE FUNCTION "private"."delete_account"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    perform set_config('app.cooking_delete_account',caller_id::text,true);
    delete from public.cooking_assignments where user_id=caller_id;
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
create or replace function private.guard_cooking_recipe_copy() returns trigger language plpgsql security definer set search_path='' as $$
declare app text;
begin
 if tg_table_name='meal_ingredients' then select app_id into app from public.meals where row_id=old.meal_row_id;
 else app:=to_jsonb(old)->>'app_id'; end if;
 if current_setting('app.cooking_delete_account',true) is distinct from coalesce(to_jsonb(old)->>'owner_user_id',(select owner_user_id::text from public.meals where row_id=(to_jsonb(old)->>'meal_row_id')::bigint)) and app like 'group-copy-%' and exists(select 1 from auth.users where id=coalesce((to_jsonb(old)->>'owner_user_id')::uuid,(select owner_user_id from public.meals where row_id=(to_jsonb(old)->>'meal_row_id')::bigint))) then
   perform private.raise_mutation_error('conflict','Saved group recipe copies are retained unchanged. Save a personal copy to edit.');
 end if;
 return coalesce(new,old);
end;
$$;
create or replace function private.cooking_live_assignments(p_group uuid,p_week date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'memberId',a.user_id,'recipeId',a.recipe_id,'recipeRevision',(select revision from public.meals where row_id=a.recipe_snapshot_row_id),'label',pm.label,'date',pm.meal_date,'slot',pm.meal_slot,'servings',pm.servings,'skipped',pm.skipped,
 'protected',exists(select 1 from public.nutrition_logs l where l.user_id=a.user_id and l.planned_meal_app_id=a.id))), '[]'::jsonb)
 from public.cooking_assignments a join public.planned_meals pm on pm.user_id=a.user_id and pm.app_id=a.id
 join public.meal_plans p on p.row_id=pm.meal_plan_row_id
 where a.group_id=p_group and pm.meal_date>=p_week and pm.meal_date<p_week+7 and p.calendar_active
 and p.row_id=(select row_id from public.meal_plans where user_id=a.user_id and week_of=p.week_of and calendar_active order by version desc,row_id desc limit 1);
$$;
create or replace function private.reconcile_cooking_grocery(p_group uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$
declare state public.cooking_group_weeks; items jsonb:='[]'::jsonb; generated record; old jsonb; custom jsonb; live jsonb:=private.cooking_live_assignments(p_group,p_week);
begin
 perform set_config('app.cooking_dirty_'||replace(p_group::text,'-','')||'_'||replace(p_week::text,'-',''),'done',true);
 insert into public.cooking_group_weeks(group_id,week_of) values(p_group,p_week) on conflict do nothing;
 select * into state from public.cooking_group_weeks where group_id=p_group and week_of=p_week for update;
 for generated in
 with portions as(select a->>'recipeId' recipe_id,(a->>'recipeRevision')::integer recipe_revision,sum((a->>'servings')::numeric) portions from jsonb_array_elements(live) a where not coalesce((a->>'skipped')::boolean,false) group by 1,2),
 recipes as(select distinct on(a.recipe_id,m.revision) a.recipe_id,m.* from public.cooking_assignments a join public.meals m on m.row_id=a.recipe_snapshot_row_id where a.group_id=p_group order by a.recipe_id,m.revision,a.generation_id desc),
 totals as(select f.app_id,f.name,f.category,f.serving_unit,sum(i.servings*ceil(p.portions/m.servings)*case when f.serving_unit='piece' then 1 else f.serving_grams end) quantity
 from portions p join recipes m on m.recipe_id=p.recipe_id and m.revision=p.recipe_revision join public.meal_ingredients i on i.meal_row_id=m.row_id join public.foods f on f.row_id=i.food_row_id group by f.app_id,f.name,f.category,f.serving_unit)
 select 'cg-'||md5(lower(name)||':'||serving_unit) id,name,category,case when serving_unit='piece' then 'pcs' else 'g' end unit,
 sum(case when serving_unit='piece' then ceil(quantity) else round(quantity) end) quantity from totals group by name,category,serving_unit
 loop
   select value into old from jsonb_array_elements(state.grocery->'items') where value->>'id'=generated.id;
   items:=items||jsonb_build_array(jsonb_build_object('id',generated.id,'name',generated.name,'category',generated.category,'unit',generated.unit,
   'generatedQuantity',generated.quantity,'quantity',case when old is not null and old->>'quantity' is distinct from old->>'generatedQuantity' then (old->>'quantity')::numeric else generated.quantity end,
   'checked',coalesce((old->>'checked')::boolean,false),'removed',coalesce((old->>'removed')::boolean,false)));
 end loop;
 for custom in select value from jsonb_array_elements(state.grocery->'items') where coalesce((value->>'custom')::boolean,false) or not exists(select 1 from jsonb_array_elements(items) i where i->>'id'=value->>'id') and (coalesce((value->>'removed')::boolean,false) or value->>'quantity' is distinct from value->>'generatedQuantity') loop
   items:=items||jsonb_build_array(custom);
 end loop;
 update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('items',items),revision=revision+1 where group_id=p_group and week_of=p_week;
end;
$$;
create or replace function public.get_group_planning_context(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(p_actor); selected_week date; profile public.profiles; recipe public.meals; plan public.meal_plans;
 recipes jsonb:='[]'::jsonb; members jsonb:='[]'::jsonb; allowed jsonb; days jsonb; occupied jsonb; metadata jsonb; day date; target public.daily_targets;
 used_calories numeric; used_carbs numeric; limit_carbs numeric; source_owner uuid;
begin
 if (select auth.role()) is distinct from 'service_role' then perform private.raise_mutation_error('not_authenticated','Server planning only'); end if;
 if gid is null or gid::text is distinct from p_input->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 perform private.assert_date_key(p_input->>'weekOf','weekOf'); selected_week:=(p_input->>'weekOf')::date;
 if private.calendar_week(selected_week,private.account_week_start(p_actor))<>selected_week then perform private.raise_mutation_error('validation_failed','Choose the account week'); end if;
 for recipe in select m.* from public.meals m where archived_at is null and app_id not like 'group-copy-%' and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid)) order by app_id loop
   source_owner:=coalesce(recipe.owner_user_id,p_actor);
   begin
     metadata:=private.normalize_planned_meal_record(jsonb_build_object('mealId',recipe.app_id,'servings',1),source_owner);
     recipes:=recipes||jsonb_build_array(jsonb_build_object('id',recipe.app_id,'name',recipe.name,'revision',recipe.revision,'yield',recipe.servings,'calories',(metadata->>'expectedCalories')::numeric,'carbs',(metadata->>'expectedCarbsG')::numeric,'slots',recipe.meal_slots,'image',recipe.image));
   exception when others then null; end;
 end loop;
 for recipe in select distinct m.* from public.cooking_assignments a join public.meals m on m.row_id=a.recipe_snapshot_row_id where a.group_id=gid and a.meal_date>=selected_week and a.meal_date<selected_week+7 loop
   if not exists(select 1 from jsonb_array_elements(recipes) r where r->>'id'=(select recipe_id from public.cooking_assignments where recipe_snapshot_row_id=recipe.row_id limit 1) and (r->>'revision')::integer=recipe.revision) then
     metadata:=private.normalize_planned_meal_record(jsonb_build_object('mealId',recipe.app_id,'servings',1),recipe.owner_user_id);
     recipes:=recipes||jsonb_build_array(jsonb_build_object('id',(select recipe_id from public.cooking_assignments where recipe_snapshot_row_id=recipe.row_id limit 1),'name',recipe.name,'revision',recipe.revision,'yield',recipe.servings,'calories',(metadata->>'expectedCalories')::numeric,'carbs',(metadata->>'expectedCarbsG')::numeric,'slots',recipe.meal_slots,'image',recipe.image));
   end if;
 end loop;
 for profile in select p.* from public.profiles p join public.cooking_group_members m on m.user_id=p.id where m.group_id=gid order by p.id loop
   allowed:='[]'; days:='[]';
   for recipe in select m.* from public.meals m where m.app_id in(select r->>'id' from jsonb_array_elements(recipes) r) loop
     begin perform private.assert_generation_recipe(recipe,profile); allowed:=allowed||jsonb_build_array(recipe.app_id); exception when others then null; end;
   end loop;
   select * into plan from public.meal_plans where user_id=profile.id and week_of=selected_week and calendar_active order by version desc,row_id desc limit 1;
   select coalesce(jsonb_agg(jsonb_build_object('id',app_id,'date',meal_date,'slot',meal_slot,'name',label,
   'calories',case when skipped then 0 else expected_calories end,'carbs',case when skipped then 0 else expected_carbs_g end,
   'protected',exists(select 1 from public.nutrition_logs l where l.user_id=profile.id and l.log_date=pm.meal_date and l.meal_slot=pm.meal_slot))), '[]'::jsonb)
   into occupied from public.planned_meals pm where meal_plan_row_id=plan.row_id;
   occupied:=occupied||(select coalesce(jsonb_agg(jsonb_build_object('id','eaten:'||l.log_date::text||':'||l.meal_slot,'date',l.log_date,'slot',l.meal_slot,'name','Eaten entry','calories',0,'carbs',0,'protected',true)), '[]'::jsonb)
   from (select distinct log_date,meal_slot from public.nutrition_logs l where user_id=profile.id and log_date>=selected_week and log_date<selected_week+7
   and not exists(select 1 from public.planned_meals pm where meal_plan_row_id=plan.row_id and meal_date=l.log_date and pm.meal_slot=l.meal_slot)) l);
   for day in select selected_week+i from generate_series(0,6) i loop
     select * into target from public.daily_targets where user_id=profile.id and effective_date<=day order by effective_date desc,version desc limit 1;
     select coalesce(sum(expected_calories),0),coalesce(sum(expected_carbs_g),0) into used_calories,used_carbs from public.planned_meals pm where meal_plan_row_id=plan.row_id and meal_date=day and not skipped
       and not exists(select 1 from public.nutrition_logs l where l.user_id=profile.id and l.planned_meal_app_id=pm.app_id);
     used_calories:=used_calories+coalesce((select sum(calories) from public.nutrition_logs where user_id=profile.id and log_date=day),0);
     used_carbs:=used_carbs+coalesce((select sum(carbs_g) from public.nutrition_logs where user_id=profile.id and log_date=day),0);
     limit_carbs:=private.total_carb_limit(profile.dietary_pattern);
     days:=days||jsonb_build_array(jsonb_build_object('date',day,'calories',coalesce(target.calories,0),'remainingCalories',greatest(0,coalesce(target.calories,0)-used_calories),
       'remainingCarbs',case when limit_carbs is null then null else greatest(0,limit_carbs-used_carbs) end,
       'eligible',target.row_id is not null and coalesce(target.safety_outcome,'eligible')<>'unsupported_population' and coalesce(profile.eligibility_status,'eligible')<>'unsupported'));
   end loop;
   members:=members||jsonb_build_array(jsonb_build_object('id',profile.id,'allowed',allowed,'days',days,'occupied',occupied));
 end loop;
 return jsonb_build_object('basis',private.cooking_basis(gid,selected_week),'recipes',recipes,'members',members,'retained',private.cooking_live_assignments(gid,selected_week));
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
 'assignments',private.cooking_live_assignments(gid,p_week_of),'revision',coalesce(state.revision,0),
 'grocery',case when state.group_id is null then null else state.grocery||jsonb_build_object('id',gid::text||':'||p_week_of::text,'weekOf',p_week_of,'revision',state.revision) end,
 'generation',case when latest.id is null then null else private.cooking_generation_json(latest,caller) end,
 'notices',(select coalesce(jsonb_agg(private.cooking_generation_json(n,caller) order by n.created_at desc,n.id desc),'[]'::jsonb) from public.cooking_generations n join public.cooking_generation_notices r on r.generation_id=n.id and r.user_id=caller where n.group_id=gid and r.acknowledged_at is null));
end;
$$;