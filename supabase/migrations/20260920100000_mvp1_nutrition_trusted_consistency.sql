-- MVP-1 completion slice:
--   * persist provider provenance and canonical per-100-g nutrition values;
--   * calculate food-backed logs and planned meals from authoritative rows;
--   * reconcile generated grocery rows when a future plan is replaced;
--   * preserve planned-meal slot identity across future plan versions;
--   * add safe custom-food and nutrition-correction RPCs.

alter table public.foods
  add column if not exists fdc_id text,
  add column if not exists record_type text,
  add column if not exists provider_revision text,
  add column if not exists provider_imported_at timestamptz,
  add column if not exists nutrients_per_100g jsonb,
  add column if not exists serving_options jsonb;

-- Household conversions are retained as rows so they can be selected and
-- audited independently from a food's default serving. Only provider-backed
-- conversions belong here; user-entered quantities stay on the food/log row.
create table if not exists public.food_serving_options (
  row_id bigint generated always as identity primary key,
  food_row_id bigint not null references public.foods(row_id) on delete cascade,
  label text not null,
  unit text not null,
  grams numeric(10, 3) not null,
  provider_revision text not null,
  created_at timestamptz not null default now(),
  constraint food_serving_options_label_check check (btrim(label) <> ''),
  constraint food_serving_options_unit_check check (btrim(unit) <> ''),
  constraint food_serving_options_grams_check check (grams > 0),
  constraint food_serving_options_revision_check check (btrim(provider_revision) <> ''),
  constraint food_serving_options_unique unique (food_row_id, label, unit, grams)
);

create index if not exists food_serving_options_food_idx
  on public.food_serving_options (food_row_id, row_id);

alter table public.food_serving_options enable row level security;

drop policy if exists "users can read serving options for visible foods"
  on public.food_serving_options;
create policy "users can read serving options for visible foods"
  on public.food_serving_options
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.foods
      where foods.row_id = food_serving_options.food_row_id
        and (foods.is_system or (select auth.uid()) = foods.owner_user_id)
    )
  );

revoke all on table public.food_serving_options from anon, authenticated;
grant select on table public.food_serving_options to anon, authenticated;

-- Provider calls are bounded per authenticated user. The function is the only
-- write path; the table itself remains unreadable/writable to client roles.
create table if not exists public.nutrition_provider_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  window_count integer not null default 0,
  day_started_on date not null default current_date,
  day_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint nutrition_provider_window_count_check check (window_count >= 0),
  constraint nutrition_provider_day_count_check check (day_count >= 0)
);

alter table public.nutrition_provider_rate_limits enable row level security;
revoke all on table public.nutrition_provider_rate_limits from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'foods_nutrients_per_100g_shape_check') then
    alter table public.foods add constraint foods_nutrients_per_100g_shape_check
      check (nutrients_per_100g is null or jsonb_typeof(nutrients_per_100g) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'foods_serving_options_shape_check') then
    alter table public.foods add constraint foods_serving_options_shape_check
      check (serving_options is null or jsonb_typeof(serving_options) = 'array');
  end if;
end
$$;

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
  if p_kind = 'ai_text' then
    window_limit := 10;
    day_limit := 50;
  elsif p_kind = 'nutrition_search' then
    window_limit := 30;
    day_limit := 200;
  else
    perform private.raise_mutation_error('validation_failed', 'unknown provider quota kind');
  end if;

  insert into public.nutrition_provider_rate_limits (user_id)
  values (caller_id)
  on conflict (user_id) do nothing;

  select * into quota
  from public.nutrition_provider_rate_limits
  where user_id = caller_id
  for update;

  if quota.window_started_at <= current_window - interval '10 minutes' then
    quota.window_started_at := current_window;
    quota.window_count := 0;
  end if;
  if quota.day_started_on <> current_day then
    quota.day_started_on := current_day;
    quota.day_count := 0;
  end if;

  if quota.window_count >= window_limit or quota.day_count >= day_limit then
    update public.nutrition_provider_rate_limits
    set window_started_at = quota.window_started_at,
        window_count = quota.window_count,
        day_started_on = quota.day_started_on,
        day_count = quota.day_count,
        updated_at = current_window
    where user_id = caller_id;
    return jsonb_build_object(
      'allowed', false,
      'windowRemaining', greatest(window_limit - quota.window_count, 0),
      'dayRemaining', greatest(day_limit - quota.day_count, 0)
    );
  end if;

  update public.nutrition_provider_rate_limits
  set window_started_at = quota.window_started_at,
      window_count = quota.window_count + 1,
      day_started_on = quota.day_started_on,
      day_count = quota.day_count + 1,
      updated_at = current_window
  where user_id = caller_id;
  return jsonb_build_object(
    'allowed', true,
    'windowRemaining', greatest(window_limit - quota.window_count - 1, 0),
    'dayRemaining', greatest(day_limit - quota.day_count - 1, 0)
  );
