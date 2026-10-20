-- A retained copy must not interfere with editing ordinary authored ingredients.
create or replace function private.guard_cooking_recipe_copy() returns trigger language plpgsql security definer set search_path='' as $$
declare app text;
begin
 if tg_table_name='meal_ingredients' then select app_id into app from public.meals where row_id=old.meal_row_id;
 else app:=to_jsonb(old)->>'app_id'; end if;
 if app like 'group-copy-%' and exists(select 1 from auth.users where id=coalesce((to_jsonb(old)->>'owner_user_id')::uuid,(select owner_user_id from public.meals where row_id=(to_jsonb(old)->>'meal_row_id')::bigint))) then
   perform private.raise_mutation_error('conflict','Saved group recipe copies are retained unchanged. Save a personal copy to edit.');
 end if;
 return coalesce(new,old);
end;
$$;

create function public.get_cooking_recipe(p_recipe_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe public.meals;
begin
 select * into recipe from public.meals where app_id=p_recipe_id and (is_system or owner_user_id=caller or owner_user_id in(select user_id from public.cooking_group_members where group_id=private.cooking_group_for(caller)));
 if recipe.row_id is null then perform private.raise_mutation_error('not_found','Recipe unavailable'); end if;
 return jsonb_build_object('weekOf','2000-01-02','mealPlan',null,'grocery',null,'groceryItems','[]'::jsonb,'targets','[]'::jsonb,'plannedMeals','[]'::jsonb,'nutritionLogs','[]'::jsonb,'loggedMeals','[]'::jsonb,'servingOptions','[]'::jsonb,
 'recipes',jsonb_build_array(to_jsonb(recipe)),
 'ingredients',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.meal_ingredients i where meal_row_id=recipe.row_id),
 'foods',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from public.foods f where row_id in(select food_row_id from public.meal_ingredients where meal_row_id=recipe.row_id)));
end;
$$;
create function public.copy_cooking_recipe(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); recipe public.meals; retained bigint; copied bigint; ingredient public.meal_ingredients; app text; claim record; result jsonb;
begin
 if gid is null then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 select * into claim from private.claim_mutation(caller,'copy_cooking_recipe',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 select * into recipe from public.meals where app_id=p_payload->>'recipeId' and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid));
 if recipe.row_id is null then perform private.raise_mutation_error('not_found','Recipe unavailable'); end if;
 retained:=private.cooking_copy_recipe(recipe.row_id,caller); app:='meal-'||gen_random_uuid()::text;
 copied:=private.cooking_copy_row('meals',retained,jsonb_build_object('app_id',app,'name',recipe.name||' (personal copy)'));
 for ingredient in select * from public.meal_ingredients where meal_row_id=retained loop perform private.cooking_copy_row('meal_ingredients',ingredient.row_id,jsonb_build_object('meal_row_id',copied)); end loop;
 result:=jsonb_build_object('success',true,'recipeId',app); perform private.complete_mutation(claim.mutation_row_id,result); return result;
end;
$$;
revoke all on function public.get_cooking_recipe(text),public.copy_cooking_recipe(jsonb) from public,anon;
grant execute on function public.get_cooking_recipe(text),public.copy_cooking_recipe(jsonb) to authenticated;

-- Membership cleanup also covers account deletion, without exposing any actual intake.
create function private.cooking_member_departed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_cooking_group(old.group_id);
 update public.cooking_groups set revision=revision+1,archived_at=case when not exists(select 1 from public.cooking_group_members where group_id=old.group_id) then now() else archived_at end where id=old.group_id;
 update public.cooking_week_proposals set status='invalidated' where group_id=old.group_id and status='pending';
 update private.cooking_invitations set consumed_at=now() where created_by=old.user_id;
 return old;
