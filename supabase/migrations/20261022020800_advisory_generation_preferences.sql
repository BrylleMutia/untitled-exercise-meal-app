-- Only new generation versions adopt advisory rules; historical constraints remain intact.
alter table public.meal_plans add column preference_policy text not null default 'enforced' check(preference_policy in ('enforced','advisory_v1'));
alter table public.cooking_generation_notices add column preference_review jsonb not null default '{}' check(jsonb_typeof(preference_review)='object');

create function private.recipe_cost_score(p_recipe public.meals) returns numeric language sql immutable set search_path='' as $$ select 0::numeric; $$;

create function private.matches_avoided_food(p_name text,p_category text,p_term text) returns boolean language sql immutable set search_path='' as $$
 select btrim(p_term)<>'' and (position(lower(btrim(p_term)) in lower(p_name))>0
 or (lower(p_term)~'nut' and lower(p_name)~'peanut|almond|nut') or (lower(p_term)~'soy' and lower(p_name)~'soy|tofu')
 or (lower(p_term)~'dairy|milk' and p_category='Dairy') or (lower(p_term)~'gluten|wheat' and lower(p_name)~'wheat|bread|pasta')
 or (lower(p_term)~'egg' and lower(p_name)~'egg') or (lower(p_term)~'fish|seafood' and lower(p_name)~'salmon|fish'));
$$;

create function private.recipe_preference_warnings(p_recipe public.meals,p_profile public.profiles) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare warnings jsonb:='[]'::jsonb; base jsonb:=jsonb_build_object('recipeId',p_recipe.app_id,'recipeRevision',p_recipe.revision,'recipeName',p_recipe.name); term text; matched text; pattern text:=lower(p_profile.dietary_pattern);
begin
 if p_recipe.total_time_minutes is null then warnings:=warnings||jsonb_build_array(base||jsonb_build_object('code','cooking-time-unknown','message','Cooking time is not set.'));
 elsif p_recipe.total_time_minutes>p_profile.cooking_time_minutes then warnings:=warnings||jsonb_build_array(base||jsonb_build_object('code','cooking-time','message',p_recipe.total_time_minutes||' mins exceeds your '||p_profile.cooking_time_minutes||'-minute cooking preference.')); end if;
 if p_recipe.provided_nutrition is not null then warnings:=warnings||jsonb_build_array(base||jsonb_build_object('code','source-nutrition','message','Recipe nutrition is source-provided and has not been independently verified from ingredients.')); end if;
 if exists(select 1 from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=p_recipe.row_id and f.value_source<>'trusted_catalog') or jsonb_array_length(coalesce(p_recipe.unmeasured_ingredients,'[]'))>0 then warnings:=warnings||jsonb_build_array(base||jsonb_build_object('code','ingredient-nutrition','message','Some ingredient quantities or nutrition are estimated, unmeasured, or unverified. Planning totals are estimates.')); end if;
 select string_agg(distinct i.name,', ' order by i.name) into matched from (
   select f.name,f.category from public.meal_ingredients mi join public.foods f on f.row_id=mi.food_row_id where mi.meal_row_id=p_recipe.row_id
   union all select i->>'name','Other' from jsonb_array_elements(coalesce(p_recipe.unmeasured_ingredients,'[]')) i
 ) i where (pattern like '%vegan%' or pattern like '%vegetarian%') and
 (i.name ~* '\m(beef|chicken|pork|salmon|fish|shrimp|tuna|turkey|bacon|ham|meat|gelatin)\M' or (pattern like '%vegan%' and (i.category='Dairy' or i.name ~* '\m(egg|eggs|milk|yogurt|cheese|cheddar|butter|honey|cream)\M')));
 if matched is not null then warnings:=warnings||jsonb_build_array(base||jsonb_build_object('code','diet','message','Ingredients may not match your '||p_profile.dietary_pattern||' preference: '||matched||'. Review the recipe before choosing.')); end if;
 foreach term in array coalesce(p_profile.allergies,'{}') loop
   select string_agg(distinct i.name,', ' order by i.name) into matched from (
     select f.name,f.category from public.meal_ingredients mi join public.foods f on f.row_id=mi.food_row_id where mi.meal_row_id=p_recipe.row_id
     union all select i->>'name','Other' from jsonb_array_elements(coalesce(p_recipe.unmeasured_ingredients,'[]')) i
   ) i where private.matches_avoided_food(i.name,i.category,term);
   if matched is not null then warnings:=warnings||jsonb_build_array(base||jsonb_build_object('code','avoided-food','message','Your foods to avoid ('||term||') may match: '||matched||'. This recipe is not confirmed safe for you.')); end if;
 end loop;
 return warnings;
