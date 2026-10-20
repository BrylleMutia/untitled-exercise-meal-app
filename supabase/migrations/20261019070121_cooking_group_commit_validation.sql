-- Use exact source nutrition for allocation, then validate the saved rounded amounts again.
create function private.cooking_recipe_nutrients(p_recipe public.meals) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p_recipe.provided_nutrition is not null then jsonb_build_object('expectedCalories',p_recipe.provided_nutrition->'calories','expectedCarbsG',p_recipe.provided_nutrition->'carbsG')
 else (select jsonb_build_object('expectedCalories',coalesce(sum(f.calories*i.servings/p_recipe.servings),0),'expectedCarbsG',coalesce(sum(f.carbs_g*i.servings/p_recipe.servings),0)) from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=p_recipe.row_id) end;
$$;
create function private.validate_cooking_preview(p_preview private.cooking_previews) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; selected jsonb; profile public.profiles; recipe public.meals; existing public.planned_meals; target public.daily_targets;
 plan_id bigint; member uuid; day date; total numeric; old_calories numeric; old_carbs numeric; added_calories numeric; added_carbs numeric; limit_carbs numeric;
begin
 if jsonb_array_length(p_preview.request->'memberIds') not between 1 and 6 or jsonb_array_length(p_preview.request->'selectedDates') not between 1 and 7 then perform private.raise_mutation_error('validation_failed','Choose people and days'); end if;
 if exists(select 1 from jsonb_array_elements_text(p_preview.request->'memberIds') id group by id having count(*)>1) or exists(select 1 from jsonb_array_elements_text(p_preview.request->'selectedDates') d group by d having count(*)>1) then perform private.raise_mutation_error('validation_failed','Choose unique people and days'); end if;
 if exists(select 1 from jsonb_array_elements(p_preview.preview->'assignments') a group by a->>'memberId',a->>'date',a->>'slot' having count(*)>1) then perform private.raise_mutation_error('validation_failed','Only one new assignment per member and slot'); end if;
 for item in select value from jsonb_array_elements(p_preview.preview->'replacements') loop
   if not(p_preview.request->'memberIds' ? (item->>'memberId')) or not(p_preview.request->'selectedDates' ? (item->>'date')) or p_preview.request->>'mode'<>'replace' then perform private.raise_mutation_error('validation_failed','Replacement outside selected people and dates'); end if;
   member:=(item->>'memberId')::uuid;
   select row_id into plan_id from public.meal_plans where user_id=member and week_of=p_preview.week_of and calendar_active order by version desc,row_id desc limit 1;
   select * into existing from public.planned_meals where meal_plan_row_id=plan_id and app_id=item->>'id' and meal_date=(item->>'date')::date;
   if existing.row_id is null or exists(select 1 from public.nutrition_logs where user_id=member and log_date=existing.meal_date and meal_slot=existing.meal_slot) then perform private.raise_mutation_error('conflict','A saved assignment is protected. Refresh and review.'); end if;
 end loop;
 for item in select value from jsonb_array_elements(p_preview.preview->'assignments') loop
   perform private.assert_date_key(item->>'date','assignment date');
   if not(p_preview.request->'memberIds' ? (item->>'memberId')) or not(p_preview.request->'selectedDates' ? (item->>'date')) or (item->>'date')::date<p_preview.week_of or (item->>'date')::date>=p_preview.week_of+7 then perform private.raise_mutation_error('validation_failed','Assignment outside selected people and dates'); end if;
   member:=(item->>'memberId')::uuid;
   if private.cooking_group_for(member) is distinct from p_preview.group_id then perform private.raise_mutation_error('stale_version','Membership changed. Refresh and review.'); end if;
   perform private.assert_finite_number(item->>'servings','servings',.25,4);
   if (item->>'servings')::numeric*4<>trunc((item->>'servings')::numeric*4) then perform private.raise_mutation_error('validation_failed','Choose quarter servings'); end if;
   select * into profile from public.profiles where id=member;
   if profile.eligibility_status='unsupported' then perform private.raise_mutation_error('validation_failed','A participant has no eligible planning target'); end if;
   select * into recipe from public.meals where app_id=item->>'recipeId' and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=p_preview.group_id));
   if recipe.row_id is null or not exists(select 1 from jsonb_array_elements(p_preview.request->'recipes') r where r->>'id'=recipe.app_id and (r->>'revision')::integer=recipe.revision) or not (item->>'slot'=any(recipe.meal_slots)) then perform private.raise_mutation_error('validation_failed','Choose an eligible selected recipe and meal slot'); end if;
   perform private.assert_generation_recipe(recipe,profile);
   select row_id into plan_id from public.meal_plans where user_id=member and week_of=p_preview.week_of and calendar_active order by version desc,row_id desc limit 1;
   if exists(select 1 from public.nutrition_logs where user_id=member and log_date=(item->>'date')::date and meal_slot=item->>'slot') or exists(select 1 from public.planned_meals pm where meal_plan_row_id=plan_id and meal_date=(item->>'date')::date and meal_slot=item->>'slot' and not exists(select 1 from jsonb_array_elements(p_preview.preview->'replacements') r where r->>'memberId'=member::text and r->>'id'=pm.app_id)) then perform private.raise_mutation_error('conflict','This meal slot is occupied. Refresh and review.'); end if;
 end loop;
 for selected in select value from jsonb_array_elements(p_preview.request->'recipes') loop
   select * into recipe from public.meals where app_id=selected->>'id';
   perform private.assert_finite_number(selected->>'maxBatches','maxBatches',1,100);
   if (selected->>'maxBatches')::numeric<>trunc((selected->>'maxBatches')::numeric) then perform private.raise_mutation_error('validation_failed','Choose whole batch counts'); end if;
   select coalesce(sum((a->>'servings')::numeric),0) into total from jsonb_array_elements(p_preview.preview->'assignments') a where a->>'recipeId'=recipe.app_id;
   total:=total+coalesce((select sum((a->>'servings')::numeric) from jsonb_array_elements(private.cooking_live_assignments(p_preview.group_id,p_preview.week_of)) a where a->>'recipeId'=recipe.app_id and (a->>'recipeRevision')::integer=recipe.revision and not coalesce((a->>'skipped')::boolean,false) and not exists(select 1 from jsonb_array_elements(p_preview.preview->'replacements') r where r->>'memberId'=a->>'memberId' and r->>'id'=a->>'id')),0);
   if total>recipe.servings*(selected->>'maxBatches')::numeric then perform private.raise_mutation_error('validation_failed','Assignments exceed available recipe batches'); end if;
 end loop;
 for member,day in select distinct (a->>'memberId')::uuid,(a->>'date')::date from jsonb_array_elements(p_preview.preview->'assignments') a loop
   select * into target from public.daily_targets where user_id=member and effective_date<=day order by effective_date desc,version desc limit 1;
   if target.row_id is null or target.safety_outcome='unsupported_population' then perform private.raise_mutation_error('validation_failed','A participant has no eligible target on a selected date'); end if;
   select row_id into plan_id from public.meal_plans where user_id=member and week_of=p_preview.week_of and calendar_active order by version desc,row_id desc limit 1;
   if exists(select 1 from public.planned_meals pm where meal_plan_row_id=plan_id and meal_date=day and not skipped and meal_row_id is null and food_row_id is null and not exists(select 1 from jsonb_array_elements(p_preview.preview->'replacements') r where r->>'memberId'=member::text and r->>'id'=pm.app_id)) then perform private.raise_mutation_error('validation_failed','Unresolved planning nutrition must be reviewed first'); end if;
   select coalesce(sum(expected_calories),0),coalesce(sum(expected_carbs_g),0) into old_calories,old_carbs from public.planned_meals pm where meal_plan_row_id=plan_id and meal_date=day and not skipped and not exists(select 1 from public.nutrition_logs l where l.user_id=member and l.planned_meal_app_id=pm.app_id) and not exists(select 1 from jsonb_array_elements(p_preview.preview->'replacements') r where r->>'memberId'=member::text and r->>'id'=pm.app_id);
   old_calories:=old_calories+coalesce((select sum(calories) from public.nutrition_logs where user_id=member and log_date=day),0);
   old_carbs:=old_carbs+coalesce((select sum(carbs_g) from public.nutrition_logs where user_id=member and log_date=day),0);
   -- Normalize the source recipe reference explicitly; assignment recipe IDs are presentation IDs.
   select sum((private.normalize_planned_meal_record(a||jsonb_build_object('mealId',a->>'recipeId'),coalesce(m.owner_user_id,member))->>'expectedCalories')::numeric),
     sum((private.normalize_planned_meal_record(a||jsonb_build_object('mealId',a->>'recipeId'),coalesce(m.owner_user_id,member))->>'expectedCarbsG')::numeric)
   into added_calories,added_carbs from jsonb_array_elements(p_preview.preview->'assignments') a join public.meals m on m.app_id=a->>'recipeId' where a->>'memberId'=member::text and (a->>'date')::date=day;
   limit_carbs:=private.total_carb_limit((select dietary_pattern from public.profiles where id=member));
   if old_calories+added_calories>target.calories or limit_carbs is not null and old_carbs+added_carbs>limit_carbs then perform private.raise_mutation_error('validation_failed','Portions exceed a participant’s remaining planning limits. Refresh and review.'); end if;
 end loop;
