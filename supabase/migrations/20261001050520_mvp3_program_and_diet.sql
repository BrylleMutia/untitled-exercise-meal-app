-- Existing plan versions retain their original prescription and assumptions.
alter table public.profiles add column training_program text not null default 'calisthenics'
  check (training_program in ('calisthenics', 'pilates'));
alter table public.workout_plans add column training_program text not null default 'calisthenics'
  check (training_program in ('calisthenics', 'pilates'));
alter table public.workout_sessions add column training_program text not null default 'calisthenics'
  check (training_program in ('calisthenics', 'pilates'));
alter table public.meal_plans add column dietary_pattern text not null default '';
alter table public.meal_plans add column allergies text[] not null default '{}';
alter table public.meal_plans add column total_carb_limit numeric check (total_carb_limit in (50, 130));

create function private.total_carb_limit(p_pattern text) returns numeric
language sql immutable set search_path = '' as $$
  select case when lower(p_pattern) like '%keto-style%' then 50
    when lower(p_pattern) like '%low-carb%' then 130 else null end::numeric;
$$;

create function private.capture_meal_constraints() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select dietary_pattern, allergies into new.dietary_pattern, new.allergies
    from public.profiles where id = new.user_id;
  new.total_carb_limit := private.total_carb_limit(new.dietary_pattern);
  return new;
end;
$$;
create trigger meal_plans_capture_constraints before insert on public.meal_plans
for each row execute function private.capture_meal_constraints();

create function private.check_meal_constraints() returns trigger
language plpgsql security definer set search_path = '' as $$
declare plan public.meal_plans%rowtype; day_carbs numeric; forbidden boolean;
begin
  select * into plan from public.meal_plans where row_id = new.meal_plan_row_id;
  if plan.total_carb_limit is null then return null; end if;
  -- Check authoritative ingredients rather than client supplied totals. Empty slots
  -- remain unresolved; they do not assert that the whole day is compliant.
  if exists (select 1 from public.planned_meals pm where pm.meal_plan_row_id = plan.row_id
    and pm.meal_row_id is not null and not exists
      (select 1 from public.meal_ingredients i where i.meal_row_id = pm.meal_row_id)) then
    perform private.raise_mutation_error('validation_failed', 'recipe has no verified serving data');
  end if;
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
        ('food-egg','food-chicken','food-salmon','food-greek-yogurt','food-milk','food-cheddar','food-butter','food-honey','food-mvp3-173424','food-mvp3-171477'))
      or (lower(plan.dietary_pattern) like '%vegetarian%' and app_id in ('food-chicken','food-salmon','food-mvp3-171477'))
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
create constraint trigger planned_meals_check_constraints after insert or update on public.planned_meals
deferrable initially deferred for each row execute function private.check_meal_constraints();

create function private.check_target_carbs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap numeric;
begin
  select private.total_carb_limit(dietary_pattern) into cap from public.profiles where id = new.user_id;
  if cap is not null and new.carbs_g > cap then perform private.raise_mutation_error('validation_failed', 'target carbohydrate limit exceeded'); end if;
  return new;
end;
$$;
create trigger daily_targets_check_carbs before insert on public.daily_targets
for each row execute function private.check_target_carbs();

alter function private.persist_profile_health_metadata(jsonb) rename to persist_profile_health_metadata_mvp2;
create function private.persist_profile_health_metadata(p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); program text := coalesce(p_payload->'profile'->>'trainingProgram', 'calisthenics');
begin
  perform private.assert_enum(program, 'trainingProgram', array['calisthenics','pilates']);
  perform private.persist_profile_health_metadata_mvp2(p_payload);
  update public.profiles set training_program = program where id = caller_id and training_program is distinct from program;
  update public.workout_plans set training_program = program where row_id = (
    select row_id from public.workout_plans where user_id = caller_id and app_id = p_payload->'plan'->>'id'
      order by version desc limit 1
  );
end;
$$;
create function private.capture_session_program() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.training_program into new.training_program from public.planned_workouts w
    join public.workout_plans p on p.row_id = w.plan_row_id
    where w.row_id = new.planned_workout_row_id and w.user_id = new.user_id;
  return new;
end;
$$;
create trigger workout_sessions_capture_program before insert on public.workout_sessions
for each row execute function private.capture_session_program();

