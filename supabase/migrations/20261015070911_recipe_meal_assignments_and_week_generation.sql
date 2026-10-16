-- Recipe planning preferences never change previously prescribed or eaten nutrition.
create function private.valid_recipe_meal_slots(value text[]) returns boolean
language sql immutable security invoker set search_path='' as $$
  select value is not null and cardinality(value) <= 4
    and value <@ array['breakfast','lunch','dinner','snack']::text[]
    and array_position(value,null) is null
    and cardinality(value)=(select count(distinct v) from unnest(value) v);
$$;
alter table public.meals add column meal_slots text[] not null default '{}';
alter table public.meals add constraint meals_meal_slots_valid check(private.valid_recipe_meal_slots(meal_slots));
update public.meals set meal_slots=array['lunch','dinner']
where is_system and app_id in ('meal-creamy-lemon-chicken','meal-korean-beef-bowl');
-- Preserve whole-recipe nutrition. The existing revision trigger invalidates stale editors.
update public.meals set
  provided_nutrition=case when provided_nutrition is null then null else (
    select jsonb_object_agg(key,to_jsonb((value::text)::numeric * servings / ceil(servings)))
    from jsonb_each(provided_nutrition)
  ) end,
  servings=ceil(servings)
where servings<>ceil(servings);
alter table public.meals add constraint meals_whole_yield check(servings=trunc(servings) and servings between 1 and 10000);

