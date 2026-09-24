begin;

select plan(23);

select is((
  select count(*)::int
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee = 'anon'
    and privilege_type = 'SELECT'
), 5, 'anon has SELECT only on the five public catalog tables/read models');

select is((
  select count(*)::int
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee = 'authenticated'
    and privilege_type = 'SELECT'
), 23, 'authenticated has SELECT on all public read models');

select is((
  select count(*)::int
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
), 0, 'client roles have no direct public table write or trigger privileges');

select is((
  select count(*)::int
  from information_schema.role_usage_grants
  where object_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and object_type = 'SEQUENCE'
), 0, 'client roles have no public sequence privileges');

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'private schema usage is denied to both client roles'
);

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
), 24, 'RLS is enabled on every public table');

select is((select count(*)::int from pg_policies where schemaname = 'public'), 23,
  'the expected catalog and durable read policies exist');

select is((
  select count(*)::int
  from pg_policies
  where schemaname = 'public' and cmd <> 'SELECT'
), 0, 'no client INSERT, UPDATE, or DELETE policies exist');

select is((
  select count(*)::int
  from pg_policies
  where schemaname = 'public'
    and policyname not in (
      'public can read system exercises',
      'users can read system or owned foods',
      'users can read system or owned meals',
      'users can read ingredients for visible meals and foods',
      'users can read serving options for visible foods',
      'users can read their profile',
      'users can read their goals',
      'users can read their daily targets',
      'users can read their workout plans',
      'users can read their planned workouts',
      'users can read their planned exercises',
      'users can read their plan overrides',
      'users can read their meal plans',
      'users can read their planned meals',
      'users can read their workout sessions',
      'users can read their exercise logs',
      'users can read their nutrition logs',
      'users can read their weight entries',
      'users can read their grocery lists',
      'users can read their grocery items',
      'users can read their mutation records',
      'users can read their progression decisions'
      ,'users can read their logged meals'
    )
), 0, 'policy names remain explicit and reviewable');

select ok((
  select count(*) = 18
  from pg_policies
  where schemaname = 'public'
    and policyname like 'users can read their%'
    and 'authenticated' = any(roles)
    and qual::text like '%auth.uid%'
), 'all durable read policies are authenticated owner policies');

select ok((
  select count(*) = 4
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'public can read system exercises',
      'users can read system or owned foods',
      'users can read system or owned meals',
      'users can read ingredients for visible meals and foods'
    )
    and 'anon' = any(roles)
    and 'authenticated' = any(roles)
), 'catalog policies explicitly support anonymous and authenticated reads');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proargtypes::oidvector = '3802'::oidvector
    and p.prorettype = '3802'::oid
), 33, 'the public API exposes the 33 jsonb mutation wrappers');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proargtypes::oidvector = '3802'::oidvector
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 33, 'authenticated execution is granted for every current wrapper');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proargtypes::oidvector = '3802'::oidvector
    and has_function_privilege('anon', p.oid, 'EXECUTE')
), 0, 'anonymous execution is denied for all mutation wrappers');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
), 34, 'only the deliberate public mutation wrappers are SECURITY DEFINER');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proargtypes::oidvector = '3802'::oidvector
    and p.proconfig @> ARRAY['search_path=""']::text[]
), 33, 'public wrappers use a controlled empty search_path');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
), 0, 'private implementations are not executable by anonymous users');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 0, 'private implementations are not executable by authenticated users');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proargtypes::oidvector = '3802'::oidvector
    and (
      pg_get_functiondef(p.oid) ilike '%insert into%'
      or pg_get_functiondef(p.oid) ilike '%update public.%'
      or pg_get_functiondef(p.oid) ilike '%delete from%'
    )
), 0, 'public wrappers delegate instead of containing table mutation logic');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proargtypes::oidvector = '3802'::oidvector
    and pg_get_functiondef(p.oid) not ilike '%user_metadata%'
), 33, 'authorization does not rely on editable user metadata');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proargtypes::oidvector = '3802'::oidvector
    and exists (
      select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    )
), 0, 'PUBLIC has no implicit execute privilege on exposed mutation wrappers');

select ok((
  select count(*) = 23
  from pg_policies
  where schemaname = 'public'
    and (with_check is null)
), 'current read-only policies do not expose client write checks');

select ok((
  has_function_privilege('anon', 'private.request_hash(jsonb)', 'EXECUTE') = false
  and has_function_privilege('authenticated', 'private.claim_mutation(uuid,text,text,jsonb)', 'EXECUTE') = false
), 'idempotency helpers remain private and require an authorized wrapper');

select * from finish();

rollback;