end;
$$;

create or replace function public.consume_nutrition_provider_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.consume_nutrition_provider_quota(p_kind);
end;
$$;

create unique index if not exists foods_owner_fdc_id_idx
  on public.foods (owner_user_id, fdc_id)
  where fdc_id is not null;

create or replace function private.reconcile_grocery_items(
  p_user_id uuid,
  p_grocery jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  grocery_row_id bigint;
begin
  if p_grocery is null or jsonb_typeof(p_grocery) is distinct from 'object' then
    return;
  end if;

  select row_id into grocery_row_id
  from public.grocery_lists
  where user_id = p_user_id
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

-- Replace the old client-supplied nutrition metadata with values derived from
-- the persisted food row. Historical rows remain snapshots after save.
alter function private.save_nutrition_log(jsonb)
  rename to save_nutrition_log_unchecked;

create or replace function private.save_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized jsonb := p_payload;
  entry jsonb := coalesce(p_payload->'entry', '{}'::jsonb);
  food_row public.foods%rowtype;
  food_app_id text := nullif(entry->>'foodId', '');
  serving_count numeric;
begin
  if food_app_id is not null then
    select * into food_row
    from public.foods
    where app_id = food_app_id
      and (is_system or owner_user_id = private.require_authenticated());
    if food_row.row_id is null then
      perform private.raise_mutation_error('not_found', 'food not found');
    end if;

    serving_count := (entry->>'servings')::numeric;
    if serving_count is null or serving_count <= 0 then
      perform private.raise_mutation_error('validation_failed', 'servings must be positive');
    end if;

    normalized := jsonb_set(normalized, '{entry,calories}', to_jsonb(round(food_row.calories * serving_count, 2)), true);
    normalized := jsonb_set(normalized, '{entry,proteinG}', to_jsonb(round(food_row.protein_g * serving_count, 2)), true);
    normalized := jsonb_set(normalized, '{entry,carbsG}', to_jsonb(round(food_row.carbs_g * serving_count, 2)), true);
    normalized := jsonb_set(normalized, '{entry,fatG}', to_jsonb(round(food_row.fat_g * serving_count, 2)), true);
    normalized := jsonb_set(normalized, '{entry,fiberG}', coalesce(to_jsonb(round(food_row.fiber_g * serving_count, 2)), 'null'::jsonb), true);
    normalized := jsonb_set(normalized, '{entry,estimated}', to_jsonb(food_row.estimated), true);
    normalized := jsonb_set(normalized, '{entry,confidence}', to_jsonb(food_row.confidence), true);
    normalized := jsonb_set(normalized, '{entry,source}', to_jsonb(food_row.source), true);
    normalized := jsonb_set(normalized, '{entry,sourceVersion}', to_jsonb(food_row.source_version), true);
    normalized := jsonb_set(normalized, '{entry,preparationBasis}', to_jsonb(food_row.preparation_basis), true);
    normalized := jsonb_set(normalized, '{entry,servingQuantity}', to_jsonb(case when food_row.serving_unit = 'piece' then serving_count else food_row.serving_grams * serving_count end), true);
    normalized := jsonb_set(normalized, '{entry,servingUnit}', to_jsonb(food_row.serving_unit), true);
  end if;

  return private.save_nutrition_log_unchecked(normalized);
end;
$$;

create or replace function private.update_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  entry jsonb := coalesce(p_payload->'entry', '{}'::jsonb);
  current_row public.nutrition_logs%rowtype;
  food_row public.foods%rowtype;
  food_app_id text := nullif(entry->>'foodId', '');
  serving_count numeric;
  expected_revision integer;
  result jsonb;
begin
  select * into claim from private.claim_mutation(
    caller_id, 'update_nutrition_log', p_payload->>'idempotencyKey', p_payload
  );
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'update_nutrition_log', 'replayed', true, 'result_refs', claim.result_refs);
  end if;

  begin
    if nullif(entry->>'id', '') is null then
      perform private.raise_mutation_error('validation_failed', 'nutrition id is required');
    end if;
    select * into current_row from public.nutrition_logs
    where user_id = caller_id and app_id = entry->>'id'
    for update;
    if current_row.row_id is null then
      perform private.raise_mutation_error('not_found', 'nutrition log not found');
    end if;
    expected_revision := nullif(p_payload->'expectedVersions'->>'recordRevision', '')::integer;
    if expected_revision is not null and expected_revision <> current_row.revision then
      perform private.raise_mutation_error('stale_version', 'nutrition log changed; refresh before editing');
    end if;

    if food_app_id is not null then
      select * into food_row from public.foods
      where app_id = food_app_id and (is_system or owner_user_id = caller_id);
      if food_row.row_id is null then perform private.raise_mutation_error('not_found', 'food not found'); end if;
      serving_count := (entry->>'servings')::numeric;
      if serving_count is null or serving_count <= 0 then perform private.raise_mutation_error('validation_failed', 'servings must be positive'); end if;
      update public.nutrition_logs
      set log_date = (entry->>'date')::date,
          meal_slot = entry->>'slot',
          food_row_id = food_row.row_id,
          custom_name = null,
          servings = serving_count,
          serving_quantity = case when food_row.serving_unit = 'piece' then serving_count else food_row.serving_grams * serving_count end,
          serving_unit = food_row.serving_unit,
          calories = round(food_row.calories * serving_count, 2),
          protein_g = round(food_row.protein_g * serving_count, 2),
          carbs_g = round(food_row.carbs_g * serving_count, 2),
          fat_g = round(food_row.fat_g * serving_count, 2),
          fiber_g = case when food_row.fiber_g is null then null else round(food_row.fiber_g * serving_count, 2) end,
          estimated = food_row.estimated,
          confidence = food_row.confidence,
          source = food_row.source,
          source_version = food_row.source_version,
          preparation_basis = food_row.preparation_basis,
          assumptions = nullif(entry->>'assumptions', '')
      where row_id = current_row.row_id and user_id = caller_id;
    else
      if nullif(btrim(entry->>'customName'), '') is null then
        perform private.raise_mutation_error('validation_failed', 'foodId or customName is required');
      end if;
      update public.nutrition_logs
      set log_date = (entry->>'date')::date,
          meal_slot = entry->>'slot',
          food_row_id = null,
          custom_name = btrim(entry->>'customName'),
          servings = (entry->>'servings')::numeric(10,3),
          serving_quantity = coalesce(nullif(entry->>'servingQuantity', '')::numeric(10,3), (entry->>'servings')::numeric(10,3)),
          serving_unit = coalesce(nullif(entry->>'servingUnit', ''), 'custom'),
          calories = (entry->>'calories')::numeric(10,2),
          protein_g = (entry->>'proteinG')::numeric(10,2),
          carbs_g = (entry->>'carbsG')::numeric(10,2),
          fat_g = (entry->>'fatG')::numeric(10,2),
          fiber_g = nullif(entry->>'fiberG', '')::numeric(10,2),
          estimated = coalesce((entry->>'estimated')::boolean, true),
          confidence = coalesce(entry->>'confidence', 'low'),
          source = btrim(coalesce(entry->>'source', 'User-provided')),
          source_version = coalesce(entry->>'sourceVersion', ''),
          preparation_basis = coalesce(entry->>'preparationBasis', 'unknown'),
          assumptions = nullif(entry->>'assumptions', '')
      where row_id = current_row.row_id and user_id = caller_id;
    end if;

    result := jsonb_build_object('status', 'completed', 'operation', 'update_nutrition_log', 'result_refs', jsonb_build_object('nutrition_log_id', entry->>'id'));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.update_nutrition_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.update_nutrition_log(p_payload);