end;
$$;
revoke all on function private.cooking_recipe_nutrients(public.meals),private.validate_cooking_preview(private.cooking_previews) from public,anon,authenticated;

create or replace function private.commit_cooking_group_plan(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 perform private.validate_cooking_preview(preview);
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
     metadata:=private.normalize_planned_meal_record(jsonb_build_object('mealId',recipe.app_id,'servings',1),source_owner)||private.cooking_recipe_nutrients(recipe);
     recipes:=recipes||jsonb_build_array(jsonb_build_object('id',recipe.app_id,'name',recipe.name,'revision',recipe.revision,'yield',recipe.servings,'calories',(metadata->>'expectedCalories')::numeric,'carbs',(metadata->>'expectedCarbsG')::numeric,'slots',recipe.meal_slots,'image',recipe.image));
   exception when others then null; end;
 end loop;
 for recipe in select distinct m.* from public.cooking_assignments a join public.meals m on m.row_id=a.recipe_snapshot_row_id where a.group_id=gid and a.meal_date>=selected_week and a.meal_date<selected_week+7 loop
   if not exists(select 1 from jsonb_array_elements(recipes) r where r->>'id'=(select recipe_id from public.cooking_assignments where recipe_snapshot_row_id=recipe.row_id limit 1) and (r->>'revision')::integer=recipe.revision) then
     metadata:=private.normalize_planned_meal_record(jsonb_build_object('mealId',recipe.app_id,'servings',1),recipe.owner_user_id)||private.cooking_recipe_nutrients(recipe);
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
     days:=days||jsonb_build_array(jsonb_build_object('date',day,'calories',coalesce(target.calories,0),'remainingCalories',case when exists(select 1 from public.planned_meals where meal_plan_row_id=plan.row_id and meal_date=day and not skipped and meal_row_id is null and food_row_id is null) then 0 else greatest(0,coalesce(target.calories,0)-used_calories) end,
       'remainingCarbs',case when limit_carbs is null then null else greatest(0,limit_carbs-used_carbs) end,
       'eligible',target.row_id is not null and coalesce(target.safety_outcome,'eligible')<>'unsupported_population' and coalesce(profile.eligibility_status,'eligible')<>'unsupported'));
   end loop;
   members:=members||jsonb_build_array(jsonb_build_object('id',profile.id,'allowed',allowed,'days',days,'occupied',occupied));
 end loop;
 return jsonb_build_object('basis',private.cooking_basis(gid,selected_week),'recipes',recipes,'members',members,'retained',private.cooking_live_assignments(gid,selected_week));
end;
$$;