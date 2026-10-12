-- Recipe authoring is distinct from implicit saved meals created while logging.
alter table public.meals add column reference text;
update public.meals set reference = source_url where source_url is not null;
alter table public.meals add constraint meals_reference_length check (reference is null or char_length(reference) <= 2000);

create or replace function private.save_saved_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); result jsonb;
begin
  perform private.assert_expected_versions('save_saved_meal', p_payload, caller_id);
  perform private.assert_saved_meal_access('save_saved_meal', p_payload, caller_id);
  if p_payload->'meal' ? 'reference' and char_length(coalesce(p_payload->'meal'->>'reference','')) > 2000 then
    perform private.raise_mutation_error('validation_failed', 'Reference must be at most 2000 characters');
  end if;
  result := private.save_saved_meal_unchecked(p_payload);
  if p_payload->'meal' ? 'reference' then
    update public.meals set reference = nullif(btrim(p_payload->'meal'->>'reference'), '')
    where app_id = p_payload->'meal'->>'id' and owner_user_id = caller_id;
  end if;
  perform private.reconcile_grocery_items(caller_id, p_payload->'grocery');
  return result;
end;
$$;

create or replace function private.save_authored_recipe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated(); claim record;
  food jsonb; recipe jsonb := p_payload->'meal'; child_result jsonb; result jsonb;
begin
  select * into claim from private.claim_mutation(caller_id,'save_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then
    return jsonb_build_object('status','completed','operation','save_recipe','replayed',true,'result_refs',claim.result_refs);
  end if;
  perform private.validate_mutation_payload('save_recipe',p_payload);
  perform private.assert_nonblank(recipe->>'notes','Instructions',10000);
  if recipe ? 'reference' and jsonb_typeof(recipe->'reference') not in ('string','null') then
    perform private.raise_mutation_error('validation_failed','Reference must be text');
  end if;
  perform private.assert_json_shape(coalesce(p_payload->'newFoods','[]'::jsonb),'newFoods','array');
  if jsonb_array_length(coalesce(p_payload->'newFoods','[]'::jsonb)) > 100 then
    perform private.raise_mutation_error('validation_failed','Too many new ingredients');
  end if;
  if jsonb_array_length(recipe->'ingredients') > 100 then
    perform private.raise_mutation_error('validation_failed','A recipe supports at most 100 ingredients');
  end if;
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller_id);
  for food in select value from jsonb_array_elements(coalesce(p_payload->'newFoods','[]'::jsonb)) loop
    perform private.validate_mutation_payload('save_food',jsonb_build_object('food',food));
    if coalesce(food->>'valueSource','') not in ('trusted_catalog','user_provided') then
      perform private.raise_mutation_error('validation_failed','Recipe nutrition requires trusted or user-provided values');
    end if;
    if not exists (select 1 from jsonb_array_elements(recipe->'ingredients') i where i->>'foodId'=food->>'id') then
      perform private.raise_mutation_error('validation_failed','New food must be a recipe ingredient');
    end if;
    if exists (select 1 from public.foods where app_id=food->>'id') then
      perform private.raise_mutation_error('conflict','New ingredient id already exists');
    end if;
    perform private.save_food(jsonb_build_object('food',food,'idempotencyKey',(p_payload->>'idempotencyKey') || ':food:' || (food->>'id')));
  end loop;
  if exists (
    select 1 from jsonb_array_elements(recipe->'ingredients') i
    join public.foods f on f.app_id=i->>'foodId'
    where f.value_source='ai_estimate'
  ) then perform private.raise_mutation_error('validation_failed','Recipe nutrition requires trusted or user-provided values'); end if;
  child_result := private.save_saved_meal((p_payload - 'newFoods') || jsonb_build_object('idempotencyKey',(p_payload->>'idempotencyKey') || ':meal'));
  result := jsonb_build_object('status','completed','operation','save_recipe','result_refs',child_result->'result_refs');
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$$;

create or replace function public.save_recipe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return private.save_authored_recipe(p_payload); end;
$$;
revoke all on function private.save_saved_meal(jsonb) from public,anon,authenticated;
revoke all on function private.save_authored_recipe(jsonb) from public,anon,authenticated;
revoke all on function public.save_recipe(jsonb) from public,anon;
grant execute on function public.save_recipe(jsonb) to authenticated;
