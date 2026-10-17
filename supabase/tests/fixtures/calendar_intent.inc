alter table public.profiles alter column week_starts_on set default 1;
-- Legacy contract scenarios explicitly use Monday. The calendar suite tests Sunday defaults
-- and raw outdated-client denial without this fixture adapter.
create function pg_temp.calendar_intent(payload jsonb) returns jsonb language plpgsql as $fixture$
declare result jsonb:=payload;
begin
  result:=result||jsonb_build_object('calendarRevision',coalesce((select calendar_revision from public.profiles where id=auth.uid()),1));
  if result ? 'profile' and not (result->'profile' ? 'weekStartsOn') then
    result:=jsonb_set(result,'{profile,weekStartsOn}',to_jsonb(coalesce((select week_starts_on from public.profiles where id=auth.uid()),1)));
  end if;
  if result ? 'assignments' and not (result ? 'selectedDates') and result->>'weekOf' ~ '^\d{4}-\d{2}-\d{2}$' then
    result:=result||jsonb_build_object('selectedDates',(select jsonb_agg(((result->>'weekOf')::date+d)::text) from generate_series(0,6) d));
  end if;
  return result;
end;
$fixture$;
