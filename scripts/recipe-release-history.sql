select jsonb_build_object(
  'nutritionLogs', (select jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(n)::text,'' order by n.row_id),''))) from public.nutrition_logs n),
  'plannedMeals', (select jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(p)::text,'' order by p.row_id),''))) from public.planned_meals p),
  'loggedMeals', (select jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(l)::text,'' order by l.row_id),''))) from public.logged_meals l),
  'personalRecipes', (select jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg((to_jsonb(m)-'provided_nutrition')::text,'' order by m.row_id),''))) from public.meals m where not m.is_system),
  'existingIngredients', (select jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(i)::text,'' order by i.meal_row_id,i.ingredient_order),''))) from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.app_id<>'meal-korean-beef-bowl')
) as history;
