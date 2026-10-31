-- Nutrition mutations still use this read model for their grocery revision.
-- Ownership of shopping is expressed by the shared UI and guarded mutations,
-- not by discarding the revision required by existing plan-save contracts.
do $restore$
begin
 execute replace(pg_get_functiondef('private.before_shared_get_nutrition_week(date)'::regprocedure),'private.before_shared_get_nutrition_week(','public.get_nutrition_week(');
end;
$restore$;

create or replace function private.personal_plan_shared_grocery_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(new.user_id); day integer; week date; flag text;
begin
 if gid is not null and exists(select 1 from private.grocery_sharing where user_id=new.user_id and enabled) and private.grocery_sharing_active(new.user_id,gid) then
   select week_starts_on into day from public.cooking_groups where id=gid;
   week:=private.calendar_week(new.meal_date,day);
   flag:='app.personal_grocery_dirty_'||replace(new.user_id::text,'-','')||'_'||replace(week::text,'-','');
   if current_setting(flag,true)='done' then return null; end if;
   perform set_config(flag,'done',true);
   perform private.reconcile_cooking_grocery(gid,week);
 end if;
 return null;
end;
$$;
