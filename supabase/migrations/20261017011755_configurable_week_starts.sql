-- Week boundaries are account preferences; prescriptions and actual history retain their dates.
alter table public.profiles add column week_starts_on integer not null default 0
  check (week_starts_on between 0 and 6);
alter table public.profiles add column calendar_revision integer not null default 0;
alter table public.meal_plans drop constraint meal_plans_week_start_check;
alter table public.grocery_lists drop constraint grocery_lists_week_start_check;
alter table public.meal_plans add column calendar_active boolean not null default true;
alter table public.grocery_lists add column calendar_active boolean not null default true;
alter table public.grocery_lists add column calendar_review_required boolean not null default false;
alter table public.grocery_items add column carried_from_week date;
create index meal_plans_active_week_idx on public.meal_plans(user_id,week_of,version desc) where calendar_active;
create index grocery_lists_active_week_idx on public.grocery_lists(user_id,week_of) where calendar_active;

create table public.calendar_transitions (
  row_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_day integer not null check (from_day between 0 and 6),
  to_day integer not null check (to_day between 0 and 6),
  source_plans jsonb not null,
  source_groceries jsonb not null,
  destinations jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.meal_plans add column calendar_transition_row_id bigint references public.calendar_transitions(row_id);
create index meal_plans_calendar_transition_idx on public.meal_plans(calendar_transition_row_id);
alter table public.calendar_transitions enable row level security;
create policy "users can read their calendar transitions" on public.calendar_transitions for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.calendar_transitions from public,anon,authenticated;
grant select on public.calendar_transitions to authenticated;
grant all on public.calendar_transitions to service_role;
grant usage,select on sequence public.calendar_transitions_row_id_seq to service_role;
create index calendar_transitions_user_date_idx on public.calendar_transitions(user_id,created_at desc);

create function private.calendar_week(p_date date,p_start integer) returns date
language sql immutable set search_path='' as $$
  select p_date - ((extract(dow from p_date)::integer - p_start + 7) % 7);
$$;
create function private.account_week_start(p_user uuid) returns integer
language sql stable set search_path='' as $$
  select coalesce((select week_starts_on from public.profiles where id=p_user),0);
$$;

-- Concurrency metadata is excluded consistently, including legacy planned-log replay checks.
create or replace function private.request_hash(p_payload jsonb) returns text
language sql immutable set search_path='' as $$
  select md5((coalesce(p_payload,'{}'::jsonb) - 'calendarRevision')::text);
$$;

-- Internal only. The source JSON is captured before deactivating any boundary.
-- This also prevents old destination lists from being resurrected on a later switch back.
create function private.regroup_calendar(p_user uuid,p_from integer,p_to integer) returns void
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
      on conflict (user_id,week_of) do update set calendar_active=true,calendar_review_required=true
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

create function private.set_week_start(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); claim record; profile public.profiles; requested numeric; refs jsonb;
begin
  perform private.assert_finite_number(p_payload->>'weekStartsOn','weekStartsOn',0,6);
  requested:=(p_payload->>'weekStartsOn')::numeric;
  if requested<>trunc(requested) then perform private.raise_mutation_error('validation_failed','Choose a weekday'); end if;
  perform private.assert_finite_number(p_payload->>'expectedRevision','expectedRevision',1,2147483647);
  select * into claim from private.claim_mutation(caller,'set_week_start',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  select * into profile from public.profiles where id=caller for update;
  if profile.id is null then perform private.raise_mutation_error('not_found'); end if;
  if (p_payload->>'expectedRevision')::numeric<>profile.revision then perform private.raise_stale_version('profile',(p_payload->>'expectedRevision')::integer,profile.revision); end if;
  if profile.week_starts_on<>requested::integer then perform private.regroup_calendar(caller,profile.week_starts_on,requested::integer); end if;
  refs:=jsonb_build_object('profile_id',caller);
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$$;
create function public.set_week_start(p_payload jsonb) returns jsonb
language sql security definer set search_path='' as $$ select private.set_week_start(p_payload); $$;
revoke all on function private.calendar_week(date,integer),private.account_week_start(uuid),private.regroup_calendar(uuid,integer,integer),private.set_week_start(jsonb) from public,anon,authenticated;
revoke all on function public.set_week_start(jsonb) from public,anon;
grant execute on function public.set_week_start(jsonb) to authenticated;
revoke insert,update,delete on public.profiles,public.meal_plans,public.planned_meals,public.grocery_lists,public.grocery_items from anon,authenticated;

-- BEGIN BASELINE FUNCTION UPDATES
-- These definitions come from the verified identical local/remote schema baseline.

CREATE OR REPLACE FUNCTION "private"."add_custom_grocery_item"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

    result := jsonb_build_object('status', 'completed', 'operation', 'add_custom_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id, 'grocery_list_id', grocery->>'id'));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."add_planned_meal"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
#variable_conflict use_column
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
  selected_date date;
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
    selected_date := (item->>'date')::date;
    if extract(dow from week_date) <> private.account_week_start(auth.uid()) or selected_date < week_date or selected_date >= week_date + 7
       or grocery->>'weekOf' <> plan_data->>'weekOf'
       or (nullif(item->>'foodId','') is null) = (nullif(item->>'mealId','') is null) then
      perform private.raise_mutation_error('validation_failed', 'choose one food or recipe in the selected week');
    end if;

    -- The lock covers the empty-week case, where there is no plan row to lock.
    -- Match the profile-first lock order used by logging and target/plan generation.
    perform 1 from public.profiles where id = caller_id for update;
    perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':meal-plan:' || week_date::text, 0));
    select * into current_plan from public.meal_plans
      where calendar_active and user_id=caller_id and week_of=week_date
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
        and effective_date <= selected_date and safety_outcome <> 'unsupported_population'
      order by version desc limit 1;
    if target_row.row_id is null then
      perform private.raise_mutation_error('validation_failed', 'set an eligible daily goal before adding to plan');
    end if;
    if current_plan.row_id is not null and current_plan.target_row_id <> target_row.row_id then
      perform private.raise_mutation_error('conflict', 'plan target changed');
    end if;
    perform private.assert_expected_versions('add_planned_meal',
      p_payload - 'expectedVersions' || jsonb_build_object('expectedVersions',
        (coalesce(p_payload->'expectedVersions','{}'::jsonb) - 'mealPlanVersion' - 'groceryRevision')),
      caller_id);

    select row_id into grocery_row_id from public.grocery_lists where calendar_active and user_id=caller_id and week_of=week_date for update;
    if grocery_row_id is not null then
      if coalesce(p_payload->'expectedVersions'->>'groceryRevision','') !~ '^\d+$' then perform private.raise_mutation_error('validation_failed','grocery revision required'); end if;
      if (select revision from public.grocery_lists where calendar_active and row_id=grocery_row_id) <> (p_payload->'expectedVersions'->>'groceryRevision')::integer then
        perform private.raise_stale_version('grocery',(p_payload->'expectedVersions'->>'groceryRevision')::integer,(select revision from public.grocery_lists where calendar_active and row_id=grocery_row_id));
      end if;
    end if;
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
      where pm.meal_plan_row_id=new_plan_row_id and pm.meal_date=selected_date and pm.meal_slot=item->>'slot';
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
    values(new_plan_row_id,caller_id,week_date,item->>'id',selected_date,item->>'slot',recipe_row_id,food_row_id,
      normalized->>'label',(normalized->>'servings')::numeric,false,(normalized->>'expectedCalories')::numeric,
      (normalized->>'expectedProteinG')::numeric,(normalized->>'expectedCarbsG')::numeric,(normalized->>'expectedFatG')::numeric,
      nullif(normalized->>'expectedFiberG','')::numeric,normalized->>'source',normalized->>'sourceVersion',normalized->>'assumptions',
      normalized->>'confidence',normalized->>'preparationBasis',
      'date:' || selected_date::text || ':slot:' || (item->>'slot') || ':id:' || md5(item->>'id'),next_order);

    select row_id into grocery_row_id from public.grocery_lists where calendar_active and user_id=caller_id and week_of=week_date for update;
    if grocery_row_id is null then
      insert into public.grocery_lists(app_id,user_id,week_of) values(grocery->>'id',caller_id,week_date) returning row_id into grocery_row_id;
    elsif exists(select 1 from public.grocery_lists where calendar_active and row_id=grocery_row_id and app_id <> grocery->>'id') then
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
$_$;


CREATE OR REPLACE FUNCTION "private"."assert_expected_versions"("p_operation" "text", "p_payload" "jsonb", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
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

  if p_operation in ('toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery') and p_payload ? 'weekOf' then
    perform private.assert_date_key(p_payload->>'weekOf','weekOf');
    if extract(dow from (p_payload->>'weekOf')::date) <> private.account_week_start(auth.uid()) or p_payload->'grocery'->>'weekOf' is distinct from p_payload->>'weekOf' then
      perform private.raise_mutation_error('validation_failed','Choose one matching account grocery week');
    end if;
    perform private.assert_nonblank(p_payload->'grocery'->>'id','grocery.id',128);
    if coalesce(expected->>'groceryRevision','') !~ '^\d+$' then perform private.raise_mutation_error('validation_failed','Grocery revision is required'); end if;
  end if;

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
  from public.meal_plans where calendar_active and user_id = p_user_id
    and (p_operation <> 'regenerate_grocery' or p_payload->>'weekOf' is null or week_of=(p_payload->>'weekOf')::date)
  order by created_at desc, row_id desc limit 1 for update;
  if expected ? 'mealPlanVersion' and actual_meal is not null
     and (expected->>'mealPlanVersion')::integer <> actual_meal then
    perform private.raise_stale_version('meal_plan', (expected->>'mealPlanVersion')::integer, actual_meal);
  end if;

  select revision into actual_grocery
  from public.grocery_lists where calendar_active and user_id = p_user_id
    and (p_operation not in ('save_recipe','save_saved_meal','toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery')
      or p_payload->'grocery'->>'weekOf' is null
      or week_of=(p_payload->'grocery'->>'weekOf')::date)
  order by week_of desc, row_id desc limit 1 for update;
  if expected ? 'groceryRevision' and (actual_grocery is not null or p_operation in ('toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery') and p_payload ? 'weekOf')
     and (expected->>'groceryRevision')::integer <> coalesce(actual_grocery,0) then
    perform private.raise_stale_version('grocery', (expected->>'groceryRevision')::integer, coalesce(actual_grocery,0));
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
$_$;


CREATE OR REPLACE FUNCTION "private"."build_account_export"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare caller uuid:=private.require_authenticated();
begin
  return jsonb_build_object('calendarTransitions',coalesce((select jsonb_agg(to_jsonb(t)) from public.calendar_transitions t where user_id=caller),'[]'::jsonb)) || private.build_account_export_before_catalog() || jsonb_build_object('recipeCatalogPreferences',coalesce((
    select jsonb_agg(jsonb_build_object('mealId',m.app_id,'replacementMealId',r.app_id,'revision',cp.revision,'updatedAt',cp.updated_at) order by m.app_id)
    from public.recipe_catalog_preferences cp join public.meals m on m.row_id=cp.catalog_meal_row_id
    left join public.meals r on r.row_id=cp.replacement_meal_row_id where cp.user_id=caller
  ),'[]'::jsonb));
end;
$$;

CREATE OR REPLACE FUNCTION "private"."capture_meal_constraints"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.calendar_transition_row_id is not null then
    if not exists(select 1 from public.calendar_transitions t cross join lateral jsonb_array_elements(t.source_plans) p
      where t.row_id=new.calendar_transition_row_id and t.user_id=new.user_id and (p->>'row_id')::bigint=new.supersedes_plan_row_id) then
      perform private.raise_mutation_error('validation_failed','Invalid calendar transition source');
    end if;
    select dietary_pattern,allergies,total_carb_limit into new.dietary_pattern,new.allergies,new.total_carb_limit
      from public.meal_plans where row_id=new.supersedes_plan_row_id and user_id=new.user_id;
    return new;
  end if;
  if new.supersedes_plan_row_id is not null then
    select dietary_pattern, allergies, total_carb_limit into new.dietary_pattern, new.allergies, new.total_carb_limit
    from public.meal_plans where calendar_active and row_id = new.supersedes_plan_row_id and user_id = new.user_id and week_of = new.week_of;
    if not found then perform private.raise_mutation_error('validation_failed','invalid previous meal plan'); end if;
  else
    select dietary_pattern, allergies into new.dietary_pattern, new.allergies from public.profiles where id = new.user_id;
    new.total_carb_limit := private.total_carb_limit(new.dietary_pattern);
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."check_meal_constraints"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare plan public.meal_plans%rowtype; day_carbs numeric; forbidden boolean;
begin
  select * into plan from public.meal_plans where calendar_active and row_id = new.meal_plan_row_id;
  if plan.calendar_transition_row_id is not null or plan.total_carb_limit is null then return null; end if;
  -- Supplied macros remain unverified even when the grocery ingredients are trusted.
  if exists (select 1 from public.planned_meals pm join public.meals m on m.row_id = pm.meal_row_id
    where pm.meal_plan_row_id = plan.row_id and not pm.skipped and m.provided_nutrition is not null) then
    perform private.raise_mutation_error('validation_failed', 'carb-limited plans require verified catalog nutrition');
  end if;
  -- Check authoritative ingredients rather than client supplied totals. Empty slots
  -- remain unresolved; they do not assert that the whole day is compliant.
  if exists (select 1 from public.planned_meals pm where pm.meal_plan_row_id = plan.row_id
    and pm.meal_row_id is not null and not exists
      (select 1 from public.meal_ingredients i where i.meal_row_id = pm.meal_row_id)) then
    perform private.raise_mutation_error('validation_failed', 'recipe has no verified serving data');
  end if;
  if exists(select 1 from public.meals m cross join lateral jsonb_array_elements(coalesce(m.unmeasured_ingredients,'[]'::jsonb)) item cross join unnest(plan.allergies) allergy join public.planned_meals pm on pm.meal_row_id=m.row_id where pm.meal_plan_row_id=plan.row_id and not pm.skipped and btrim(allergy)<>'' and (position(lower(btrim(allergy)) in lower(item->>'name'))>0 or (lower(allergy)~'nut' and lower(item->>'name')~'peanut|almond|nut') or (lower(allergy)~'soy' and lower(item->>'name')~'soy|tofu') or (lower(allergy)~'gluten|wheat' and lower(item->>'name')~'wheat|bread|pasta') or (lower(allergy)~'egg' and lower(item->>'name')~'egg') or (lower(allergy)~'fish|seafood' and lower(item->>'name')~'salmon|fish'))) then perform private.raise_mutation_error('validation_failed','Recipe contains an excluded unmeasured ingredient'); end if;
  with ingredients as (
    select pm.meal_date, f.*, pm.servings as quantity
      from public.planned_meals pm join public.foods f on f.row_id = pm.food_row_id
      where pm.meal_plan_row_id = plan.row_id and not pm.skipped
    union all
    select pm.meal_date, f.*, pm.servings * i.servings / m.servings as quantity
      from public.planned_meals pm join public.meals m on m.row_id = pm.meal_row_id
      join public.meal_ingredients i on i.meal_row_id = m.row_id
      join public.foods f on f.row_id = i.food_row_id
      where pm.meal_plan_row_id = plan.row_id and not pm.skipped
  ), checked as (
    select *, value_source <> 'trusted_catalog'
      or (lower(plan.dietary_pattern) like '%vegan%' and app_id in
        ('food-egg','food-chicken','food-salmon','food-greek-yogurt','food-milk','food-cheddar','food-butter','food-honey','food-mvp3-173424','food-mvp3-171477','food-lemon-chicken-172385','food-korean-beef-171790','food-chicken-prep-171077','food-lemon-chicken-173410','food-lemon-chicken-171265','food-lemon-chicken-169640'))
      or (lower(plan.dietary_pattern) like '%vegetarian%' and app_id in ('food-chicken','food-salmon','food-mvp3-171477','food-lemon-chicken-172385','food-korean-beef-171790','food-chicken-prep-171077'))
      or exists (select 1 from unnest(plan.allergies) allergy where btrim(allergy) <> '' and (
        position(lower(btrim(allergy)) in lower(name)) > 0
        or (lower(allergy) ~ 'nut' and lower(name) ~ 'peanut|almond|nut')
        or (lower(allergy) ~ 'soy' and lower(name) ~ 'soy|tofu')
        or (lower(allergy) ~ 'dairy|milk' and category = 'Dairy')
        or (lower(allergy) ~ 'gluten|wheat' and lower(name) ~ 'wheat|bread|pasta')
        or (lower(allergy) ~ 'egg' and lower(name) ~ 'egg')
        or (lower(allergy) ~ 'fish|seafood' and lower(name) ~ 'salmon|fish')
      )) as invalid from ingredients
  ) select coalesce(max(carbs),0), coalesce(bool_or(invalid),false) into day_carbs, forbidden
    from (select meal_date, sum(carbs_g * quantity) carbs, bool_or(invalid) invalid from checked group by meal_date) days;
  if forbidden then perform private.raise_mutation_error('validation_failed', 'meal choice conflicts with verified diet or allergy constraints'); end if;
  if day_carbs > plan.total_carb_limit then perform private.raise_mutation_error('validation_failed', 'daily total carbohydrate limit exceeded'); end if;
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."claim_mutation"("p_user_id" "uuid", "p_operation" "text", "p_idempotency_key" "text", "p_payload" "jsonb") RETURNS TABLE("mutation_row_id" bigint, "request_hash" "text", "replay" boolean, "status" "text", "result_refs" "jsonb", "error_code" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  -- Calendar revision is concurrency metadata; replay identity is the original business intent.
  current_hash text := private.request_hash(p_payload - 'calendarRevision');
  existing public.mutation_idempotency%rowtype;
begin
  if p_user_id is null then
    perform private.raise_mutation_error('not_authenticated');
  end if;
  if p_operation is null or btrim(p_operation) = '' then
    perform private.raise_mutation_error('validation_failed', 'operation is required');
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    perform private.raise_mutation_error('validation_failed', 'idempotency_key is required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':calendar',0));

  insert into public.mutation_idempotency (
    user_id, operation, idempotency_key, request_hash, status
  )
  values (p_user_id, p_operation, p_idempotency_key, current_hash, 'pending')
  on conflict (user_id, operation, idempotency_key) do nothing;

  select *
  into existing
  from public.mutation_idempotency
  where user_id = p_user_id
    and operation = p_operation
    and idempotency_key = p_idempotency_key
  for update;

  if existing.request_hash <> current_hash then
    perform private.raise_mutation_error('idempotency_key_reused');
  end if;

  if existing.status = 'completed' then
    return query
    select existing.row_id, existing.request_hash, true, existing.status,
           existing.result_refs, existing.error_code;
    return;
  end if;

  if (p_operation in ('complete_onboarding','update_profile','update_units','reset_plan','set_week_start','skip_planned_meal','edit_meal_plan','add_planned_meal','generate_nutrition_week','log_planned_meal','toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery') or p_payload ? 'grocery')
     and exists(select 1 from public.profiles where id=p_user_id and calendar_revision::text is distinct from p_payload->>'calendarRevision') then
    perform private.raise_mutation_error('stale_version','Calendar settings changed. Refresh your account and review this action again.');
  end if;

  if existing.status = 'failed' then
    update public.mutation_idempotency
    set status = 'pending', error_code = null, completed_at = null
    where row_id = existing.row_id;
    existing.status := 'pending';
    existing.error_code := null;
  end if;

  return query
  select existing.row_id, existing.request_hash, false, existing.status,
         existing.result_refs, existing.error_code;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."generate_nutrition_week"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare caller uuid:=private.require_authenticated(); claim record; result jsonb; item jsonb; selected jsonb;
  week_date date; plan public.meal_plans; profile public.profiles; recipe public.meals;
  used numeric; additions integer; previous public.planned_meals; supplied jsonb; child jsonb;
  grocery_revision integer; old_count integer; limit_carbs numeric; day_row record;
begin
  select * into claim from private.claim_mutation(caller,'generate_nutrition_week',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','generate_nutrition_week','replayed',true,'result_refs',claim.result_refs); end if;
  perform private.assert_date_key(p_payload->>'weekOf','weekOf');
  if jsonb_typeof(p_payload->'selectedDates') is distinct from 'array' or jsonb_array_length(p_payload->'selectedDates') not between 1 and 7 then
    perform private.raise_mutation_error('validation_failed','Choose at least one day');
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'selectedDates') d group by d having count(*)>1) then
    perform private.raise_mutation_error('validation_failed','Duplicate selected dates');
  end if;
  for selected in select value from jsonb_array_elements(p_payload->'selectedDates') loop
    perform private.assert_date_key(selected #>> '{}','selected date');
    if (selected #>> '{}')::date < (p_payload->>'weekOf')::date or (selected #>> '{}')::date >= (p_payload->>'weekOf')::date+7 then
      perform private.raise_mutation_error('validation_failed','Selected date is outside this week');
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'assignments') a where not (p_payload->'selectedDates' ? (a->>'date'))) then
    perform private.raise_mutation_error('validation_failed','Assignment is outside selected days');
  end if;
  perform private.assert_date_key(p_payload->>'weekOf','weekOf'); week_date:=(p_payload->>'weekOf')::date;
  if extract(dow from week_date) <> private.account_week_start(auth.uid()) then perform private.raise_mutation_error('validation_failed','Choose the account week key'); end if;
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
  select * into plan from public.meal_plans where calendar_active and user_id=caller and week_of=week_date order by version desc,row_id desc limit 1 for update;
  if (p_payload->'expectedVersions'->>'mealPlanVersion')::integer is distinct from coalesce(plan.version,0) then
    perform private.raise_stale_version('meal_plan',(p_payload->'expectedVersions'->>'mealPlanVersion')::integer,coalesce(plan.version,0));
  end if;
  select revision into grocery_revision from public.grocery_lists where calendar_active and user_id=caller and week_of=week_date for update;
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
      select revision into grocery_revision from public.grocery_lists where calendar_active and user_id=caller and week_of=week_date;
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

CREATE OR REPLACE FUNCTION "private"."log_planned_meal"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


CREATE OR REPLACE FUNCTION "private"."persist_meal_plan_edit"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  caller uuid := private.require_authenticated(); claim record; result jsonb;
  data jsonb := p_payload->'mealPlan'; grocery jsonb := p_payload->'grocery';
  week_date date; old_plan public.meal_plans%rowtype; previous public.planned_meals%rowtype;
  old_grocery public.grocery_lists%rowtype; next_row bigint; next_version integer;
  item jsonb; normalized jsonb; recipe_id bigint; food_id bigint; position integer := 0;
  grocery_item jsonb; previous_item public.grocery_items%rowtype; generated numeric;
  unchanged boolean;
begin
  select * into claim from private.claim_mutation(caller, 'edit_meal_plan', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','edit_meal_plan','replayed',true,'result_refs',claim.result_refs); end if;
  perform private.assert_json_shape(data, 'mealPlan', 'object');
  perform private.assert_date_key(data->>'weekOf', 'mealPlan.weekOf');
  perform private.assert_nonblank(data->>'id', 'mealPlan.id', 128);
  perform private.assert_json_shape(data->'meals', 'mealPlan.meals', 'array');
  week_date := (data->>'weekOf')::date;
  if extract(dow from week_date) <> private.account_week_start(auth.uid()) then perform private.raise_mutation_error('validation_failed','week must match the account preference'); end if;
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
  result := jsonb_build_object('status','completed','operation','edit_meal_plan','result_refs',jsonb_build_object('meal_plan_id',old_plan.app_id,'meal_plan_version',next_version,'grocery_id',old_grocery.app_id));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$_$;


CREATE OR REPLACE FUNCTION "private"."persist_profile_bundle"("p_operation" "text", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid;
  claim record;
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  target_data jsonb := coalesce(p_payload->'target', '{}'::jsonb);
  plan_data jsonb := coalesce(p_payload->'plan', '{}'::jsonb);
  meal_plan_data jsonb := coalesce(p_payload->'mealPlan', '{}'::jsonb);
  grocery_data jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  bundle_effective_date date := coalesce(nullif(p_payload->>'effectiveDate', ''), current_date::text)::date;
  bundle_week_of date;
  goal_row_id bigint;
  goal_version integer;
  target_row_id bigint;
  target_version integer;
  plan_row_id bigint;
  plan_version integer;
  previous_plan_row_id bigint;
  meal_plan_row_id bigint;
  meal_plan_version integer;
  previous_meal_plan_row_id bigint;
  planned_workout_row_id bigint;
  exercise_row_id bigint;
  meal_row_id bigint;
  food_row_id bigint;
  exercise_measure text;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  workout_record jsonb;
  exercise_record jsonb;
  meal_record jsonb;
  grocery_item_record jsonb;
  result jsonb;
  goal_app_id text;
  target_app_id text;
  plan_app_id text;
  meal_plan_app_id text;
  grocery_app_id text;
  item_generated numeric;
  item_quantity numeric;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id,
    p_operation,
    p_payload->>'idempotencyKey',
    p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', p_operation,
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if profile_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'profile is required');
    end if;
    if target_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'target is required');
    end if;
    if plan_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'plan is required');
    end if;
    if meal_plan_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'mealPlan is required');
    end if;

    insert into public.profiles (
      week_starts_on, id, name, age, sex, height_cm, weight_kg, units, experience,
      equipment, days_per_week, session_minutes, goal, dietary_pattern,
      allergies, food_preferences, cooking_time_minutes, meal_budget
    )
    values (
      coalesce((profile_data->>'weekStartsOn')::integer,0), caller_id,
      btrim(coalesce(profile_data->>'name', '')),
      (profile_data->>'age')::smallint,
      profile_data->>'sex',
      (profile_data->>'heightCm')::numeric(5,2),
      (profile_data->>'weightKg')::numeric(6,2),
      profile_data->>'units',
      profile_data->>'experience',
      array(select jsonb_array_elements_text(coalesce(profile_data->'equipment', '[]'::jsonb))),
      (profile_data->>'daysPerWeek')::smallint,
      (profile_data->>'sessionMinutes')::smallint,
      profile_data->>'goal',
      coalesce(profile_data->>'dietaryPattern', ''),
      array(select jsonb_array_elements_text(coalesce(profile_data->'allergies', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(profile_data->'foodPreferences', '[]'::jsonb))),
      nullif(profile_data->>'cookingTimeMinutes', '')::smallint,
      nullif(profile_data->>'mealBudget', '')::numeric(10,2)
    )
    on conflict (id) do update set
      name = excluded.name,
      age = excluded.age,
      sex = excluded.sex,
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      units = excluded.units,
      experience = excluded.experience,
      equipment = excluded.equipment,
      days_per_week = excluded.days_per_week,
      session_minutes = excluded.session_minutes,
      goal = excluded.goal,
      dietary_pattern = excluded.dietary_pattern,
      allergies = excluded.allergies,
      food_preferences = excluded.food_preferences,
      cooking_time_minutes = excluded.cooking_time_minutes,
      meal_budget = excluded.meal_budget;

    update public.goals as g
    set status = 'ended',
        is_primary = false,
        ended_date = bundle_effective_date
    where g.user_id = caller_id
      and g.status = 'active'
      and g.is_primary;

    goal_app_id := coalesce(nullif(p_payload->>'goalId', ''), 'goal-' || bundle_effective_date::text);
    select coalesce(max(version), 0) + 1
    into goal_version
    from public.goals
    where user_id = caller_id;

    insert into public.goals (
      app_id, user_id, goal_type, target_weight_kg,
      desired_rate_kg_per_week, target_date, weekly_workout_target,
      skill_targets, effective_date, version, is_primary, status
    )
    values (
      goal_app_id,
      caller_id,
      profile_data->>'goal',
      nullif(p_payload->>'targetWeightKg', '')::numeric(6,2),
      nullif(p_payload->>'desiredRateKgPerWeek', '')::numeric(6,3),
      nullif(p_payload->>'targetDate', '')::date,
      (profile_data->>'daysPerWeek')::smallint,
      coalesce(p_payload->'skillTargets', '{}'::jsonb),
      bundle_effective_date,
      goal_version,
      true,
      'active'
    )
    returning row_id into goal_row_id;

    target_app_id := coalesce(nullif(target_data->>'id', ''), 'target-' || bundle_effective_date::text);
    select coalesce(max(version), 0) + 1
    into target_version
    from public.daily_targets
    where user_id = caller_id;

    insert into public.daily_targets (
      app_id, user_id, goal_row_id, version, effective_date, calories,
      protein_g, carbs_g, fat_g, bmr, bmi, tdee, activity_factor,
      formula, calculation_assumptions, disclaimer
    )
    values (
      target_app_id,
      caller_id,
      goal_row_id,
      target_version,
      coalesce(nullif(target_data->>'effectiveDate', ''), bundle_effective_date::text)::date,
      (target_data->>'calories')::numeric(10,2),
      (target_data->>'proteinG')::numeric(10,2),
      (target_data->>'carbsG')::numeric(10,2),
      (target_data->>'fatG')::numeric(10,2),
      (target_data->>'bmr')::numeric(10,2),
      (target_data->>'bmi')::numeric(6,2),
      (target_data->>'tdee')::numeric(10,2),
      (target_data->>'activityFactor')::numeric(4,2),
      coalesce(target_data->>'formula', 'mifflin-st-jeor'),
      coalesce(target_data->>'calculationAssumptions', ''),
      coalesce(target_data->>'disclaimer', 'Estimates for healthy adults only.')
    )
    returning row_id into target_row_id;

    plan_app_id := coalesce(nullif(plan_data->>'id', ''), 'plan-' || bundle_effective_date::text);
    select coalesce(max(version), 0) + 1
    into plan_version
    from public.workout_plans
    where user_id = caller_id
      and app_id = plan_app_id;

    select row_id
    into previous_plan_row_id
    from public.workout_plans
    where user_id = caller_id
    order by created_at desc, row_id desc
    limit 1
    for update;

    insert into public.workout_plans (
      app_id, user_id, version, target_row_id, supersedes_plan_row_id
    )
    values (
      plan_app_id, caller_id, plan_version, target_row_id, previous_plan_row_id
    )
    returning row_id into plan_row_id;

    for workout_record in
      select value from jsonb_array_elements(coalesce(plan_data->'workouts', '[]'::jsonb))
    loop
      insert into public.planned_workouts (
        plan_row_id, user_id, app_id, day_of_week, title, focus, warmup,
        cooldown, estimated_minutes, sort_order
      )
      values (
        plan_row_id,
        caller_id,
        workout_record->>'id',
        (workout_record->>'dayOfWeek')::smallint,
        btrim(workout_record->>'title'),
        btrim(workout_record->>'focus'),
        array(select jsonb_array_elements_text(coalesce(workout_record->'warmup', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(workout_record->'cooldown', '[]'::jsonb))),
        (workout_record->>'estimatedMinutes')::smallint,
        coalesce((workout_record->>'sortOrder')::integer, 1)
      )
      returning row_id into planned_workout_row_id;

      for exercise_record in
        select value from jsonb_array_elements(coalesce(workout_record->'exercises', '[]'::jsonb))
      loop
        select row_id, measure
        into exercise_row_id, exercise_measure
        from public.exercises
        where app_id = exercise_record->>'exerciseId'
          and is_system;
        if exercise_row_id is null or exercise_measure is null then
          perform private.raise_mutation_error(
            'validation_failed',
            'unknown exercise catalog id'
          );
        end if;

        insert into public.planned_exercises (
          planned_workout_row_id, user_id, app_id, exercise_row_id,
          sort_order, exercise_name_snapshot, measure_snapshot,
          catalog_source_version, sets, reps, hold_seconds, rest_seconds,
          regression_reference_snapshot, progression_reference_snapshot
        )
        select
          planned_workout_row_id,
          caller_id,
          exercise_record->>'id',
          e.row_id,
          coalesce((exercise_record->>'sortOrder')::integer, row_number() over ()),
          e.name,
          e.measure,
          e.source_version,
          (exercise_record->>'sets')::smallint,
          nullif(exercise_record->>'reps', '')::smallint,
          nullif(exercise_record->>'holdSeconds', '')::smallint,
          (exercise_record->>'restSeconds')::smallint,
          e.regression_reference,
          e.progression_reference
        from public.exercises e
        where e.row_id = exercise_row_id
        ;
      end loop;
    end loop;

    bundle_week_of := (meal_plan_data->>'weekOf')::date;
    meal_plan_app_id := coalesce(nullif(meal_plan_data->>'id', ''), 'mp-' || bundle_week_of::text);
    select coalesce(max(version), 0) + 1
    into meal_plan_version
    from public.meal_plans
    where calendar_active and user_id = caller_id
      and app_id = meal_plan_app_id;

    select row_id
    into previous_meal_plan_row_id
    from public.meal_plans
    where calendar_active and user_id = caller_id
    order by created_at desc, row_id desc
    limit 1
    for update;

    insert into public.meal_plans (
      app_id, user_id, version, week_of, target_row_id, supersedes_plan_row_id
    )
    values (
      meal_plan_app_id, caller_id, meal_plan_version, bundle_week_of, target_row_id,
      previous_meal_plan_row_id
    )
    returning row_id into meal_plan_row_id;

    for meal_record in
      select value from jsonb_array_elements(coalesce(meal_plan_data->'meals', '[]'::jsonb))
    loop
      meal_row_id := null;
      food_row_id := null;

      if nullif(meal_record->>'mealId', '') is not null then
        select row_id into meal_row_id
        from public.meals
        where app_id = meal_record->>'mealId'
          and (is_system or owner_user_id = caller_id);
        if meal_row_id is null then
          perform private.raise_mutation_error('not_found', 'meal catalog id not found');
        end if;
      end if;

      if nullif(meal_record->>'foodId', '') is not null then
        select row_id into food_row_id
        from public.foods
        where app_id = meal_record->>'foodId'
          and (is_system or owner_user_id = caller_id);
        if food_row_id is null then
          perform private.raise_mutation_error('not_found', 'food catalog id not found');
        end if;
      end if;

      if meal_row_id is not null and food_row_id is not null then
        perform private.raise_mutation_error(
          'validation_failed',
          'planned meal cannot reference both meal and food'
        );
      end if;

      insert into public.planned_meals (
        meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot,
        meal_row_id, food_row_id, label, servings, skipped,
        expected_calories, expected_protein_g, expected_carbs_g,
        expected_fat_g, expected_fiber_g, source, source_version,
        assumptions, confidence, preparation_basis
      )
      values (
        meal_plan_row_id,
        caller_id,
        bundle_week_of,
        meal_record->>'id',
        (meal_record->>'date')::date,
        meal_record->>'slot',
        meal_row_id,
        food_row_id,
        btrim(coalesce(meal_record->>'label', 'Choose a meal that fits')),
        (meal_record->>'servings')::numeric(8,3),
        coalesce((meal_record->>'skipped')::boolean, false),
        coalesce((meal_record->>'expectedCalories')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedProteinG')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedCarbsG')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedFatG')::numeric(10,2), 0),
        nullif(meal_record->>'expectedFiberG', '')::numeric(10,2),
        nullif(meal_record->>'source', ''),
        nullif(meal_record->>'sourceVersion', ''),
        nullif(meal_record->>'assumptions', ''),
        nullif(meal_record->>'confidence', ''),
        nullif(meal_record->>'preparationBasis', '')
      );
    end loop;

    if grocery_data <> '{}'::jsonb then
      bundle_week_of := (grocery_data->>'weekOf')::date;
      grocery_app_id := coalesce(nullif(grocery_data->>'id', ''), 'gl-' || bundle_week_of::text);

      insert into public.grocery_lists (app_id, user_id, week_of)
      values (grocery_app_id, caller_id, bundle_week_of)
      on conflict (user_id, week_of) do update
        set updated_at = now()
      returning row_id into grocery_row_id;

      for grocery_item_record in
        select value from jsonb_array_elements(coalesce(grocery_data->'items', '[]'::jsonb))
      loop
        item_generated := (grocery_item_record->>'generatedQuantity')::numeric(12,3);
        select *
        into previous_item
        from public.grocery_items
        where grocery_list_row_id = grocery_row_id
          and app_id = grocery_item_record->>'id'
        for update;

        if previous_item.row_id is null then
          item_quantity := coalesce(
            nullif(grocery_item_record->>'quantity', '')::numeric,
            item_generated
          );
          insert into public.grocery_items (
            grocery_list_row_id, user_id, app_id, name, category, unit,
            generated_quantity, quantity, checked, custom_item, removed,
            source_food_row_id
          )
          values (
            grocery_row_id,
            caller_id,
            grocery_item_record->>'id',
            btrim(grocery_item_record->>'name'),
            grocery_item_record->>'category',
            btrim(grocery_item_record->>'unit'),
            item_generated,
            item_quantity,
            coalesce((grocery_item_record->>'checked')::boolean, false),
            coalesce((grocery_item_record->>'custom')::boolean, false),
            coalesce((grocery_item_record->>'removed')::boolean, false),
            (select row_id from public.foods where app_id = grocery_item_record->>'foodId')
          );
        else
          item_quantity := case
            when previous_item.quantity = previous_item.generated_quantity
              then item_generated
            else previous_item.quantity
          end;
          update public.grocery_items
          set name = btrim(grocery_item_record->>'name'),
              category = grocery_item_record->>'category',
              unit = btrim(grocery_item_record->>'unit'),
              generated_quantity = item_generated,
              quantity = item_quantity,
              source_food_row_id = coalesce(
                (select row_id from public.foods where app_id = grocery_item_record->>'foodId'),
                previous_item.source_food_row_id
              )
          where row_id = previous_item.row_id
            and user_id = caller_id;
        end if;
      end loop;
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', p_operation,
      'result_refs', jsonb_build_object(
        'profile_id', caller_id::text,
        'goal_id', goal_app_id,
        'target_id', target_app_id,
        'plan_id', plan_app_id,
        'meal_plan_id', meal_plan_app_id,
        'grocery_id', coalesce(grocery_app_id, '')
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."persist_profile_health_metadata"("p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_authenticated();
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  current_target integer; current_start integer; requested_start numeric;
  requested_target integer;
begin
  select daily_step_target into current_target from public.profiles where id = caller_id for update;
  select week_starts_on into current_start from public.profiles where id=caller_id;
  if profile_data ? 'weekStartsOn' then
    perform private.assert_finite_number(profile_data->>'weekStartsOn','weekStartsOn',0,6);
    requested_start:=(profile_data->>'weekStartsOn')::numeric;
    if requested_start<>trunc(requested_start) then perform private.raise_mutation_error('validation_failed','Choose a weekday'); end if;
    if current_start<>requested_start::integer then perform private.regroup_calendar(caller_id,current_start,requested_start::integer); end if;
  end if;
  requested_target := private.resolve_daily_step_target(profile_data, current_target);
  perform private.persist_profile_health_metadata_before_step_target(p_payload);
  update public.profiles set daily_step_target = requested_target
    where id = caller_id and daily_step_target is distinct from requested_target;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."reconcile_grocery_items"("p_user_id" "uuid", "p_grocery" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  grocery_row_id bigint;
begin
  if p_grocery is null or jsonb_typeof(p_grocery) is distinct from 'object' then
    return;
  end if;

  select row_id into grocery_row_id
  from public.grocery_lists
  where calendar_active and user_id = p_user_id
    and (app_id = nullif(p_grocery->>'id', '')
      or week_of = nullif(p_grocery->>'weekOf', '')::date)
  order by row_id desc
  limit 1
  for update;

  if grocery_row_id is null then
    return;
  end if;

  -- A generated item absent from the new plan is no longer active. Preserve
  -- custom rows, checked state, explicit quantity edits, and prior removals.
  update public.grocery_items item
  set removed = true
  where item.grocery_list_row_id = grocery_row_id
    and item.user_id = p_user_id
    and not item.custom_item
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_grocery->'items', '[]'::jsonb)) incoming
      where incoming->>'id' = item.app_id
    );
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
        where p.user_id=caller_id and not p.skipped
        union all
        select p.food_row_id,p.servings from public.planned_meals p join selected_plan s on s.row_id=p.meal_plan_row_id
        where p.user_id=caller_id and not p.skipped and p.food_row_id is not null
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

CREATE OR REPLACE FUNCTION "private"."remove_grocery_item"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'remove_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'remove_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    update public.grocery_items
    set removed = true
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

    result := jsonb_build_object('status', 'completed', 'operation', 'remove_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."save_saved_meal_unchecked"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid;
  claim record;
  meal jsonb := coalesce(p_payload->'meal', '{}'::jsonb);
  grocery jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  ingredient jsonb;
  grocery_item_record jsonb;
  meal_id text := meal->>'id';
  saved_meal_row_id bigint;
  ingredient_food_row_id bigint;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  item_generated numeric;
  item_quantity numeric;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'save_saved_meal',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'save_saved_meal',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if meal_id is null or btrim(meal_id) = '' then
      perform private.raise_mutation_error('validation_failed', 'meal id is required');
    end if;
    if exists (select 1 from public.meals where app_id = meal_id and is_system) then
      perform private.raise_mutation_error('conflict', 'system meals cannot be overwritten');
    end if;

    insert into public.meals (
      app_id, owner_user_id, is_system, name, servings, notes, source_url
    )
    values (
      meal_id, caller_id, false, btrim(meal->>'name'),
      (meal->>'servings')::numeric(8,3),
      nullif(meal->>'notes', ''), nullif(meal->>'sourceUrl', '')
    )
    on conflict (app_id) do update set
      name = excluded.name,
      servings = excluded.servings,
      notes = excluded.notes,
      source_url = excluded.source_url,
      archived_at = null,
      updated_at = now()
    returning row_id into saved_meal_row_id;

    delete from public.meal_ingredients where meal_row_id = saved_meal_row_id;
    for ingredient in select value from jsonb_array_elements(coalesce(meal->'ingredients', '[]'::jsonb)) loop
      select row_id into ingredient_food_row_id
      from public.foods
      where app_id = ingredient->>'foodId'
        and (is_system or owner_user_id = caller_id);
      if ingredient_food_row_id is null then
        perform private.raise_mutation_error('not_found', 'meal ingredient food not found');
      end if;
      insert into public.meal_ingredients (meal_row_id, food_row_id, ingredient_order, servings)
      values (
        saved_meal_row_id,
        ingredient_food_row_id,
        (select count(*) + 1 from public.meal_ingredients mi where mi.meal_row_id = saved_meal_row_id),
        (ingredient->>'servings')::numeric(8,3)
      );
    end loop;

    if grocery <> '{}'::jsonb then
      select row_id into grocery_row_id
      from public.grocery_lists
      where calendar_active and user_id = caller_id
        and (app_id = nullif(grocery->>'id', '') or week_of = (grocery->>'weekOf')::date)
      order by row_id desc limit 1 for update;
      if grocery_row_id is null then
        perform private.raise_mutation_error('not_found', 'grocery list not found');
      end if;
      for grocery_item_record in select value from jsonb_array_elements(coalesce(grocery->'items', '[]'::jsonb)) loop
        item_generated := (grocery_item_record->>'generatedQuantity')::numeric(12,3);
        select * into previous_item
        from public.grocery_items
        where grocery_list_row_id = grocery_row_id and app_id = grocery_item_record->>'id'
        for update;
        if previous_item.row_id is null then
          item_quantity := coalesce(nullif(grocery_item_record->>'quantity', '')::numeric, item_generated);
          insert into public.grocery_items (
            grocery_list_row_id, user_id, app_id, name, category, unit,
            generated_quantity, quantity, checked, custom_item, removed, source_food_row_id
          )
          values (
            grocery_row_id, caller_id, grocery_item_record->>'id',
            btrim(grocery_item_record->>'name'), grocery_item_record->>'category',
            btrim(grocery_item_record->>'unit'), item_generated, item_quantity,
            coalesce((grocery_item_record->>'checked')::boolean, false),
            coalesce((grocery_item_record->>'custom')::boolean, false),
            coalesce((grocery_item_record->>'removed')::boolean, false),
            (select row_id from public.foods where app_id = grocery_item_record->>'foodId')
          );
        else
          item_quantity := case when previous_item.quantity = previous_item.generated_quantity
            then item_generated else previous_item.quantity end;
          update public.grocery_items
          set generated_quantity = item_generated, quantity = item_quantity
          where row_id = previous_item.row_id and user_id = caller_id;
        end if;
      end loop;
      update public.grocery_lists set updated_at = now()
      where row_id = grocery_row_id and user_id = caller_id;
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'save_saved_meal',
      'result_refs', jsonb_build_object('meal_id', meal_id)
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."set_grocery_quantity"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  item_quantity numeric := (p_payload->>'quantity')::numeric;
  result jsonb;
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
    update public.grocery_items
    set quantity = item_quantity
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

    result := jsonb_build_object('status', 'completed', 'operation', 'set_grocery_quantity', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."toggle_grocery_item"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid;
  claim record;
  item_id text := p_payload->>'itemId';
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(caller_id, 'toggle_grocery_item', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'toggle_grocery_item', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    update public.grocery_items
    set checked = not checked
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

    result := jsonb_build_object('status', 'completed', 'operation', 'toggle_grocery_item', 'result_refs', jsonb_build_object('grocery_item_id', item_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_nutrition_week"("p_week_of" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if p_week_of is null or extract(dow from p_week_of) <> coalesce((select week_starts_on from public.profiles where id=caller),0) then
    raise exception 'validation_failed: choose the account week date';
  end if;
  with plan as (
    select * from public.meal_plans where calendar_active and user_id = caller and week_of = p_week_of
    order by version desc, row_id desc limit 1
  ), planned as (
    select pm.* from public.planned_meals pm join plan p on p.row_id = pm.meal_plan_row_id
    where pm.user_id = caller
  ), logs as (
    select * from public.nutrition_logs where user_id = caller and log_date >= p_week_of and log_date < p_week_of + 7
  ), groups as (
    select * from public.logged_meals where user_id = caller and log_date >= p_week_of and log_date < p_week_of + 7
  ), recipes as (
    select * from public.meals where row_id in (select meal_row_id from planned union select meal_row_id from groups)
  ), ingredients as (
    select * from public.meal_ingredients where meal_row_id in (select row_id from recipes)
  ), foods as (
    select * from public.foods where row_id in (select food_row_id from planned union select food_row_id from logs union select food_row_id from ingredients)
  ), targets as (
    select * from public.daily_targets where user_id = caller and row_id in (
      select target_row_id from plan union
      select t.row_id from generate_series(0, 6) d
      cross join lateral (select row_id from public.daily_targets where user_id = caller and effective_date <= p_week_of + d
        order by effective_date desc, version desc limit 1) t
    )
  ), grocery as (
    select * from public.grocery_lists where calendar_active and user_id = caller and week_of = p_week_of
  )
  select jsonb_build_object(
    'weekOf', p_week_of, 'mealPlan', (select to_jsonb(p) from plan p),
    'plannedMeals', coalesce((select jsonb_agg(to_jsonb(p) order by meal_date, meal_slot, sort_order) from planned p), '[]'),
    'nutritionLogs', coalesce((select jsonb_agg(to_jsonb(l) order by log_date, created_at, row_id) from logs l), '[]'),
    'loggedMeals', coalesce((select jsonb_agg(to_jsonb(g) order by log_date, created_at, row_id) from groups g), '[]'),
    'targets', coalesce((select jsonb_agg(to_jsonb(t)) from targets t), '[]'),
    'recipes', coalesce((select jsonb_agg(to_jsonb(m)) from recipes m), '[]'),
    'ingredients', coalesce((select jsonb_agg(to_jsonb(i)) from ingredients i), '[]'),
    'foods', coalesce((select jsonb_agg(to_jsonb(f)) from foods f), '[]'),
    'servingOptions', coalesce((select jsonb_agg(to_jsonb(o)) from public.food_serving_options o where food_row_id in (select row_id from foods)), '[]'),
    'grocery', (select to_jsonb(g) from grocery g),
    'groceryItems', coalesce((select jsonb_agg(to_jsonb(i)) from public.grocery_items i where user_id = caller and grocery_list_row_id in (select row_id from grocery)), '[]')
  ) into result;
  return result;
end;
$$;

create or replace function private.validate_mutation_payload(
  p_operation text,
  p_payload jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  entry jsonb;
  session_data jsonb;
  log_record jsonb;
  meal_data jsonb;
  ingredient jsonb;
  versions jsonb;
  version_key text;
  version_value jsonb;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    perform private.raise_mutation_error('validation_failed', 'payload must be an object');
  end if;
  if nullif(btrim(p_payload->>'idempotencyKey'), '') is null then
    perform private.raise_mutation_error('validation_failed', 'idempotencyKey is required');
  end if;

  if profile_data ? 'weekStartsOn' then
    perform private.assert_finite_number(profile_data->>'weekStartsOn','weekStartsOn',0,6);
    if (profile_data->>'weekStartsOn')::numeric <> trunc((profile_data->>'weekStartsOn')::numeric) then
      perform private.raise_mutation_error('validation_failed','Choose a whole weekday');
    end if;
  end if;
  if p_payload ? 'mealPlan' then
    perform private.assert_date_key(p_payload->'mealPlan'->>'weekOf','mealPlan.weekOf');
    if extract(dow from (p_payload->'mealPlan'->>'weekOf')::date)::integer <>
      coalesce((profile_data->>'weekStartsOn')::integer,private.account_week_start(auth.uid())) then
      perform private.raise_mutation_error('validation_failed','Plan week must match the account preference');
    end if;
  end if;
  versions := coalesce(p_payload->'expectedVersions', '{}'::jsonb);
  perform private.assert_json_shape(versions, 'expectedVersions', 'object');
  for version_key, version_value in select key, value from jsonb_each(versions)
  loop
    if version_key not in ('profileRevision', 'goalVersion', 'targetVersion', 'workoutPlanVersion', 'mealPlanVersion', 'groceryRevision', 'recordRevision') then
      perform private.raise_mutation_error('validation_failed', 'unknown expected version field');
    end if;
    perform private.assert_finite_number(version_value #>> '{}', version_key, case when version_key='groceryRevision' and p_operation='add_custom_grocery_item' and p_payload ? 'weekOf' then 0 else 1 end, 2147483647);
  end loop;

  if p_operation in ('complete_onboarding', 'update_profile', 'update_units', 'reset_plan', 'skip_planned_meal') then
    if jsonb_typeof(profile_data) <> 'object' or profile_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'profile is required');
    end if;
    if nullif(btrim(profile_data->>'name'), '') is null then
      perform private.raise_mutation_error('validation_failed', 'profile name is required');
    end if;
    perform private.assert_finite_number(profile_data->>'age', 'age', 18, 100);
    perform private.assert_finite_number(profile_data->>'heightCm', 'heightCm', 120, 230);
    perform private.assert_finite_number(profile_data->>'weightKg', 'weightKg', 35, 300);
    perform private.assert_finite_number(profile_data->>'daysPerWeek', 'daysPerWeek', 1, 7);
    perform private.assert_finite_number(profile_data->>'sessionMinutes', 'sessionMinutes', 15, 120);
    perform private.assert_enum(profile_data->>'sex', 'sex', array['female', 'male']);
    perform private.assert_enum(profile_data->>'units', 'units', array['metric', 'imperial']);
    perform private.assert_enum(profile_data->>'experience', 'experience', array['beginner', 'intermediate', 'advanced']);
    perform private.assert_enum(profile_data->>'goal', 'goal', array['lose', 'maintain', 'gain', 'strength', 'consistency']);
    perform private.assert_json_shape(coalesce(profile_data->'equipment', '[]'::jsonb), 'equipment', 'array');
    perform private.assert_json_shape(coalesce(profile_data->'allergies', '[]'::jsonb), 'allergies', 'array');
    perform private.assert_json_shape(coalesce(profile_data->'foodPreferences', '[]'::jsonb), 'foodPreferences', 'array');
    if p_payload ? 'effectiveDate' then perform private.assert_date_key(p_payload->>'effectiveDate', 'effectiveDate'); end if;
    if nullif(p_payload->>'targetDate', '') is not null then perform private.assert_date_key(p_payload->>'targetDate', 'targetDate'); end if;
    if profile_data ? 'targetEligibility' then
      perform private.assert_enum(profile_data->>'targetEligibility', 'targetEligibility', array['eligible', 'unsupported', 'not_answered']);
    end if;
    if profile_data ? 'eligibilityVersion' then perform private.assert_nonblank(profile_data->>'eligibilityVersion', 'eligibilityVersion', 64); end if;
    if profile_data ? 'cookingTimeMinutes' and nullif(profile_data->>'cookingTimeMinutes', '') is not null then
      perform private.assert_finite_number(profile_data->>'cookingTimeMinutes', 'cookingTimeMinutes', 1, 240);
    end if;
    if profile_data ? 'mealBudget' and nullif(profile_data->>'mealBudget', '') is not null then
      perform private.assert_finite_number(profile_data->>'mealBudget', 'mealBudget', 0, 1000000);
    end if;
    if coalesce(profile_data->>'targetEligibility', 'eligible') <> 'eligible'
       and not (p_operation in ('complete_onboarding', 'update_profile')
                and profile_data->>'targetEligibility' = 'unsupported') then
      perform private.raise_mutation_error('validation_failed', 'automated targets require an eligible adult screening result');
    end if;
  elsif p_operation in ('save_nutrition_log', 'log_saved_meal') then
    if p_operation = 'save_nutrition_log' then
      entry := coalesce(p_payload->'entry', '{}'::jsonb);
      if entry = '{}'::jsonb then perform private.raise_mutation_error('validation_failed', 'entry is required'); end if;
      perform private.assert_date_key(entry->>'date', 'entry.date');
      perform private.assert_finite_number(entry->>'servings', 'entry.servings', 0.0001, 10000);
      perform private.assert_finite_number(entry->>'calories', 'entry.calories', 0, 1000000);
      perform private.assert_finite_number(entry->>'proteinG', 'entry.proteinG', 0, 100000);
      perform private.assert_finite_number(entry->>'carbsG', 'entry.carbsG', 0, 100000);
      perform private.assert_finite_number(entry->>'fatG', 'entry.fatG', 0, 100000);
      perform private.assert_enum(entry->>'slot', 'entry.slot', array['breakfast', 'lunch', 'dinner', 'snack']);
      if entry ? 'servingUnit' then perform private.assert_enum(entry->>'servingUnit', 'entry.servingUnit', array['g', 'piece', 'serving', 'ml', 'custom']); end if;
      if entry ? 'confidence' then perform private.assert_enum(entry->>'confidence', 'entry.confidence', array['high', 'medium', 'low']); end if;
      perform private.assert_nonblank(coalesce(entry->>'source', 'User-provided'), 'entry.source', 256);
    else
      if jsonb_typeof(p_payload->'entries') <> 'array' or jsonb_array_length(p_payload->'entries') = 0 then
        perform private.raise_mutation_error('validation_failed', 'entries are required');
      end if;
      for entry in select value from jsonb_array_elements(p_payload->'entries')
      loop
        perform private.assert_json_shape(entry, 'meal entry', 'object');
        perform private.assert_nonblank(entry->>'id', 'meal entry id', 128);
        perform private.assert_date_key(entry->>'date', 'meal entry date');
        perform private.assert_enum(entry->>'slot', 'meal entry slot', array['breakfast', 'lunch', 'dinner', 'snack']);
        perform private.assert_finite_number(entry->>'servings', 'meal entry servings', 0.0001, 10000);
        perform private.assert_finite_number(entry->>'calories', 'meal entry calories', 0, 1000000);
        perform private.assert_finite_number(entry->>'proteinG', 'meal entry proteinG', 0, 100000);
        perform private.assert_finite_number(entry->>'carbsG', 'meal entry carbsG', 0, 100000);
        perform private.assert_finite_number(entry->>'fatG', 'meal entry fatG', 0, 100000);
      end loop;
    end if;
  elsif p_operation = 'save_weight_entry' then
    perform private.assert_date_key(p_payload->'entry'->>'date', 'entry.date');
    perform private.assert_finite_number(p_payload->'entry'->>'weightKg', 'entry.weightKg', 35, 300);
  elsif p_operation in ('toggle_grocery_item', 'set_grocery_quantity', 'remove_grocery_item') then
    if nullif(btrim(p_payload->>'itemId'), '') is null then perform private.raise_mutation_error('validation_failed', 'itemId is required'); end if;
    if p_operation = 'set_grocery_quantity' then perform private.assert_finite_number(p_payload->>'quantity', 'quantity', 0, 1000000); end if;
  elsif p_operation = 'add_custom_grocery_item' then
    if nullif(btrim(p_payload->'item'->>'name'), '') is null then perform private.raise_mutation_error('validation_failed', 'custom item name is required'); end if;
    perform private.assert_finite_number(p_payload->'item'->>'quantity', 'quantity', 0, 1000000);
    perform private.assert_nonblank(p_payload->'item'->>'unit', 'unit', 64);
  elsif p_operation = 'delete_nutrition_log' then
    if nullif(btrim(p_payload->>'nutritionLogId'), '') is null then perform private.raise_mutation_error('validation_failed', 'nutritionLogId is required'); end if;
  elsif p_operation = 'apply_workout_override' then
    if nullif(btrim(p_payload->>'slotKey'), '') is null or nullif(btrim(p_payload->>'plannedExerciseId'), '') is null then
      perform private.raise_mutation_error('validation_failed', 'slotKey and plannedExerciseId are required');
    end if;
    if p_payload ? 'sets' then perform private.assert_finite_number(p_payload->>'sets', 'sets', 1, 100); end if;
    if p_payload ? 'reps' then perform private.assert_finite_number(p_payload->>'reps', 'reps', 1, 1000); end if;
    if p_payload ? 'holdSeconds' then perform private.assert_finite_number(p_payload->>'holdSeconds', 'holdSeconds', 1, 3600); end if;
    if p_payload ? 'restSeconds' then perform private.assert_finite_number(p_payload->>'restSeconds', 'restSeconds', 0, 3600); end if;
  elsif p_operation in ('start_workout_session', 'save_workout_session', 'finish_workout_session', 'abandon_workout_session') then
    session_data := coalesce(p_payload->'session', '{}'::jsonb);
    perform private.assert_json_shape(session_data, 'session', 'object');
    perform private.assert_nonblank(session_data->>'id', 'session.id', 128);
    if p_operation = 'start_workout_session' then
      perform private.assert_nonblank(session_data->>'plannedWorkoutId', 'session.plannedWorkoutId', 128);
      perform private.assert_date_key(session_data->>'date', 'session.date');
      perform private.assert_nonblank(session_data->>'startedAt', 'session.startedAt', 64);
    end if;
    if p_operation in ('save_workout_session', 'finish_workout_session') then
      perform private.assert_json_shape(session_data->'logs', 'session.logs', 'array');
      for log_record in select value from jsonb_array_elements(session_data->'logs')
      loop
        perform private.assert_json_shape(log_record, 'exercise log', 'object');
        perform private.assert_nonblank(coalesce(log_record->>'plannedExerciseId', log_record->>'exerciseId'), 'exercise log exercise id', 128);
        perform private.assert_enum(coalesce(log_record->>'status', 'completed'), 'exercise log status', array['completed', 'skipped', 'modified']);
        if log_record ? 'rpe' and nullif(log_record->>'rpe', '') is not null then perform private.assert_finite_number(log_record->>'rpe', 'exercise log rpe', 1, 10); end if;
        if log_record->'actual' is not null and jsonb_typeof(log_record->'actual') = 'object' then
          if log_record->'actual' ? 'sets' and nullif(log_record->'actual'->>'sets', '') is not null then perform private.assert_finite_number(log_record->'actual'->>'sets', 'exercise log sets', 0, 10); end if;
          if log_record->'actual' ? 'reps' and nullif(log_record->'actual'->>'reps', '') is not null then perform private.assert_finite_number(log_record->'actual'->>'reps', 'exercise log reps', 0, 1000); end if;
          if log_record->'actual' ? 'holdSeconds' and nullif(log_record->'actual'->>'holdSeconds', '') is not null then perform private.assert_finite_number(log_record->'actual'->>'holdSeconds', 'exercise log holdSeconds', 0, 3600); end if;
        end if;
      end loop;
    end if;
  elsif p_operation in ('save_saved_meal', 'save_recipe') then
    meal_data := coalesce(p_payload->'meal', '{}'::jsonb);
    perform private.assert_json_shape(meal_data, 'meal', 'object');
    perform private.assert_nonblank(meal_data->>'id', 'meal.id', 128);
    perform private.assert_nonblank(meal_data->>'name', 'meal.name', 256);
    perform private.assert_finite_number(meal_data->>'servings', 'meal.servings', 0.0001, 10000);
    perform private.assert_json_shape(meal_data->'ingredients', 'meal.ingredients', 'array');
    if jsonb_array_length(meal_data->'ingredients') = 0 then perform private.raise_mutation_error('validation_failed', 'meal ingredients are required'); end if;
    for ingredient in select value from jsonb_array_elements(meal_data->'ingredients')
    loop
      perform private.assert_json_shape(ingredient, 'meal ingredient', 'object');
      perform private.assert_nonblank(ingredient->>'foodId', 'meal ingredient foodId', 128);
      perform private.assert_finite_number(ingredient->>'servings', 'meal ingredient servings', 0.0001, 10000);
    end loop;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."persist_meal_plan_edit_unchecked"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid;
  claim record;
  current_plan record;
  meal_plan_data jsonb := coalesce(p_payload->'mealPlan', '{}'::jsonb);
  grocery_data jsonb := coalesce(p_payload->'grocery', '{}'::jsonb);
  meal_record jsonb;
  grocery_item_record jsonb;
  meal_row_id bigint;
  food_row_id bigint;
  meal_plan_row_id bigint;
  previous_meal_plan_row_id bigint;
  meal_plan_version integer;
  grocery_row_id bigint;
  previous_item public.grocery_items%rowtype;
  item_generated numeric;
  item_quantity numeric;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id,
    'edit_meal_plan',
    p_payload->>'idempotencyKey',
    p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'edit_meal_plan',
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    if jsonb_typeof(meal_plan_data) is distinct from 'object'
       or meal_plan_data = '{}'::jsonb then
      perform private.raise_mutation_error('validation_failed', 'mealPlan is required');
    end if;
    perform private.assert_nonblank(meal_plan_data->>'id', 'mealPlan.id', 128);
    perform private.assert_date_key(meal_plan_data->>'weekOf', 'mealPlan.weekOf');
    perform private.assert_json_shape(meal_plan_data->'meals', 'mealPlan.meals', 'array');

    perform private.assert_expected_versions('edit_meal_plan', p_payload, caller_id);

    select row_id, app_id, version, week_of, target_row_id
    into current_plan
    from public.meal_plans
    where calendar_active and user_id = caller_id
    order by created_at desc, row_id desc
    limit 1
    for update;

    if not found then
      perform private.raise_mutation_error('not_found', 'meal plan not found');
    end if;
    if current_plan.app_id <> meal_plan_data->>'id'
       or current_plan.week_of <> (meal_plan_data->>'weekOf')::date then
      perform private.raise_mutation_error('conflict', 'only the current meal plan can be edited');
    end if;

    select coalesce(max(version), 0) + 1
    into meal_plan_version
    from public.meal_plans
    where calendar_active and user_id = caller_id
      and app_id = current_plan.app_id;

    previous_meal_plan_row_id := current_plan.row_id;
    insert into public.meal_plans (
      app_id, user_id, version, week_of, target_row_id, supersedes_plan_row_id
    )
    values (
      current_plan.app_id,
      caller_id,
      meal_plan_version,
      current_plan.week_of,
      current_plan.target_row_id,
      previous_meal_plan_row_id
    )
    returning row_id into meal_plan_row_id;

    for meal_record in
      select value from jsonb_array_elements(meal_plan_data->'meals')
    loop
      perform private.assert_nonblank(meal_record->>'id', 'planned meal id', 128);
      perform private.assert_date_key(meal_record->>'date', 'planned meal date');
      perform private.assert_enum(meal_record->>'slot', 'planned meal slot', array['breakfast', 'lunch', 'dinner', 'snack']);
      perform private.assert_nonblank(meal_record->>'label', 'planned meal label', 256);
      perform private.assert_finite_number(meal_record->>'servings', 'planned meal servings', 0.0001, 10000);

      meal_row_id := null;
      food_row_id := null;
      if nullif(meal_record->>'mealId', '') is not null then
        select row_id into meal_row_id
        from public.meals
        where app_id = meal_record->>'mealId'
          and (is_system or owner_user_id = caller_id)
          and archived_at is null;
        if meal_row_id is null then
          perform private.raise_mutation_error('not_found', 'planned meal recipe not found');
        end if;
      end if;
      if nullif(meal_record->>'foodId', '') is not null then
        select row_id into food_row_id
        from public.foods
        where app_id = meal_record->>'foodId'
          and (is_system or owner_user_id = caller_id);
        if food_row_id is null then
          perform private.raise_mutation_error('not_found', 'planned meal food not found');
        end if;
      end if;
      if meal_row_id is not null and food_row_id is not null then
        perform private.raise_mutation_error('validation_failed', 'planned meal cannot reference both meal and food');
      end if;

      insert into public.planned_meals (
        meal_plan_row_id, user_id, week_of, app_id, meal_date, meal_slot,
        meal_row_id, food_row_id, label, servings, skipped,
        expected_calories, expected_protein_g, expected_carbs_g,
        expected_fat_g, expected_fiber_g, source, source_version,
        assumptions, confidence, preparation_basis
      )
      values (
        meal_plan_row_id,
        caller_id,
        current_plan.week_of,
        meal_record->>'id',
        (meal_record->>'date')::date,
        meal_record->>'slot',
        meal_row_id,
        food_row_id,
        btrim(meal_record->>'label'),
        (meal_record->>'servings')::numeric(8,3),
        coalesce((meal_record->>'skipped')::boolean, false),
        coalesce((meal_record->>'expectedCalories')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedProteinG')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedCarbsG')::numeric(10,2), 0),
        coalesce((meal_record->>'expectedFatG')::numeric(10,2), 0),
        nullif(meal_record->>'expectedFiberG', '')::numeric(10,2),
        nullif(meal_record->>'source', ''),
        nullif(meal_record->>'sourceVersion', ''),
        nullif(meal_record->>'assumptions', ''),
        nullif(meal_record->>'confidence', ''),
        nullif(meal_record->>'preparationBasis', '')
      );
    end loop;

    if grocery_data <> '{}'::jsonb then
      perform private.assert_date_key(grocery_data->>'weekOf', 'grocery.weekOf');
      select row_id into grocery_row_id
      from public.grocery_lists
      where calendar_active and user_id = caller_id
        and (app_id = nullif(grocery_data->>'id', '')
             or week_of = (grocery_data->>'weekOf')::date)
      order by row_id desc
      limit 1
      for update;

      if grocery_row_id is null then
        perform private.raise_mutation_error('not_found', 'grocery list not found');
      end if;

      for grocery_item_record in
        select value from jsonb_array_elements(coalesce(grocery_data->'items', '[]'::jsonb))
      loop
        item_generated := (grocery_item_record->>'generatedQuantity')::numeric(12,3);
        select * into previous_item
        from public.grocery_items
        where grocery_list_row_id = grocery_row_id
          and app_id = grocery_item_record->>'id'
        for update;

        if previous_item.row_id is null then
          item_quantity := coalesce(nullif(grocery_item_record->>'quantity', '')::numeric, item_generated);
          insert into public.grocery_items (
            grocery_list_row_id, user_id, app_id, name, category, unit,
            generated_quantity, quantity, checked, custom_item, removed,
            source_food_row_id
          )
          values (
            grocery_row_id,
            caller_id,
            grocery_item_record->>'id',
            btrim(grocery_item_record->>'name'),
            grocery_item_record->>'category',
            btrim(grocery_item_record->>'unit'),
            item_generated,
            item_quantity,
            coalesce((grocery_item_record->>'checked')::boolean, false),
            coalesce((grocery_item_record->>'custom')::boolean, false),
            coalesce((grocery_item_record->>'removed')::boolean, false),
            (select row_id from public.foods where app_id = grocery_item_record->>'foodId')
          );
        else
          item_quantity := case
            when previous_item.quantity = previous_item.generated_quantity then item_generated
            else previous_item.quantity
          end;
          update public.grocery_items
          set generated_quantity = item_generated,
              quantity = item_quantity
          where row_id = previous_item.row_id
            and user_id = caller_id;
        end if;
      end loop;
      update public.grocery_lists set updated_at = now()
      where row_id = grocery_row_id and user_id = caller_id;
    end if;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'edit_meal_plan',
      'result_refs', jsonb_build_object(
        'meal_plan_id', current_plan.app_id,
        'meal_plan_version', meal_plan_version,
        'grocery_id', coalesce(grocery_data->>'id', '')
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

do $$ declare account record; begin
  for account in select id from public.profiles order by id loop
    perform private.regroup_calendar(account.id,1,0);
  end loop;
end; $$;
alter table public.profiles alter column calendar_revision set default 1;
notify pgrst,'reload schema';
