begin;

select plan(42);

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
select has_table('public', 'logged_meals', 'logged meals table exists');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
), 24, 'the public application schema contains exactly 24 tables');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
), 24, 'every public application table has RLS enabled');

select ok((
  select count(*) = 10
  from (values
    ('profiles', 'id', 'uuid', 'NO'),
    ('profiles', 'created_at', 'timestamp with time zone', 'NO'),
    ('goals', 'effective_date', 'date', 'NO'),
    ('daily_targets', 'effective_date', 'date', 'NO'),
    ('workout_sessions', 'started_at', 'timestamp with time zone', 'NO'),
    ('nutrition_logs', 'log_date', 'date', 'NO'),
    ('grocery_lists', 'week_of', 'date', 'NO'),
    ('exercises', 'row_id', 'bigint', 'NO'),
    ('foods', 'row_id', 'bigint', 'NO'),
    ('mutation_idempotency', 'result_refs', 'jsonb', 'NO')
  ) as expected(table_name, column_name, data_type, nullable)
  join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = expected.table_name
   and c.column_name = expected.column_name
   and c.data_type = expected.data_type
   and c.is_nullable = expected.nullable
), 'required date, timestamp, identity, and JSON columns use the expected types');

select ok((
  select count(*) = 18
  from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'app_id'
    and c.is_nullable = 'NO'
), 'application-facing app_id columns are present and non-null');

select ok((
  select count(*) = 22
  from information_schema.columns c
  join pg_class t on t.relname = c.table_name
  join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = t.oid and a.attname = c.column_name
  where c.table_schema = 'public'
    and c.column_name = 'row_id'
    and a.attidentity = 'a'
), 'all internal row_id columns are identity-backed');

select ok((
  select count(*) = 16
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join unnest(c.conkey) as key(attnum) on true
  join pg_attribute a on a.attrelid = t.oid and a.attnum = key.attnum
  where n.nspname = 'public'
    and c.contype = 'c'
    and c.conname like '%app_id%'
    and a.attname = 'app_id'
), 'non-blank app_id constraints cover every application ID column');

select ok((
  select count(*) >= 12
  from pg_trigger tr
  join pg_class c on c.oid = tr.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not tr.tgisinternal
    and tr.tgname like '%set_updated_at'
), 'durable rows with updated_at have maintenance triggers');

select is((
  with foreign_keys as (
    select conrelid, conkey
    from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace
  )
  select count(*)::int
  from foreign_keys fk
  where not exists (
    select 1
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_am am on am.oid = ic.relam and am.amname = 'btree'
    where i.indrelid = fk.conrelid
      and i.indisvalid
      and (
        select array_agg(k.attnum::smallint order by k.ordinality)
        from unnest(i.indkey::smallint[]) with ordinality as k(attnum, ordinality)
        where k.ordinality <= cardinality(fk.conkey)
      ) = fk.conkey
  )
), 0, 'every public foreign key has a leftmost B-tree index');

select is((select count(*)::int from public.exercises where is_system), 21, 'starter exercise count');
select is((select count(*)::int from public.foods where is_system), 22, 'starter food count');
select is((select count(*)::int from public.meals where is_system), 4, 'starter meal count');
select is((select count(*)::int from public.meal_ingredients), 14, 'starter meal ingredient count');

select ok((
  exists (select 1 from public.exercises where app_id = 'ex-knee-push-up' and slug = 'knee-push-up')
  and exists (select 1 from public.foods where app_id = 'food-egg'
    and source = 'Starter Food Catalog' and source_version = '2026.09' and estimated)
), 'authored exercise ID, food ID, source, version, and estimate metadata remain intact');

select ok((
  not exists (select 1 from public.exercises where not is_system)
  and not exists (select 1 from public.exercises where is_system is distinct from true)
  and not exists (select 1 from public.foods where is_system and owner_user_id is not null)
  and not exists (select 1 from public.meals where is_system and owner_user_id is not null)
), 'system catalog rows have no owner and exercises cannot become user-owned');

select ok((
  not exists (select 1 from public.foods where not is_system and owner_user_id is null)
  and not exists (select 1 from public.meals where not is_system and owner_user_id is null)
), 'custom food and meal rows require an owner');

select ok((
  has_schema_privilege('anon', 'private', 'USAGE') = false
  and has_schema_privilege('authenticated', 'private', 'USAGE') = false
  and has_function_privilege('authenticated', 'private.set_updated_at()', 'EXECUTE') = false
), 'private helpers are not usable or executable by client roles');

select ok((
  has_table_privilege('anon', 'public.profiles', 'SELECT') = false
  and has_table_privilege('authenticated', 'public.profiles', 'INSERT') = false
  and has_table_privilege('authenticated', 'public.profiles', 'UPDATE') = false
  and has_table_privilege('authenticated', 'public.profiles', 'DELETE') = false
), 'durable table privileges are not granted to client roles');

select ok((
  has_table_privilege('anon', 'public.exercises', 'SELECT')
  and has_table_privilege('anon', 'public.foods', 'SELECT')
  and has_table_privilege('anon', 'public.meals', 'SELECT')
  and has_table_privilege('anon', 'public.meal_ingredients', 'SELECT')
), 'anonymous catalog SELECT grants are explicit');

select ok((
  (select count(*) from pg_default_acl d
   join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'r'
     and d.defaclacl::text like '%anon%INSERT%') = 0
), 'default table privileges do not silently grant future client writes');

select * from finish();

rollback;
