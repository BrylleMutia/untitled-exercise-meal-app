do $fix$
declare definition text;
begin
 select pg_get_functiondef('private.before_shared_reconcile_cooking_grocery(uuid,date)'::regprocedure) into definition;
 execute replace(definition,'private.recipe_cooking_grocery(m,ceil(p.portions/m.servings),p.recipe_id)','private.recipe_cooking_grocery((select recipe from public.meals recipe where recipe.row_id=m.row_id),ceil(p.portions/m.servings),p.recipe_id)');
 select pg_get_functiondef('private.valid_cooking_ingredients(jsonb)'::regprocedure) into definition;
 execute replace(definition,'ids text[]:=''{}'';','ids text[]:=''{}''::text[];');
end; $fix$;
notify pgrst,'reload schema';
