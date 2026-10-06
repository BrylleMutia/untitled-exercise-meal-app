-- A personal preference only: no default, backfill, or target/plan regeneration.
alter table public.profiles add column daily_step_target integer;
alter table public.profiles add constraint profiles_daily_step_target_check
  check (daily_step_target is null or daily_step_target between 1 and 200000);

create function private.resolve_daily_step_target(p_profile jsonb, p_current integer)
returns integer language plpgsql set search_path = '' as $$
declare target numeric;
begin
  if not (p_profile ? 'dailyStepTarget') then return p_current; end if;
  if jsonb_typeof(p_profile->'dailyStepTarget') = 'null' then return null; end if;
  if jsonb_typeof(p_profile->'dailyStepTarget') is distinct from 'number' then
    perform private.raise_mutation_error('validation_failed', 'dailyStepTarget must be an integer from 1 to 200000, or null');
  end if;
  perform private.assert_finite_number(p_profile->>'dailyStepTarget', 'dailyStepTarget', 1, 200000);
  target := (p_profile->>'dailyStepTarget')::numeric;
  if target <> trunc(target) then perform private.raise_mutation_error('validation_failed'); end if;
  return target::integer;
end;
$$;

-- All bundle/onboarding paths already call this helper in their transaction.
-- Omission preserves an older client's preference; explicit null clears it.
alter function private.persist_profile_health_metadata(jsonb) rename to persist_profile_health_metadata_before_step_target;
create function private.persist_profile_health_metadata(p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated();
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  current_target integer;
  requested_target integer;
begin
  select daily_step_target into current_target from public.profiles where id = caller_id for update;
  requested_target := private.resolve_daily_step_target(profile_data, current_target);
  perform private.persist_profile_health_metadata_before_step_target(p_payload);
  update public.profiles set daily_step_target = requested_target
    where id = caller_id and daily_step_target is distinct from requested_target;
end;
$$;

create function private.set_daily_step_target(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  current_revision integer;
  requested_target integer;
  expected_revision numeric;
  refs jsonb;
begin
  perform private.assert_json_shape(p_payload, 'payload', 'object');
  perform private.assert_nonblank(p_payload->>'idempotencyKey', 'idempotencyKey', 128);
  if not (p_payload ? 'target') then perform private.raise_mutation_error('validation_failed', 'target is required; null removes it'); end if;
  requested_target := private.resolve_daily_step_target(jsonb_build_object('dailyStepTarget', p_payload->'target'), null);
  perform private.assert_finite_number(p_payload->>'expectedRevision', 'expectedRevision', 1, 2147483647);
  expected_revision := (p_payload->>'expectedRevision')::numeric;
  if expected_revision <> trunc(expected_revision) then perform private.raise_mutation_error('validation_failed'); end if;
  select * into claim from private.claim_mutation(caller_id, 'set_daily_step_target', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status', 'completed', 'replayed', true, 'result_refs', claim.result_refs); end if;
  select revision into current_revision from public.profiles where id = caller_id for update;
  if current_revision is null then perform private.raise_mutation_error('not_found'); end if;
  if current_revision <> expected_revision::integer then
    perform private.raise_stale_version('profile', expected_revision::integer, current_revision);
  end if;
  update public.profiles set daily_step_target = requested_target where id = caller_id;
  refs := jsonb_build_object('profile_id', caller_id);
  perform private.complete_mutation(claim.mutation_row_id, refs);
  return jsonb_build_object('status', 'completed', 'result_refs', refs);
end;
$$;

-- The definer boundary is needed because direct profile writes are denied.
create function public.set_daily_step_target(p_payload jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select private.set_daily_step_target(p_payload);
$$;

revoke all on function private.resolve_daily_step_target(jsonb, integer),
  private.persist_profile_health_metadata_before_step_target(jsonb),
  private.persist_profile_health_metadata(jsonb), private.set_daily_step_target(jsonb)
  from public, anon, authenticated;
revoke all on function public.set_daily_step_target(jsonb) from public, anon, authenticated;
grant execute on function public.set_daily_step_target(jsonb) to authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Profile-only and display-unit edits retain the same atomic update boundary.
create or replace function private.persist_profile_fields(
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  claim record;
  profile_data jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
  current_profile public.profiles%rowtype;
  current_eligibility text;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id,
    p_operation,
    p_payload->>'idempotencyKey',
    p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', p_operation,
      'replayed', true,
      'result_refs', claim.result_refs
    );
  end if;

  begin
    select *
      into current_profile
      from public.profiles
      where id = caller_id;
    if not found then
      perform private.raise_mutation_error('not_found', 'profile not found');
    end if;
    current_eligibility := coalesce(current_profile.eligibility_status, 'eligible');
    if (profile_data->>'age')::numeric is distinct from current_profile.age
       or profile_data->>'sex' is distinct from current_profile.sex
       or (profile_data->>'heightCm')::numeric is distinct from current_profile.height_cm
       or (profile_data->>'weightKg')::numeric is distinct from current_profile.weight_kg
       or profile_data->>'experience' is distinct from current_profile.experience
       or array(select jsonb_array_elements_text(coalesce(profile_data->'equipment', '[]'::jsonb))) is distinct from current_profile.equipment
       or (profile_data->>'daysPerWeek')::numeric is distinct from current_profile.days_per_week
       or (profile_data->>'sessionMinutes')::numeric is distinct from current_profile.session_minutes
       or profile_data->>'goal' is distinct from current_profile.goal
       or coalesce(profile_data->>'dietaryPattern', '') is distinct from coalesce(current_profile.dietary_pattern, '')
       or array(select jsonb_array_elements_text(coalesce(profile_data->'allergies', '[]'::jsonb))) is distinct from current_profile.allergies
       or array(select jsonb_array_elements_text(coalesce(profile_data->'foodPreferences', '[]'::jsonb))) is distinct from current_profile.food_preferences
       or nullif(profile_data->>'cookingTimeMinutes', '')::numeric is distinct from current_profile.cooking_time_minutes
       or nullif(profile_data->>'mealBudget', '')::numeric is distinct from current_profile.meal_budget
       or coalesce(nullif(profile_data->>'targetEligibility', ''), current_eligibility) is distinct from current_eligibility
       or coalesce(nullif(profile_data->>'eligibilityVersion', ''), current_profile.eligibility_version) is distinct from current_profile.eligibility_version then
      perform private.raise_mutation_error('validation_failed', 'profile-only edits may change only name, display units, or daily step target');
    end if;

    update public.profiles
    set daily_step_target = private.resolve_daily_step_target(profile_data, current_profile.daily_step_target),
        name = btrim(profile_data->>'name'),
        age = (profile_data->>'age')::smallint,
        sex = profile_data->>'sex',
        height_cm = (profile_data->>'heightCm')::numeric(5,2),
        weight_kg = (profile_data->>'weightKg')::numeric(6,2),
        units = profile_data->>'units',
        experience = profile_data->>'experience',
        equipment = array(select jsonb_array_elements_text(coalesce(profile_data->'equipment', '[]'::jsonb))),
        days_per_week = (profile_data->>'daysPerWeek')::smallint,
        session_minutes = (profile_data->>'sessionMinutes')::smallint,
        goal = profile_data->>'goal',
        dietary_pattern = coalesce(profile_data->>'dietaryPattern', ''),
        allergies = array(select jsonb_array_elements_text(coalesce(profile_data->'allergies', '[]'::jsonb))),
        food_preferences = array(select jsonb_array_elements_text(coalesce(profile_data->'foodPreferences', '[]'::jsonb))),
        cooking_time_minutes = nullif(profile_data->>'cookingTimeMinutes', '')::smallint,
        meal_budget = nullif(profile_data->>'mealBudget', '')::numeric(10,2),
        eligibility_status = coalesce(nullif(profile_data->>'targetEligibility', ''), eligibility_status, 'eligible'),
        eligibility_version = coalesce(nullif(profile_data->>'eligibilityVersion', ''), eligibility_version, 'calicoach-eligibility-v1')
    where id = caller_id;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', p_operation,
      'result_refs', jsonb_build_object(
        'profile_id', caller_id::text,
        'profile_only', true
      )
    );
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$$;