end;
$$;

-- No preference checks here: generation still requires usable authoritative recipe data.
create or replace function private.assert_generation_recipe(p_recipe public.meals,p_profile public.profiles) returns void language plpgsql security definer set search_path='' as $$
declare n jsonb; k text; amount numeric;
begin
 if p_recipe.archived_at is not null or cardinality(p_recipe.meal_slots)=0 or p_recipe.servings<1
 or (p_recipe.provided_nutrition is null and not exists(select 1 from public.meal_ingredients where meal_row_id=p_recipe.row_id)) then perform private.raise_mutation_error('validation_failed','Recipe needs valid servings, meal slots, and usable nutrition'); end if;
 n:=private.normalize_planned_meal_record(jsonb_build_object('mealId',p_recipe.app_id,'servings',1),coalesce(p_recipe.owner_user_id,p_profile.id));
 foreach k in array array['expectedCalories','expectedProteinG','expectedCarbsG','expectedFatG'] loop
   if n->>k is null then perform private.raise_mutation_error('validation_failed','Recipe nutrition is incomplete'); end if;
   perform private.assert_finite_number(n->>k,k,0,100000);
 end loop;
 amount:=(n->>'expectedCalories')::numeric;
 if amount<=0 then perform private.raise_mutation_error('validation_failed','Recipe needs a positive calorie estimate'); end if;
end;
$$;

