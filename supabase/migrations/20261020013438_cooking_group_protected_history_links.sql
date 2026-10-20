-- Correcting an actual entry's date or slot never makes its planned basis replaceable.
do $patch$
declare definition text; needle text; replacement text;
begin
 definition:=pg_get_functiondef('public.get_group_planning_context(uuid,jsonb)'::regprocedure);
 needle:='exists(select 1 from public.nutrition_logs l where l.user_id=profile.id and l.log_date=pm.meal_date and l.meal_slot=pm.meal_slot)';
 replacement:='(exists(select 1 from public.nutrition_logs l where l.user_id=profile.id and (l.planned_meal_app_id=pm.app_id or (l.log_date=pm.meal_date and l.meal_slot=pm.meal_slot))) or exists(select 1 from public.logged_meals l where l.user_id=profile.id and l.planned_meal_app_id=pm.app_id))';
 if strpos(definition,needle)=0 then raise exception 'Unexpected group planning context; inspect before changing history protection'; end if;
 execute replace(definition,needle,replacement);
 definition:=pg_get_functiondef('private.validate_cooking_preview(private.cooking_previews)'::regprocedure);
 needle:='exists(select 1 from public.nutrition_logs where user_id=member and log_date=existing.meal_date and meal_slot=existing.meal_slot)';
 replacement:='(exists(select 1 from public.nutrition_logs where user_id=member and (planned_meal_app_id=existing.app_id or (log_date=existing.meal_date and meal_slot=existing.meal_slot))) or exists(select 1 from public.logged_meals where user_id=member and planned_meal_app_id=existing.app_id))';
 if strpos(definition,needle)=0 then raise exception 'Unexpected group commit validation; inspect before changing history protection'; end if;
 execute replace(definition,needle,replacement);
end;
$patch$;
revoke all on function private.validate_cooking_preview(private.cooking_previews) from public,anon,authenticated;
revoke all on function public.get_group_planning_context(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_group_planning_context(uuid,jsonb) to service_role;
