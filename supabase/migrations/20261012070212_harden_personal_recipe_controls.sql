-- Keep concurrency checks explicit and replay the original intent before consulting mutable recipe metadata.
create or replace function private.lock_catalog_preference(p_catalog_id text,p_record_revision jsonb,p_preference_revision jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); catalog public.meals; current_revision integer;
begin
  perform private.assert_nonblank(p_catalog_id,'catalog mealId',128);
  for expected in 1..2 loop
    if jsonb_typeof(case when expected=1 then p_record_revision else p_preference_revision end) is distinct from 'number' then
      perform private.raise_mutation_error('validation_failed','Catalog versions are required');
    end if;
    if (case when expected=1 then p_record_revision else p_preference_revision end)::numeric not between 0 and 2147483647
      or trunc((case when expected=1 then p_record_revision else p_preference_revision end)::numeric)
        <> (case when expected=1 then p_record_revision else p_preference_revision end)::numeric then
      perform private.raise_mutation_error('validation_failed','Invalid catalog version');
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':'||p_catalog_id,0));
  select * into catalog from public.meals where app_id=p_catalog_id and is_system and archived_at is null for share;
  if not found then perform private.raise_mutation_error('not_found','Catalog recipe is unavailable'); end if;
  if catalog.revision<>(p_record_revision::text)::integer then
    perform private.raise_mutation_error('stale_version','The catalog recipe changed; reopen the editor');
  end if;
  select revision into current_revision from public.recipe_catalog_preferences
    where user_id=caller and catalog_meal_row_id=catalog.row_id for update;
  if coalesce(current_revision,0)<>(p_preference_revision::text)::integer then
    perform private.raise_mutation_error('stale_version','This recipe changed elsewhere; refresh and retry');
  end if;
  return catalog.row_id;
end;
$$;

create or replace function private.save_reviewed_meal(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe public.meals; claim record; result jsonb; portion numeric; item jsonb;
begin
  select * into claim from private.claim_mutation(caller,'log_provided_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_reviewed_meal','replayed',true,'result_refs',claim.result_refs); end if;
  select * into recipe from public.meals where app_id=p_payload->'meal'->>'id' and (is_system or owner_user_id=caller) for share;
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


revoke all on function private.lock_catalog_preference(text,jsonb,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