alter function private.save_saved_meal(jsonb) rename to save_saved_meal_before_meal_slots;
create function private.save_saved_meal(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe jsonb:=p_payload->'meal';
  claim record; result jsonb; slots text[]; old_slots text[];
begin
  select * into claim from private.claim_mutation(caller,'save_recipe_meal_slots',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_saved_meal','replayed',true,'result_refs',claim.result_refs); end if;
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller);
  perform private.assert_finite_number(recipe->>'servings','recipe servings',1,10000);
  if trunc((recipe->>'servings')::numeric)<>(recipe->>'servings')::numeric then
    perform private.raise_mutation_error('validation_failed','Recipe servings must be a whole number');
  end if;
  select meal_slots into old_slots from public.meals where app_id=recipe->>'id' and owner_user_id=caller;
  if recipe ? 'mealSlots' then
    perform private.assert_json_shape(recipe->'mealSlots','recipe meal slots','array');
    if exists(select 1 from jsonb_array_elements(recipe->'mealSlots') v where jsonb_typeof(v)<>'string') then
      perform private.raise_mutation_error('validation_failed','Invalid recipe meal slots');
    end if;
    select array_agg(v) into slots from jsonb_array_elements_text(recipe->'mealSlots') v;
    if not private.valid_recipe_meal_slots(slots) or cardinality(slots)=0 then
      perform private.raise_mutation_error('validation_failed','Choose at least one distinct meal slot');
    end if;
  else slots:=coalesce(old_slots,'{}'); end if;
  result:=private.save_saved_meal_before_meal_slots(p_payload);
  if not coalesce((result->>'replayed')::boolean,false) then
    update public.meals set meal_slots=slots where app_id=recipe->>'id' and owner_user_id=caller and meal_slots is distinct from slots;
  end if;
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;

-- Use the same recipe eligibility rules as the deterministic planner, for every diet.
create function private.assert_generation_recipe(p_recipe public.meals,p_profile public.profiles) returns void
language plpgsql security definer set search_path='' as $$
declare food public.foods; pattern text:=lower(p_profile.dietary_pattern); allergy text; prep numeric; cost numeric;
begin
  if p_recipe.archived_at is not null or cardinality(p_recipe.meal_slots)=0
    or not exists(select 1 from public.meal_ingredients where meal_row_id=p_recipe.row_id) then
    perform private.raise_mutation_error('validation_failed','Recipe is not eligible for generation');
  end if;
  if private.total_carb_limit(pattern) is not null and p_recipe.provided_nutrition is not null then
    perform private.raise_mutation_error('validation_failed','Carb-limited generation needs verified ingredient nutrition');
  end if;
  prep:=coalesce(p_recipe.total_time_minutes,case p_recipe.app_id when 'meal-creamy-lemon-chicken' then 30
    when 'meal-mvp3-eggs' then 15 when 'meal-mvp3-chicken' then 30 when 'meal-mvp3-tofu' then 15 when 'meal-mvp3-tofu-almonds' then 15
    when 'meal-yogurt-bowl' then 5 when 'meal-pb-toast' then 8 when 'meal-chicken-rice' then 25 when 'meal-salmon-potato' then 35 else 0 end);
  cost:=case p_recipe.app_id when 'meal-creamy-lemon-chicken' then 7 when 'meal-korean-beef-bowl' then 7
    when 'meal-mvp3-eggs' then 4 when 'meal-mvp3-chicken' then 7 when 'meal-mvp3-tofu' then 4 when 'meal-mvp3-tofu-almonds' then 6
    when 'meal-yogurt-bowl' then 6 when 'meal-pb-toast' then 4 when 'meal-chicken-rice' then 7 when 'meal-salmon-potato' then 12 else 0 end;
  if prep>p_profile.cooking_time_minutes or cost>p_profile.meal_budget then
    perform private.raise_mutation_error('validation_failed','Recipe exceeds cooking-time or budget settings');
  end if;
  for food in select f.* from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=p_recipe.row_id loop
    if food.value_source='ai_estimate' or (private.total_carb_limit(pattern) is not null and food.value_source<>'trusted_catalog')
      or (pattern like '%vegan%' and food.app_id=any(array['food-egg','food-chicken','food-salmon','food-greek-yogurt','food-milk','food-cheddar','food-butter','food-honey','food-mvp3-173424','food-mvp3-171477','food-lemon-chicken-172385','food-lemon-chicken-173410','food-lemon-chicken-171265','food-lemon-chicken-169640','food-korean-beef-171790']))
      or (pattern like '%vegetarian%' and food.app_id=any(array['food-chicken','food-salmon','food-mvp3-171477','food-lemon-chicken-172385','food-korean-beef-171790'])) then
      perform private.raise_mutation_error('validation_failed','Recipe does not meet dietary requirements');
    end if;
    foreach allergy in array p_profile.allergies loop
      allergy:=lower(btrim(allergy));
      if allergy<>'' and (position(allergy in lower(food.name))>0
        or (allergy ~ 'nut' and lower(food.name) ~ 'peanut|almond|nut')
        or (allergy ~ 'soy' and lower(food.name) ~ 'soy|tofu')
        or (allergy ~ 'dairy|milk' and food.category='Dairy')
        or (allergy ~ 'gluten|wheat' and lower(food.name) ~ 'wheat|bread|pasta')
        or (allergy ~ 'egg' and lower(food.name) ~ 'egg')
        or (allergy ~ 'fish|seafood' and lower(food.name) ~ 'salmon|fish')) then
        perform private.raise_mutation_error('validation_failed','Recipe contains an excluded ingredient');
      end if;
    end loop;
  end loop;
end;
$$;

create function private.generate_nutrition_week(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); claim record; result jsonb; item jsonb; selected jsonb;
  week_date date; plan public.meal_plans; profile public.profiles; recipe public.meals;
  used numeric; additions integer; previous public.planned_meals; supplied jsonb; child jsonb;
  grocery_revision integer; old_count integer; limit_carbs numeric; day_row record;
begin
  select * into claim from private.claim_mutation(caller,'generate_nutrition_week',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','generate_nutrition_week','replayed',true,'result_refs',claim.result_refs); end if;
  perform private.assert_date_key(p_payload->>'weekOf','weekOf'); week_date:=(p_payload->>'weekOf')::date;
  if extract(isodow from week_date)<>1 then perform private.raise_mutation_error('validation_failed','Choose a Monday week key'); end if;
  perform private.assert_json_shape(p_payload->'assignments','assignments','array');
  perform private.assert_json_shape(p_payload->'recipes','recipes','array');
  if jsonb_array_length(p_payload->'assignments') not between 1 and 28 or jsonb_array_length(p_payload->'recipes') not between 1 and 1000 then
    perform private.raise_mutation_error('validation_failed','Review generated recipes and assignments');
  end if;
  select * into profile from public.profiles where id=caller for update;
  if profile.id is null then perform private.raise_mutation_error('not_found','Profile not found'); end if;
  if profile.eligibility_status='unsupported' then perform private.raise_mutation_error('validation_failed','An eligible daily goal is required'); end if;
  if (p_payload->'expectedVersions'->>'profileRevision')::integer is distinct from profile.revision then
    perform private.raise_stale_version('profile',(p_payload->'expectedVersions'->>'profileRevision')::integer,profile.revision);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':meal-plan:'||week_date::text,0));
  select * into plan from public.meal_plans where user_id=caller and week_of=week_date order by version desc,row_id desc limit 1 for update;
  if (p_payload->'expectedVersions'->>'mealPlanVersion')::integer is distinct from coalesce(plan.version,0) then
    perform private.raise_stale_version('meal_plan',(p_payload->'expectedVersions'->>'mealPlanVersion')::integer,coalesce(plan.version,0));
  end if;
  select revision into grocery_revision from public.grocery_lists where user_id=caller and week_of=week_date for update;
  if (p_payload->'expectedVersions'->>'groceryRevision')::integer is distinct from coalesce(grocery_revision,0) then
    perform private.raise_stale_version('grocery',(p_payload->'expectedVersions'->>'groceryRevision')::integer,coalesce(grocery_revision,0));
  end if;
  if p_payload->'mealPlan'->>'weekOf' is distinct from week_date::text then perform private.raise_mutation_error('validation_failed','Plan week does not match'); end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'recipes') r group by r->>'id' having count(*)>1) then
    perform private.raise_mutation_error('validation_failed','Duplicate recipe selection');
  end if;
  for selected in select value from jsonb_array_elements(p_payload->'recipes') order by value->>'id' loop
    select * into recipe from public.meals where app_id=selected->>'id' and (is_system or owner_user_id=caller) for share;
    if recipe.row_id is null or recipe.archived_at is not null or exists(select 1 from public.recipe_catalog_preferences where user_id=caller and catalog_meal_row_id=recipe.row_id) then
      perform private.raise_mutation_error('not_found','Selected recipe is no longer available');
    end if;
    if (selected->>'revision')::integer is distinct from recipe.revision then perform private.raise_stale_version('recipe',(selected->>'revision')::integer,recipe.revision); end if;
    select count(*) into additions from jsonb_array_elements(p_payload->'assignments') a where a->>'mealId'=recipe.app_id;
    if additions>0 then
      perform private.assert_generation_recipe(recipe,profile);
      select coalesce(sum(servings),0) into used from public.planned_meals where meal_plan_row_id=plan.row_id and meal_row_id=recipe.row_id and not skipped;
      if used+additions>recipe.servings then perform private.raise_mutation_error('validation_failed','Generated servings exceed the remaining weekly yield'); end if;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'assignments') loop
    perform private.assert_date_key(item->>'date','assignment date');
    perform private.assert_enum(item->>'slot','assignment slot',array['breakfast','lunch','dinner','snack']);
    if (item->>'date')::date < week_date or (item->>'date')::date>=week_date+7 or (item->>'servings')::numeric is distinct from 1
      or item ? 'foodId' or coalesce((item->>'skipped')::boolean,false)
      or not exists(select 1 from jsonb_array_elements(p_payload->'recipes') r where r->>'id'=item->>'mealId')
      or not exists(select 1 from public.meals where app_id=item->>'mealId' and item->>'slot'=any(meal_slots)) then
      perform private.raise_mutation_error('validation_failed','Assignment must use one serving in an eligible slot');
    end if;
    if exists(select 1 from public.planned_meals where meal_plan_row_id=plan.row_id and meal_date=(item->>'date')::date and meal_slot=item->>'slot')
      or exists(select 1 from public.nutrition_logs where user_id=caller and log_date=(item->>'date')::date and meal_slot=item->>'slot')
      or exists(select 1 from public.logged_meals where user_id=caller and log_date=(item->>'date')::date and meal_slot=item->>'slot') then
      perform private.raise_mutation_error('stale_version','A generated slot is now occupied. Refresh and review the week.');
    end if;
    if not exists(select 1 from (select safety_outcome from public.daily_targets where user_id=caller and effective_date<=(item->>'date')::date order by effective_date desc,version desc limit 1) t where t.safety_outcome<>'unsupported_population') then
      perform private.raise_mutation_error('validation_failed','An eligible daily goal is required for each generated day');
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'assignments') a group by a->>'date',a->>'slot' having count(*)>1) then
    perform private.raise_mutation_error('validation_failed','Only one generated entry fits each empty slot');
  end if;
  -- A generation request cannot remove, edit, or replace an existing prescription.
  select count(*) into old_count from public.planned_meals where meal_plan_row_id=plan.row_id;
  if jsonb_array_length(p_payload->'mealPlan'->'meals')<>old_count+jsonb_array_length(p_payload->'assignments')
    or exists(select 1 from jsonb_array_elements(p_payload->'mealPlan'->'meals') m group by m->>'id' having count(*)>1) then
    perform private.raise_mutation_error('validation_failed','Existing plan entries must be preserved');
  end if;
  for previous in select * from public.planned_meals where meal_plan_row_id=plan.row_id loop
    select value into supplied from jsonb_array_elements(p_payload->'mealPlan'->'meals') m where m->>'id'=previous.app_id;
    if supplied is null or supplied->>'date' is distinct from previous.meal_date::text or supplied->>'slot' is distinct from previous.meal_slot
      or (supplied->>'servings')::numeric is distinct from previous.servings or supplied->>'label' is distinct from previous.label
      or coalesce((supplied->>'skipped')::boolean,false) is distinct from previous.skipped
      or supplied->>'mealId' is distinct from (select app_id from public.meals where row_id=previous.meal_row_id)
      or supplied->>'foodId' is distinct from (select app_id from public.foods where row_id=previous.food_row_id) then
      perform private.raise_mutation_error('validation_failed','Existing plan entries must be preserved');
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'assignments') loop
    if not exists(select 1 from jsonb_array_elements(p_payload->'mealPlan'->'meals') m where m=item) then
      perform private.raise_mutation_error('validation_failed','Saved assignments must match the preview');
    end if;
  end loop;
  limit_carbs:=private.total_carb_limit(profile.dietary_pattern);
  if limit_carbs is not null then
    for day_row in select a->>'date' date_key,sum((private.normalize_planned_meal_record(a,caller)->>'expectedCarbsG')::numeric) carbs
      from jsonb_array_elements(p_payload->'assignments') a group by a->>'date' loop
      if exists(select 1 from public.planned_meals where meal_plan_row_id=plan.row_id and not skipped and meal_date=day_row.date_key::date and expected_carbs_g is null)
        or day_row.carbs+coalesce((select sum(expected_carbs_g) from public.planned_meals where meal_plan_row_id=plan.row_id and not skipped and meal_date=day_row.date_key::date),0)>limit_carbs then
        perform private.raise_mutation_error('validation_failed','Generated meals exceed the daily carbohydrate limit');
      end if;
    end loop;
  end if;
  child:=p_payload - 'recipes' - 'assignments' - 'weekOf';
  if plan.row_id is null then
    result:=private.add_planned_meal(child || jsonb_build_object('plannedMeal',p_payload->'assignments'->0,'idempotencyKey',(p_payload->>'idempotencyKey')||':first'));
    if jsonb_array_length(p_payload->'assignments')>1 then
      select revision into grocery_revision from public.grocery_lists where user_id=caller and week_of=week_date;
      child:=child || jsonb_build_object('expectedVersions',jsonb_build_object('mealPlanVersion',1,'groceryRevision',grocery_revision));
      result:=private.persist_meal_plan_edit(child || jsonb_build_object('idempotencyKey',(p_payload->>'idempotencyKey')||':rest'));
    end if;
  else
    result:=private.persist_meal_plan_edit(child || jsonb_build_object('idempotencyKey',(p_payload->>'idempotencyKey')||':plan'));
  end if;
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return jsonb_build_object('status','completed','operation','generate_nutrition_week','result_refs',result->'result_refs');
end;
$$;
-- Deliberate definer wrapper: clients cannot execute the private writer directly.
create function public.generate_nutrition_week(p_payload jsonb) returns jsonb
language sql security definer set search_path='' as $$ select private.generate_nutrition_week(p_payload); $$;
revoke all on function private.valid_recipe_meal_slots(text[]), private.save_saved_meal_before_meal_slots(jsonb),
  private.save_saved_meal(jsonb),private.assert_generation_recipe(public.meals,public.profiles),private.generate_nutrition_week(jsonb) from public,anon,authenticated;
