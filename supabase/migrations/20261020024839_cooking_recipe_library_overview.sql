-- Read-only library provenance and current cooking totals; saved facts remain unchanged.
create function private.cooking_library_recipe_json(p_recipe public.meals) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb:=private.cooking_recipe_json(p_recipe); nutrition jsonb;
begin
  begin
    nutrition:=private.normalize_planned_meal_record(jsonb_build_object('mealId',p_recipe.app_id,'servings',1),coalesce(p_recipe.owner_user_id,auth.uid()));
  exception when sqlstate 'P0001' then nutrition:=null;
  end;
  return result || jsonb_build_object('ownerId',p_recipe.owner_user_id,'isSystem',p_recipe.is_system)
    || case when p_recipe.is_system then jsonb_build_object('canonicalDefaultId',p_recipe.app_id) else '{}'::jsonb end
    || case when nutrition->>'expectedCalories' is not null then jsonb_build_object('caloriesPerServing',(nutrition->>'expectedCalories')::numeric) else '{}'::jsonb end;
end;
$$;
revoke all on function private.cooking_library_recipe_json(public.meals) from public,anon,authenticated;

alter function public.get_cooking_group_week(date) set schema private;
alter function private.get_cooking_group_week(date) rename to get_cooking_group_week_before_overview;
revoke all on function private.get_cooking_group_week_before_overview(date) from public,anon,authenticated;

create function public.get_cooking_group_week(p_week_of date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); result jsonb; gid uuid; live jsonb; cooking jsonb;
begin
  result:=private.get_cooking_group_week_before_overview(p_week_of);
  gid:=(result->'group'->>'id')::uuid;
  -- Only the caller's retained copies are exposed, including copies from former groups.
  result:=result || jsonb_build_object('recipeOrigins',coalesce((
    select jsonb_agg(origin order by origin->>'snapshotId') from (
      select distinct jsonb_build_object('snapshotId',m.app_id,'recipeId',a.recipe_id)
        || case when source.is_system then jsonb_build_object('canonicalDefaultId',source.app_id) else '{}'::jsonb end origin
      from public.cooking_assignments a join public.meals m on m.row_id=a.recipe_snapshot_row_id
      left join public.meals source on source.app_id=a.recipe_id
      where a.user_id=caller and m.owner_user_id=caller
    ) origins),'[]'::jsonb));
  if gid is null then return result || jsonb_build_object('cooking','[]'::jsonb); end if;
  -- Recipes are a membership-authorized collection, not other members' private nutrition facts.
  result:=jsonb_set(result,'{recipes}',coalesce((select jsonb_agg(private.cooking_library_recipe_json(m) order by m.name,m.app_id)
    from public.meals m where m.archived_at is null and (m.is_system or m.owner_user_id in(select user_id from public.cooking_group_members where group_id=gid))
      and m.app_id not like 'group-copy-%'),'[]'::jsonb));
  live:=private.cooking_live_assignments(gid,p_week_of);
  with saved as (
    select a.recipe_id, m.revision, m.row_id, m.name, m.servings, m.image,
      entry->>'id' assignment_id, (entry->>'servings')::numeric portions,coalesce((entry->>'skipped')::boolean,false) skipped
    from jsonb_array_elements(live) entry
    join public.cooking_assignments a on a.group_id=gid and a.id=entry->>'id' and a.user_id=(entry->>'memberId')::uuid
    join public.meals m on m.row_id=a.recipe_snapshot_row_id
  ), totals as (
    select recipe_id,revision,min(row_id) snapshot_id,min(name) name,min(servings) yield,
      coalesce(sum(portions) filter(where not skipped),0) portions,jsonb_agg(assignment_id order by assignment_id) assignment_ids
    from saved group by recipe_id,revision
  )
  select coalesce(jsonb_agg(jsonb_build_object('recipeId',t.recipe_id,'recipeRevision',t.revision,'name',t.name,'yield',t.yield,
    'portions',t.portions,'batches',ceil(t.portions/t.yield),'leftovers',ceil(t.portions/t.yield)*t.yield-t.portions,'assignmentIds',t.assignment_ids)
    || jsonb_strip_nulls(jsonb_build_object('image',m.image,'caloriesPerServing',private.cooking_library_recipe_json(m)->'caloriesPerServing')) order by t.name,t.recipe_id,t.revision),'[]'::jsonb)
    into cooking from totals t join public.meals m on m.row_id=t.snapshot_id;
  return result || jsonb_build_object('cooking',cooking);
end;
$$;
revoke all on function public.get_cooking_group_week(date) from public,anon;
grant execute on function public.get_cooking_group_week(date) to authenticated;
