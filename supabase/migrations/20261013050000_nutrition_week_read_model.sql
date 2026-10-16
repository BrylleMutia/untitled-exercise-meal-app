-- One consistent seven-day read, independent of the compact snapshot's limits.
create function public.get_nutrition_week(p_week_of date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if p_week_of is null or extract(isodow from p_week_of) <> 1 then
    raise exception 'validation_failed: choose a Monday week date';
  end if;
  with plan as (
    select * from public.meal_plans where user_id = caller and week_of = p_week_of
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
    select * from public.grocery_lists where user_id = caller and week_of = p_week_of
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
revoke all on function public.get_nutrition_week(date) from public, anon;
grant execute on function public.get_nutrition_week(date) to authenticated;
notify pgrst, 'reload schema';
