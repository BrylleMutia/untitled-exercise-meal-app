-- Explicit initialization types keep plpgsql_check clean without changing behavior.

create or replace function private.validate_custom_workout(p_definition jsonb, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare movement jsonb; result jsonb := '[]'::jsonb; ids text[] := array[]::text[]; catalog public.exercises%rowtype;
  profile public.profiles%rowtype; duration numeric := 8; seconds numeric;
begin
  perform private.assert_json_shape(p_definition,'workout','object');
  perform private.assert_nonblank(p_definition->>'name','name',100);
  perform private.assert_json_shape(p_definition->'movements','movements','array');
  if jsonb_array_length(p_definition->'movements') not between 1 and 24 then perform private.raise_mutation_error('validation_failed','choose 1 to 24 movements'); end if;
  select * into profile from public.profiles where id = p_user_id;
  if profile.id is null then perform private.raise_mutation_error('not_found'); end if;
  for movement in select value from jsonb_array_elements(p_definition->'movements') loop
    perform private.assert_json_shape(movement,'movement','object');
    perform private.assert_nonblank(movement->>'id','movement id',128);
    if movement->>'id' = any(ids) then perform private.raise_mutation_error('validation_failed','duplicate movement id'); end if;
    ids := array_append(ids,movement->>'id');
    perform private.assert_nonblank(movement->>'name','movement name',100);
    perform private.assert_finite_number(movement->>'sets','sets',1,6);
    perform private.assert_finite_number(movement->>'restSeconds','restSeconds',15,180);
    if (movement->>'sets')::numeric <> trunc((movement->>'sets')::numeric)
      or (movement->>'restSeconds')::numeric <> trunc((movement->>'restSeconds')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if (movement->>'reps' is null) = (movement->>'holdSeconds' is null) then perform private.raise_mutation_error('validation_failed','choose reps or hold time'); end if;
    if movement->>'reps' is not null then
      perform private.assert_finite_number(movement->>'reps','reps',1,50);
      if (movement->>'reps')::numeric <> trunc((movement->>'reps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
      seconds := (movement->>'reps')::numeric * 4;
    else
      perform private.assert_finite_number(movement->>'holdSeconds','holdSeconds',5,120);
      if (movement->>'holdSeconds')::numeric <> trunc((movement->>'holdSeconds')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
      seconds := (movement->>'holdSeconds')::numeric;
    end if;
    if nullif(movement->>'exerciseId','') is not null then
      select * into catalog from public.exercises where app_id = movement->>'exerciseId';
      if catalog.row_id is null then perform private.raise_mutation_error('not_found','exercise not found'); end if;
      if not catalog.equipment <@ (profile.equipment || array['none']) then perform private.raise_mutation_error('validation_failed','equipment unavailable'); end if;
      if catalog.difficulty > (case profile.experience when 'beginner' then 2 when 'intermediate' then 4 else 5 end) then perform private.raise_mutation_error('validation_failed','exercise exceeds selected experience'); end if;
      if (catalog.measure = 'reps') <> (movement->>'reps' is not null) then perform private.raise_mutation_error('validation_failed','exercise measure mismatch'); end if;
      movement := movement || jsonb_build_object('name',catalog.name);
    end if;
    duration := duration + (movement->>'sets')::numeric * (seconds + (movement->>'restSeconds')::numeric) / 60;
    result := result || jsonb_build_array(movement - 'automaticProgression');
  end loop;
  if ceil(duration) > profile.session_minutes then perform private.raise_mutation_error('validation_failed','routine exceeds available workout time'); end if;
  return jsonb_build_object('name',btrim(p_definition->>'name'),'movements',result,'estimatedMinutes',ceil(duration),
    'warmup',jsonb_build_array('5 min easy movement and comfortable joint mobility'),
    'cooldown',jsonb_build_array('3 min easy breathing and comfortable stretches'),
    'safety','Choose familiar movements. Stop for pain, dizziness, or unusual breathlessness. User movements are text-only and receive no automatic progression.');
end;
$$;

create or replace function private.save_custom_workout_session(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := private.require_authenticated(); claim record; session public.custom_workout_sessions%rowtype; prescription jsonb;
  entry jsonb; ids text[] := array[]::text[]; desired_status text := p_payload->>'status'; refs jsonb;
begin
  perform private.assert_nonblank(p_payload->>'id','id',128);
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_finite_number(p_payload->>'expectedRevision','expectedRevision',1,2147483646);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  perform private.assert_enum(desired_status,'status',array['in_progress','paused','completed','partial','abandoned']);
  perform private.assert_json_shape(p_payload->'actual','actual','array');
  select * into claim from private.claim_mutation(caller_id,'save_custom_workout_session',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  select * into session from public.custom_workout_sessions where user_id=caller_id and app_id=p_payload->>'id' for update;
  if session.row_id is null then perform private.raise_mutation_error('not_found'); end if;
  if session.revision <> (p_payload->>'expectedRevision')::integer then perform private.raise_stale_version('custom_session',(p_payload->>'expectedRevision')::integer,session.revision); end if;
  if session.status not in ('in_progress','paused') then perform private.raise_mutation_error('already_completed'); end if;
  for entry in select value from jsonb_array_elements(p_payload->'actual') loop
    perform private.assert_json_shape(entry,'entry','object');
    perform private.assert_nonblank(entry->>'movementId','movementId',128);
    if entry->>'movementId'=any(ids) or not exists(select 1 from jsonb_array_elements(session.planned->'movements') movement where movement->>'id'=entry->>'movementId') then perform private.raise_mutation_error('validation_failed','movement mismatch'); end if;
    ids := array_append(ids,entry->>'movementId');
    select value into prescription from jsonb_array_elements(session.planned->'movements') where value->>'id'=entry->>'movementId';
    perform private.assert_enum(entry->>'status','movement status',array['completed','modified','skipped']);
    perform private.assert_finite_number(entry->>'sets','actual sets',0,20);
    if (entry->>'sets')::numeric <> trunc((entry->>'sets')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if entry->>'reps' is not null then
      perform private.assert_finite_number(entry->>'reps','actual reps',0,500);
      if (entry->>'reps')::numeric <> trunc((entry->>'reps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    end if;
    if entry->>'holdSeconds' is not null then perform private.assert_finite_number(entry->>'holdSeconds','actual holdSeconds',0,3600); end if;
    if entry->>'status' <> 'skipped' and ((prescription->>'reps' is not null and (entry->>'reps' is null or entry->>'holdSeconds' is not null))
      or (prescription->>'holdSeconds' is not null and (entry->>'holdSeconds' is null or entry->>'reps' is not null))) then
      perform private.raise_mutation_error('validation_failed','actual measure differs from prescription');
    end if;
    if entry->>'status'='completed' and ((entry->>'sets')::numeric < (prescription->>'sets')::numeric
      or coalesce((entry->>'reps')::numeric,(entry->>'holdSeconds')::numeric) < coalesce((prescription->>'reps')::numeric,(prescription->>'holdSeconds')::numeric)) then
      perform private.raise_mutation_error('validation_failed','mark reduced work as modified');
    end if;
    if entry->>'rpe' is not null then perform private.assert_finite_number(entry->>'rpe','rpe',1,10); end if;
    if length(coalesce(entry->>'note','')) > 500 then perform private.raise_mutation_error('validation_failed','note too long'); end if;
  end loop;
  if desired_status='completed' and (cardinality(ids) <> jsonb_array_length(session.planned->'movements') or exists(select 1 from jsonb_array_elements(p_payload->'actual') e where e->>'status'<>'completed')) then perform private.raise_mutation_error('validation_failed','use partial completion for modified or unfinished work'); end if;
  if desired_status in ('partial','completed') and cardinality(ids)=0 then perform private.raise_mutation_error('validation_failed','record what happened before finishing'); end if;
  update public.custom_workout_sessions set actual=p_payload->'actual',status=desired_status,revision=revision+1,updated_at=now(),
    finished_at=case when desired_status in ('completed','partial','abandoned') then now() else null end where row_id=session.row_id;
  refs := jsonb_build_object('session_id',session.app_id);
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$$;

revoke all on function private.validate_custom_workout(jsonb,uuid), private.save_custom_workout_session(jsonb) from public,anon,authenticated;
