-- Unknown recipe time stays null; duration belongs to the whole recipe.
alter table public.meals add column total_time_minutes integer;
alter table public.meals add constraint meals_total_time_minutes_nonnegative
  check (total_time_minutes is null or total_time_minutes >= 0);

create or replace function private.save_saved_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated();
  result jsonb;
  recipe jsonb := p_payload->'meal';
  total_minutes numeric;
begin
  perform private.assert_expected_versions('save_saved_meal', p_payload, caller_id);
  perform private.assert_saved_meal_access('save_saved_meal', p_payload, caller_id);
  if recipe ? 'reference' and char_length(coalesce(recipe->>'reference','')) > 2000 then
    perform private.raise_mutation_error('validation_failed', 'Reference must be at most 2000 characters');
  end if;
  if recipe ? 'totalTimeMinutes' and recipe->'totalTimeMinutes' <> 'null'::jsonb then
    if jsonb_typeof(recipe->'totalTimeMinutes') <> 'number' then
      perform private.raise_mutation_error('validation_failed', 'Recipe time must be whole minutes or null');
    end if;
    total_minutes := (recipe->>'totalTimeMinutes')::numeric;
    if total_minutes < 0 or total_minutes > 2147483647 or trunc(total_minutes) <> total_minutes then
      perform private.raise_mutation_error('validation_failed', 'Recipe time must be whole minutes between 0 and 2147483647');
    end if;
  end if;
  result := private.save_saved_meal_unchecked(p_payload);
  -- Omitted legacy fields preserve stored details; explicit null clears time.
  if recipe ? 'reference' or recipe ? 'totalTimeMinutes' then
    update public.meals set
      reference = case when recipe ? 'reference' then nullif(btrim(recipe->>'reference'), '') else reference end,
      total_time_minutes = case when recipe ? 'totalTimeMinutes' then total_minutes::integer else total_time_minutes end
    where app_id = recipe->>'id' and owner_user_id = caller_id;
  end if;
  perform private.reconcile_grocery_items(caller_id, p_payload->'grocery');
  return result;
end;
$$;

revoke all on function private.save_saved_meal(jsonb) from public, anon, authenticated;
revoke all on function public.save_saved_meal(jsonb), public.save_recipe(jsonb) from public, anon;
grant execute on function public.save_saved_meal(jsonb), public.save_recipe(jsonb) to authenticated;

notify pgrst, 'reload schema';
