SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.build_account_export_before_catalog()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller uuid:=private.require_authenticated();
begin
  return private.build_account_export_without_recipe_favorites() || jsonb_build_object('recipeFavorites',coalesce((
    select jsonb_agg(jsonb_build_object('mealId',m.app_id,'favorite',f.favorite,'revision',f.revision,'updatedAt',f.updated_at) order by m.app_id)
    from public.recipe_favorites f join public.meals m on m.row_id=f.meal_row_id where f.user_id=caller
  ),'[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION private.build_account_export_daily_activity()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_id uuid := private.require_authenticated();
begin
  return private.build_account_export_mvp2() || jsonb_build_object('dailySteps', coalesce((
    select jsonb_agg(to_jsonb(s) - 'user_id' order by entry_date) from public.daily_step_entries s where user_id = caller_id
  ), '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION private.build_account_export_without_recipe_favorites()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_id uuid := private.require_authenticated();
begin
  return private.build_account_export_daily_activity() || jsonb_build_object(
    'customWorkoutVersions',coalesce((select jsonb_agg(to_jsonb(v)-'user_id' order by row_id) from public.custom_workout_versions v where user_id=caller_id),'[]'::jsonb),
    'customWorkoutSessions',coalesce((select jsonb_agg(to_jsonb(s)-'user_id' order by row_id) from public.custom_workout_sessions s where user_id=caller_id),'[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION private.capture_plan_program()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.supersedes_plan_row_id is not null then
    select training_program into new.training_program from public.workout_plans where row_id=new.supersedes_plan_row_id and user_id=new.user_id;
  else
    select training_program into new.training_program from public.profiles where id=new.user_id;
  end if;
  new.training_program := coalesce(new.training_program,'calisthenics');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.capture_session_program()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  select p.training_program into new.training_program from public.planned_workouts w
    join public.workout_plans p on p.row_id = w.plan_row_id
    where w.row_id = new.planned_workout_row_id and w.user_id = new.user_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.check_target_carbs()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare cap numeric;
begin
  select private.total_carb_limit(dietary_pattern) into cap from public.profiles where id = new.user_id;
  if cap is not null and new.carbs_g > cap then perform private.raise_mutation_error('validation_failed', 'target carbohydrate limit exceeded'); end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.delete_account (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_id uuid;
  claim record;
  result jsonb;
begin
  caller_id := private.require_authenticated();
  select * into claim
  from private.claim_mutation(
    caller_id, 'delete_account',
    p_payload->>'idempotencyKey', p_payload
  );

  if claim.replay then
    return jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_account',
      'replayed', true,
      'result_refs', claim.result_refs,
      'clear_cache', true
    );
  end if;

  begin
    -- Remove owned references before the auth cascade deletes private foods.
    -- RESTRICT checks otherwise run before recipe ingredient cascades finish.
    delete from public.nutrition_logs where user_id = caller_id;
    delete from public.logged_meals where user_id = caller_id;
    delete from public.planned_meals where user_id = caller_id;
    delete from public.grocery_items where user_id = caller_id;
    delete from public.meal_ingredients i using public.meals m
      where i.meal_row_id = m.row_id and m.owner_user_id = caller_id;
    delete from auth.users where id = caller_id;

    result := jsonb_build_object(
      'status', 'completed',
      'operation', 'delete_account',
      'result_refs', jsonb_build_object('user_id', caller_id::text),
      'clear_cache', true
    );
    -- The mutation row is removed by the auth.users cascade, so this update is
    -- intentionally best-effort and does not change the deletion result.
    perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
    return result;
  exception when others then
    perform private.fail_mutation(claim.mutation_row_id, sqlstate);
    raise;
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_recipe_complexity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.complexity is null then
    if tg_op = 'UPDATE' then
      new.complexity := coalesce(old.complexity, 'medium');
    else
      new.complexity := 'medium';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.persist_profile_health_metadata_before_step_target (
  p_payload jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_id uuid := private.require_authenticated(); program text := coalesce(p_payload->'profile'->>'trainingProgram', 'calisthenics');
begin
  perform private.assert_enum(program, 'trainingProgram', array['calisthenics','pilates']);
  perform private.persist_profile_health_metadata_mvp2(p_payload);
  update public.profiles set training_program = program where id = caller_id and training_program is distinct from program;
  update public.workout_plans set training_program = program where row_id = (
    select row_id from public.workout_plans where user_id = caller_id and app_id = p_payload->'plan'->>'id'
      order by version desc limit 1
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.queue_deleted_recipe_images()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,0));
  insert into private.deleted_recipe_images(path)
    select path from private.recipe_image_assets where user_id=old.id
    union select name from storage.objects where bucket_id='recipe-covers' and split_part(name,'/',1)=old.id::text
    on conflict(path) do nothing;
  -- Reassign only this bucket's owned media; never DELETE Storage metadata.
  update storage.objects set owner=null, owner_id=null
    where bucket_id='recipe-covers' and split_part(name,'/',1)=old.id::text;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION private.raise_mutation_error (
  p_code    text,
  p_message text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise exception using message=coalesce(nullif(p_message,''),p_code), detail=jsonb_build_object('code',p_code)::text;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reject_ai_only_planned_foods()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.save_authored_recipe_before_catalog (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.require_authenticated();
  if jsonb_typeof(p_payload->'meal'->'complexity') is distinct from 'string'
    or p_payload->'meal'->>'complexity' not in ('easy','medium','hard') then
    perform private.raise_mutation_error('validation_failed','Choose Easy, Medium, or Hard complexity');
  end if;
  return private.save_authored_recipe_without_complexity(p_payload);
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_authored_recipe_without_complexity (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_id uuid := private.require_authenticated(); claim record;
  food jsonb; recipe jsonb := p_payload->'meal'; child_result jsonb; result jsonb;
begin
  select * into claim from private.claim_mutation(caller_id,'save_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then
    return jsonb_build_object('status','completed','operation','save_recipe','replayed',true,'result_refs',claim.result_refs);
  end if;
  perform private.validate_mutation_payload('save_recipe',p_payload);
  perform private.assert_nonblank(recipe->>'notes','Instructions',10000);
  if recipe ? 'reference' and jsonb_typeof(recipe->'reference') not in ('string','null') then
    perform private.raise_mutation_error('validation_failed','Reference must be text');
  end if;
  perform private.assert_json_shape(coalesce(p_payload->'newFoods','[]'::jsonb),'newFoods','array');
  if jsonb_array_length(coalesce(p_payload->'newFoods','[]'::jsonb)) > 100 then
    perform private.raise_mutation_error('validation_failed','Too many new ingredients');
  end if;
  if jsonb_array_length(recipe->'ingredients') > 100 then
    perform private.raise_mutation_error('validation_failed','A recipe supports at most 100 ingredients');
  end if;
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller_id);
  for food in select value from jsonb_array_elements(coalesce(p_payload->'newFoods','[]'::jsonb)) loop
    perform private.validate_mutation_payload('save_food',jsonb_build_object('food',food,'idempotencyKey',(p_payload->>'idempotencyKey') || ':food:' || (food->>'id')));
    if coalesce(food->>'valueSource','') not in ('trusted_catalog','user_provided') then
      perform private.raise_mutation_error('validation_failed','Recipe nutrition requires trusted or user-provided values');
    end if;
    if not exists (select 1 from jsonb_array_elements(recipe->'ingredients') i where i->>'foodId'=food->>'id') then
      perform private.raise_mutation_error('validation_failed','New food must be a recipe ingredient');
    end if;
    if exists (select 1 from public.foods where app_id=food->>'id') then
      perform private.raise_mutation_error('conflict','New ingredient id already exists');
    end if;
    perform private.save_food(jsonb_build_object('food',food,'idempotencyKey',(p_payload->>'idempotencyKey') || ':food:' || (food->>'id')));
  end loop;
  if exists (
    select 1 from jsonb_array_elements(recipe->'ingredients') i
    join public.foods f on f.app_id=i->>'foodId'
    where f.value_source='ai_estimate'
  ) then perform private.raise_mutation_error('validation_failed','Recipe nutrition requires trusted or user-provided values'); end if;
  child_result := private.save_saved_meal((p_payload - 'newFoods') || jsonb_build_object('idempotencyKey',(p_payload->>'idempotencyKey') || ':meal'));
  result := jsonb_build_object('status','completed','operation','save_recipe','result_refs',child_result->'result_refs');
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_custom_workout (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_id uuid := private.require_authenticated(); claim record; current_version integer; definition jsonb; refs jsonb;
begin
  perform private.assert_nonblank(p_payload->>'id','id',128);
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_finite_number(p_payload->>'expectedVersion','expectedVersion',0,2147483646);
  if (p_payload->>'expectedVersion')::numeric <> trunc((p_payload->>'expectedVersion')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  select * into claim from private.claim_mutation(caller_id,'save_custom_workout',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':custom:' || (p_payload->>'id'),0));
  select coalesce(max(version),0) into current_version from public.custom_workout_versions where user_id = caller_id and app_id = p_payload->>'id';
  if current_version <> (p_payload->>'expectedVersion')::integer then perform private.raise_stale_version('custom_workout', (p_payload->>'expectedVersion')::integer,current_version); end if;
  definition := private.validate_custom_workout(p_payload->'definition',caller_id);
  insert into public.custom_workout_versions(user_id,app_id,version,definition) values(caller_id,p_payload->>'id',current_version+1,definition);
  refs := jsonb_build_object('workout_id',p_payload->>'id','version',current_version+1);
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_custom_workout_session (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.save_daily_steps (
  p_payload jsonb,
  p_delete  boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_id uuid := private.require_authenticated(); result jsonb; previous_revision integer; current_revision integer;
  claim record; operation text := case when p_delete then 'delete_daily_steps' else 'save_daily_steps' end;
begin
  perform private.assert_json_shape(p_payload,'payload','object');
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_date_key(p_payload->>'date','date');
  perform private.assert_finite_number(p_payload->>'expectedRevision','expectedRevision',0,2147483646);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  if (p_payload->>'date')::date < current_date - 366 or (p_payload->>'date')::date > current_date+1 then perform private.raise_mutation_error('validation_failed','date is outside the editable year'); end if;
  if not p_delete then
    perform private.assert_finite_number(p_payload->>'steps','steps',0,200000);
    if (p_payload->>'steps')::numeric <> trunc((p_payload->>'steps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if p_payload->>'walkingMinutes' is not null then
      perform private.assert_finite_number(p_payload->>'walkingMinutes','walkingMinutes',0,1440);
      if (p_payload->>'walkingMinutes')::numeric <> trunc((p_payload->>'walkingMinutes')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    end if;
  end if;
  select * into claim from private.claim_mutation(caller_id,operation,p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || (p_payload->>'date'),0));
  select revision into previous_revision from private.daily_step_revisions where user_id=caller_id and entry_date=(p_payload->>'date')::date;
  select revision into current_revision from public.daily_step_entries where user_id=caller_id and entry_date=(p_payload->>'date')::date;
  -- After deletion the UI submits zero for a new observation. Reject old
  -- nonzero revisions before reaching the initial implementation.
  if coalesce(current_revision,0) <> (p_payload->>'expectedRevision')::integer then
    perform private.raise_stale_version('daily_steps',(p_payload->>'expectedRevision')::integer,coalesce(current_revision,0));
  end if;
  if p_delete then
    delete from public.daily_step_entries where user_id=caller_id and entry_date=(p_payload->>'date')::date;
  else
    current_revision := coalesce(previous_revision,0)+1;
    insert into public.daily_step_entries(user_id,entry_date,steps,walking_minutes,revision)
      values(caller_id,(p_payload->>'date')::date,(p_payload->>'steps')::integer,(p_payload->>'walkingMinutes')::integer,current_revision)
      on conflict(user_id,entry_date) do update set steps=excluded.steps,walking_minutes=excluded.walking_minutes,revision=excluded.revision,updated_at=now();
    insert into private.daily_step_revisions values(caller_id,(p_payload->>'date')::date,current_revision)
      on conflict(user_id,entry_date) do update set revision=excluded.revision;
  end if;
  result := jsonb_build_object('status','completed','result_refs',jsonb_build_object('date',p_payload->>'date','revision',coalesce(current_revision,0)));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_daily_steps_initial (
  p_payload jsonb,
  p_delete  boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_id uuid := private.require_authenticated();
  claim record;
  operation text := case when p_delete then 'delete_daily_steps' else 'save_daily_steps' end;
  entry_day date;
  current_revision integer;
  expected_revision integer;
  result jsonb;
begin
  perform private.assert_json_shape(p_payload, 'payload', 'object');
  perform private.assert_date_key(p_payload->>'date', 'date');
  perform private.assert_nonblank(p_payload->>'idempotencyKey', 'idempotencyKey', 128);
  perform private.assert_finite_number(p_payload->>'expectedRevision', 'expectedRevision', 0, 2147483647);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then
    perform private.raise_mutation_error('validation_failed');
  end if;
  expected_revision := (p_payload->>'expectedRevision')::integer;
  entry_day := (p_payload->>'date')::date;
  if entry_day > current_date + 1 then perform private.raise_mutation_error('validation_failed', 'future steps are not observations'); end if;
  if not p_delete then
    perform private.assert_finite_number(p_payload->>'steps', 'steps', 0, 200000);
    if (p_payload->>'steps')::numeric <> trunc((p_payload->>'steps')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    if p_payload->>'walkingMinutes' is not null then
      perform private.assert_finite_number(p_payload->>'walkingMinutes', 'walkingMinutes', 0, 1440);
      if (p_payload->>'walkingMinutes')::numeric <> trunc((p_payload->>'walkingMinutes')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
    end if;
  end if;
  select * into claim from private.claim_mutation(caller_id, operation, p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || entry_day::text, 0));
  select revision into current_revision from public.daily_step_entries where user_id = caller_id and entry_date = entry_day for update;
  if coalesce(current_revision, 0) <> expected_revision then
    perform private.raise_stale_version('daily_steps', expected_revision, coalesce(current_revision, 0));
  end if;
  if p_delete then
    delete from public.daily_step_entries where user_id = caller_id and entry_date = entry_day;
  else
    insert into public.daily_step_entries(user_id, entry_date, steps, walking_minutes)
    values (caller_id, entry_day, (p_payload->>'steps')::integer, (p_payload->>'walkingMinutes')::integer)
    on conflict (user_id, entry_date) do update set steps = excluded.steps,
      walking_minutes = excluded.walking_minutes, revision = public.daily_step_entries.revision + 1, updated_at = now();
  end if;
  result := jsonb_build_object('status','completed','result_refs',jsonb_build_object('date', entry_day::text));
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_reviewed_meal_before_recipe_servings (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller uuid:=private.require_authenticated(); recipe public.meals; claim record; result jsonb; portion numeric; item jsonb;
begin
  select * into claim from private.claim_mutation(caller,'log_provided_recipe',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','operation','save_reviewed_meal','replayed',true,'result_refs',claim.result_refs); end if;
  select * into recipe from public.meals where app_id=p_payload->'meal'->>'id' and (is_system or owner_user_id=caller) for update;
  if recipe.provided_nutrition is null then
    result:=private.save_reviewed_meal_before_provided_nutrition(p_payload);
    perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
    return result;
  end if;
  if jsonb_typeof(p_payload->'ingredients') is distinct from 'array' or jsonb_array_length(p_payload->'ingredients')<>1 then
    perform private.raise_mutation_error('validation_failed','Log provided recipe macros as a recipe portion');
  end if;
  item:=p_payload->'ingredients'->0;
  if jsonb_typeof(item->'servings') is distinct from 'number' then
    perform private.raise_mutation_error('validation_failed','Actual recipe servings are required');
  end if;
  portion:=(item->>'servings')::numeric;
  if portion<=0 or portion>10000 then perform private.raise_mutation_error('validation_failed','Invalid recipe portion'); end if;
  item:=jsonb_build_object('id',item->>'id','customName',recipe.name||' · provided recipe macros',
    'servings',portion,'servingGrams',1,'servingLabel','1 recipe serving','servingUnit','piece',
    'calories',recipe.provided_nutrition->'calories','proteinG',recipe.provided_nutrition->'proteinG',
    'carbsG',recipe.provided_nutrition->'carbsG','fatG',recipe.provided_nutrition->'fatG',
    'valueSource','user_provided','estimated',true,'confidence','medium','preparationBasis','as_labeled',
    'sourceVersion','recipe:'||recipe.app_id||':revision:'||recipe.revision,
    'assumptions','Source-provided recipe macros per serving; not recalculated from ingredients. Reference: '||coalesce(recipe.reference,'user provided'));
  result:=private.save_reviewed_meal_before_provided_nutrition(p_payload||jsonb_build_object('ingredients',jsonb_build_array(item)));
  perform private.complete_mutation(claim.mutation_row_id,result->'result_refs');
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_saved_meal_before_cooking_measurements (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller uuid:=private.require_authenticated(); result jsonb; macros jsonb:=nullif(p_payload->'meal'->'providedNutrition','null'::jsonb);
begin
  if not private.valid_provided_recipe_nutrition(macros) then
    perform private.raise_mutation_error('validation_failed','Provided nutrition requires nonnegative calories, protein, carbs and fat per serving');
  end if;
  result:=private.save_saved_meal_before_provided_nutrition(p_payload);
  if not coalesce((result->>'replayed')::boolean,false) and p_payload->'meal' ? 'providedNutrition' then
    update public.meals set provided_nutrition=macros where app_id=p_payload->'meal'->>'id' and owner_user_id=caller;
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_saved_meal_before_provided_nutrition (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb; recipe jsonb:=p_payload->'meal';
begin
  if recipe ? 'complexity' and recipe->'complexity'<>'null'::jsonb
    and (jsonb_typeof(recipe->'complexity')<>'string' or recipe->>'complexity' not in ('easy','medium','hard')) then
    perform private.raise_mutation_error('validation_failed','Choose Easy, Medium, or Hard complexity');
  end if;
  result:=private.save_saved_meal_without_complexity(p_payload);
  if not coalesce((result->>'replayed')::boolean,false) and recipe ? 'complexity' then
    update public.meals set complexity=nullif(recipe->>'complexity','')
      where app_id=recipe->>'id' and owner_user_id=(select auth.uid());
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_celebrations_mvp3 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_id uuid := private.require_authenticated(); claim record; current_revision integer; result jsonb;
begin
  perform private.assert_json_shape(p_payload, 'payload', 'object');
  perform private.assert_nonblank(p_payload->>'idempotencyKey', 'idempotencyKey', 128);
  perform private.assert_finite_number(p_payload->>'expectedRevision', 'expectedRevision', 1, 2147483647);
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then perform private.raise_mutation_error('validation_failed'); end if;
  select * into claim from private.claim_mutation(caller_id, 'set_celebrations', p_payload->>'idempotencyKey', p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  select revision into current_revision from public.profiles where id = caller_id for update;
  if current_revision is null then perform private.raise_mutation_error('not_found'); end if;
  if current_revision <> (p_payload->>'expectedRevision')::integer then perform private.raise_stale_version('profile', (p_payload->>'expectedRevision')::integer, current_revision); end if;
  update public.profiles set celebrations_enabled = (p_payload->>'enabled')::boolean where id = caller_id;
  result := jsonb_build_object('status','completed','result_refs',jsonb_build_object('profile_id',caller_id));
  perform private.complete_mutation(claim.mutation_row_id, result->'result_refs');
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.start_custom_workout (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_id uuid := private.require_authenticated(); claim record; template public.custom_workout_versions%rowtype; refs jsonb;
begin
  perform private.assert_json_shape(p_payload,'payload','object');
  perform private.assert_nonblank(p_payload->>'id','session id',128);
  perform private.assert_nonblank(p_payload->>'workoutId','workout id',128);
  perform private.assert_nonblank(p_payload->>'idempotencyKey','idempotencyKey',128);
  perform private.assert_date_key(p_payload->>'date','date');
  perform private.assert_finite_number(p_payload->>'expectedVersion','expectedVersion',1,2147483647);
  if (p_payload->>'expectedVersion')::numeric <> trunc((p_payload->>'expectedVersion')::numeric) then perform private.raise_mutation_error('validation_failed'); end if;
  if (p_payload->>'date')::date > current_date+1 then perform private.raise_mutation_error('validation_failed'); end if;
  select * into claim from private.claim_mutation(caller_id,'start_custom_workout',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return jsonb_build_object('status','completed','replayed',true,'result_refs',claim.result_refs); end if;
  select * into template from public.custom_workout_versions where user_id=caller_id and app_id=p_payload->>'workoutId' order by version desc limit 1;
  if template.row_id is null then perform private.raise_mutation_error('not_found'); end if;
  if template.version <> (p_payload->>'expectedVersion')::integer then perform private.raise_stale_version('custom_workout',(p_payload->>'expectedVersion')::integer,template.version); end if;
  perform private.validate_custom_workout(template.definition,caller_id);
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':custom-session',0));
  if exists(select 1 from public.custom_workout_sessions where user_id=caller_id and status in ('in_progress','paused')) then perform private.raise_mutation_error('conflict','resume the active custom workout'); end if;
  insert into public.custom_workout_sessions(user_id,app_id,workout_version_row_id,session_date,planned)
    values(caller_id,p_payload->>'id',template.row_id,(p_payload->>'date')::date,template.definition);
  refs := jsonb_build_object('session_id',p_payload->>'id');
  perform private.complete_mutation(claim.mutation_row_id,refs);
  return jsonb_build_object('status','completed','result_refs',refs);
end;
$function$;

CREATE OR REPLACE FUNCTION private.total_carb_limit (
  p_pattern text
)
  RETURNS numeric
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case when lower(p_pattern) like '%keto-style%' then 50
    when lower(p_pattern) like '%low-carb%' then 130 else null end::numeric;
$function$;

CREATE OR REPLACE FUNCTION private.valid_provided_recipe_nutrition (
  value jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare key text;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  foreach key in array array['calories','proteinG','carbsG','fatG'] loop
    if jsonb_typeof(value->key) is distinct from 'number' then return false; end if;
    if (value->>key)::numeric not between 0 and 10000 then return false; end if;
  end loop;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_custom_workout (
  p_definition jsonb,
  p_user_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.add_planned_meal (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin return private.add_planned_meal(p_payload); end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_deleted_recipe_images (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare lease uuid:=gen_random_uuid(); result jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    perform private.raise_mutation_error('unauthorized','Server cleanup only');
  end if;
  with candidates as (
    select path from private.deleted_recipe_images
    where leased_until is null or leased_until<now()
    order by queued_at limit 100 for update skip locked
  ), claimed as (
    update private.deleted_recipe_images j set lease_id=lease, leased_until=now()+interval '10 minutes'
    from candidates c where j.path=c.path returning j.path
  ) select jsonb_build_object('leaseId',lease,'paths',coalesce(jsonb_agg(path),'[]'::jsonb)) into result from claimed;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_recipe_image_cleanup (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller uuid:=private.require_authenticated(); result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
  if p_payload->>'mode' is distinct from 'expired' then
    perform private.raise_mutation_error('validation_failed','Invalid image cleanup');
  end if;
  -- The same lock is taken when attaching: claiming cleanup prevents a race
  -- between an image becoming referenced and its removal through Storage API.
  with candidates as (
    select a.path from private.recipe_image_assets a where a.user_id=caller
      and a.created_at<now()-interval '8 days'
      and not exists(select 1 from public.meals m where m.owner_user_id=caller and m.image->>'path'=a.path)
    order by a.created_at limit 100 for update
  ), marked as (
    update private.recipe_image_assets a set state='removing' from candidates c
    where a.path=c.path returning a.path
  ) select coalesce(jsonb_agg(path),'[]'::jsonb) into result from marked;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_deleted_recipe_images (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if (select auth.role()) is distinct from 'service_role' then
    perform private.raise_mutation_error('unauthorized','Server cleanup only');
  end if;
  perform private.assert_json_shape(p_payload->'paths','paths','array');
  if jsonb_array_length(p_payload->'paths')>100 then
    perform private.raise_mutation_error('validation_failed','Too many cleanup paths');
  end if;
  delete from private.deleted_recipe_images j where j.lease_id=(p_payload->>'leaseId')::uuid
    and j.path in (select jsonb_array_elements_text(p_payload->'paths'))
    and not exists(select 1 from storage.objects o where o.bucket_id='recipe-covers' and o.name=j.path);
  return jsonb_build_object('completed',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_recipe_image_cleanup (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller uuid:=private.require_authenticated();
begin
  perform private.assert_json_shape(p_payload->'paths','paths','array');
  if jsonb_array_length(p_payload->'paths')>100 then perform private.raise_mutation_error('validation_failed','Too many cleanup paths'); end if;
  delete from private.recipe_image_assets a where a.user_id=caller and a.state='removing'
    and a.path in (select jsonb_array_elements_text(p_payload->'paths'))
    and not exists(select 1 from storage.objects o where o.bucket_id='recipe-covers' and o.name=a.path);
  return jsonb_build_object('completed',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.recipe_image_access (
  p_path  text,
  p_write boolean DEFAULT false
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (select 1 from private.recipe_image_assets a where a.path=p_path
    and a.user_id=(select auth.uid()) and a.state <> 'removing'
    and (not p_write or a.state='staged'));
$function$;

CREATE OR REPLACE FUNCTION public.recipe_image_removable (
  p_path text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists(select 1 from private.recipe_image_assets a where a.path=p_path
    and a.user_id=(select auth.uid()) and a.state='removing');
$function$;

CREATE OR REPLACE FUNCTION public.register_recipe_image (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller uuid:=private.require_authenticated(); object_path text; asset private.recipe_image_assets;
begin
  perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
  if coalesce(p_payload->>'uploadId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'checksum','') !~ '^[0-9a-f]{64}$' then
    perform private.raise_mutation_error('validation_failed','Invalid image upload');
  end if;
  object_path:=caller::text||'/'||(p_payload->>'uploadId')||'.webp';
  if not exists(select 1 from private.recipe_image_assets where path=object_path)
    and (select count(*) from private.recipe_image_assets where user_id=caller and state='staged') >= 100 then
    perform private.raise_mutation_error('validation_failed','Too many pending images; retry after expired uploads are cleaned up');
  end if;
  insert into private.recipe_image_assets(path,user_id,checksum)
    values(object_path,caller,p_payload->>'checksum') on conflict(path) do nothing;
  select * into asset from private.recipe_image_assets where path=object_path for update;
  if asset.user_id<>caller or asset.checksum<>p_payload->>'checksum' or asset.state='removing' then
    perform private.raise_mutation_error('idempotency_key_reused','Choose the image again to start a new upload');
  end if;
  return jsonb_build_object('path',object_path);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_recipe (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.require_authenticated();
  perform private.assert_json_shape(p_payload->'meal'->'notes', 'Instructions', 'string');
  return private.save_authored_recipe(p_payload);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_celebrations (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.assert_finite_number(p_payload->>'expectedRevision', 'expectedRevision', 1, 2147483647);
  if (p_payload->>'expectedRevision')::numeric <> trunc((p_payload->>'expectedRevision')::numeric) then
    perform private.raise_mutation_error('validation_failed');
  end if;
  return private.set_celebrations_mvp3(p_payload);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_recipe_favorite (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin return private.set_recipe_favorite(p_payload); end;
$function$;

