do $compat$
declare definition text;
begin
 select pg_get_functiondef('private.save_saved_meal(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'if not coalesce((result->>''replayed'')::boolean,false) then','if not coalesce((result->>''replayed'')::boolean,false) and (recipe ? ''cookingIngredients'' or recipe ? ''nutritionInput'') then');
 definition:=replace(definition,'for week in select distinct week_of from public.grocery_lists where user_id=caller and calendar_active loop','for week in select (p_payload->''grocery''->>''weekOf'')::date where recipe ? ''cookingIngredients'' and p_payload->''grocery''->>''weekOf'' is not null loop');
 execute definition;
 select pg_get_functiondef('private.before_shared_reconcile_cooking_grocery(uuid,date)'::regprocedure) into definition;
 execute replace(definition,'from totals group by id,name,category,unit','from totals group by case when id like ''gi-cook-%'' then ''cg-''||id else ''cg-''||md5(lower(name)||'':''||case when unit=''pcs'' then ''piece'' else ''g'' end) end,name,category,unit');
end; $compat$;
notify pgrst,'reload schema';
