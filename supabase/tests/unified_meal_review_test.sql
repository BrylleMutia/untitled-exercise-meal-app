begin;

select plan(25);

select has_table('public', 'logged_meals', 'grouped meal history has a durable parent table');
select has_column('public', 'foods', 'value_source', 'foods retain nutrition value provenance');
select has_column('public', 'foods', 'estimate_range', 'foods retain optional estimate ranges');
select has_column('public', 'nutrition_logs', 'value_source', 'nutrition logs retain nutrition value provenance');
select has_column('public', 'nutrition_logs', 'estimate_range', 'nutrition logs retain optional estimate ranges');
select has_column('public', 'nutrition_logs', 'logged_meal_row_id', 'nutrition logs link to grouped meal history');
select has_column('public', 'nutrition_logs', 'ingredient_order', 'grouped nutrition entries retain ingredient order');
select has_function('public', 'save_reviewed_meal', ARRAY['jsonb'], 'reviewed meals use an authorized atomic save RPC');
select has_function('public', 'update_logged_meal', ARRAY['jsonb'], 'grouped meal corrections use an authorized RPC');
select has_function('public', 'delete_logged_meal', ARRAY['jsonb'], 'grouped meal deletion uses an authorized RPC');
select has_function('private', 'is_valid_estimate_range', ARRAY['jsonb'], 'estimate ranges have one shared validator');
select has_index('public', 'logged_meals', 'logged_meals_user_date_slot_idx', 'grouped history has an owner/date lookup index');
select has_index('public', 'nutrition_logs', 'nutrition_logs_logged_meal_order_idx', 'grouped ingredients have an ordering index');
select ok(has_function_privilege('authenticated', 'public.save_reviewed_meal(jsonb)', 'EXECUTE'), 'authenticated users can save reviewed meals');
select ok(not has_function_privilege('anon', 'public.save_reviewed_meal(jsonb)', 'EXECUTE'), 'anonymous users cannot save reviewed meals');
select ok(has_function_privilege('authenticated', 'public.update_logged_meal(jsonb)', 'EXECUTE'), 'authenticated users can update grouped meals');
select ok(not has_function_privilege('anon', 'public.update_logged_meal(jsonb)', 'EXECUTE'), 'anonymous users cannot update grouped meals');
select ok(has_function_privilege('authenticated', 'public.delete_logged_meal(jsonb)', 'EXECUTE'), 'authenticated users can delete grouped meals');
select ok(not has_function_privilege('anon', 'public.delete_logged_meal(jsonb)', 'EXECUTE'), 'anonymous users cannot delete grouped meals');
select ok((select count(*) from pg_constraint where conname = 'foods_value_source_check') = 1, 'foods enforce the supported provenance values');
select ok((select count(*) from pg_constraint where conname = 'nutrition_logs_ai_estimate_contract_check') = 1, 'nutrition logs enforce the AI estimate contract');
select ok((select relrowsecurity from pg_class where oid = 'public.logged_meals'::regclass), 'grouped history has row-level security enabled');
select ok(not has_table_privilege('authenticated', 'public.logged_meals', 'INSERT'), 'grouped history has no direct authenticated inserts');
select ok(not has_table_privilege('authenticated', 'public.logged_meals', 'UPDATE'), 'grouped history has no direct authenticated updates');
select ok(not has_table_privilege('authenticated', 'public.logged_meals', 'DELETE'), 'grouped history has no direct authenticated deletes');

select * from finish();
rollback;
