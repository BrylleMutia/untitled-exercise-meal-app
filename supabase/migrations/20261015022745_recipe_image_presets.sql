-- Register three optional recipe cover presets. No recipe or historical row is rewritten.
alter table public.meals drop constraint meals_image_shape;
alter table public.meals add constraint meals_image_shape check (
  image is null or (jsonb_typeof(image)='object' and (
    (image->>'kind'='asset' and image->>'id' in ('creamy-lemon-chicken','korean-beef-bowl','breakfast-egg-salad','snack-sandwich','dinner-curry-omelette')) or
    (image->>'kind'='url' and jsonb_typeof(image->'url')='string' and char_length(image->>'url')<=2048 and image->>'url' ~ '^https://[^/@[:space:]]+([/?#]|$)') or
    (image->>'kind'='upload' and jsonb_typeof(image->'path')='string' and image->>'path' ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')
  )) is true
);

create or replace function private.save_saved_meal_without_complexity(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller_id uuid:=private.require_authenticated(); result jsonb;
  recipe jsonb:=p_payload->'meal'; total_minutes numeric; cover jsonb:=recipe->'image'; asset private.recipe_image_assets;
begin
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller_id);
  perform private.assert_saved_meal_access('save_saved_meal',p_payload,caller_id);
  if recipe ? 'reference' and char_length(coalesce(recipe->>'reference',''))>2000 then
    perform private.raise_mutation_error('validation_failed','Reference must be at most 2000 characters');
  end if;
  if recipe ? 'totalTimeMinutes' and recipe->'totalTimeMinutes'<>'null'::jsonb then
    if jsonb_typeof(recipe->'totalTimeMinutes')<>'number' then perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes or null'); end if;
    total_minutes:=(recipe->>'totalTimeMinutes')::numeric;
    if total_minutes<0 or total_minutes>2147483647 or trunc(total_minutes)<>total_minutes then
      perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes between 0 and 2147483647');
    end if;
  end if;
  if cover is not null and cover<>'null'::jsonb then
    if jsonb_typeof(cover)<>'object' or coalesce(cover->>'kind','') not in ('url','upload','asset') then
      perform private.raise_mutation_error('validation_failed','Invalid recipe image');
    end if;
    if cover->>'kind'='url' then
      if jsonb_typeof(cover->'url')<>'string' or char_length(cover->>'url')>2048
        or coalesce(cover->>'url','') !~ '^https://[^/@[:space:]]+([/?#]|$)' then
        perform private.raise_mutation_error('validation_failed','Use a complete HTTPS image URL without credentials');
      end if;
      cover:=jsonb_build_object('kind','url','url',cover->>'url');
    elsif cover->>'kind'='asset' then
      if coalesce(cover->>'id','') not in ('creamy-lemon-chicken','korean-beef-bowl','breakfast-egg-salad','snack-sandwich','dinner-curry-omelette') then
        perform private.raise_mutation_error('validation_failed','Unknown catalog image');
      end if;
      cover:=jsonb_build_object('kind','asset','id',cover->>'id');
    else
      perform pg_advisory_xact_lock(hashtextextended(caller_id::text,0));
      select * into asset from private.recipe_image_assets where path=cover->>'path' and user_id=caller_id for update;
      if not found or asset.state='removing' or not exists(select 1 from storage.objects o where o.bucket_id='recipe-covers' and o.name=asset.path) then
        perform private.raise_mutation_error('validation_failed','The uploaded image is unavailable; upload it again or select the default');
      end if;
      cover:=jsonb_build_object('kind','upload','path',asset.path);
    end if;
  end if;
  result:=private.save_saved_meal_unchecked(p_payload);
  if coalesce((result->>'replayed')::boolean,false) then return result; end if;
  if recipe ? 'reference' or recipe ? 'totalTimeMinutes' or recipe ? 'image' then
    update public.meals set
      reference=case when recipe ? 'reference' then nullif(btrim(recipe->>'reference'),'') else reference end,
      total_time_minutes=case when recipe ? 'totalTimeMinutes' then total_minutes::integer else total_time_minutes end,
      image=case when recipe ? 'image' then nullif(cover,'null'::jsonb) else image end
    where app_id=recipe->>'id' and owner_user_id=caller_id;
  end if;
  if cover->>'kind'='upload' then update private.recipe_image_assets set state='attached' where path=cover->>'path' and user_id=caller_id; end if;
  perform private.reconcile_grocery_items(caller_id,p_payload->'grocery');
  return result;
end;
$$;
revoke all on function private.save_saved_meal_without_complexity(jsonb) from public,anon,authenticated;

grant execute on function private.save_saved_meal_without_complexity(jsonb) to postgres;
