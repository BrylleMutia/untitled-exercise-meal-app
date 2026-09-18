-- Preserve targets and plan history for profile-only changes.
-- Name/display-unit edits are still authoritative mutations, but they do not
-- change health inputs or regenerate any derived artifacts.

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
      perform private.raise_mutation_error('validation_failed', 'profile-only edits may change only name or display units');
    end if;

    update public.profiles
    set name = btrim(profile_data->>'name'),
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

create or replace function public.update_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  replay jsonb;
  result jsonb;
begin
  replay := private.preflight_mutation('update_profile', p_payload);
  if replay is not null then return replay; end if;
  if p_payload->>'profileOnly' = 'true' then
    return private.persist_profile_fields('update_profile', p_payload);
  end if;
  if p_payload->'profile'->>'targetEligibility' = 'unsupported' then
    result := private.persist_profile_only('update_profile', p_payload);
    perform private.persist_profile_health_metadata(p_payload);
    return result;
  end if;
  result := private.persist_profile_bundle('update_profile', p_payload);
  perform private.persist_profile_health_metadata(p_payload);
  return result;
end;
$$;

create or replace function public.update_units(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  replay jsonb;
begin
  if p_payload->>'profileOnly' <> 'true' then
    perform private.raise_mutation_error('validation_failed', 'display-unit updates must be profile-only');
  end if;
  replay := private.preflight_mutation('update_units', p_payload);
  if replay is not null then return replay; end if;
  return private.persist_profile_fields('update_units', p_payload);
end;
$$;

revoke all on function private.persist_profile_fields(text, jsonb) from public, anon, authenticated;
revoke all on function public.update_profile(jsonb) from public, anon;
revoke all on function public.update_units(jsonb) from public, anon;
grant execute on function public.update_profile(jsonb) to authenticated;
grant execute on function public.update_units(jsonb) to authenticated;
