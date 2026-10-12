-- Use the same exclusive recipe-row lock as the existing grouped logger; avoid shared-to-exclusive upgrades between simultaneous callers.
create or replace function private.save_reviewed_meal(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe public.meals; claim record; result jsonb; portion numeric; item jsonb;
begin
  select * into claim from private.claim_mutation(caller,'log_provided_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_reviewed_meal','replayed',true,'result_refs',claim.result_refs); end if;
  select * into recipe from public.meals where app_id=p_payload->'meal'->>'id' and (is_system or owner_user_id=caller) for update;
  if recipe.provided_nutrition is null then
    result:=private.save_reviewed_meal_before_provided_nutrition(p_payload);
    perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
    return result;
  end if;
  if jsonb_typeof(p_payload->'ingredients') is distinct from 'array' or jsonb_array_length(p_payload->'ingredients')<>1 then
    perform private.raise_mutation_error('validation_failed','Log provided recipe macros as a recipe portion');
  end if;
  item:=p_payload->'ingredients'->0;
  if jsonb_typeof(item->'servings') is distinct from 'number' then
    perform private.raise_mutation_error('validation_failed','Actual recipe servings are required');
  end if;
  portion:=(item->>'servings')::numeric;
  if portion<=0 or portion>10000 then perform private.raise_mutation_error('validation_failed','Invalid recipe portion'); end if;
  item:=jsonb_build_object('id',item->>'id','customName',recipe.name||' · provided recipe macros',
    'servings',portion,'servingGrams',1,'servingLabel','1 recipe serving','servingUnit','piece',
    'calories',recipe.provided_nutrition->'calories','proteinG',recipe.provided_nutrition->'proteinG',
    'carbsG',recipe.provided_nutrition->'carbsG','fatG',recipe.provided_nutrition->'fatG',
    'valueSource','user_provided','estimated',true,'confidence','medium','preparationBasis','as_labeled',
    'sourceVersion','recipe:'||recipe.app_id||':revision:'||recipe.revision,
    'assumptions','Source-provided recipe macros per serving; not recalculated from ingredients. Reference: '||coalesce(recipe.reference,'user provided'));
  result:=private.save_reviewed_meal_before_provided_nutrition(p_payload||jsonb_build_object('ingredients',jsonb_build_array(item)));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;
revoke all on function private.save_reviewed_meal(jsonb),private.save_reviewed_meal_before_provided_nutrition(jsonb) from public,anon,authenticated;


notify pgrst,'reload schema';
