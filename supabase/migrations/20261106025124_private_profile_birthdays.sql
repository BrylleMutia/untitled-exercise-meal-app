-- Birthdays are private inputs. Legacy age-only rows and payloads remain valid.
alter table public.profiles add column birth_date date;
alter table public.profiles add constraint profiles_birth_date_finite check (
  birth_date is null or (isfinite(birth_date) and birth_date between date '0001-01-01' and date '9999-12-31')
);

create function private.birth_date_age(p_birth_date date, p_reference_date date) returns integer
language sql immutable strict set search_path = '' as $$
  select extract(year from p_reference_date)::integer - extract(year from p_birth_date)::integer
    - case when (extract(month from p_reference_date), extract(day from p_reference_date))
      < (extract(month from p_birth_date), extract(day from p_birth_date)) then 1 else 0 end;
$$;

alter function private.validate_mutation_payload(text,jsonb) rename to validate_mutation_payload_before_birthdate;
create function private.validate_mutation_payload(p_operation text, p_payload jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  data jsonb := coalesce(p_payload->'profile','{}'::jsonb);
  stored public.profiles%rowtype;
  birthday date;
  reference_date date;
  derived_age integer;
begin
  perform private.validate_mutation_payload_before_birthdate(p_operation,p_payload);
  if p_operation not in ('complete_onboarding','update_profile','update_units','reset_plan','skip_planned_meal') then return; end if;
  select * into stored from public.profiles where id=auth.uid();
  if data ? 'birthDate' then
    if jsonb_typeof(data->'birthDate') <> 'string' then
      perform private.raise_mutation_error('validation_failed','birthDate must be a calendar date');
    end if;
    perform private.assert_date_key(data->>'birthDate','birthDate');
    birthday := (data->>'birthDate')::date;
  else
    birthday := stored.birth_date;
  end if;
  if birthday is null then return; end if;
  -- Unrelated display edits preserve the last confirmed age and existing targets.
  if birthday is not distinct from stored.birth_date and (data->>'age')::numeric=stored.age
    and (p_operation='update_units' or p_payload->>'profileOnly'='true' or p_operation='skip_planned_meal') then return; end if;
  if p_payload->>'effectiveDate' is null then
    perform private.raise_mutation_error('validation_failed','effectiveDate is required with a birthday');
  end if;
  perform private.assert_date_key(p_payload->>'effectiveDate','effectiveDate');
  reference_date := (p_payload->>'effectiveDate')::date;
  derived_age := private.birth_date_age(birthday,reference_date);
  if birthday>reference_date or derived_age not between 18 and 100 then
    perform private.raise_mutation_error('validation_failed','Birthday must give an age between 18 and 100');
  end if;
  if (data->>'age')::numeric <> derived_age then
    perform private.raise_mutation_error('validation_failed','Age does not match birthday and effective date');
  end if;
end;
$$;

create function private.persist_birth_date(p_payload jsonb) returns void
language plpgsql set search_path = '' as $$
declare caller uuid := private.require_authenticated();
begin
  if p_payload->'profile' ? 'birthDate' then
    update public.profiles set birth_date=(p_payload->'profile'->>'birthDate')::date
      where id=caller and birth_date is distinct from (p_payload->'profile'->>'birthDate')::date;
  end if;
end;
$$;

alter function private.persist_profile_health_metadata(jsonb) rename to persist_profile_health_metadata_before_birthdate;
create function private.persist_profile_health_metadata(p_payload jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  perform private.persist_profile_health_metadata_before_birthdate(p_payload);
  perform private.persist_birth_date(p_payload);
end;
$$;

alter function private.persist_profile_fields(text,jsonb) rename to persist_profile_fields_before_birthdate;
create function private.persist_profile_fields(p_operation text,p_payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  result := private.persist_profile_fields_before_birthdate(p_operation,p_payload);
  if coalesce((result->>'replayed')::boolean,false)=false then perform private.persist_birth_date(p_payload); end if;
  return result;
end;
$$;

-- A birthday is neither shared planning data nor a reason to invalidate group previews.
do $$
declare definition text;
begin
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='cooking_basis';
  if position('jsonb_agg(to_jsonb(p) order by p.id)' in definition)=0 then raise exception 'Unexpected cooking_basis definition'; end if;
  definition := replace(definition,'jsonb_agg(to_jsonb(p) order by p.id)', 'jsonb_agg((to_jsonb(p) - ''birth_date'' - ''revision'' - ''updated_at'') order by p.id)');
  execute definition;
end;
$$;

revoke all on function private.birth_date_age(date,date), private.validate_mutation_payload_before_birthdate(text,jsonb),
  private.validate_mutation_payload(text,jsonb), private.persist_birth_date(jsonb),
  private.persist_profile_health_metadata_before_birthdate(jsonb), private.persist_profile_health_metadata(jsonb),
  private.persist_profile_fields_before_birthdate(text,jsonb), private.persist_profile_fields(text,jsonb)
  from public,anon,authenticated;
grant execute on function private.birth_date_age(date,date), private.validate_mutation_payload_before_birthdate(text,jsonb),
  private.validate_mutation_payload(text,jsonb), private.persist_birth_date(jsonb),
  private.persist_profile_health_metadata_before_birthdate(jsonb), private.persist_profile_health_metadata(jsonb),
  private.persist_profile_fields_before_birthdate(text,jsonb), private.persist_profile_fields(text,jsonb) to postgres;
revoke insert,update,delete on public.profiles from anon,authenticated;
