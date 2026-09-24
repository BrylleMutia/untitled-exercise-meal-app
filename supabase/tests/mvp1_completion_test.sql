begin;

select plan(23);

select has_column('public', 'foods', 'fdc_id', 'foods retain provider record IDs');
select has_column('public', 'foods', 'nutrients_per_100g', 'foods retain canonical per-100g nutrients');
select has_column('public', 'foods', 'serving_options', 'foods retain explicit serving options');
select has_table('public', 'food_serving_options', 'provider serving conversions have a normalized table');
select has_table('public', 'nutrition_provider_rate_limits', 'provider calls have durable per-user quota state');
select has_column('public', 'exercises', 'progression_bounds', 'exercises retain catalog progression bounds');
select has_column('public', 'profiles', 'notifications_enabled', 'profiles retain the MVP-1 notification preference');
select has_function('public', 'save_food', ARRAY['jsonb'], 'owned food import uses a public RPC');
select has_function('public', 'update_nutrition_log', ARRAY['jsonb'], 'nutrition correction uses a public RPC');
select has_function('public', 'update_notification_preference', ARRAY['jsonb'], 'notification preference uses an authorized RPC');
select has_function('public', 'consume_nutrition_provider_quota', ARRAY['text'], 'provider quotas use an authenticated RPC');
select has_function('private', 'reconcile_grocery_items', ARRAY['uuid', 'jsonb'], 'generated grocery reconciliation is private');
select has_function('private', 'normalize_planned_meal_record', ARRAY['jsonb', 'uuid'], 'planned meal metadata is normalized server-side');
select has_function('private', 'validate_planned_exercise_bounds', ARRAY[]::text[], 'planned exercise bounds are enforced by a trigger helper');
select ok(has_function_privilege('authenticated', 'public.save_food(jsonb)', 'EXECUTE'), 'authenticated users can import owned foods');
select ok(has_function_privilege('authenticated', 'public.update_nutrition_log(jsonb)', 'EXECUTE'), 'authenticated users can correct nutrition');
select ok(not has_function_privilege('anon', 'public.save_food(jsonb)', 'EXECUTE'), 'anonymous users cannot import foods');
select ok(not has_function_privilege('anon', 'public.update_nutrition_log(jsonb)', 'EXECUTE'), 'anonymous users cannot correct nutrition');
select ok(has_function_privilege('authenticated', 'public.update_notification_preference(jsonb)', 'EXECUTE'), 'authenticated users can update notification preference');
select ok(not has_function_privilege('anon', 'public.update_notification_preference(jsonb)', 'EXECUTE'), 'anonymous users cannot update notification preference');
select ok(has_function_privilege('authenticated', 'public.consume_nutrition_provider_quota(text)', 'EXECUTE'), 'authenticated users can consume provider quota');
select ok(not has_function_privilege('anon', 'public.consume_nutrition_provider_quota(text)', 'EXECUTE'), 'anonymous users cannot consume provider quota');
select ok((select count(*) from pg_trigger where tgname = 'planned_exercises_validate_bounds') = 1, 'catalog bounds trigger is installed');

select * from finish();
rollback;
