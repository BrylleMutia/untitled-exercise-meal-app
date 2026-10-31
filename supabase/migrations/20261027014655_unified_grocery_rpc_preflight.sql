-- Keep the established idempotency/version/calendar preflight for existing RPCs.
do $guards$
declare name text;
begin
 foreach name in array array['toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery'] loop
   execute format('create or replace function public.%I(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='''' as $body$ declare replay jsonb; begin perform private.assert_personal_grocery_writable(); replay:=private.preflight_mutation(%L,p_payload); if replay is not null then return replay; end if; return private.%I(p_payload); end; $body$;',name,name,name);
 end loop;
 execute replace(pg_get_functiondef('public.share_cooking_groceries(jsonb)'::regprocedure),'public.share_cooking_groceries(','private.share_cooking_groceries(');
end;
$guards$;
create or replace function public.share_cooking_groceries(p_payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.share_cooking_groceries(p_payload); $$;
revoke all on function private.share_cooking_groceries(jsonb) from public,anon,authenticated;
