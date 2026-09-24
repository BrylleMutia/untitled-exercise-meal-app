-- MVP-1 unified food search and guided meal review.
-- This migration keeps the existing Supabase RPC boundary authoritative while
-- adding grouped history, provenance, and bounded estimate ranges.

alter table public.foods
  add column if not exists value_source text not null default 'development_catalog',
  add column if not exists estimate_range jsonb;

alter table public.nutrition_logs
  add column if not exists value_source text not null default 'user_provided',
  add column if not exists estimate_range jsonb,
  add column if not exists logged_meal_row_id bigint,
  add column if not exists ingredient_order integer;

update public.foods
set value_source = case
  when fdc_id is not null or source ilike '%usda%' then 'trusted_catalog'
  when is_system then 'development_catalog'
  else 'user_provided'
end
where value_source is null or value_source = 'development_catalog';

update public.nutrition_logs nl
set value_source = case
  when f.fdc_id is not null or nl.source ilike '%usda%' then 'trusted_catalog'
  when nl.estimated then 'user_provided'
  else 'user_provided'
end
from public.foods f
where f.row_id = nl.food_row_id
  and (nl.value_source is null or nl.value_source = 'user_provided');

create or replace function private.is_valid_estimate_range(p_range jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  metric text;
  item jsonb;
  low_value numeric;
  base_value numeric;
  high_value numeric;
begin
  if p_range is null or jsonb_typeof(p_range) is distinct from 'object' then
    return false;
  end if;
  foreach metric in array array['calories', 'proteinG', 'carbsG', 'fatG'] loop
    item := p_range->metric;
    if jsonb_typeof(item) is distinct from 'object'
      or not (item ? 'low') or not (item ? 'base') or not (item ? 'high') then
      return false;
    end if;
    low_value := (item->>'low')::numeric;
    base_value := (item->>'base')::numeric;
    high_value := (item->>'high')::numeric;
    if low_value is null or base_value is null or high_value is null
      or low_value < 0 or base_value < 0 or high_value < 0
      or low_value > base_value or base_value > high_value then
      return false;
    end if;
  end loop;
  if p_range ? 'fiberG' then
    item := p_range->'fiberG';
    if jsonb_typeof(item) is distinct from 'object'
      or not (item ? 'low') or not (item ? 'base') or not (item ? 'high') then
      return false;
    end if;
    low_value := (item->>'low')::numeric;
    base_value := (item->>'base')::numeric;
    high_value := (item->>'high')::numeric;
    if low_value is null or base_value is null or high_value is null
      or low_value < 0 or base_value < 0 or high_value < 0
      or low_value > base_value or base_value > high_value then
      return false;
    end if;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'foods_value_source_check') then
    alter table public.foods add constraint foods_value_source_check
      check (value_source in ('trusted_catalog', 'development_catalog', 'user_provided', 'ai_estimate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'foods_estimate_range_check') then
    alter table public.foods add constraint foods_estimate_range_check
      check (estimate_range is null or private.is_valid_estimate_range(estimate_range));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'foods_ai_estimate_contract_check') then
    alter table public.foods add constraint foods_ai_estimate_contract_check
      check (value_source <> 'ai_estimate' or (estimated and confidence = 'low' and estimate_range is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_logs_value_source_check') then
    alter table public.nutrition_logs add constraint nutrition_logs_value_source_check
      check (value_source in ('trusted_catalog', 'development_catalog', 'user_provided', 'ai_estimate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_logs_estimate_range_check') then
    alter table public.nutrition_logs add constraint nutrition_logs_estimate_range_check
      check (estimate_range is null or private.is_valid_estimate_range(estimate_range));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_logs_ai_estimate_contract_check') then
    alter table public.nutrition_logs add constraint nutrition_logs_ai_estimate_contract_check
      check (value_source <> 'ai_estimate' or (estimated and confidence = 'low' and estimate_range is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_logs_ingredient_order_check') then
    alter table public.nutrition_logs add constraint nutrition_logs_ingredient_order_check
      check (ingredient_order is null or ingredient_order > 0);
  end if;
end
$$;

create table if not exists public.logged_meals (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal_slot text not null,
  name text not null,
  meal_row_id bigint not null references public.meals(row_id) on delete restrict,
  source_mode text not null,
  assumptions text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint logged_meals_user_app_unique unique (user_id, app_id),
  constraint logged_meals_slot_check check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  constraint logged_meals_name_check check (btrim(name) <> ''),
  constraint logged_meals_source_check check (source_mode in ('saved_meal', 'ai_assisted')),
  constraint logged_meals_revision_check check (revision > 0)
);

alter table public.nutrition_logs
  drop constraint if exists nutrition_logs_logged_meal_fk;
alter table public.nutrition_logs
  add constraint nutrition_logs_logged_meal_fk
  foreign key (logged_meal_row_id) references public.logged_meals(row_id) on delete cascade;

create index if not exists logged_meals_user_date_slot_idx
  on public.logged_meals (user_id, log_date desc, meal_slot, row_id desc);
create index if not exists logged_meals_meal_idx
  on public.logged_meals (meal_row_id, row_id);
create index if not exists nutrition_logs_logged_meal_order_idx
  on public.nutrition_logs (logged_meal_row_id, ingredient_order, row_id);

alter table public.logged_meals enable row level security;
drop policy if exists "users can read their logged meals" on public.logged_meals;
create policy "users can read their logged meals" on public.logged_meals
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.logged_meals from anon, authenticated;
grant select on table public.logged_meals to authenticated;

drop trigger if exists logged_meals_set_updated_at on public.logged_meals;
create trigger logged_meals_set_updated_at
before update on public.logged_meals
for each row execute function private.set_updated_at();

-- The estimate quota is intentionally separate from extraction quota. A user
-- must explicitly choose the unresolved ingredients before this quota is used.
create or replace function private.consume_nutrition_provider_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  window_limit integer;
  day_limit integer;
  current_window timestamptz := now();
  current_day date := current_date;
  quota public.nutrition_provider_rate_limits%rowtype;
begin
  if p_kind = 'ai_text' then window_limit := 10; day_limit := 50;
  elsif p_kind = 'ai_estimate' then window_limit := 5; day_limit := 20;
  elsif p_kind = 'nutrition_search' then window_limit := 30; day_limit := 200;
  else perform private.raise_mutation_error('validation_failed', 'unknown provider quota kind'); end if;
  insert into public.nutrition_provider_rate_limits (user_id) values (caller_id) on conflict (user_id) do nothing;
  select * into quota from public.nutrition_provider_rate_limits where user_id = caller_id for update;
  if quota.window_started_at <= current_window - interval '10 minutes' then quota.window_started_at := current_window; quota.window_count := 0; end if;
  if quota.day_started_on <> current_day then quota.day_started_on := current_day; quota.day_count := 0; end if;
  if quota.window_count >= window_limit or quota.day_count >= day_limit then
    update public.nutrition_provider_rate_limits set window_started_at = quota.window_started_at, window_count = quota.window_count, day_started_on = quota.day_started_on, day_count = quota.day_count, updated_at = current_window where user_id = caller_id;
    return jsonb_build_object('allowed', false, 'windowRemaining', greatest(window_limit - quota.window_count, 0), 'dayRemaining', greatest(day_limit - quota.day_count, 0));
  end if;
  update public.nutrition_provider_rate_limits set window_started_at = quota.window_started_at, window_count = quota.window_count + 1, day_started_on = quota.day_started_on, day_count = quota.day_count + 1, updated_at = current_window where user_id = caller_id;
  return jsonb_build_object('allowed', true, 'windowRemaining', greatest(window_limit - quota.window_count - 1, 0), 'dayRemaining', greatest(day_limit - quota.day_count - 1, 0));
end;
$$;

create or replace function public.consume_nutrition_provider_quota(p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$ begin return private.consume_nutrition_provider_quota(p_kind); end; $$;

-- Atomic grouped save. Catalog nutrition is always re-derived from the food
-- row; only explicitly accepted custom/AI values are read from the payload.
create or replace function private.save_reviewed_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  meal_data jsonb := coalesce(p_payload->'meal', '{}'::jsonb);
  ingredients jsonb := coalesce(p_payload->'ingredients', '[]'::jsonb);
  item jsonb;
  food_row public.foods%rowtype;
  existing_meal public.meals%rowtype;
  recipe_row_id bigint;
  logged_row_id bigint;
  food_id text;
  saved_food_row_id bigint;
  entry_id text;
  order_no integer := 0;
  quantity numeric;
  result jsonb;
  ids jsonb := '[]'::jsonb;
  range_value jsonb;
begin
  select * into claim from private.claim_mutation(caller_id, 'save_reviewed_meal', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_reviewed_meal','replayed',true,'result_refs',claim.result_refs); end if;
  begin
    if jsonb_typeof(ingredients) is distinct from 'array' or jsonb_array_length(ingredients) < 1 or jsonb_array_length(ingredients) > 10 then perform private.raise_mutation_error('validation_failed', 'one to ten ingredients are required'); end if;
    perform private.assert_nonblank(p_payload->>'name', 'name', 160);
    perform private.assert_nonblank(meal_data->>'id', 'meal.id', 128);
    perform private.assert_nonblank(meal_data->>'name', 'meal.name', 160);
    if p_payload->>'sourceMode' not in ('saved_meal','ai_assisted') then perform private.raise_mutation_error('validation_failed', 'sourceMode is invalid'); end if;
    select * into existing_meal from public.meals where app_id = meal_data->>'id' and (is_system or owner_user_id = caller_id) for update;
    if existing_meal.row_id is not null then
      recipe_row_id := existing_meal.row_id;
    else
      insert into public.meals (app_id, owner_user_id, is_system, name, servings, notes)
      values (meal_data->>'id', caller_id, false, btrim(meal_data->>'name'), greatest(coalesce((meal_data->>'servings')::numeric, 1), 1), nullif(meal_data->>'notes',''))
      returning row_id into recipe_row_id;
    end if;
    insert into public.logged_meals (app_id, user_id, log_date, meal_slot, name, meal_row_id, source_mode, assumptions)
    values (coalesce(nullif(p_payload->>'loggedMealId',''), 'logged-meal-' || md5(caller_id::text || ':' || (meal_data->>'id'))), caller_id, (p_payload->>'date')::date, p_payload->>'slot', btrim(p_payload->>'name'), recipe_row_id, p_payload->>'sourceMode', nullif(p_payload->>'assumptions',''))
    returning row_id into logged_row_id;
    for item in select value from jsonb_array_elements(ingredients) loop
      order_no := order_no + 1;
      quantity := coalesce(nullif(item->>'servings','')::numeric, nullif(item->>'quantity','')::numeric);
      if quantity is null or quantity <= 0 then perform private.raise_mutation_error('validation_failed', 'ingredient quantity must be positive'); end if;
      food_id := nullif(item->>'foodId','');
      if food_id is not null then
        select * into food_row from public.foods where app_id = food_id and (is_system or owner_user_id = caller_id);
        if food_row.row_id is null then perform private.raise_mutation_error('not_found', 'ingredient food not found'); end if;
      else
        if nullif(btrim(item->>'customName'),'') is null then perform private.raise_mutation_error('validation_failed', 'ingredient requires a catalog food or custom name'); end if;
        if coalesce(item->>'valueSource','') not in ('user_provided','ai_estimate') then perform private.raise_mutation_error('validation_failed', 'unresolved ingredient source must be explicit'); end if;
        if item->>'valueSource' = 'ai_estimate' and (coalesce(item->>'confidence','low') <> 'low' or coalesce((item->>'estimated')::boolean, false) is not true) then perform private.raise_mutation_error('validation_failed', 'AI estimate must remain low confidence and estimated'); end if;
        range_value := item->'estimateRange';
        if item->>'valueSource' = 'ai_estimate' and not private.is_valid_estimate_range(range_value) then perform private.raise_mutation_error('validation_failed', 'AI estimate range is invalid'); end if;
        food_id := 'review-food-' || md5(caller_id::text || ':' || coalesce(item->>'customName','') || ':' || order_no::text || ':' || coalesce(p_payload->>'idempotencyKey',''));
        insert into public.foods (app_id, owner_user_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, preparation_basis, value_source, estimate_range)
        values (food_id, caller_id, false, btrim(item->>'customName'), coalesce(nullif(item->>'servingLabel',''), 'custom serving'), greatest(coalesce(nullif(item->>'servingGrams','')::numeric, 100), 0.1), coalesce(nullif(item->>'servingUnit',''), 'g'), greatest(coalesce((item->>'calories')::numeric, 0), 0), greatest(coalesce((item->>'proteinG')::numeric, 0), 0), greatest(coalesce((item->>'carbsG')::numeric, 0), 0), greatest(coalesce((item->>'fatG')::numeric, 0), 0), nullif(item->>'fiberG','')::numeric, 'Other', case when item->>'valueSource' = 'ai_estimate' then 'DeepSeek estimate' else 'User-provided' end, coalesce(nullif(item->>'sourceVersion',''), 'review-v1'), coalesce((item->>'estimated')::boolean, true), coalesce(nullif(item->>'confidence',''), 'low'), coalesce(nullif(item->>'preparationBasis',''), 'unknown'), item->>'valueSource', range_value)
        returning row_id into saved_food_row_id;
        select * into food_row from public.foods where row_id = saved_food_row_id;
      end if;
      if not exists (select 1 from public.meal_ingredients mi where mi.meal_row_id = recipe_row_id and mi.ingredient_order = order_no) then
        insert into public.meal_ingredients (meal_row_id, food_row_id, ingredient_order, servings)
        values (recipe_row_id, food_row.row_id, order_no, quantity);
      end if;
      entry_id := coalesce(nullif(item->>'id',''), 'logged-entry-' || md5((coalesce(p_payload->>'loggedMealId', logged_row_id::text)) || ':' || order_no::text));
      insert into public.nutrition_logs (app_id, user_id, log_date, meal_slot, food_row_id, servings, serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, estimated, confidence, source, source_version, preparation_basis, assumptions, value_source, estimate_range, logged_meal_row_id, ingredient_order, idempotency_key)
      values (entry_id, caller_id, (p_payload->>'date')::date, p_payload->>'slot', food_row.row_id, quantity, case when food_row.serving_unit = 'piece' then quantity else food_row.serving_grams * quantity end, food_row.serving_unit, round(food_row.calories * quantity, 2), round(food_row.protein_g * quantity, 2), round(food_row.carbs_g * quantity, 2), round(food_row.fat_g * quantity, 2), case when food_row.fiber_g is null then null else round(food_row.fiber_g * quantity, 2) end, food_row.estimated, food_row.confidence, food_row.source, food_row.source_version, food_row.preparation_basis, nullif(item->>'assumptions',''), food_row.value_source, case when food_row.value_source = 'ai_estimate' then food_row.estimate_range else null end, logged_row_id, order_no, (p_payload->>'idempotencyKey') || ':' || order_no::text);
      ids := ids || to_jsonb(entry_id);
    end loop;
    result := jsonb_build_object('status','completed','operation','save_reviewed_meal','result_refs',jsonb_build_object('logged_meal_id',coalesce(p_payload->>'loggedMealId','logged-meal-' || md5(caller_id::text || ':' || (meal_data->>'id'))),'meal_id',meal_data->>'id','nutrition_log_ids',ids));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate); raise;
  end;
end;
$$;

create or replace function public.save_reviewed_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$ begin return private.save_reviewed_meal(p_payload); end; $$;

create or replace function private.delete_logged_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); claim record; current_row public.logged_meals%rowtype; result jsonb;
begin
  select * into claim from private.claim_mutation(caller_id,'delete_logged_meal',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','delete_logged_meal','replayed',true,'result_refs',claim.result_refs); end if;
  begin
    select * into current_row from public.logged_meals where user_id=caller_id and app_id=p_payload->>'loggedMealId' for update;
    if current_row.row_id is null then perform private.raise_mutation_error('not_found','logged meal not found'); end if;
    if nullif(p_payload->'expectedVersions'->>'recordRevision','')::integer is distinct from current_row.revision then perform private.raise_mutation_error('stale_version','logged meal changed; refresh before editing'); end if;
    delete from public.logged_meals where row_id=current_row.row_id and user_id=caller_id;
    result := jsonb_build_object('status','completed','operation','delete_logged_meal','result_refs',jsonb_build_object('logged_meal_id',current_row.app_id));
    perform private.complete_mutation(claim.mutation_row_id,result->'result_refs'); return result;
  exception when others then perform private.fail_mutation(claim.mutation_row_id,sqlstate); raise; end;
end;
$$;

create or replace function public.delete_logged_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$ begin return private.delete_logged_meal(p_payload); end; $$;

-- Historical edits are intentionally scoped to child snapshots and never
-- rewrite the linked reusable recipe. The client sends refreshed food IDs,
-- allowing the same trusted derivation used by save_reviewed_meal.
create or replace function private.update_logged_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); claim record; current_row public.logged_meals%rowtype; item jsonb; food_row public.foods%rowtype; index_no integer := 0; quantity numeric; result jsonb;
begin
  select * into claim from private.claim_mutation(caller_id,'update_logged_meal',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','update_logged_meal','replayed',true,'result_refs',claim.result_refs); end if;
  begin
    select * into current_row from public.logged_meals where user_id=caller_id and app_id=p_payload->'loggedMeal'->>'id' for update;
    if current_row.row_id is null then perform private.raise_mutation_error('not_found','logged meal not found'); end if;
    if nullif(p_payload->'expectedVersions'->>'recordRevision','')::integer is distinct from current_row.revision then perform private.raise_mutation_error('stale_version','logged meal changed; refresh before editing'); end if;
    if jsonb_array_length(coalesce(p_payload->'ingredients','[]'::jsonb)) < 1 then perform private.raise_mutation_error('validation_failed','ingredients are required'); end if;
    delete from public.nutrition_logs where logged_meal_row_id=current_row.row_id;
    for item in select value from jsonb_array_elements(p_payload->'ingredients') loop
      index_no := index_no + 1; quantity := (item->>'servings')::numeric;
      select * into food_row from public.foods where app_id=item->>'foodId' and (is_system or owner_user_id=caller_id);
      if food_row.row_id is null or quantity is null or quantity <= 0 then perform private.raise_mutation_error('validation_failed','historical ingredient is invalid'); end if;
      insert into public.nutrition_logs (app_id,user_id,log_date,meal_slot,food_row_id,servings,serving_quantity,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,estimated,confidence,source,source_version,preparation_basis,assumptions,value_source,estimate_range,logged_meal_row_id,ingredient_order,idempotency_key)
      values ('logged-entry-'||md5(current_row.app_id||':'||index_no::text),caller_id,current_row.log_date,current_row.meal_slot,food_row.row_id,quantity,case when food_row.serving_unit='piece' then quantity else food_row.serving_grams*quantity end,food_row.serving_unit,round(food_row.calories*quantity,2),round(food_row.protein_g*quantity,2),round(food_row.carbs_g*quantity,2),round(food_row.fat_g*quantity,2),case when food_row.fiber_g is null then null else round(food_row.fiber_g*quantity,2) end,food_row.estimated,food_row.confidence,food_row.source,food_row.source_version,food_row.preparation_basis,nullif(item->>'assumptions',''),food_row.value_source,food_row.estimate_range,current_row.row_id,index_no,(p_payload->>'idempotencyKey') || ':' || index_no::text);
    end loop;
    update public.logged_meals set name=coalesce(nullif(p_payload->'loggedMeal'->>'name',''),name), assumptions=nullif(p_payload->'loggedMeal'->>'assumptions',''), revision=revision+1 where row_id=current_row.row_id;
    result := jsonb_build_object('status','completed','operation','update_logged_meal','result_refs',jsonb_build_object('logged_meal_id',current_row.app_id));
    perform private.complete_mutation(claim.mutation_row_id,result->'result_refs'); return result;
  exception when others then perform private.fail_mutation(claim.mutation_row_id,sqlstate); raise; end;
end;
$$;

create or replace function public.update_logged_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$ begin return private.update_logged_meal(p_payload); end; $$;

create or replace function private.save_food(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated(); claim record;
  food jsonb := coalesce(p_payload->'food','{}'::jsonb); food_id text := nullif(food->>'id','');
  existing public.foods%rowtype; saved_food_row_id bigint; option_value jsonb; result jsonb;
  source_kind text := coalesce(nullif(food->>'valueSource',''), case when nullif(food->>'fdcId','') is not null then 'trusted_catalog' else 'user_provided' end);
begin
  select * into claim from private.claim_mutation(caller_id,'save_food',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_food','replayed',true,'result_refs',claim.result_refs); end if;
  begin
    if food_id is null then perform private.raise_mutation_error('validation_failed','food id is required'); end if;
    perform private.assert_nonblank(food->>'name','food.name',256); perform private.assert_nonblank(food->>'servingLabel','food.servingLabel',256);
    perform private.assert_finite_number(food->>'servingGrams','food.servingGrams',0.1,100000); perform private.assert_enum(food->>'unit','food.unit',array['g','piece']);
    perform private.assert_finite_number(food->>'calories','food.calories',0,100000); perform private.assert_finite_number(food->>'proteinG','food.proteinG',0,100000); perform private.assert_finite_number(food->>'carbsG','food.carbsG',0,100000); perform private.assert_finite_number(food->>'fatG','food.fatG',0,100000);
    if source_kind not in ('trusted_catalog','development_catalog','user_provided','ai_estimate') then perform private.raise_mutation_error('validation_failed','food value source is invalid'); end if;
    if source_kind = 'ai_estimate' and (coalesce((food->>'estimated')::boolean,false) is not true or coalesce(food->>'confidence','low') <> 'low' or not private.is_valid_estimate_range(food->'estimateRange')) then perform private.raise_mutation_error('validation_failed','AI estimate contract is invalid'); end if;
    select * into existing from public.foods where app_id=food_id for update;
    if existing.row_id is not null and (existing.is_system or existing.owner_user_id <> caller_id) then perform private.raise_mutation_error('conflict','food id is not owned by the current user'); end if;
    if existing.row_id is null then
      insert into public.foods (app_id,owner_user_id,is_system,name,serving_label,serving_grams,serving_unit,calories,protein_g,carbs_g,fat_g,fiber_g,category,source,source_version,estimated,confidence,preparation_basis,fdc_id,record_type,provider_revision,provider_imported_at,nutrients_per_100g,serving_options,value_source,estimate_range)
      values (food_id,caller_id,false,btrim(food->>'name'),btrim(food->>'servingLabel'),(food->>'servingGrams')::numeric,food->>'unit',(food->>'calories')::numeric,(food->>'proteinG')::numeric,(food->>'carbsG')::numeric,(food->>'fatG')::numeric,nullif(food->>'fiberG','')::numeric,coalesce(food->>'category','Other'),btrim(coalesce(food->>'source','User-provided')),btrim(coalesce(food->>'sourceVersion','user-v1')),coalesce((food->>'estimated')::boolean,false),coalesce(food->>'confidence','medium'),coalesce(food->>'preparationBasis','as_labeled'),nullif(food->>'fdcId',''),nullif(food->>'recordType',''),nullif(food->>'providerRevision',''),nullif(food->>'providerImportedAt','')::timestamptz,food->'nutrientsPer100g',food->'servingOptions',source_kind,food->'estimateRange') returning row_id into saved_food_row_id;
    else
      update public.foods set name=btrim(food->>'name'),serving_label=btrim(food->>'servingLabel'),serving_grams=(food->>'servingGrams')::numeric,serving_unit=food->>'unit',calories=(food->>'calories')::numeric,protein_g=(food->>'proteinG')::numeric,carbs_g=(food->>'carbsG')::numeric,fat_g=(food->>'fatG')::numeric,fiber_g=nullif(food->>'fiberG','')::numeric,category=coalesce(food->>'category','Other'),source=btrim(coalesce(food->>'source','User-provided')),source_version=btrim(coalesce(food->>'sourceVersion','user-v1')),estimated=coalesce((food->>'estimated')::boolean,false),confidence=coalesce(food->>'confidence','medium'),preparation_basis=coalesce(food->>'preparationBasis','as_labeled'),fdc_id=nullif(food->>'fdcId',''),record_type=nullif(food->>'recordType',''),provider_revision=nullif(food->>'providerRevision',''),provider_imported_at=nullif(food->>'providerImportedAt','')::timestamptz,nutrients_per_100g=food->'nutrientsPer100g',serving_options=food->'servingOptions',value_source=source_kind,estimate_range=food->'estimateRange' where row_id=existing.row_id and owner_user_id=caller_id;
      saved_food_row_id := existing.row_id;
    end if;
    delete from public.food_serving_options where food_row_id=saved_food_row_id;
    if nullif(food->>'fdcId','') is not null then
      for option_value in select value from jsonb_array_elements(coalesce(food->'servingOptions','[]'::jsonb)) loop
        perform private.assert_nonblank(option_value->>'label','food.servingOptions.label',256); perform private.assert_nonblank(option_value->>'unit','food.servingOptions.unit',64); perform private.assert_finite_number(option_value->>'grams','food.servingOptions.grams',0.1,100000);
        insert into public.food_serving_options(food_row_id,label,unit,grams,provider_revision) values(saved_food_row_id,btrim(option_value->>'label'),btrim(option_value->>'unit'),(option_value->>'grams')::numeric,coalesce(nullif(food->>'providerRevision',''),food->>'fdcId'));
      end loop;
    end if;
    result:=jsonb_build_object('status','completed','operation','save_food','result_refs',jsonb_build_object('food_id',food_id)); perform private.complete_mutation(claim.mutation_row_id,result->'result_refs'); return result;
  exception when others then perform private.fail_mutation(claim.mutation_row_id,sqlstate); raise; end;
end;
$$;

create or replace function public.save_food(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$ begin return private.save_food(p_payload); end; $$;

alter function private.build_account_export() rename to build_account_export_without_logged_meals;
create or replace function private.build_account_export()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated();
begin
  return jsonb_set(
    private.build_account_export_without_logged_meals(),
    '{loggedMeals}',
    coalesce((select jsonb_agg(to_jsonb(lm) - array['row_id','user_id','meal_row_id'] order by lm.log_date, lm.row_id) from public.logged_meals lm where lm.user_id = caller_id), '[]'::jsonb),
    true
  );
end;
$$;

revoke all on function private.is_valid_estimate_range(jsonb) from public, anon, authenticated;
revoke all on function private.build_account_export_without_logged_meals() from public, anon, authenticated;
revoke all on function private.build_account_export() from public, anon, authenticated;
revoke all on function private.save_reviewed_meal(jsonb) from public, anon, authenticated;
revoke all on function private.update_logged_meal(jsonb) from public, anon, authenticated;
revoke all on function private.delete_logged_meal(jsonb) from public, anon, authenticated;
revoke all on function public.save_reviewed_meal(jsonb) from public, anon;
revoke all on function public.update_logged_meal(jsonb) from public, anon;
revoke all on function public.delete_logged_meal(jsonb) from public, anon;
grant execute on function public.save_reviewed_meal(jsonb) to authenticated;
grant execute on function public.update_logged_meal(jsonb) to authenticated;
grant execute on function public.delete_logged_meal(jsonb) to authenticated;
