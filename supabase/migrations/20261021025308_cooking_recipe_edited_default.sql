-- Presentation provenance for recipes already exposed by the authorized shared library.
create or replace function private.cooking_library_recipe_json(p_recipe public.meals) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb:=private.cooking_recipe_json(p_recipe); nutrition jsonb;
begin
  begin
    nutrition:=private.normalize_planned_meal_record(jsonb_build_object('mealId',p_recipe.app_id,'servings',1),coalesce(p_recipe.owner_user_id,auth.uid()));
  exception when sqlstate 'P0001' then nutrition:=null;
  end;
  return result || jsonb_build_object('ownerId',p_recipe.owner_user_id,'isSystem',p_recipe.is_system,
    'isEditedDefault',not p_recipe.is_system and exists (
      select 1 from public.recipe_catalog_preferences preference
      join public.meals catalog on catalog.row_id=preference.catalog_meal_row_id and catalog.is_system
      where preference.replacement_meal_row_id=p_recipe.row_id and preference.user_id=p_recipe.owner_user_id
    ))
    || case when p_recipe.is_system then jsonb_build_object('canonicalDefaultId',p_recipe.app_id) else '{}'::jsonb end
    || case when nutrition->>'expectedCalories' is not null then jsonb_build_object('caloriesPerServing',(nutrition->>'expectedCalories')::numeric) else '{}'::jsonb end;
end;
$$;
revoke all on function private.cooking_library_recipe_json(public.meals) from public,anon,authenticated;
