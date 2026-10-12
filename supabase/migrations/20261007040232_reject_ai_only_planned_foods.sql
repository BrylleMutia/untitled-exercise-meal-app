-- An AI-only estimate can be recorded as uncertain intake, but a planned
-- prescription must use a catalog match or explicit user-corrected values.
create function private.reject_ai_only_planned_foods()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.food_row_id is not null and exists (
    select 1 from public.foods f
    where f.row_id = new.food_row_id and f.value_source = 'ai_estimate'
  ) then
    perform private.raise_mutation_error('validation_failed', 'correct AI-only values before planning');
  end if;
  if new.meal_row_id is not null and exists (
    select 1 from public.meal_ingredients i
    join public.foods f on f.row_id = i.food_row_id
    where i.meal_row_id = new.meal_row_id and f.value_source = 'ai_estimate'
  ) then
    perform private.raise_mutation_error('validation_failed', 'correct AI-only values before planning');
  end if;
  return new;
end;
$$;

create trigger planned_meals_reject_ai_only_foods
before insert or update of food_row_id, meal_row_id on public.planned_meals
for each row execute function private.reject_ai_only_planned_foods();

revoke all on function private.reject_ai_only_planned_foods() from public, anon, authenticated;