revoke all on function public.generate_nutrition_week(jsonb) from public,anon;
grant execute on function public.generate_nutrition_week(jsonb) to authenticated;
revoke insert,update,delete on public.meals,public.meal_ingredients,public.meal_plans,public.planned_meals from anon,authenticated;
-- Recipe authoring reconciles its submitted grocery week, independently of a
-- future generated week. Preserve all existing revision checks and lock order.
create or replace function private.assert_expected_versions(
  p_operation text,
  p_payload jsonb,
  p_user_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  expected jsonb := coalesce(p_payload->'expectedVersions', '{}'::jsonb);
  actual_profile integer;
  actual_goal integer;
  actual_target integer;
  actual_workout integer;
  actual_meal integer;
  actual_grocery integer;
  actual_record integer;
  record_id text;
  version_key text;
begin
  if p_operation is null or btrim(p_operation) = '' then
    perform private.raise_mutation_error('validation_failed', 'operation is required');
  end if;

  for version_key in select entry.key from jsonb_each(expected) as entry
  loop
    if (expected->>version_key) !~ '^\d+$' then
      perform private.raise_mutation_error('validation_failed', version_key || ' must be an integer');
    end if;
  end loop;

  -- Stable lock order: profile, goal, target, workout plan, meal plan,
  -- grocery list, then a directly edited child record.
  select revision into actual_profile
  from public.profiles where id = p_user_id for update;
  if expected ? 'profileRevision' and actual_profile is not null
     and (expected->>'profileRevision')::integer <> actual_profile then
    perform private.raise_stale_version('profile', (expected->>'profileRevision')::integer, actual_profile);
  end if;

  select version into actual_goal
  from public.goals where user_id = p_user_id and status = 'active' and is_primary
  order by version desc limit 1 for update;
  if expected ? 'goalVersion' and actual_goal is not null
     and (expected->>'goalVersion')::integer <> actual_goal then
    perform private.raise_stale_version('goal', (expected->>'goalVersion')::integer, actual_goal);
  end if;

  select version into actual_target
  from public.daily_targets where user_id = p_user_id
  order by version desc limit 1 for update;
  if expected ? 'targetVersion' and actual_target is not null
     and (expected->>'targetVersion')::integer <> actual_target then
    perform private.raise_stale_version('target', (expected->>'targetVersion')::integer, actual_target);
  end if;

  select version into actual_workout
  from public.workout_plans where user_id = p_user_id
  order by created_at desc, row_id desc limit 1 for update;
  if expected ? 'workoutPlanVersion' and actual_workout is not null
     and (expected->>'workoutPlanVersion')::integer <> actual_workout then
    perform private.raise_stale_version('workout_plan', (expected->>'workoutPlanVersion')::integer, actual_workout);
  end if;

  select version into actual_meal
  from public.meal_plans where user_id = p_user_id
  order by created_at desc, row_id desc limit 1 for update;
  if expected ? 'mealPlanVersion' and actual_meal is not null
     and (expected->>'mealPlanVersion')::integer <> actual_meal then
    perform private.raise_stale_version('meal_plan', (expected->>'mealPlanVersion')::integer, actual_meal);
  end if;

  select revision into actual_grocery
  from public.grocery_lists where user_id = p_user_id
    and (p_operation not in ('save_recipe','save_saved_meal')
      or p_payload->'grocery'->>'weekOf' is null
      or week_of=(p_payload->'grocery'->>'weekOf')::date)
  order by week_of desc, row_id desc limit 1 for update;
  if expected ? 'groceryRevision' and actual_grocery is not null
     and (expected->>'groceryRevision')::integer <> actual_grocery then
    perform private.raise_stale_version('grocery', (expected->>'groceryRevision')::integer, actual_grocery);
  end if;

  record_id := nullif(p_payload->>'nutritionLogId', '');
  if record_id is not null then
    select revision into actual_record
    from public.nutrition_logs
    where user_id = p_user_id and app_id = record_id
    for update;
    if expected ? 'recordRevision' and actual_record is not null
       and (expected->>'recordRevision')::integer <> actual_record then
      perform private.raise_stale_version('nutrition_record', (expected->>'recordRevision')::integer, actual_record);
    end if;
  end if;
end;
$$;


revoke all on function private.assert_expected_versions(text,jsonb,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
