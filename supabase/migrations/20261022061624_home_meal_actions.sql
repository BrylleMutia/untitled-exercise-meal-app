-- Preserve history while removing current-day plans; serialize one-tap logs.
CREATE OR REPLACE FUNCTION private.persist_meal_plan_edit(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := private.require_authenticated(); claim record; result jsonb;
  data jsonb := p_payload->'mealPlan'; grocery jsonb := p_payload->'grocery';
  week_date date; old_plan public.meal_plans%rowtype; previous public.planned_meals%rowtype;
  old_grocery public.grocery_lists%rowtype; next_row bigint; next_version integer;
  item jsonb; normalized jsonb; recipe_id bigint; food_id bigint; position integer := 0;
  grocery_item jsonb; previous_item public.grocery_items%rowtype; generated numeric;
  unchanged boolean;
  affected record; selected_group uuid; member_id uuid;
begin
  select * into claim from private.claim_mutation(caller, 'edit_meal_plan', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','edit_meal_plan','replayed',true,'result_refs',claim.result_refs); end if;
  perform private.assert_json_shape(data, 'mealPlan', 'object');
  perform private.assert_date_key(data->>'weekOf', 'mealPlan.weekOf');
  perform private.assert_nonblank(data->>'id', 'mealPlan.id', 128);
  perform private.assert_json_shape(data->'meals', 'mealPlan.meals', 'array');
  week_date := (data->>'weekOf')::date;
  if extract(dow from week_date) <> private.account_week_start(auth.uid()) then perform private.raise_mutation_error('validation_failed','week must match the account preference'); end if;
  -- Shared edits lock the group before any member profile, matching group commands.
  selected_group := private.cooking_group_for(caller);
  if selected_group is not null then perform private.lock_cooking_group(selected_group); end if;
  -- Match the profile-first lock order used by logging and target/plan generation.
  perform 1 from public.profiles where id = caller for update;
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':meal-plan:' || week_date::text, 0));
  select * into old_plan from public.meal_plans where calendar_active and user_id = caller and week_of = week_date
    order by version desc, row_id desc limit 1 for update;
  if old_plan.row_id is null or old_plan.app_id <> data->>'id' then perform private.raise_mutation_error('not_found','selected meal plan not found'); end if;
  if coalesce(p_payload->'expectedVersions'->>'mealPlanVersion','') !~ '^\d+$' then
    perform private.raise_mutation_error('validation_failed','meal plan version is required');
  end if;
  if old_plan.version <> (p_payload->'expectedVersions'->>'mealPlanVersion')::integer then
    perform private.raise_stale_version('meal_plan',(p_payload->'expectedVersions'->>'mealPlanVersion')::integer,old_plan.version);
  end if;
  if p_payload ? 'removePlannedMealId' then
    perform private.assert_nonblank(p_payload->>'removePlannedMealId','planned meal id',128);
    if not exists(select 1 from public.planned_meals pm where pm.meal_plan_row_id=old_plan.row_id and pm.user_id=caller and pm.app_id=p_payload->>'removePlannedMealId') then
      perform private.raise_mutation_error('not_found','Selected planned meal is not in your current plan.');
    end if;
    if jsonb_array_length(data->'meals')<>(select count(*)-1 from public.planned_meals where meal_plan_row_id=old_plan.row_id)
      or exists(select 1 from jsonb_array_elements(data->'meals') retained(value) where retained.value->>'id'=p_payload->>'removePlannedMealId')
      or exists(select 1 from public.planned_meals pm where pm.meal_plan_row_id=old_plan.row_id and pm.app_id<>p_payload->>'removePlannedMealId' and not exists(select 1 from jsonb_array_elements(data->'meals') retained(value) where retained.value->>'id'=pm.app_id)) then
      perform private.raise_mutation_error('validation_failed','Remove only the selected planned meal.');
    end if;
  end if;
  if exists (
    select 1 from public.planned_meals pm where pm.meal_plan_row_id=old_plan.row_id
      and not exists(select 1 from jsonb_array_elements(data->'meals') retained(value) where retained.value->>'id'=pm.app_id)
      and (exists(select 1 from public.nutrition_logs nl where nl.user_id=caller and nl.planned_meal_app_id=pm.app_id)
        or exists(select 1 from public.logged_meals lm where lm.user_id=caller and lm.planned_meal_app_id=pm.app_id))
  ) then perform private.raise_mutation_error('conflict','This meal has already been logged. Edit its saved entry instead.'); end if;
  select * into old_grocery from public.grocery_lists where calendar_active and user_id = caller and week_of = week_date for update;
  if grocery is null or grocery->>'weekOf' <> week_date::text then perform private.raise_mutation_error('validation_failed','grocery week must match plan'); end if;
  perform private.assert_nonblank(grocery->>'id','grocery.id',128);
  perform private.assert_json_shape(grocery->'items','grocery.items','array');
  if old_grocery.row_id is not null then
    if old_grocery.app_id <> grocery->>'id' then perform private.raise_mutation_error('conflict','grocery identity changed'); end if;
    if coalesce(p_payload->'expectedVersions'->>'groceryRevision','') !~ '^\d+$' then perform private.raise_mutation_error('validation_failed','grocery revision is required'); end if;
    if old_grocery.revision <> (p_payload->'expectedVersions'->>'groceryRevision')::integer then
      perform private.raise_stale_version('grocery',(p_payload->'expectedVersions'->>'groceryRevision')::integer,old_grocery.revision);
    end if;
  elsif coalesce((p_payload->'expectedVersions'->>'groceryRevision')::integer,0) <> 0 then
    perform private.raise_stale_version('grocery',(p_payload->'expectedVersions'->>'groceryRevision')::integer,0);
  end if;
  next_version := old_plan.version + 1;
  insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id,supersedes_plan_row_id,dietary_pattern,allergies,total_carb_limit)
    values(old_plan.app_id,caller,next_version,week_date,old_plan.target_row_id,old_plan.row_id,old_plan.dietary_pattern,old_plan.allergies,old_plan.total_carb_limit)
    returning row_id into next_row;
  for item in select value from jsonb_array_elements(data->'meals') loop
    perform private.assert_nonblank(item->>'id','planned meal id',128);
    perform private.assert_date_key(item->>'date','planned meal date');
    perform private.assert_enum(item->>'slot','planned meal slot',array['breakfast','lunch','dinner','snack']);
    perform private.assert_nonblank(item->>'label','planned meal label',256);
    perform private.assert_finite_number(item->>'servings','planned meal servings',0.0001,10000);
    if (item->>'date')::date < week_date or (item->>'date')::date >= week_date + 7 then
      perform private.raise_mutation_error('validation_failed','meal date must belong to plan week');
    end if;
    select * into previous from public.planned_meals where meal_plan_row_id = old_plan.row_id and user_id = caller and app_id = item->>'id';
    unchanged := previous.row_id is not null
      and previous.meal_date = (item->>'date')::date and previous.meal_slot = item->>'slot'
      and previous.servings = (item->>'servings')::numeric and previous.label = item->>'label'
      and (select app_id from public.meals where row_id = previous.meal_row_id) is not distinct from nullif(item->>'mealId','')
      and (select app_id from public.foods where row_id = previous.food_row_id) is not distinct from nullif(item->>'foodId','');
    position := position + 1;
    if unchanged then
      insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,food_row_id,label,servings,skipped,
        expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,expected_fiber_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order)
      values(next_row,caller,week_date,previous.app_id,previous.meal_date,previous.meal_slot,previous.meal_row_id,previous.food_row_id,previous.label,previous.servings,
        coalesce((item->>'skipped')::boolean,false),previous.expected_calories,previous.expected_protein_g,previous.expected_carbs_g,previous.expected_fat_g,
        previous.expected_fiber_g,previous.source,previous.source_version,previous.assumptions,previous.confidence,previous.preparation_basis,previous.slot_key,position);
    else
      normalized := private.normalize_planned_meal_record(item,caller);
      recipe_id := null; food_id := null;
      if nullif(item->>'mealId','') is not null then
        select row_id into recipe_id from public.meals where app_id = item->>'mealId' and (is_system or owner_user_id = caller) and archived_at is null;
        if recipe_id is null then perform private.raise_mutation_error('not_found','recipe not found'); end if;
      elsif nullif(item->>'foodId','') is not null then
        select row_id into food_id from public.foods where app_id = item->>'foodId' and (is_system or owner_user_id = caller);
        if food_id is null then perform private.raise_mutation_error('not_found','food not found'); end if;
      else
        perform private.raise_mutation_error('validation_failed','resolve the meal before changing its content');
      end if;
      insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,food_row_id,label,servings,skipped,
        expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,expected_fiber_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order)
      values(next_row,caller,week_date,item->>'id',(item->>'date')::date,item->>'slot',recipe_id,food_id,normalized->>'label',(item->>'servings')::numeric,
        coalesce((item->>'skipped')::boolean,false),(normalized->>'expectedCalories')::numeric,(normalized->>'expectedProteinG')::numeric,
        (normalized->>'expectedCarbsG')::numeric,(normalized->>'expectedFatG')::numeric,(normalized->>'expectedFiberG')::numeric,
        normalized->>'source',normalized->>'sourceVersion',normalized->>'assumptions',normalized->>'confidence',normalized->>'preparationBasis',
        'date:' || (item->>'date') || ':slot:' || (item->>'slot') || ':id:' || md5(item->>'id'),position);
    end if;
  end loop;
  if old_grocery.row_id is null then
    insert into public.grocery_lists(app_id,user_id,week_of) values(grocery->>'id',caller,week_date) returning * into old_grocery;
  end if;
  for grocery_item in select value from jsonb_array_elements(grocery->'items') loop
    perform private.assert_nonblank(grocery_item->>'id','grocery item id',128);
    perform private.assert_nonblank(grocery_item->>'name','grocery item name',256);
    perform private.assert_finite_number(grocery_item->>'generatedQuantity','generated quantity',0,100000);
    perform private.assert_finite_number(grocery_item->>'quantity','grocery quantity',0,100000);
    generated := (grocery_item->>'generatedQuantity')::numeric;
    select * into previous_item from public.grocery_items where grocery_list_row_id = old_grocery.row_id and user_id = caller and app_id = grocery_item->>'id' for update;
    if previous_item.row_id is null then
      insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,checked,custom_item,removed)
      values(old_grocery.row_id,caller,grocery_item->>'id',grocery_item->>'name',grocery_item->>'category',grocery_item->>'unit',generated,
        (grocery_item->>'quantity')::numeric,coalesce((grocery_item->>'checked')::boolean,false),coalesce((grocery_item->>'custom')::boolean,false),coalesce((grocery_item->>'removed')::boolean,false));
    else
      update public.grocery_items set generated_quantity = generated,
        quantity = case when previous_item.quantity = previous_item.generated_quantity then generated else previous_item.quantity end
        where row_id = previous_item.row_id and user_id = caller;
    end if;
  end loop;
  perform private.reconcile_grocery_items(caller,grocery);
  update public.grocery_lists set updated_at = now() where row_id = old_grocery.row_id;
  -- No planned-row INSERT fires when the last shared entry is removed. Reconcile
  -- the affected week explicitly without deleting historical assignment records.
  for affected in
    select distinct a.group_id, private.calendar_week(pm.meal_date,g.week_starts_on) as week_of
    from public.planned_meals pm join public.cooking_assignments a on a.user_id=caller and a.id=pm.app_id
    join public.cooking_groups g on g.id=a.group_id
    where pm.meal_plan_row_id=old_plan.row_id and a.group_id=selected_group
      and not exists(select 1 from jsonb_array_elements(data->'meals') retained(value) where retained.value->>'id'=pm.app_id)
  loop
    perform private.reconcile_cooking_grocery(affected.group_id,affected.week_of);
    for member_id in select user_id from public.cooking_group_members where cooking_group_members.group_id=affected.group_id order by user_id loop
      perform private.reconcile_personal_cooking_grocery(member_id,affected.week_of);
    end loop;
    perform set_config('app.cooking_dirty_'||replace(affected.group_id::text,'-','')||'_'||replace(affected.week_of::text,'-',''),'done',true);
  end loop;
  result := jsonb_build_object('status','completed','operation','edit_meal_plan','result_refs',jsonb_build_object('meal_plan_id',old_plan.app_id,'meal_plan_version',next_version,'grocery_id',old_grocery.app_id));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.log_planned_meal(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := private.require_authenticated();
  log_kind text := p_payload->>'kind';
  log_operation text;
  claim record;
  legacy_refs jsonb;
  result jsonb;
  current_plan public.meal_plans%rowtype;
  planned public.planned_meals%rowtype;
  actual_date date;
  actual_slot text;
  expected_version integer;
  updated_count integer;
begin
  if log_kind not in ('food', 'meal') or log_kind is null then
    perform private.raise_mutation_error('validation_failed', 'planned log kind must be food or meal');
  end if;
  log_operation := case when log_kind = 'food' then 'save_nutrition_log' else 'save_reviewed_meal' end;
  -- Honor completed requests made before planned logging had its own claim.
  select mi.result_refs into legacy_refs from public.mutation_idempotency mi
  where mi.user_id = caller_id and mi.idempotency_key = p_payload->>'idempotencyKey'
    and mi.operation in (log_operation, 'log_provided_recipe') and mi.status = 'completed'
    and mi.request_hash = private.request_hash(p_payload)
    and (
      (log_kind = 'food' and exists (select 1 from public.nutrition_logs nl
        where nl.user_id = caller_id and nl.app_id = mi.result_refs->>'nutrition_log_id'
          and nl.planned_meal_app_id = p_payload->>'plannedMealId'))
      or (log_kind = 'meal' and exists (select 1 from public.logged_meals lm
        where lm.user_id = caller_id and lm.app_id = mi.result_refs->>'logged_meal_id'
          and lm.planned_meal_app_id = p_payload->>'plannedMealId'))
    ) limit 1;
  if legacy_refs is not null then
    return jsonb_build_object('status', 'completed', 'operation', log_operation, 'replayed', true, 'result_refs', legacy_refs);
  end if;
  -- Keep the original planned intent separate from the logger's normalized payload.
  select * into claim from private.claim_mutation(caller_id, 'log_planned_meal', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', log_operation, 'replayed', true, 'result_refs', claim.result_refs);
  end if;
  perform private.validate_mutation_payload(log_operation, p_payload);
  perform private.assert_expected_versions(log_operation, p_payload, caller_id);
  perform private.assert_saved_meal_access(log_operation, p_payload, caller_id);
  perform private.assert_workout_log_shape(log_operation, p_payload);

  perform private.assert_nonblank(p_payload->>'plannedMealId', 'plannedMealId', 128);
  if coalesce(p_payload->>'expectedMealPlanVersion', '') !~ '^[0-9]+$' then
    perform private.raise_mutation_error('validation_failed', 'expected meal plan version must be an integer');
  end if;
  expected_version := (p_payload->>'expectedMealPlanVersion')::integer;
  if log_kind = 'food' then
    actual_date := (p_payload->'entry'->>'date')::date;
    actual_slot := p_payload->'entry'->>'slot';
  else
    perform private.assert_date_key(p_payload->>'date', 'date');
    perform private.assert_enum(p_payload->>'slot', 'slot', array['breakfast','lunch','dinner','snack']);
    actual_date := (p_payload->>'date')::date;
    actual_slot := p_payload->>'slot';
  end if;

  if private.cooking_group_for(caller_id) is not null then perform private.lock_cooking_group(private.cooking_group_for(caller_id)); end if;
  perform 1 from public.profiles where id=caller_id for update;
  -- Serialize logging with selected-week edits before taking a fresh plan snapshot.
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':meal-plan:' || (private.calendar_week(actual_date,private.account_week_start(caller_id)))::text, 0));

  select * into current_plan from public.meal_plans
  where calendar_active and user_id = caller_id and week_of = private.calendar_week(actual_date,private.account_week_start(caller_id))
  order by version desc, row_id desc limit 1 for update;
  if current_plan.row_id is null then
    perform private.raise_mutation_error('not_found', 'current meal plan not found');
  end if;
  if current_plan.version <> expected_version then
    perform private.raise_stale_version('meal_plan', expected_version, current_plan.version);
  end if;
  select * into planned from public.planned_meals
  where meal_plan_row_id = current_plan.row_id and user_id = caller_id
    and app_id = p_payload->>'plannedMealId'
    and meal_date = actual_date and meal_slot = actual_slot
  for update;
  if planned.row_id is null then
    perform private.raise_mutation_error('not_found', 'planned meal not found for this date and slot');
  end if;
  if planned.skipped then perform private.raise_mutation_error('conflict','Restore this planned meal before logging it.'); end if;
  if coalesce((p_payload->>'singlePlannedPortion')::boolean,false) and (exists(select 1 from public.nutrition_logs nl where nl.user_id=caller_id and nl.planned_meal_app_id=planned.app_id)
    or exists(select 1 from public.logged_meals lm where lm.user_id=caller_id and lm.planned_meal_app_id=planned.app_id)) then
    perform private.raise_mutation_error('conflict','This planned meal is already logged. Refresh this day to edit its saved entry.');
  end if;
  if log_kind = 'food' then
    if planned.food_row_id is null or not exists (
      select 1 from public.foods f where f.row_id = planned.food_row_id
        and f.app_id = p_payload->'entry'->>'foodId'
    ) then
      perform private.raise_mutation_error('validation_failed', 'logged food does not match planned food');
    end if;
    result := private.save_nutrition_log(p_payload);
    update public.nutrition_logs
    set planned_meal_app_id = planned.app_id
    where user_id = caller_id and app_id = result->'result_refs'->>'nutrition_log_id';
  else
    if planned.meal_row_id is null or not exists (
      select 1 from public.meals m where m.row_id = planned.meal_row_id
        and m.app_id = p_payload->'meal'->>'id'
    ) then
      perform private.raise_mutation_error('validation_failed', 'logged meal does not match planned meal');
    end if;
    result := private.save_reviewed_meal(p_payload);
    update public.logged_meals
    set planned_meal_app_id = planned.app_id
    where user_id = caller_id and app_id = result->'result_refs'->>'logged_meal_id';
  end if;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    perform private.raise_mutation_error('not_found', 'saved entry for planned meal was not found');
  end if;
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$function$;

revoke all on function private.persist_meal_plan_edit(jsonb),private.log_planned_meal(jsonb) from public,anon,authenticated;
revoke all on function public.edit_meal_plan(jsonb),public.log_planned_meal(jsonb) from public,anon;
grant execute on function public.edit_meal_plan(jsonb),public.log_planned_meal(jsonb) to authenticated;
notify pgrst, 'reload schema';
