WITH app_schemas AS (
  SELECT oid, nspname, nspowner, nspacl
  FROM pg_namespace
  WHERE nspname IN ('public', 'private')
),
items(kind, item) AS (
  SELECT 'schema', concat(nspname, '|owner=', pg_get_userbyid(nspowner))
  FROM app_schemas
  UNION ALL
  SELECT 'schema_grant', concat(s.nspname, '|', coalesce(r.rolname, 'PUBLIC'), '|', a.privilege_type, '|grantable=', a.is_grantable)
  FROM app_schemas s
  CROSS JOIN LATERAL aclexplode(coalesce(s.nspacl, acldefault('n', s.nspowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  UNION ALL
  SELECT 'relation', concat(n.nspname, '.', c.relname, '|kind=', c.relkind, '|owner=', pg_get_userbyid(c.relowner),
    '|rls=', c.relrowsecurity, '|force_rls=', c.relforcerowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'private') AND c.relkind IN ('r','p','v','m','S','f')
  UNION ALL
  SELECT 'column', concat(n.nspname, '.', c.relname, '.', a.attnum, '|', a.attname, '|',
    format_type(a.atttypid, a.atttypmod), '|not_null=', a.attnotnull, '|identity=', a.attidentity,
    '|generated=', a.attgenerated, '|default=', coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE n.nspname IN ('public','private') AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'constraint', concat(n.nspname, '.', c.relname, '.', con.conname, '|type=', con.contype,
    '|validated=', con.convalidated, '|deferrable=', con.condeferrable, '|initially_deferred=', con.condeferred,
    '|', pg_get_constraintdef(con.oid, true))
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','private')
  UNION ALL
  SELECT 'index', concat(schemaname, '.', tablename, '.', indexname, '|', indexdef)
  FROM pg_indexes WHERE schemaname IN ('public','private')
  UNION ALL
  SELECT 'policy', concat(schemaname, '.', tablename, '.', policyname, '|', permissive, '|', roles::text,
    '|', cmd, '|using=', coalesce(qual,''), '|check=', coalesce(with_check,''))
  FROM pg_policies WHERE schemaname IN ('public','private')
  UNION ALL
  SELECT 'trigger', concat(n.nspname, '.', c.relname, '.', t.tgname, '|enabled=', t.tgenabled,
    '|', pg_get_triggerdef(t.oid, true))
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','private') AND NOT t.tgisinternal
  UNION ALL
  SELECT 'routine', concat(n.nspname, '.', p.proname, '(', pg_get_function_identity_arguments(p.oid), ')',
    '|result=', pg_get_function_result(p.oid), '|language=', l.lanname, '|kind=', p.prokind,
    '|owner=', pg_get_userbyid(p.proowner), '|security_definer=', p.prosecdef, '|volatility=', p.provolatile,
    '|strict=', p.proisstrict, '|config=', coalesce(array_to_string(p.proconfig, ','), ''),
    '|definition=', regexp_replace(pg_get_functiondef(p.oid), E'\r\n?', E'\n', 'g'))
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')
  UNION ALL
  SELECT 'routine_grant', concat(n.nspname, '.', p.proname, '(', pg_get_function_identity_arguments(p.oid), ')',
    '|', coalesce(r.rolname, 'PUBLIC'), '|', a.privilege_type, '|grantable=', a.is_grantable)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')
  UNION ALL
  SELECT 'table_grant', concat(table_schema, '.', table_name, '|', grantee, '|', privilege_type, '|grantable=', is_grantable)
  FROM information_schema.table_privileges WHERE table_schema IN ('public','private')
  UNION ALL
  SELECT 'enum', concat(n.nspname, '.', t.typname, '|', string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder))
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  JOIN pg_enum e ON e.enumtypid=t.oid
  WHERE n.nspname IN ('public','private')
  GROUP BY n.nspname, t.typname
  UNION ALL
  SELECT 'view', concat(schemaname, '.', viewname, '|', definition)
  FROM pg_views WHERE schemaname IN ('public','private')
),
digests AS (
  SELECT kind, count(*) AS object_count, md5(string_agg(item, E'\\n' ORDER BY item)) AS digest
  FROM items GROUP BY kind
)
SELECT kind, object_count, digest FROM digests ORDER BY kind;
