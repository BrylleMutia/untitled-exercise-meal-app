-- Transferred source headers remain immutable historical identities after leave.
-- Active personal lists must be able to reuse a calendar week and public app ID.
alter table public.grocery_lists drop constraint grocery_lists_user_week_unique;
alter table public.grocery_lists drop constraint grocery_lists_user_app_unique;
create unique index grocery_lists_active_week_unique on public.grocery_lists(user_id,week_of) where calendar_active;
create unique index grocery_lists_active_app_unique on public.grocery_lists(user_id,app_id) where calendar_active;
do $upserts$
declare item record; definition text;
begin
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('persist_profile_bundle','set_grocery_total_amount','regroup_calendar') loop
   definition:=pg_get_functiondef(item.oid);
   definition:=regexp_replace(definition,'on conflict\s*\(user_id,\s*week_of\)','on conflict (user_id,week_of) where calendar_active','gi');
   execute definition;
 end loop;
end;
$upserts$;
