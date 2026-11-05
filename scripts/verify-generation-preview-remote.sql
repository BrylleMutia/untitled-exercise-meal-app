-- Transaction-only deployment smoke: all fixture identities and mutations roll back.
begin;
do $$
declare
  actor uuid := gen_random_uuid();
  recipient uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  invite jsonb;
  input jsonb;
  context jsonb;
  preview jsonb;
  committed jsonb;
  denied boolean := false;
  retry_key text := gen_random_uuid()::text;
begin
  insert into auth.users(id,email) select id,id::text||'@preview-smoke.example.test' from unnest(array[actor,recipient,outsider]) id;
  insert into public.profiles(id,name,age,sex,height_cm,weight_kg,units,experience,equipment,days_per_week,session_minutes,goal,dietary_pattern,allergies)
  select id,'Preview smoke',30,'female',165,65,'metric','beginner',array['none'],3,30,'maintain','No restrictions','{}' from unnest(array[actor,recipient,outsider]) id;
  insert into public.goals(app_id,user_id,goal_type,effective_date,weekly_workout_target)
  select 'preview-goal-'||id,id,'maintain','2026-09-01',3 from unnest(array[actor,recipient]) id;
  insert into public.daily_targets(app_id,user_id,goal_row_id,version,effective_date,calories,protein_g,carbs_g,fat_g,bmr,bmi,tdee,activity_factor,formula,disclaimer)
  select 'preview-target-'||user_id,user_id,row_id,1,'2026-09-01',2400,120,300,65,1400,23.9,2400,1.5,'test','Estimates only' from public.goals where user_id in(actor,recipient);
  insert into public.meal_plans(app_id,user_id,week_of,target_row_id,version,preference_policy)
  select 'preview-plan-'||user_id,user_id,'2026-11-08',row_id,1,'advisory_v1' from public.daily_targets where user_id in(actor,recipient);
  insert into public.planned_meals(app_id,meal_plan_row_id,user_id,week_of,meal_date,meal_slot,meal_row_id,label,servings,expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,source)
  select 'preview-kept-'||user_id,row_id,user_id,'2026-11-08','2026-11-08','breakfast',(select row_id from public.meals where app_id='meal-korean-beef-bowl'),'Saved preview portion',1.25,321,22,33,11,'Saved estimate' from public.meal_plans where user_id in(actor,recipient);

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  invite := public.cooking_group_command(jsonb_build_object('action','invite','grocerySharingAcknowledgment','all-weeks-v1','idempotencyKey',gen_random_uuid()));
  perform set_config('request.jwt.claim.sub',recipient::text,true);
  perform public.cooking_group_command(jsonb_build_object('action','inspect-pin','pin',invite->>'pin'));
  perform public.cooking_group_command(jsonb_build_object('action','join','grocerySharingAcknowledgment','all-weeks-v1','pin',invite->>'pin','groupRevision',1,'idempotencyKey',gen_random_uuid()));

  perform set_config('request.jwt.claim.role','service_role',true);
  input := jsonb_build_object('reviewPolicyVersion','advisory_v1','groupId',invite->'group'->>'id','weekOf','2026-11-08','memberIds',jsonb_build_array(actor,recipient),'selectedDates',jsonb_build_array('2026-11-08'),'mode','fill','recipes',jsonb_build_array(jsonb_build_object('id','meal-korean-beef-bowl','revision',(select revision from public.meals where app_id='meal-korean-beef-bowl'),'maxBatches',2)),'seed','smoke','overrides','{}'::jsonb);
  context := public.get_group_planning_context(actor,input);
  preview := public.store_group_planning_preview(actor,input,jsonb_build_object('basis',context->>'basis','warnings','[]'::jsonb,'batches','[]'::jsonb,'replacements','[]'::jsonb,'assignments',jsonb_build_array(jsonb_build_object('id','preview-new','memberId',recipient,'recipeId','meal-korean-beef-bowl','date','2026-11-08','slot','dinner','servings',1.5))));
  if jsonb_array_length(preview->'resultingMeals') <> 3 then raise exception 'Resulting day must contain two kept and one new meal'; end if;
  if not exists(select 1 from jsonb_array_elements(preview->'resultingMeals') m where m->>'memberId'=recipient::text and m->>'status'='kept' and (m->>'expectedCalories')::numeric=321) then raise exception 'Retained saved nutrition was not preserved'; end if;
  if preview ? 'memberReviews' or exists(select 1 from jsonb_array_elements(preview->'resultingMeals') m cross join lateral jsonb_object_keys(m) k where k in ('protected','allergies','targets','logs','remainingCalories')) then raise exception 'Private facts leaked'; end if;
  begin
    perform public.store_group_planning_preview(outsider,input,preview);
  exception when sqlstate 'P0001' then denied := true;
  end;
  if not denied then raise exception 'Outsider access was not denied'; end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  committed := public.commit_cooking_group_plan(jsonb_build_object('previewId',preview->>'id','acknowledged',true,'idempotencyKey',retry_key));
  if public.commit_cooking_group_plan(jsonb_build_object('previewId',preview->>'id','acknowledged',true,'idempotencyKey',retry_key)) is distinct from committed then raise exception 'Commit retry was not idempotent'; end if;
  if not exists(select 1 from public.planned_meals pm join public.meal_plans p on p.row_id=pm.meal_plan_row_id where p.calendar_active and p.user_id=recipient and pm.app_id=preview->'assignments'->0->>'id' and pm.servings=1.5) then raise exception 'Reviewed assignment did not save'; end if;
end;
$$;
rollback;
select 'Resulting-day preview, outsider denial, commit and retry passed; fixtures rolled back.' as verification;
