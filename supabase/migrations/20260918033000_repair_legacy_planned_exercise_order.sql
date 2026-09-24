-- Added after the first remote MVP-1 push exposed legacy plans whose every
-- exercise had sort_order = 1. Run before the slot-key uniqueness migration.
-- Row IDs preserve insertion order; exercise rows and history links stay intact.

do $$
begin
  if exists (
    select 1
    from public.planned_exercises
    group by planned_workout_row_id, sort_order
    having count(*) > 1
       and not (
         sort_order = 1
         and (
           select count(distinct other.sort_order)
           from public.planned_exercises other
           where other.planned_workout_row_id = planned_exercises.planned_workout_row_id
         ) = 1
       )
  ) then
    raise exception 'unexpected duplicate planned exercise order; inspect before migration';
  end if;
end;
$$;

with legacy_workouts as (
  select planned_workout_row_id
  from public.planned_exercises
  group by planned_workout_row_id
  having count(*) > 1
     and count(distinct sort_order) = 1
     and min(sort_order) = 1
), ranked as (
  select pe.row_id,
         row_number() over (
           partition by pe.planned_workout_row_id order by pe.row_id
         )::integer as corrected_sort_order
  from public.planned_exercises pe
  join legacy_workouts lw on lw.planned_workout_row_id = pe.planned_workout_row_id
)
update public.planned_exercises pe
set sort_order = ranked.corrected_sort_order
from ranked
where pe.row_id = ranked.row_id
  and pe.sort_order is distinct from ranked.corrected_sort_order;