-- Reject fractional concurrency revisions before the existing mutation is called.
alter function public.set_celebrations(jsonb) set schema private;
alter function private.set_celebrations(jsonb) rename to set_celebrations_mvp3;
create function public.set_celebrations(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_finite_number(p_payload->>'expectedRevision', 'expectedRevision', 1, 2147483647);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then
    perform private.raise_mutation_error('validation_failed');
  end if;
  return private.set_celebrations_mvp3(p_payload);
end;
$$;
revoke all on function private.total_carb_limit(text), private.capture_meal_constraints(), private.check_meal_constraints(),
  private.check_target_carbs(), private.persist_profile_health_metadata_mvp2(jsonb), private.persist_profile_health_metadata(jsonb),
  private.capture_session_program(), private.set_celebrations_mvp3(jsonb) from public, anon, authenticated;
revoke all on function public.set_celebrations(jsonb) from public, anon;
grant execute on function public.set_celebrations(jsonb) to authenticated;
-- Reviewed USDA SR Legacy records; new IDs preserve historical starter values.
insert into public.foods (app_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, value_source, fdc_id, record_type, nutrients_per_100g)
values ('food-mvp3-173424', true, 'Hard-boiled egg', '100 g · Egg, whole, cooked, hard-boiled', 100, 'g', 155, 12.58, 1.12, 10.61, 0, 'Protein', 'USDA FoodData Central', 'SR Legacy:173424:2019-04-01', false, 'high', 'trusted_catalog', 173424, 'SR Legacy', '{"calories":155,"proteinG":12.58,"carbsG":1.12,"fatG":10.61,"fiberG":0}'::jsonb);
insert into public.foods (app_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, value_source, fdc_id, record_type, nutrients_per_100g)
values ('food-mvp3-171477', true, 'Roasted chicken breast, meat only', '100 g · Chicken, broilers or fryers, breast, meat only, cooked, roasted', 100, 'g', 165, 31.02, 0, 3.57, 0, 'Protein', 'USDA FoodData Central', 'SR Legacy:171477:2019-04-01', false, 'high', 'trusted_catalog', 171477, 'SR Legacy', '{"calories":165,"proteinG":31.02,"carbsG":0,"fatG":3.57,"fiberG":0}'::jsonb);
insert into public.foods (app_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, value_source, fdc_id, record_type, nutrients_per_100g)
values ('food-mvp3-169967', true, 'Broccoli, boiled without salt', '100 g · Broccoli, cooked, boiled, drained, without salt', 100, 'g', 35, 2.38, 7.18, 0.41, 3.3, 'Produce', 'USDA FoodData Central', 'SR Legacy:169967:2019-04-01', false, 'high', 'trusted_catalog', 169967, 'SR Legacy', '{"calories":35,"proteinG":2.38,"carbsG":7.18,"fatG":0.41,"fiberG":3.3}'::jsonb);
insert into public.foods (app_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, value_source, fdc_id, record_type, nutrients_per_100g)
values ('food-mvp3-174290', true, 'Extra-firm tofu, prepared with nigari', '100 g · Tofu, extra firm, prepared with nigari', 100, 'g', 83, 9.98, 1.18, 5.26, 1, 'Protein', 'USDA FoodData Central', 'SR Legacy:174290:2019-04-01', false, 'high', 'trusted_catalog', 174290, 'SR Legacy', '{"calories":83,"proteinG":9.98,"carbsG":1.18,"fatG":5.26,"fiberG":1}'::jsonb);
insert into public.foods (app_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, value_source, fdc_id, record_type, nutrients_per_100g)
values ('food-mvp3-171413', true, 'Olive oil', '100 g · Oil, olive, salad or cooking', 100, 'g', 884, 0, 0, 100, 0, 'Pantry', 'USDA FoodData Central', 'SR Legacy:171413:2019-04-01', false, 'high', 'trusted_catalog', 171413, 'SR Legacy', '{"calories":884,"proteinG":0,"carbsG":0,"fatG":100,"fiberG":0}'::jsonb);
insert into public.foods (app_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, value_source, fdc_id, record_type, nutrients_per_100g)
values ('food-mvp3-170567', true, 'Almonds', '100 g · Nuts, almonds', 100, 'g', 579, 21.15, 21.55, 49.93, 12.5, 'Pantry', 'USDA FoodData Central', 'SR Legacy:170567:2019-04-01', false, 'high', 'trusted_catalog', 170567, 'SR Legacy', '{"calories":579,"proteinG":21.15,"carbsG":21.55,"fatG":49.93,"fiberG":12.5}'::jsonb);
insert into public.meals (app_id,is_system,name,servings,notes) values ('meal-mvp3-eggs',true,'Egg, Broccoli & Almond Plate',1,'Weigh 100 g hard-boiled egg, 50 g boiled broccoli, 28 g almonds, and 20 g olive oil. Oil is included.');
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,1,1 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-eggs' and f.app_id='food-mvp3-173424';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,2,0.5 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-eggs' and f.app_id='food-mvp3-169967';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,3,0.28 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-eggs' and f.app_id='food-mvp3-170567';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,4,0.2 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-eggs' and f.app_id='food-mvp3-171413';
insert into public.meals (app_id,is_system,name,servings,notes) values ('meal-mvp3-chicken',true,'Chicken & Broccoli Plate',1,'Weigh 150 g cooked skinless chicken, 100 g boiled broccoli, and 25 g olive oil. Count all oil used.');
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,1,1.5 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-chicken' and f.app_id='food-mvp3-171477';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,2,1 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-chicken' and f.app_id='food-mvp3-169967';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,3,0.25 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-chicken' and f.app_id='food-mvp3-171413';
insert into public.meals (app_id,is_system,name,servings,notes) values ('meal-mvp3-tofu',true,'Tofu & Broccoli Plate',1,'Weigh 300 g extra-firm nigari tofu, 50 g boiled broccoli, and 30 g olive oil. Tofu brands differ.');
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,1,3 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-tofu' and f.app_id='food-mvp3-174290';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,2,0.5 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-tofu' and f.app_id='food-mvp3-169967';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,3,0.3 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-tofu' and f.app_id='food-mvp3-171413';
insert into public.meals (app_id,is_system,name,servings,notes) values ('meal-mvp3-tofu-almonds',true,'Tofu, Broccoli & Almond Bowl',1,'Weigh 200 g extra-firm nigari tofu, 50 g boiled broccoli, 28 g almonds, and 20 g olive oil. Count all oil used.');
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,1,2 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-tofu-almonds' and f.app_id='food-mvp3-174290';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,2,0.5 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-tofu-almonds' and f.app_id='food-mvp3-169967';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,3,0.28 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-tofu-almonds' and f.app_id='food-mvp3-170567';
insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,4,0.2 from public.meals m cross join public.foods f where m.app_id='meal-mvp3-tofu-almonds' and f.app_id='food-mvp3-171413';