end;
$$;
create trigger cooking_member_departed after delete on public.cooking_group_members for each row execute function private.cooking_member_departed();
revoke all on function private.cooking_member_departed() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION "public"."claim_deleted_recipe_images"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare lease uuid:=gen_random_uuid(); result jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    perform private.raise_mutation_error('unauthorized','Server cleanup only');
  end if;
  with candidates as (
    select path from private.deleted_recipe_images
    where (leased_until is null or leased_until<now()) and not exists(select 1 from public.meals m where m.image->>'path'=deleted_recipe_images.path)
    order by queued_at limit 100 for update skip locked
  ), claimed as (
    update private.deleted_recipe_images j set lease_id=lease, leased_until=now()+interval '10 minutes'
    from candidates c where j.path=c.path returning j.path
  ) select jsonb_build_object('leaseId',lease,'paths',coalesce(jsonb_agg(path),'[]'::jsonb)) into result from claimed;
  return result;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."claim_recipe_image_cleanup"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare caller uuid:=private.require_authenticated(); result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
  if p_payload->>'mode' is distinct from 'expired' then
    perform private.raise_mutation_error('validation_failed','Invalid image cleanup');
  end if;
  -- The same lock is taken when attaching: claiming cleanup prevents a race
  -- between an image becoming referenced and its removal through Storage API.
  with candidates as (
    select a.path from private.recipe_image_assets a where a.user_id=caller
      and a.created_at<now()-interval '8 days'
      and not exists(select 1 from public.meals m where m.image->>'path'=a.path)
    order by a.created_at limit 100 for update
  ), marked as (
    update private.recipe_image_assets a set state='removing' from candidates c
    where a.path=c.path returning a.path
  ) select coalesce(jsonb_agg(path),'[]'::jsonb) into result from marked;
  return result;
end;
$$;
CREATE OR REPLACE FUNCTION "private"."save_saved_meal_without_complexity"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare caller_id uuid:=private.require_authenticated(); result jsonb;
  recipe jsonb:=p_payload->'meal'; total_minutes numeric; cover jsonb:=recipe->'image'; asset private.recipe_image_assets;
begin
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller_id);
  perform private.assert_saved_meal_access('save_saved_meal',p_payload,caller_id);
  if recipe ? 'reference' and char_length(coalesce(recipe->>'reference',''))>2000 then
    perform private.raise_mutation_error('validation_failed','Reference must be at most 2000 characters');
  end if;
  if recipe ? 'totalTimeMinutes' and recipe->'totalTimeMinutes'<>'null'::jsonb then
    if jsonb_typeof(recipe->'totalTimeMinutes')<>'number' then perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes or null'); end if;
    total_minutes:=(recipe->>'totalTimeMinutes')::numeric;
    if total_minutes<0 or total_minutes>2147483647 or trunc(total_minutes)<>total_minutes then
      perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes between 0 and 2147483647');
    end if;
  end if;
  if cover is not null and cover<>'null'::jsonb then
    if jsonb_typeof(cover)<>'object' or coalesce(cover->>'kind','') not in ('url','upload','asset') then
      perform private.raise_mutation_error('validation_failed','Invalid recipe image');
    end if;
    if cover->>'kind'='url' then
      if jsonb_typeof(cover->'url')<>'string' or char_length(cover->>'url')>2048
        or coalesce(cover->>'url','') !~ '^https://[^/@[:space:]]+([/?#]|$)' then
        perform private.raise_mutation_error('validation_failed','Use a complete HTTPS image URL without credentials');
      end if;
      cover:=jsonb_build_object('kind','url','url',cover->>'url');
    elsif cover->>'kind'='asset' then
      if coalesce(cover->>'id','') not in ('creamy-lemon-chicken','korean-beef-bowl','breakfast-egg-salad','snack-sandwich','dinner-curry-omelette','sticky-teriyaki-chicken','chicken-burrito-protein-boxes','hainanese-chicken-rice','korean-broccoli-side-dish','tortang-talong-with-chicken') then
        perform private.raise_mutation_error('validation_failed','Unknown catalog image');
      end if;
      cover:=jsonb_build_object('kind','asset','id',cover->>'id');
    else
      perform pg_advisory_xact_lock(hashtextextended(caller_id::text,0));
      select * into asset from private.recipe_image_assets where path=cover->>'path' and user_id=caller_id for update;
      if not found or asset.state='removing' or not exists(select 1 from storage.objects o where o.bucket_id='recipe-covers' and o.name=asset.path) then
        perform private.raise_mutation_error('validation_failed','The uploaded image is unavailable; upload it again or select the default');
      end if;
      cover:=jsonb_build_object('kind','upload','path',asset.path);
    end if;
  end if;
  result:=private.save_saved_meal_unchecked(p_payload);
  if coalesce((result->>'replayed')::boolean,false) then return result; end if;
  if recipe ? 'reference' or recipe ? 'totalTimeMinutes' or recipe ? 'image' then
    update public.meals set
      reference=case when recipe ? 'reference' then nullif(btrim(recipe->>'reference'),'') else reference end,
      total_time_minutes=case when recipe ? 'totalTimeMinutes' then total_minutes::integer else total_time_minutes end,
      image=case when recipe ? 'image' then nullif(cover,'null'::jsonb) else image end
    where app_id=recipe->>'id' and owner_user_id=caller_id;
  end if;
  if cover->>'kind'='upload' then update private.recipe_image_assets set state='attached' where path=cover->>'path' and user_id=caller_id; end if;
  perform private.reconcile_grocery_items(caller_id,p_payload->'grocery');
  return result;
