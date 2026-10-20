-- Live provider imports are unique per owner/FDC ID. Frozen versions retain the
-- original source ID separately so multiple historical bases can coexist.
alter table public.foods add column snapshot_fdc_id text;
create or replace function private.cooking_copy_row(p_table text,p_id bigint,p_overrides jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare columns text; result bigint; overrides jsonb:=p_overrides;
begin
 if p_table not in ('foods','meals','meal_ingredients','meal_plans','planned_meals') then raise exception 'Invalid copy table'; end if;
 if p_table='foods' and p_overrides->>'app_id' like 'group-copy-%' then
   overrides:=overrides||jsonb_build_object('fdc_id',null,'snapshot_fdc_id',(select coalesce(fdc_id,snapshot_fdc_id) from public.foods where row_id=p_id));
 end if;
 select string_agg(format('%I',attname),',' order by attnum) into columns from pg_attribute where attrelid=('public.'||p_table)::regclass and attnum>0 and not attisdropped and attname<>'row_id';
 execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,(select to_jsonb(t) from public.%1$I t where row_id=$1)||$2) returning row_id',p_table,columns) into result using p_id,overrides;
 return result;
end;
$$;
revoke all on function private.cooking_copy_row(text,bigint,jsonb) from public,anon,authenticated;