-- Called only by verified server paths; never return another member's review to the caller.
create function private.planning_preference_review(p_user uuid,p_input jsonb,p_preview jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare profile public.profiles; recipe public.meals; warnings jsonb:='[]'::jsonb; days jsonb:='[]'::jsonb; day date; plan_id bigint; cap numeric; total numeric; incomplete boolean; ids jsonb; names jsonb; added numeric;
begin
 select * into profile from public.profiles where id=p_user;
 for recipe in select m.* from public.meals m where m.app_id in(select r->>'id' from jsonb_array_elements(p_input->'recipes') r) and (m.is_system or m.owner_user_id in(select user_id from public.cooking_group_members where group_id=private.cooking_group_for(p_user))) loop
   warnings:=warnings||private.recipe_preference_warnings(recipe,profile);
 end loop;
 cap:=private.total_carb_limit(profile.dietary_pattern);
 select row_id into plan_id from public.meal_plans where user_id=p_user and week_of=(p_input->>'weekOf')::date and calendar_active order by version desc,row_id desc limit 1;
 if cap is not null then
 for day in select value::date from jsonb_array_elements_text(p_input->'selectedDates') order by value::date loop
   select coalesce(sum(pm.expected_carbs_g),0),coalesce(bool_or(pm.expected_carbs_g is null or exists(select 1 from public.meals m where m.row_id=pm.meal_row_id and m.provided_nutrition is null and jsonb_array_length(m.unmeasured_ingredients)>0)),false) into total,incomplete from public.planned_meals pm where pm.meal_plan_row_id=plan_id and pm.meal_date=day and not pm.skipped
   and not exists(select 1 from public.nutrition_logs l where l.user_id=p_user and l.planned_meal_app_id=pm.app_id)
   and not exists(select 1 from jsonb_array_elements(coalesce(p_preview->'replacements','[]')) r where r->>'memberId'=p_user::text and r->>'id'=pm.app_id);
   total:=total+coalesce((select sum(carbs_g) from public.nutrition_logs where user_id=p_user and log_date=day),0);
   select coalesce(sum((private.cooking_recipe_nutrients(m)->>'expectedCarbsG')::numeric*(a->>'servings')::numeric),0),coalesce(jsonb_agg(distinct to_jsonb(m.app_id)),'[]') into added,ids from jsonb_array_elements(coalesce(p_preview->'assignments','[]')) a join public.meals m on m.app_id=coalesce(a->>'recipeId',a->>'mealId') where coalesce(a->>'memberId',p_user::text)=p_user::text and (a->>'date')::date=day;
   select coalesce(jsonb_agg(distinct m.app_id),'[]'),coalesce(jsonb_object_agg(m.app_id,m.name),'{}') into ids,names from public.meals m where m.app_id in(select jsonb_array_elements_text(ids)) or m.row_id in(select pm.meal_row_id from public.planned_meals pm where pm.meal_plan_row_id=plan_id and pm.meal_date=day and not pm.skipped and not exists(select 1 from jsonb_array_elements(coalesce(p_preview->'replacements','[]')) r where r->>'memberId'=p_user::text and r->>'id'=pm.app_id));
   incomplete:=incomplete or exists(select 1 from jsonb_array_elements(coalesce(p_preview->'assignments','[]')) a join public.meals m on m.app_id=coalesce(a->>'recipeId',a->>'mealId') where coalesce(a->>'memberId',p_user::text)=p_user::text and (a->>'date')::date=day and m.provided_nutrition is null and jsonb_array_length(m.unmeasured_ingredients)>0);
   total:=round(total+added,2);
   if incomplete or total>cap then days:=days||jsonb_build_array(jsonb_build_object('code','daily-carbohydrate','date',day,'totalCarbs',case when incomplete then null else total end,'limit',cap,'recipeIds',ids,'recipeNames',names,'message',case when incomplete then 'Nutrition is incomplete; your carbohydrate preference cannot be assessed reliably.' else 'Estimated daily total: '||total||' g total carbs; your preference is '||cap||' g. Includes retained meals and recorded intake.' end)); end if;
 end loop;
 end if;
 return jsonb_build_object('policyVersion','advisory_v1','recipeWarnings',warnings,'dailyWarnings',days);
end;
$$;

CREATE OR REPLACE FUNCTION private.assert_enforced_generation_recipe(p_recipe meals, p_profile profiles)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  cost:=0;
  if prep>p_profile.cooking_time_minutes or cost>p_profile.meal_budget then
    perform private.raise_mutation_error('validation_failed','Recipe exceeds cooking-time or budget settings');
  end if;
  for food in select f.* from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=p_recipe.row_id loop
    if food.value_source='ai_estimate' or (private.total_carb_limit(pattern) is not null and food.value_source<>'trusted_catalog')
      or (pattern like '%vegan%' and food.app_id=any(array['food-egg','food-chicken','food-salmon','food-greek-yogurt','food-milk','food-cheddar','food-butter','food-honey','food-mvp3-173424','food-mvp3-171477','food-lemon-chicken-172385','food-lemon-chicken-173410','food-lemon-chicken-171265','food-lemon-chicken-169640','food-korean-beef-171790','food-chicken-prep-171077']))
      or (pattern like '%vegetarian%' and food.app_id=any(array['food-chicken','food-salmon','food-mvp3-171477','food-lemon-chicken-172385','food-korean-beef-171790','food-chicken-prep-171077'])) then
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
  foreach allergy in array p_profile.allergies loop
    allergy:=lower(btrim(allergy));
    if allergy<>'' and exists(select 1 from jsonb_array_elements(coalesce(p_recipe.unmeasured_ingredients,'[]'::jsonb)) item where position(allergy in lower(item->>'name'))>0 or (allergy~'nut' and lower(item->>'name')~'peanut|almond|nut') or (allergy~'soy' and lower(item->>'name')~'soy|tofu') or (allergy~'gluten|wheat' and lower(item->>'name')~'wheat|bread|pasta') or (allergy~'egg' and lower(item->>'name')~'egg') or (allergy~'fish|seafood' and lower(item->>'name')~'salmon|fish')) then perform private.raise_mutation_error('validation_failed','Recipe contains an excluded unmeasured ingredient'); end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.capture_meal_constraints()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('app.generation_preference_policy',true)='advisory_v1' then new.preference_policy:='advisory_v1';
  elsif new.supersedes_plan_row_id is not null then
    select preference_policy into new.preference_policy from public.meal_plans where row_id=new.supersedes_plan_row_id and user_id=new.user_id;
  else new.preference_policy:='enforced'; end if;
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
$function$
;

CREATE OR REPLACE FUNCTION private.check_meal_constraints()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare plan public.meal_plans%rowtype; day_carbs numeric; forbidden boolean;
begin
  select * into plan from public.meal_plans where calendar_active and row_id = new.meal_plan_row_id;
  if plan.preference_policy='advisory_v1' then return null; end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_group_planning_context(p_actor uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare gid uuid:=private.cooking_group_for(p_actor); selected_week date; profile public.profiles; recipe public.meals; plan public.meal_plans;
 recipes jsonb:='[]'::jsonb; members jsonb:='[]'::jsonb; allowed jsonb; days jsonb; occupied jsonb; metadata jsonb; day date; target public.daily_targets;
 used_calories numeric; used_carbs numeric; limit_carbs numeric; source_owner uuid;
begin
 if (select auth.role()) is distinct from 'service_role' then perform private.raise_mutation_error('not_authenticated','Server planning only'); end if;
 if gid is null or gid::text is distinct from p_input->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 if p_input->>'reviewPolicyVersion' is distinct from 'advisory_v1' then perform private.raise_mutation_error('stale_version','Refresh and review the advisory planning policy.'); end if;
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
   'protected',(exists(select 1 from public.nutrition_logs l where l.user_id=profile.id and (l.planned_meal_app_id=pm.app_id or (l.log_date=pm.meal_date and l.meal_slot=pm.meal_slot))) or exists(select 1 from public.logged_meals l where l.user_id=profile.id and l.planned_meal_app_id=pm.app_id)))), '[]'::jsonb)
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
 return jsonb_build_object('preferencePolicy','advisory_v1','basis',private.cooking_basis(gid,selected_week),'recipes',recipes,'members',members,'retained',private.cooking_live_assignments(gid,selected_week));