end;
$$;

create or replace function private.save_food(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  food jsonb := coalesce(p_payload->'food', '{}'::jsonb);
  food_id text := nullif(food->>'id', '');
  existing public.foods%rowtype;
  saved_food_row_id bigint;
  option_value jsonb;
  result jsonb;
begin
  select * into claim from private.claim_mutation(caller_id, 'save_food', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then
    return jsonb_build_object('status', 'completed', 'operation', 'save_food', 'replayed', true, 'result_refs', claim.result_refs);
  end if;
  begin
    if food_id is null then perform private.raise_mutation_error('validation_failed', 'food id is required'); end if;
    perform private.assert_nonblank(food->>'name', 'food.name', 256);
    perform private.assert_nonblank(food->>'servingLabel', 'food.servingLabel', 256);
    perform private.assert_finite_number(food->>'servingGrams', 'food.servingGrams', 0.1, 100000);
    perform private.assert_enum(food->>'unit', 'food.unit', array['g', 'piece']);
    perform private.assert_finite_number(food->>'calories', 'food.calories', 0, 100000);
    perform private.assert_finite_number(food->>'proteinG', 'food.proteinG', 0, 100000);
    perform private.assert_finite_number(food->>'carbsG', 'food.carbsG', 0, 100000);
    perform private.assert_finite_number(food->>'fatG', 'food.fatG', 0, 100000);
    if food ? 'fiberG' and nullif(food->>'fiberG', '') is not null then perform private.assert_finite_number(food->>'fiberG', 'food.fiberG', 0, 100000); end if;

    select * into existing from public.foods where app_id = food_id for update;
    if existing.row_id is not null and (existing.is_system or existing.owner_user_id <> caller_id) then
      perform private.raise_mutation_error('conflict', 'food id is not owned by the current user');
    end if;

    if existing.row_id is null then
      insert into public.foods (
        app_id, owner_user_id, is_system, name, serving_label, serving_grams,
        serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category,
        source, source_version, estimated, confidence, preparation_basis,
        fdc_id, record_type, provider_revision, provider_imported_at,
        nutrients_per_100g, serving_options
      ) values (
        food_id, caller_id, false, btrim(food->>'name'), btrim(food->>'servingLabel'),
        (food->>'servingGrams')::numeric, food->>'unit', (food->>'calories')::numeric,
        (food->>'proteinG')::numeric, (food->>'carbsG')::numeric, (food->>'fatG')::numeric,
        nullif(food->>'fiberG', '')::numeric, coalesce(food->>'category', 'Other'),
        btrim(coalesce(food->>'source', 'User-provided')), btrim(coalesce(food->>'sourceVersion', 'user-v1')),
        coalesce((food->>'estimated')::boolean, false), coalesce(food->>'confidence', 'medium'),
        coalesce(food->>'preparationBasis', 'as_labeled'), nullif(food->>'fdcId', ''),
        nullif(food->>'recordType', ''), nullif(food->>'providerRevision', ''),
        nullif(food->>'providerImportedAt', '')::timestamptz, food->'nutrientsPer100g', food->'servingOptions'
      ) returning row_id into saved_food_row_id;
    else
      update public.foods set
        name = btrim(food->>'name'), serving_label = btrim(food->>'servingLabel'),
        serving_grams = (food->>'servingGrams')::numeric, serving_unit = food->>'unit',
        calories = (food->>'calories')::numeric, protein_g = (food->>'proteinG')::numeric,
        carbs_g = (food->>'carbsG')::numeric, fat_g = (food->>'fatG')::numeric,
        fiber_g = nullif(food->>'fiberG', '')::numeric, category = coalesce(food->>'category', 'Other'),
        source = btrim(coalesce(food->>'source', 'User-provided')),
        source_version = btrim(coalesce(food->>'sourceVersion', 'user-v1')),
        estimated = coalesce((food->>'estimated')::boolean, false), confidence = coalesce(food->>'confidence', 'medium'),
        preparation_basis = coalesce(food->>'preparationBasis', 'as_labeled'), fdc_id = nullif(food->>'fdcId', ''),
        record_type = nullif(food->>'recordType', ''), provider_revision = nullif(food->>'providerRevision', ''),
        provider_imported_at = nullif(food->>'providerImportedAt', '')::timestamptz,
        nutrients_per_100g = food->'nutrientsPer100g', serving_options = food->'servingOptions'
      where row_id = existing.row_id and owner_user_id = caller_id;
      saved_food_row_id := existing.row_id;
    end if;

    delete from public.food_serving_options where food_row_id = saved_food_row_id;
    if nullif(food->>'fdcId', '') is not null then
      for option_value in select value from jsonb_array_elements(coalesce(food->'servingOptions', '[]'::jsonb)) loop
        perform private.assert_nonblank(option_value->>'label', 'food.servingOptions.label', 256);
        perform private.assert_nonblank(option_value->>'unit', 'food.servingOptions.unit', 64);
        perform private.assert_finite_number(option_value->>'grams', 'food.servingOptions.grams', 0.1, 100000);
        insert into public.food_serving_options (food_row_id, label, unit, grams, provider_revision)
        values (
          saved_food_row_id,
          btrim(option_value->>'label'),
          btrim(option_value->>'unit'),
          (option_value->>'grams')::numeric,
          coalesce(nullif(food->>'providerRevision', ''), food->>'fdcId')
        );
      end loop;
    end if;

    result := jsonb_build_object('status', 'completed', 'operation', 'save_food', 'result_refs', jsonb_build_object('food_id', food_id));
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;

create or replace function public.save_food(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.save_food(p_payload);
end;
$$;

-- Normalize planned-meal metadata from the same persisted food/recipe rows
-- used by logging. The client may provide display values, but cannot invent
-- nutrition totals for a future plan.
create or replace function private.normalize_planned_meal_record(
  p_record jsonb,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb := p_record;
  meal_row public.meals%rowtype;
  food_row public.foods%rowtype;
  meal_ref text := nullif(p_record->>'mealId', '');
  food_ref text := nullif(p_record->>'foodId', '');
  servings numeric := (p_record->>'servings')::numeric;
  calories numeric := 0;
  protein numeric := 0;
  carbs numeric := 0;
  fat numeric := 0;
  fiber numeric := 0;
  has_fiber boolean := false;
begin
  if meal_ref is not null and food_ref is not null then
    perform private.raise_mutation_error('validation_failed', 'planned meal cannot reference both meal and food');
  end if;
  if servings is null or servings <= 0 then perform private.raise_mutation_error('validation_failed', 'planned meal servings must be positive'); end if;

  if meal_ref is not null then
    select * into meal_row from public.meals
    where app_id = meal_ref and (is_system or owner_user_id = p_user_id) and archived_at is null;
    if meal_row.row_id is null then perform private.raise_mutation_error('not_found', 'planned meal recipe not found'); end if;
    select coalesce(sum(f.calories * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.protein_g * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.carbs_g * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.fat_g * ingredient.servings / meal_row.servings), 0),
      coalesce(sum(f.fiber_g * ingredient.servings / meal_row.servings), 0),
      bool_or(f.fiber_g is not null)
    into calories, protein, carbs, fat, fiber, has_fiber
    from public.meal_ingredients ingredient
    join public.foods f on f.row_id = ingredient.food_row_id
    where ingredient.meal_row_id = meal_row.row_id;
    result := result || jsonb_build_object(
      'label', meal_row.name,
      'expectedCalories', round(calories * servings, 2),
      'expectedProteinG', round(protein * servings, 2),
      'expectedCarbsG', round(carbs * servings, 2),
      'expectedFatG', round(fat * servings, 2),
      'source', 'trusted-catalog', 'sourceVersion', 'database-catalog',
      'assumptions', 'Calculated from the saved recipe and versioned food catalog.',
      'confidence', 'medium', 'preparationBasis', 'as_labeled'
    );
    if has_fiber then result := result || jsonb_build_object('expectedFiberG', round(fiber * servings, 2)); end if;
  elsif food_ref is not null then
    select * into food_row from public.foods
    where app_id = food_ref and (is_system or owner_user_id = p_user_id);
    if food_row.row_id is null then perform private.raise_mutation_error('not_found', 'planned meal food not found'); end if;
    result := result || jsonb_build_object(
      'label', food_row.name,
      'expectedCalories', round(food_row.calories * servings, 2),
      'expectedProteinG', round(food_row.protein_g * servings, 2),
      'expectedCarbsG', round(food_row.carbs_g * servings, 2),
      'expectedFatG', round(food_row.fat_g * servings, 2),
      'source', food_row.source, 'sourceVersion', food_row.source_version,
      'assumptions', 'Calculated from the versioned food catalog serving size.',
      'confidence', food_row.confidence, 'preparationBasis', food_row.preparation_basis
    );
    if food_row.fiber_g is not null then result := result || jsonb_build_object('expectedFiberG', round(food_row.fiber_g * servings, 2)); end if;
  else
    result := result || jsonb_build_object(
      'expectedCalories', 0, 'expectedProteinG', 0, 'expectedCarbsG', 0,
      'expectedFatG', 0, 'source', 'user-choice', 'sourceVersion', 'unknown',
      'assumptions', 'No trusted catalog match; confirm the meal before logging.',
      'confidence', 'low', 'preparationBasis', 'unknown'
    );
  end if;
  return result;
end;
$$;

-- Keep old persisted behavior behind a wrapper, then reconcile identity and
-- generated grocery rows after the atomic insert completes.
alter function private.persist_meal_plan_edit(jsonb)
  rename to persist_meal_plan_edit_unchecked;

create or replace function private.persist_meal_plan_edit(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  meal_plan_data jsonb := coalesce(p_payload->'mealPlan', '{}'::jsonb);
  normalized_meals jsonb := '[]'::jsonb;
  record_value jsonb;
  normalized_payload jsonb;
  result jsonb;
  previous_plan_row_id bigint;
  new_plan_row_id bigint;
  meal_plan_id text := meal_plan_data->>'id';
begin
  select row_id into previous_plan_row_id
  from public.meal_plans where user_id = caller_id and app_id = meal_plan_id
  order by version desc, row_id desc limit 1;
  for record_value in select value from jsonb_array_elements(coalesce(meal_plan_data->'meals', '[]'::jsonb)) loop
    normalized_meals := normalized_meals || jsonb_build_array(private.normalize_planned_meal_record(record_value, caller_id));
  end loop;
  normalized_payload := p_payload || jsonb_build_object(
    'mealPlan', meal_plan_data || jsonb_build_object('meals', normalized_meals)
  );
  result := private.persist_meal_plan_edit_unchecked(normalized_payload);

  select row_id into new_plan_row_id from public.meal_plans
  where user_id = caller_id and app_id = meal_plan_id
  order by version desc, row_id desc limit 1;

  -- Avoid unique-index collisions while stable keys and order are reassigned.
  update public.planned_meals
  set slot_key = 'tmp:' || row_id::text, sort_order = 100000 + row_id
  where meal_plan_row_id = new_plan_row_id and user_id = caller_id;

  with incoming as (
    select value, ordinality,
      row_number() over (
        partition by value->>'date', value->>'slot'
        order by ordinality
      )::integer as next_order
    from jsonb_array_elements(normalized_meals) with ordinality
  ), previous as (
    select incoming.value->>'id' as app_id, incoming.value->>'date' as meal_date,
      incoming.value->>'slot' as meal_slot, incoming.next_order,
      old.slot_key as prior_slot_key
    from incoming
    left join public.planned_meals old
      on old.meal_plan_row_id = previous_plan_row_id
      and old.user_id = caller_id
      and old.app_id = incoming.value->>'id'
      and old.meal_date = (incoming.value->>'date')::date
      and old.meal_slot = incoming.value->>'slot'
  )
  update public.planned_meals current_row
  set sort_order = previous.next_order,
      slot_key = coalesce(
        previous.prior_slot_key,
        'date:' || previous.meal_date || ':slot:' || previous.meal_slot || ':id:' || md5(previous.app_id)
      )
  from previous
  where current_row.meal_plan_row_id = new_plan_row_id
    and current_row.user_id = caller_id
    and current_row.app_id = previous.app_id;

  perform private.reconcile_grocery_items(caller_id, normalized_payload->'grocery');
  return result;
end;
$$;

-- The recipe-save path has the same stale-generated-item hazard as plan edits.
create or replace function private.save_saved_meal(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_authenticated();
  result jsonb;
begin
  perform private.assert_expected_versions('save_saved_meal', p_payload, caller_id);
  perform private.assert_saved_meal_access('save_saved_meal', p_payload, caller_id);
  result := private.save_saved_meal_unchecked(p_payload);
  perform private.reconcile_grocery_items(caller_id, p_payload->'grocery');
  return result;
end;
$$;

revoke all on function private.reconcile_grocery_items(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.normalize_planned_meal_record(jsonb, uuid) from public, anon, authenticated;
revoke all on function private.persist_meal_plan_edit(jsonb) from public, anon, authenticated;
revoke all on function private.persist_meal_plan_edit_unchecked(jsonb) from public, anon, authenticated;
revoke all on function private.save_nutrition_log(jsonb) from public, anon, authenticated;
revoke all on function private.save_nutrition_log_unchecked(jsonb) from public, anon, authenticated;
revoke all on function private.update_nutrition_log(jsonb) from public, anon, authenticated;
revoke all on function private.save_food(jsonb) from public, anon, authenticated;
revoke all on function private.consume_nutrition_provider_quota(text) from public, anon, authenticated;
revoke all on function private.save_saved_meal(jsonb) from public, anon, authenticated;
revoke all on function public.update_nutrition_log(jsonb) from public, anon;
revoke all on function public.save_food(jsonb) from public, anon;
revoke all on function public.consume_nutrition_provider_quota(text) from public, anon;
grant execute on function public.update_nutrition_log(jsonb) to authenticated;
grant execute on function public.save_food(jsonb) to authenticated;
grant execute on function public.consume_nutrition_provider_quota(text) to authenticated;
