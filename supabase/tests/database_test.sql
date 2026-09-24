begin;

select plan(33);

select has_schema('private', 'private helper schema exists');

select has_table('public', 'exercises', 'exercises table exists');
select has_table('public', 'foods', 'foods table exists');
select has_table('public', 'meals', 'meals table exists');
select has_table('public', 'meal_ingredients', 'meal ingredients table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'goals', 'goals table exists');
select has_table('public', 'daily_targets', 'daily targets table exists');
select has_table('public', 'workout_plans', 'workout plans table exists');
select has_table('public', 'planned_workouts', 'planned workouts table exists');
select has_table('public', 'planned_exercises', 'planned exercises table exists');
select has_table('public', 'workout_plan_overrides', 'workout overrides table exists');
select has_table('public', 'meal_plans', 'meal plans table exists');
select has_table('public', 'planned_meals', 'planned meals table exists');
select has_table('public', 'workout_sessions', 'workout sessions table exists');
select has_table('public', 'exercise_logs', 'exercise logs table exists');
select has_table('public', 'nutrition_logs', 'nutrition logs table exists');
select has_table('public', 'weight_entries', 'weight entries table exists');
select has_table('public', 'grocery_lists', 'grocery lists table exists');
select has_table('public', 'grocery_items', 'grocery items table exists');
select has_table('public', 'mutation_idempotency', 'idempotency table exists');
select has_table('public', 'progression_decisions', 'progression decisions table exists');

select is((select count(*)::int from public.exercises where is_system), 21, 'starter exercise count');
select is((select count(*)::int from public.foods where is_system), 22, 'starter food count');
select is((select count(*)::int from public.meals where is_system), 4, 'starter meal count');
select is((select count(*)::int from public.meal_ingredients), 14, 'starter meal ingredient count');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
), 24, 'every public application table has RLS enabled');

select is((select count(*)::int from pg_policies where schemaname = 'public'), 23, 'owner/catalog policies are present');

select is((
  select count(*)::int
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
), 0, 'client table writes are revoked');

select is((
  select count(*)::int
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'
), 5, 'anonymous catalog reads are granted');

select is((
  select count(*)::int
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT'
), 23, 'authenticated reads are granted');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.proname in (
      'complete_onboarding', 'update_profile', 'update_units', 'update_notification_preference', 'reset_plan',
      'skip_planned_meal', 'start_workout_session', 'save_workout_session',
      'finish_workout_session', 'abandon_workout_session', 'save_nutrition_log',
      'delete_nutrition_log', 'save_weight_entry', 'save_saved_meal', 'save_recipe',
      'toggle_grocery_item', 'set_grocery_quantity', 'remove_grocery_item',
      'add_custom_grocery_item', 'regenerate_grocery', 'export_account_data',
      'delete_account'
    )
), 22, 'authenticated RPC wrappers have execute grants');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname in (
      'complete_onboarding', 'update_profile', 'update_units', 'update_notification_preference', 'reset_plan',
      'skip_planned_meal', 'start_workout_session', 'save_workout_session',
      'finish_workout_session', 'abandon_workout_session', 'save_nutrition_log',
      'delete_nutrition_log', 'save_weight_entry', 'save_saved_meal', 'save_recipe',
      'toggle_grocery_item', 'set_grocery_quantity', 'remove_grocery_item',
      'add_custom_grocery_item', 'regenerate_grocery', 'export_account_data',
      'delete_account'
    )
), 0, 'anonymous users cannot execute mutation wrappers');

select * from finish();

rollback;