end;
$function$
;

CREATE OR REPLACE FUNCTION private.cooking_basis(p_group uuid, p_week date)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select encode(extensions.digest(jsonb_build_object(
 'reviewPolicyVersion','advisory_v1','group',private.cooking_group_json(p_group),
 'profiles',(select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p where id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'targets',(select jsonb_agg(to_jsonb(t) order by row_id) from public.daily_targets t where user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'plans',(select jsonb_agg(to_jsonb(p) order by row_id) from public.meal_plans p where calendar_active and week_of=p_week and user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'planned',(select jsonb_agg(to_jsonb(p) order by row_id) from public.planned_meals p where week_of=p_week and user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'logs',(select jsonb_agg(to_jsonb(l) order by row_id) from public.nutrition_logs l where log_date>=p_week and log_date<p_week+7 and user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'recipes',(select jsonb_agg(to_jsonb(m) order by row_id) from public.meals m where is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'foods',(select jsonb_agg(to_jsonb(f) order by row_id) from public.foods f where is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'ingredients',(select jsonb_agg(to_jsonb(i) order by i.row_id) from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.is_system or m.owner_user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'week',(select to_jsonb(w) from public.cooking_group_weeks w where group_id=p_group and week_of=p_week))::text,'sha256'),'hex');
$function$
;

CREATE OR REPLACE FUNCTION public.store_group_planning_preview(p_actor uuid, p_input jsonb, p_preview jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare gid uuid:=private.cooking_group_for(p_actor); saved private.cooking_previews; member uuid; reviews jsonb:='{}'::jsonb;
begin
 if (select auth.role()) is distinct from 'service_role' then perform private.raise_mutation_error('not_authenticated','Server planning only'); end if;
 if gid is null or gid::text is distinct from p_input->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 if private.cooking_basis(gid,(p_input->>'weekOf')::date) is distinct from p_preview->>'basis' then perform private.raise_mutation_error('stale_version','Planning details changed. Refresh the preview.'); end if;
 delete from private.cooking_previews where expires_at<now();
 saved.id:=gen_random_uuid();
 p_preview:=jsonb_set(p_preview,'{assignments}',(select coalesce(jsonb_agg(a||jsonb_build_object('id',(a->>'id')||'-'||saved.id::text)),'[]'::jsonb) from jsonb_array_elements(p_preview->'assignments') a));
 for member in select jsonb_array_elements_text(p_input->'memberIds')::uuid loop
   reviews:=reviews||jsonb_build_object(member::text,private.planning_preference_review(member,p_input,p_preview));
 end loop;
 if not (p_input->'memberIds' ? p_actor::text) then reviews:=reviews||jsonb_build_object(p_actor::text,private.planning_preference_review(p_actor,p_input,p_preview)); end if;
 p_preview:=p_preview||jsonb_build_object('memberReviews',reviews);
 insert into private.cooking_previews(id,group_id,created_by,week_of,request,basis,preview) values(saved.id,gid,p_actor,(p_input->>'weekOf')::date,p_input,p_preview->>'basis',p_preview) returning * into saved;
 return (p_preview-'memberReviews')||jsonb_build_object('preferenceReview',reviews->p_actor::text,'id',saved.id,'expiresAt',saved.expires_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.validate_cooking_preview(p_preview private.cooking_previews)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; selected jsonb; profile public.profiles; recipe public.meals; existing public.planned_meals; target public.daily_targets;
 plan_id bigint; member uuid; day date; total numeric; old_calories numeric; old_carbs numeric; added_calories numeric;
begin
 if p_preview.request->>'reviewPolicyVersion' is distinct from 'advisory_v1' then perform private.raise_mutation_error('stale_version','Refresh and review the advisory planning policy.'); end if;
 if jsonb_array_length(p_preview.request->'memberIds') not between 1 and 6 or jsonb_array_length(p_preview.request->'selectedDates') not between 1 and 7 then perform private.raise_mutation_error('validation_failed','Choose people and days'); end if;
 if exists(select 1 from jsonb_array_elements_text(p_preview.request->'memberIds') id group by id having count(*)>1) or exists(select 1 from jsonb_array_elements_text(p_preview.request->'selectedDates') d group by d having count(*)>1) then perform private.raise_mutation_error('validation_failed','Choose unique people and days'); end if;
 if exists(select 1 from jsonb_array_elements(p_preview.preview->'assignments') a group by a->>'memberId',a->>'date',a->>'slot' having count(*)>1) then perform private.raise_mutation_error('validation_failed','Only one new assignment per member and slot'); end if;
 for item in select value from jsonb_array_elements(p_preview.preview->'replacements') loop
   if not(p_preview.request->'memberIds' ? (item->>'memberId')) or not(p_preview.request->'selectedDates' ? (item->>'date')) or p_preview.request->>'mode'<>'replace' then perform private.raise_mutation_error('validation_failed','Replacement outside selected people and dates'); end if;
   member:=(item->>'memberId')::uuid;
   select row_id into plan_id from public.meal_plans where user_id=member and week_of=p_preview.week_of and calendar_active order by version desc,row_id desc limit 1;
   select * into existing from public.planned_meals where meal_plan_row_id=plan_id and app_id=item->>'id' and meal_date=(item->>'date')::date;
   if existing.row_id is null or (exists(select 1 from public.nutrition_logs where user_id=member and (planned_meal_app_id=existing.app_id or (log_date=existing.meal_date and meal_slot=existing.meal_slot))) or exists(select 1 from public.logged_meals where user_id=member and planned_meal_app_id=existing.app_id)) then perform private.raise_mutation_error('conflict','A saved assignment is protected. Refresh and review.'); end if;
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
   select sum((private.normalize_planned_meal_record(a||jsonb_build_object('mealId',a->>'recipeId'),coalesce(m.owner_user_id,member))->>'expectedCalories')::numeric)
   into added_calories from jsonb_array_elements(p_preview.preview->'assignments') a join public.meals m on m.app_id=a->>'recipeId' where a->>'memberId'=member::text and (a->>'date')::date=day;
   if old_calories+added_calories>target.calories then perform private.raise_mutation_error('validation_failed','Portions exceed a participant’s remaining planning limits. Refresh and review.'); end if;
 end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.commit_cooking_group_plan(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform set_config('app.generation_preference_policy','advisory_v1',true);
 insert into public.cooking_generations(group_id,week_of,generated_by,generator_name,member_ids,summary)
 values(gid,preview.week_of,caller,(select name from public.profiles where id=caller),array(select jsonb_array_elements_text(preview.request->'memberIds')::uuid),preview.preview-'memberReviews') returning id into gen;
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
   insert into public.cooking_generation_notices(generation_id,user_id,preference_review) values(gen,member,coalesce(preview.preview->'memberReviews'->member::text,'{}'::jsonb));
   perform private.reconcile_personal_cooking_grocery(member,preview.week_of);
 end loop;
 insert into public.cooking_generation_notices(generation_id,user_id,preference_review) values(gen,caller,coalesce(preview.preview->'memberReviews'->caller::text,'{}'::jsonb)) on conflict do nothing;
 perform private.reconcile_cooking_grocery(gid,preview.week_of);
 perform set_config('app.generation_preference_policy','',true);
 result:=jsonb_build_object('success',true,'generationId',gen);
 perform private.complete_mutation(claim.mutation_row_id,result);
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.cooking_generation_json(p_gen cooking_generations, p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',p_gen.id,'weekOf',p_gen.week_of,'createdAt',p_gen.created_at,'generatedBy',p_gen.generator_name,
 'memberIds',p_gen.member_ids,
 'assignmentCounts',(select jsonb_agg(jsonb_build_object('memberId',m.id,'count',(select count(*) from jsonb_array_elements(coalesce(p_gen.summary->'assignments','[]')) a where a->>'memberId'=m.id::text))) from unnest(p_gen.member_ids) m(id)),
 'personalReview',(select case when preference_review->>'policyVersion'='advisory_v1' then preference_review else null end from public.cooking_generation_notices where generation_id=p_gen.id and user_id=p_user and p_user=auth.uid()),'batches',p_gen.summary->'batches',
 'acknowledged',exists(select 1 from public.cooking_generation_notices where generation_id=p_gen.id and user_id=p_user and acknowledged_at is not null),
 'superseded',exists(select 1 from public.cooking_generations where group_id=p_gen.group_id and week_of=p_gen.week_of and (created_at,id)>(p_gen.created_at,p_gen.id)));
$function$
;

CREATE OR REPLACE FUNCTION private.generate_nutrition_week(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=private.require_authenticated(); claim record; result jsonb; item jsonb; selected jsonb;
  week_date date; plan public.meal_plans; profile public.profiles; recipe public.meals;
  used numeric; additions integer; previous public.planned_meals; supplied jsonb; child jsonb;
  grocery_revision integer; old_count integer;
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
  if p_payload->>'reviewPolicyVersion' is distinct from 'advisory_v1' or p_payload->>'reviewAcknowledged' is distinct from 'true' then perform private.raise_mutation_error('validation_failed','Refresh and acknowledge the current generation review.'); end if;
  perform set_config('app.generation_preference_policy','advisory_v1',true);
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
  perform set_config('app.generation_preference_policy','',true);
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return jsonb_build_object('status','completed','operation','generate_nutrition_week','result_refs',result->'result_refs');
end;
$function$
;

CREATE OR REPLACE FUNCTION private.mutate_cooking_group_week(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   perform set_config('app.cooking_edit',gid::text,true);
   select * into assignment from public.cooking_assignments where group_id=gid and id=p_payload->>'assignmentId';
   if assignment.id is null or private.cooking_group_for(assignment.user_id) is distinct from gid then perform private.raise_mutation_error('not_found','Assignment not found'); end if;
   select * into plan from public.meal_plans where user_id=assignment.user_id and week_of=week and calendar_active order by version desc,row_id desc limit 1 for update;
   select * into pm from public.planned_meals where meal_plan_row_id=plan.row_id and app_id=assignment.id;
   if pm.row_id is null then perform private.raise_mutation_error('stale_version','Assignment changed. Refresh and review.'); end if;
   if exists(select 1 from public.nutrition_logs where user_id=assignment.user_id and planned_meal_app_id=assignment.id) then perform private.raise_mutation_error('conflict','This saved assignment is protected. Refresh your plan or choose another meal.'); end if;
   perform private.assert_finite_number(p_payload->>'servings','servings',.25,4);
   if (p_payload->>'servings')::numeric*4<>trunc((p_payload->>'servings')::numeric*4) then perform private.raise_mutation_error('validation_failed','Choose quarter servings'); end if;
   recipe_to_use:=pm.meal_row_id;
   if nullif(p_payload->>'recipeId','') is not null and p_payload->>'recipeId'<>assignment.recipe_id then
     select * into chosen from public.meals where app_id=p_payload->>'recipeId' and archived_at is null and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid));
     if chosen.row_id is null or not(pm.meal_slot=any(chosen.meal_slots)) then perform private.raise_mutation_error('validation_failed','Choose an available recipe for this meal'); end if;
          if plan.preference_policy='advisory_v1' then perform private.assert_generation_recipe(chosen,(select p from public.profiles p where id=assignment.user_id)); else perform private.assert_enforced_generation_recipe(chosen,(select p from public.profiles p where id=assignment.user_id)); end if;
     recipe_to_use:=private.cooking_copy_recipe(chosen.row_id,assignment.user_id);
     update public.cooking_assignments set recipe_id=chosen.app_id,recipe_snapshot_row_id=recipe_to_use where user_id=assignment.user_id and id=assignment.id;
   end if;
   normalized:=private.normalize_planned_meal_record(jsonb_build_object('mealId',(select app_id from public.meals where row_id=recipe_to_use),'servings',p_payload->'servings'),assignment.user_id);
   if plan.preference_policy<>'advisory_v1' and private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) is not null and (normalized->>'expectedCarbsG')::numeric+coalesce((select sum(expected_carbs_g) from public.planned_meals where meal_plan_row_id=plan.row_id and meal_date=pm.meal_date and not skipped and row_id<>pm.row_id),0)>private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) then perform private.raise_mutation_error('validation_failed','Portion exceeds this member’s planning limits'); end if;
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
$function$
;


revoke all on function private.recipe_cost_score(public.meals),private.matches_avoided_food(text,text,text),private.recipe_preference_warnings(public.meals,public.profiles),private.planning_preference_review(uuid,jsonb,jsonb),private.assert_enforced_generation_recipe(public.meals,public.profiles) from public,anon,authenticated;
revoke all on function private.assert_generation_recipe(public.meals,public.profiles),private.capture_meal_constraints(),private.check_meal_constraints(),private.cooking_basis(uuid,date),private.validate_cooking_preview(private.cooking_previews),private.commit_cooking_group_plan(jsonb),private.generate_nutrition_week(jsonb),private.mutate_cooking_group_week(jsonb),private.cooking_generation_json(public.cooking_generations,uuid) from public,anon,authenticated;
revoke all on function public.get_group_planning_context(uuid,jsonb),public.store_group_planning_preview(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.get_group_planning_context(uuid,jsonb),public.store_group_planning_preview(uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
