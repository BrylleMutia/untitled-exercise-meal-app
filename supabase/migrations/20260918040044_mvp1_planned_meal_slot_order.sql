-- MVP-1 M1.2: planned meals need stable identity within a date/slot so an
-- edited plan can contain multiple snacks or repeated meal slots.

alter table public.planned_meals
  add column if not exists slot_key text,
  add column if not exists sort_order integer;

with numbered as (
  select row_id,
    row_number() over (
      partition by meal_plan_row_id, meal_date, meal_slot
      order by row_id
    )::integer as next_order
  from public.planned_meals
)
update public.planned_meals pm
set sort_order = numbered.next_order,
    slot_key = 'date:' || pm.meal_date::text || ':slot:' || pm.meal_slot || ':order:' || numbered.next_order::text
from numbered
where pm.row_id = numbered.row_id;

alter table public.planned_meals
  alter column sort_order set not null,
  alter column slot_key set not null;

alter table public.planned_meals
  drop constraint if exists planned_meals_slot_unique;

alter table public.planned_meals
  add constraint planned_meals_sort_order_check check (sort_order > 0),
  add constraint planned_meals_slot_key_check check (btrim(slot_key) <> '');

create unique index if not exists planned_meals_plan_slot_order_idx
  on public.planned_meals (meal_plan_row_id, meal_date, meal_slot, sort_order);

create unique index if not exists planned_meals_plan_slot_key_idx
  on public.planned_meals (meal_plan_row_id, slot_key);

drop index if exists planned_meals_user_date_idx;
create index planned_meals_user_date_idx
  on public.planned_meals (user_id, meal_date, meal_slot, sort_order);

create or replace function private.set_planned_meal_slot_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sort_order is null or new.sort_order < 1 then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order
    from public.planned_meals
    where meal_plan_row_id = new.meal_plan_row_id
      and user_id = new.user_id
      and meal_date = new.meal_date
      and meal_slot = new.meal_slot;
  end if;
  if nullif(btrim(new.slot_key), '') is null then
    new.slot_key := 'date:' || new.meal_date::text || ':slot:' || new.meal_slot || ':order:' || new.sort_order::text;
  end if;
  return new;
end;
$$;

drop trigger if exists planned_meals_set_slot_identity on public.planned_meals;
create trigger planned_meals_set_slot_identity
before insert or update of meal_date, meal_slot, sort_order, slot_key
on public.planned_meals
for each row execute function private.set_planned_meal_slot_identity();

revoke all on function private.set_planned_meal_slot_identity() from public, anon, authenticated;
