-- Keep progression bounded by the exercise catalog, not by client payloads.

alter table public.exercises
  add column if not exists progression_bounds jsonb;

update public.exercises
set progression_bounds = jsonb_build_object(
  'minSets', 1,
  'maxSets', case when difficulty >= 4 then 4 else 5 end,
  'setStep', 1,
  'minReps', 1,
  'maxReps', case when difficulty >= 4 then 15 else 20 end,
  'repStep', case when difficulty >= 4 then 1 else 2 end,
  'minHoldSeconds', 5,
  'maxHoldSeconds', case when measure = 'hold' and difficulty >= 4 then 60 when measure = 'hold' then 120 else 90 end,
  'holdStep', case when difficulty >= 4 then 5 else 10 end
)
where progression_bounds is null;

alter table public.exercises
  alter column progression_bounds set not null;

create or replace function private.validate_planned_exercise_bounds()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bounds jsonb;
begin
  select progression_bounds into bounds from public.exercises where row_id = new.exercise_row_id;
  if bounds is null then raise exception using errcode = '23503', message = 'exercise catalog bounds not found'; end if;
  if new.sets < (bounds->>'minSets')::integer or new.sets > (bounds->>'maxSets')::integer then
    raise exception using errcode = '22023', message = 'sets exceed the exercise catalog bounds';
  end if;
  if new.measure_snapshot = 'reps' and (new.reps < (bounds->>'minReps')::integer or new.reps > (bounds->>'maxReps')::integer) then
    raise exception using errcode = '22023', message = 'reps exceed the exercise catalog bounds';
  end if;
  if new.measure_snapshot = 'hold' and (new.hold_seconds < (bounds->>'minHoldSeconds')::integer or new.hold_seconds > (bounds->>'maxHoldSeconds')::integer) then
    raise exception using errcode = '22023', message = 'hold duration exceeds the exercise catalog bounds';
  end if;
  return new;
end;
$$;

drop trigger if exists planned_exercises_validate_bounds on public.planned_exercises;
create trigger planned_exercises_validate_bounds
before insert or update of exercise_row_id, measure_snapshot, sets, reps, hold_seconds
on public.planned_exercises
for each row execute function private.validate_planned_exercise_bounds();

revoke all on function private.validate_planned_exercise_bounds() from public, anon, authenticated;
