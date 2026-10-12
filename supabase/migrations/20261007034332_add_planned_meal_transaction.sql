-- A food or recipe and its plan reference are one durable intent. Eaten entries
-- remain independent nutrition history and are never modified here.
create function private.add_planned_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  plan_data jsonb := p_payload->'mealPlan';
  item jsonb := p_payload->'plannedMeal';
  grocery jsonb := p_payload->'grocery';
  new_food jsonb;
  normalized jsonb;
  current_plan public.meal_plans%rowtype;
  target_row public.daily_targets%rowtype;
  new_plan_row_id bigint;
  food_row_id bigint;
  recipe_row_id bigint;
  grocery_row_id bigint;
  grocery_item jsonb;
  previous_item public.grocery_items%rowtype;
  generated numeric;
  expected_version integer;
  next_version integer;
  next_order integer;
  week_date date;
  meal_date date;
  result jsonb;
begin
  select * into claim from private.claim_mutation(caller_id, 'add_planned_meal', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status','completed','operation','add_planned_meal','replayed',true,'result_refs',claim.result_refs);
  end if;
  begin
    perform private.assert_json_shape(plan_data, 'mealPlan', 'object');
    perform private.assert_json_shape(item, 'plannedMeal', 'object');
    perform private.assert_json_shape(grocery, 'grocery', 'object');
    perform private.assert_nonblank(plan_data->>'id', 'mealPlan.id', 128);
    perform private.assert_nonblank(item->>'id', 'plannedMeal.id', 128);
    perform private.assert_date_key(plan_data->>'weekOf', 'mealPlan.weekOf');
    perform private.assert_date_key(item->>'date', 'plannedMeal.date');
    perform private.assert_enum(item->>'slot', 'plannedMeal.slot', array['breakfast','lunch','dinner','snack']);
    perform private.assert_finite_number(item->>'servings', 'plannedMeal.servings', 0.0001, 10000);
    perform private.assert_nonblank(grocery->>'id', 'grocery.id', 128);
    perform private.assert_date_key(grocery->>'weekOf', 'grocery.weekOf');
    perform private.assert_json_shape(grocery->'items', 'grocery.items', 'array');
    week_date := (plan_data->>'weekOf')::date;
    meal_date := (item->>'date')::date;
    if extract(isodow from week_date) <> 1 or meal_date < week_date or meal_date >= week_date + 7
       or grocery->>'weekOf' <> plan_data->>'weekOf'
       or (nullif(item->>'foodId','') is null) = (nullif(item->>'mealId','') is null) then
      perform private.raise_mutation_error('validation_failed', 'choose one food or recipe in the selected week');
    end if;

    -- The lock covers the empty-week case, where there is no plan row to lock.
    perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':meal-plan:' || week_date::text, 0));
    select * into current_plan from public.meal_plans
      where user_id=caller_id and week_of=week_date
      order by version desc, row_id desc limit 1 for update;
    expected_version := nullif(p_payload->'expectedVersions'->>'mealPlanVersion','')::integer;
    if current_plan.row_id is null then
      if expected_version is not null and expected_version <> 0 then
        perform private.raise_stale_version('meal_plan', expected_version, 0);
      end if;
    elsif current_plan.app_id <> plan_data->>'id' then
      perform private.raise_mutation_error('conflict', 'current meal plan changed');
    elsif expected_version is null then
      perform private.raise_mutation_error('validation_failed', 'meal plan version is required');
    elsif expected_version is distinct from current_plan.version then
      perform private.raise_stale_version('meal_plan', expected_version, current_plan.version);
    end if;
    select * into target_row from public.daily_targets
      where user_id=caller_id and app_id=plan_data->>'targetId'
        and effective_date <= meal_date and safety_outcome <> 'unsupported_population'
      order by version desc limit 1;
    if target_row.row_id is null then
      perform private.raise_mutation_error('validation_failed', 'set an eligible daily goal before adding to plan');
    end if;
    if current_plan.row_id is not null and current_plan.target_row_id <> target_row.row_id then
      perform private.raise_mutation_error('conflict', 'plan target changed');
    end if;
    perform private.assert_expected_versions('add_planned_meal',
      p_payload - 'expectedVersions' || jsonb_build_object('expectedVersions',
        (coalesce(p_payload->'expectedVersions','{}'::jsonb) - 'mealPlanVersion')),
      caller_id);

    if p_payload ? 'newFoods' then
      perform private.assert_json_shape(p_payload->'newFoods', 'newFoods', 'array');
      if jsonb_array_length(p_payload->'newFoods') > 10 then perform private.raise_mutation_error('validation_failed', 'too many foods'); end if;
      for new_food in select value from jsonb_array_elements(p_payload->'newFoods') loop
        if new_food->>'valueSource' = 'ai_estimate' then
          perform private.raise_mutation_error('validation_failed', 'correct AI-only values before planning');
        end if;
        perform private.save_food(jsonb_build_object('food',new_food,'idempotencyKey',(p_payload->>'idempotencyKey') || ':food:' || (new_food->>'id')));
      end loop;
    end if;
    if p_payload ? 'newMeal' then
      perform private.save_saved_meal(jsonb_build_object('meal',p_payload->'newMeal','idempotencyKey',(p_payload->>'idempotencyKey') || ':recipe'));
    end if;
    normalized := private.normalize_planned_meal_record(item, caller_id);
    if normalized->>'valueSource' = 'ai_estimate' then
      perform private.raise_mutation_error('validation_failed', 'correct AI-only values before planning');
    end if;
    if current_plan.row_id is null then next_version := 1; else next_version := current_plan.version + 1; end if;
    insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id,supersedes_plan_row_id)
      values(plan_data->>'id',caller_id,next_version,week_date,target_row.row_id,current_plan.row_id)
      returning row_id into new_plan_row_id;
    if current_plan.row_id is not null then
      insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,food_row_id,label,servings,skipped,
        expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,expected_fiber_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order)
      select new_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,food_row_id,label,servings,skipped,
        expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,expected_fiber_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order
      from public.planned_meals where meal_plan_row_id=current_plan.row_id and user_id=caller_id;
    end if;
    select coalesce(max(pm.sort_order),0)+1 into next_order from public.planned_meals pm
      where pm.meal_plan_row_id=new_plan_row_id and pm.meal_date=meal_date and pm.meal_slot=item->>'slot';
    if exists(select 1 from public.planned_meals where meal_plan_row_id=new_plan_row_id and app_id=item->>'id') then
      perform private.raise_mutation_error('conflict', 'planned meal id already exists');
    end if;
    if nullif(item->>'foodId','') is not null then
      select row_id into food_row_id from public.foods where app_id=item->>'foodId' and (is_system or owner_user_id=caller_id);
      if food_row_id is null then perform private.raise_mutation_error('not_found', 'food not found'); end if;
    else
      select row_id into recipe_row_id from public.meals where app_id=item->>'mealId' and (is_system or owner_user_id=caller_id) and archived_at is null;
      if recipe_row_id is null then perform private.raise_mutation_error('not_found', 'recipe not found'); end if;
    end if;
    insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,food_row_id,label,servings,skipped,
      expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,expected_fiber_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order)
    values(new_plan_row_id,caller_id,week_date,item->>'id',meal_date,item->>'slot',recipe_row_id,food_row_id,
      normalized->>'label',(normalized->>'servings')::numeric,false,(normalized->>'expectedCalories')::numeric,
      (normalized->>'expectedProteinG')::numeric,(normalized->>'expectedCarbsG')::numeric,(normalized->>'expectedFatG')::numeric,
      nullif(normalized->>'expectedFiberG','')::numeric,normalized->>'source',normalized->>'sourceVersion',normalized->>'assumptions',
      normalized->>'confidence',normalized->>'preparationBasis',
      'date:' || meal_date::text || ':slot:' || (item->>'slot') || ':id:' || md5(item->>'id'),next_order);

    select row_id into grocery_row_id from public.grocery_lists where user_id=caller_id and week_of=week_date for update;
    if grocery_row_id is null then
      insert into public.grocery_lists(app_id,user_id,week_of) values(grocery->>'id',caller_id,week_date) returning row_id into grocery_row_id;
    elsif exists(select 1 from public.grocery_lists where row_id=grocery_row_id and app_id <> grocery->>'id') then
      perform private.raise_mutation_error('conflict', 'grocery list changed');
    end if;
    for grocery_item in select value from jsonb_array_elements(grocery->'items') loop
      perform private.assert_nonblank(grocery_item->>'id','grocery item id',128);
      perform private.assert_nonblank(grocery_item->>'name','grocery item name',256);
      perform private.assert_finite_number(grocery_item->>'generatedQuantity','generated quantity',0,100000);
      generated := (grocery_item->>'generatedQuantity')::numeric;
      select * into previous_item from public.grocery_items where grocery_list_row_id=grocery_row_id and app_id=grocery_item->>'id' for update;
      if previous_item.row_id is null then
        insert into public.grocery_items(grocery_list_row_id,user_id,app_id,name,category,unit,generated_quantity,quantity,checked,custom_item,removed,source_food_row_id)
        values(grocery_row_id,caller_id,grocery_item->>'id',grocery_item->>'name',grocery_item->>'category',grocery_item->>'unit',generated,
          coalesce(nullif(grocery_item->>'quantity','')::numeric,generated),coalesce((grocery_item->>'checked')::boolean,false),
          coalesce((grocery_item->>'custom')::boolean,false),coalesce((grocery_item->>'removed')::boolean,false),
          (select row_id from public.foods where app_id=grocery_item->>'foodId' and (is_system or owner_user_id=caller_id)));
      else
        update public.grocery_items set generated_quantity=generated,
          quantity=case when previous_item.quantity=previous_item.generated_quantity then generated else previous_item.quantity end
        where row_id=previous_item.row_id and user_id=caller_id;
      end if;
    end loop;
    perform private.reconcile_grocery_items(caller_id,grocery);
    update public.grocery_lists set updated_at=now() where row_id=grocery_row_id;
    result := jsonb_build_object('status','completed','operation','add_planned_meal','result_refs',
      jsonb_build_object('meal_plan_id',plan_data->>'id','meal_plan_version',next_version,'planned_meal_id',item->>'id','grocery_id',grocery->>'id'));
    perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id,sqlstate);
    raise;
  end;
end;
$$;

create function public.add_planned_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return private.add_planned_meal(p_payload); end;
$$;
revoke all on function private.add_planned_meal(jsonb) from public, anon, authenticated;
revoke all on function public.add_planned_meal(jsonb) from public, anon;
grant execute on function public.add_planned_meal(jsonb) to authenticated;
