-- Allocation is deterministic; persisted assignment identities are unique per reviewed preview.
create or replace function public.store_group_planning_preview(p_actor uuid,p_input jsonb,p_preview jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(p_actor); saved private.cooking_previews;
begin
 if (select auth.role()) is distinct from 'service_role' then perform private.raise_mutation_error('not_authenticated','Server planning only'); end if;
 if gid is null or gid::text is distinct from p_input->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 if private.cooking_basis(gid,(p_input->>'weekOf')::date) is distinct from p_preview->>'basis' then perform private.raise_mutation_error('stale_version','Planning details changed. Refresh the preview.'); end if;
 delete from private.cooking_previews where expires_at<now();
 saved.id:=gen_random_uuid();
 p_preview:=jsonb_set(p_preview,'{assignments}',(select coalesce(jsonb_agg(a||jsonb_build_object('id',(a->>'id')||'-'||saved.id::text)),'[]'::jsonb) from jsonb_array_elements(p_preview->'assignments') a));
 insert into private.cooking_previews(id,group_id,created_by,week_of,request,basis,preview) values(saved.id,gid,p_actor,(p_input->>'weekOf')::date,p_input,p_preview->>'basis',p_preview) returning * into saved;
 return p_preview||jsonb_build_object('id',saved.id,'expiresAt',saved.expires_at);
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
   for recipe in select m.* from public.meals m where m.app_id in(select r->>'id' from jsonb_array_elements(recipes) r) and (m.is_system or m.owner_user_id in(select user_id from public.cooking_group_members where group_id=gid)) loop
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