end;
$_$;
CREATE OR REPLACE FUNCTION "private"."build_account_export"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare caller uuid:=private.require_authenticated();
begin
  return jsonb_build_object('cookingGroup',private.cooking_group_json(private.cooking_group_for(caller)),'cookingGroupWeeks',coalesce((select jsonb_agg(to_jsonb(w)) from public.cooking_group_weeks w where group_id=private.cooking_group_for(caller)),'[]'::jsonb),'cookingGenerations',coalesce((select jsonb_agg(to_jsonb(g)) from public.cooking_generations g where group_id=private.cooking_group_for(caller)),'[]'::jsonb),'cookingAssignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.cooking_assignments a where user_id=caller),'[]'::jsonb),'cookingGenerationNotices',coalesce((select jsonb_agg(to_jsonb(n)) from public.cooking_generation_notices n where user_id=caller),'[]'::jsonb),'cookingCalendarTransitions',coalesce((select jsonb_agg(to_jsonb(t)) from public.cooking_calendar_transitions t where group_id=private.cooking_group_for(caller)),'[]'::jsonb)) || jsonb_build_object('calendarTransitions',coalesce((select jsonb_agg(to_jsonb(t)) from public.calendar_transitions t where user_id=caller),'[]'::jsonb)) || private.build_account_export_before_catalog() || jsonb_build_object('recipeCatalogPreferences',coalesce((
    select jsonb_agg(jsonb_build_object('mealId',m.app_id,'replacementMealId',r.app_id,'revision',cp.revision,'updatedAt',cp.updated_at) order by m.app_id)
    from public.recipe_catalog_preferences cp join public.meals m on m.row_id=cp.catalog_meal_row_id
    left join public.meals r on r.row_id=cp.replacement_meal_row_id where cp.user_id=caller
  ),'[]'::jsonb));
end;
$$;
create or replace function public.mutate_cooking_group_week(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   select * into assignment from public.cooking_assignments where group_id=gid and id=p_payload->>'assignmentId';
   if assignment.id is null or private.cooking_group_for(assignment.user_id) is distinct from gid then perform private.raise_mutation_error('not_found','Assignment not found'); end if;
   select * into plan from public.meal_plans where user_id=assignment.user_id and week_of=week and calendar_active order by version desc,row_id desc limit 1 for update;
   select * into pm from public.planned_meals where meal_plan_row_id=plan.row_id and app_id=assignment.id;
   if pm.row_id is null then perform private.raise_mutation_error('stale_version','Assignment changed. Refresh and review.'); end if;
   if exists(select 1 from public.nutrition_logs where user_id=assignment.user_id and planned_meal_app_id=assignment.id) then perform private.raise_mutation_error('conflict','This meal is already logged. Its planned basis is preserved.'); end if;
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