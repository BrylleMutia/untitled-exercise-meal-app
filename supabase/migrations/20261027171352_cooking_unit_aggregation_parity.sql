do $units$
declare definition text;
begin
 select pg_get_functiondef('private.conversion_unit(text)'::regprocedure) into definition;
 execute replace(definition,'when ''pieces'' then ''piece''','when ''pieces'' then ''piece'' when ''pc'' then ''piece'' when ''pcs'' then ''piece''');
 select pg_get_functiondef('private.before_shared_reconcile_personal_cooking_grocery(uuid,date)'::regprocedure) into definition;
 definition:=replace(definition,'select row_id,id,name,category,unit,case','select row_id,id,min(name) name,category,unit,case');
 execute replace(definition,'group by row_id,id,name,category,unit','group by row_id,id,category,unit');
 select pg_get_functiondef('private.before_shared_reconcile_cooking_grocery(uuid,date)'::regprocedure) into definition;
 definition:=replace(definition,' end id,name,category,unit,case',' end id,min(name) name,category,unit,case');
 execute replace(definition,' end,name,category,unit',' end,category,unit');
end; $units$;
notify pgrst,'reload schema';

do $warnings$
declare definition text; original text;
begin
 select pg_get_functiondef('private.recipe_preference_warnings(public.meals,public.profiles)'::regprocedure) into definition;
 original:='union all select i->>''name'',''Other'' from jsonb_array_elements(coalesce(p_recipe.unmeasured_ingredients,''[]'')) i';
 if position(original in definition)=0 then raise exception 'Recipe warning baseline differs'; end if;
 execute replace(definition,original,original||' union all select i->''cookingMeasurement''->>''name'',''Other'' from jsonb_array_elements(coalesce(p_recipe.cooking_ingredients,''[]'')) i');
end; $warnings$;
