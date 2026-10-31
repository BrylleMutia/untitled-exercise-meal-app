do $consistency$
declare definition text; addition text;
begin
 select pg_get_functiondef('private.validate_recipe_cooking(jsonb,uuid)'::regprocedure) into definition;
 addition:=$body$
 if macros is null and p_recipe ? 'cookingIngredients' and
  (select jsonb_agg(jsonb_build_array(i->>'foodId',(i->>'nutritionServings')::numeric) order by i->>'foodId',(i->>'nutritionServings')::numeric) from jsonb_array_elements(p_recipe->'cookingIngredients') i)
  is distinct from (select jsonb_agg(jsonb_build_array(i->>'foodId',(i->>'servings')::numeric) order by i->>'foodId',(i->>'servings')::numeric) from jsonb_array_elements(p_recipe->'ingredients') i) then
  perform private.raise_mutation_error('validation_failed','Cooking rows and calculated nutrition ingredients must agree');
 end if;
 if input ? 'values' then
  if jsonb_typeof(input->'values') is distinct from 'object' or exists(select 1 from jsonb_object_keys(input->'values') k where k not in ('calories','proteinG','carbsG','fatG')) then perform private.raise_mutation_error('validation_failed','Invalid source macro values'); end if;
  foreach key in array array['calories','proteinG','carbsG','fatG'] loop
   if jsonb_typeof(input->'values'->key) is distinct from 'number' then perform private.raise_mutation_error('validation_failed','Enter all four source macro values'); end if;
   perform private.assert_finite_number(input->'values'->>key,'Source macro',0,100000000);
  end loop;
 end if;
$body$;
 if position(' if input is not null then' in definition)=0 then raise exception 'Cooking validation baseline differs'; end if;
 execute replace(definition,' if input is not null then',addition||' if input is not null then');
end; $consistency$;
notify pgrst,'reload schema';
