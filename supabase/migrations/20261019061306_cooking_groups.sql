-- Private cooking groups. No personal history is made readable by membership.
create table public.cooking_groups (
  id uuid primary key default gen_random_uuid(), revision integer not null default 1,
  week_starts_on integer not null check(week_starts_on between 0 and 6),
  archived_at timestamptz, created_at timestamptz not null default now()
);
create table public.cooking_group_members (
  user_id uuid primary key references auth.users on delete cascade,
  group_id uuid not null references public.cooking_groups on delete cascade,
  joined_at timestamptz not null default now()
);
create index cooking_group_members_group_idx on public.cooking_group_members(group_id,user_id);
create table private.cooking_invitations (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.cooking_groups on delete cascade,
  created_by uuid not null references auth.users on delete cascade, pin_hash text not null unique,
  expires_at timestamptz not null, consumed_at timestamptz
);
create index cooking_invitations_group_idx on private.cooking_invitations(group_id);
create table private.cooking_pin_attempts (user_id uuid primary key references auth.users on delete cascade, started_at timestamptz not null, attempts integer not null);
create table public.cooking_week_proposals (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.cooking_groups on delete cascade,
  day integer not null check(day between 0 and 6), approvals uuid[] not null default '{}',
  status text not null default 'pending' check(status in ('pending','rejected','applied','invalidated')),
  created_at timestamptz not null default now()
);
create index cooking_week_proposals_group_idx on public.cooking_week_proposals(group_id,status);
create table public.cooking_group_weeks (
  group_id uuid not null references public.cooking_groups on delete cascade, week_of date not null,
  revision integer not null default 0, grocery jsonb not null default '{"items":[]}',
  primary key(group_id,week_of)
);
create table public.cooking_generations (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.cooking_groups on delete cascade,
  week_of date not null, generated_by uuid references auth.users on delete set null, generator_name text not null,
  member_ids uuid[] not null, summary jsonb not null, created_at timestamptz not null default now()
);
create index cooking_generations_week_idx on public.cooking_generations(group_id,week_of,created_at desc);
create table public.cooking_generation_notices (
  generation_id uuid not null references public.cooking_generations on delete cascade,
  user_id uuid not null references auth.users on delete cascade, acknowledged_at timestamptz,
  primary key(generation_id,user_id)
);
create table public.cooking_assignments (
  id text not null, user_id uuid not null references auth.users on delete cascade,
  group_id uuid not null references public.cooking_groups on delete cascade,
  generation_id uuid not null references public.cooking_generations on delete cascade,
  recipe_id text not null, recipe_snapshot_row_id bigint not null references public.meals on delete restrict,
  meal_date date not null, meal_slot text not null check(meal_slot in ('breakfast','lunch','dinner','snack')),
  primary key(user_id,id)
);
create index cooking_assignments_group_date_idx on public.cooking_assignments(group_id,meal_date);
create index cooking_assignments_recipe_idx on public.cooking_assignments(recipe_snapshot_row_id);
create table private.cooking_previews (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.cooking_groups on delete cascade,
  created_by uuid not null references auth.users on delete cascade, week_of date not null,
  request jsonb not null, basis text not null, preview jsonb not null,
  expires_at timestamptz not null default now()+interval '30 minutes'
);
create index cooking_previews_expiry_idx on private.cooking_previews(expires_at);
create table public.cooking_calendar_transitions (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.cooking_groups on delete cascade,
  source_state jsonb not null, destination_state jsonb not null, created_at timestamptz not null default now()
);
create index cooking_calendar_transitions_group_idx on public.cooking_calendar_transitions(group_id,created_at);

create function private.cooking_group_for(p_user uuid) returns uuid language sql stable security definer set search_path='' as $$
  select group_id from public.cooking_group_members where user_id=p_user;
$$;
create function private.lock_cooking_group(p_group uuid) returns void language plpgsql security definer set search_path='' as $$
declare member uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_group::text||':cooking-group',0));
  for member in select user_id from public.cooking_group_members where group_id=p_group order by user_id loop
    perform pg_advisory_xact_lock(hashtextextended(member::text||':calendar',0));
  end loop;
end;
$$;
create function private.cooking_group_json(p_group uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'revision',g.revision,'weekStartsOn',g.week_starts_on,
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.name,'joinedAt',m.joined_at) order by m.joined_at,m.user_id)
 from public.cooking_group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id),'[]'::jsonb),
 'proposal',(select jsonb_build_object('id',q.id,'day',q.day,'approvals',q.approvals) from public.cooking_week_proposals q where q.group_id=g.id and q.status='pending' order by created_at desc limit 1))
 from public.cooking_groups g where g.id=p_group and archived_at is null;
$$;
create function private.cooking_recipe_json(p_recipe public.meals) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',p_recipe.app_id,'name',p_recipe.name,'servings',p_recipe.servings,
 'revision',p_recipe.revision,'mealSlots',p_recipe.meal_slots,'image',p_recipe.image,'notes',p_recipe.notes,
 'reference',p_recipe.reference,'totalTimeMinutes',p_recipe.total_time_minutes,'complexity',p_recipe.complexity,
 'providedNutrition',p_recipe.provided_nutrition,'unmeasuredIngredients',p_recipe.unmeasured_ingredients,
 'ownerId',p_recipe.owner_user_id,'ownerName',coalesce((select name from public.profiles where id=p_recipe.owner_user_id),'Default recipe'),
 'ingredients',coalesce((select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings,'cookingMeasurement',i.cooking_measurement) order by i.ingredient_order)
 from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=p_recipe.row_id),'[]'::jsonb)));
$$;
create function private.cooking_generation_json(p_gen public.cooking_generations,p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_gen.id,'weekOf',p_gen.week_of,'createdAt',p_gen.created_at,'generatedBy',p_gen.generator_name,
 'memberIds',p_gen.member_ids,'batches',p_gen.summary->'batches',
 'acknowledged',exists(select 1 from public.cooking_generation_notices where generation_id=p_gen.id and user_id=p_user and acknowledged_at is not null),
 'superseded',exists(select 1 from public.cooking_generations where group_id=p_gen.group_id and week_of=p_gen.week_of and (created_at,id)>(p_gen.created_at,p_gen.id)));
$$;

-- Identifies live assignments in the latest personal snapshot, rather than duplicating portions.
create function private.cooking_live_assignments(p_group uuid,p_week date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'memberId',a.user_id,'recipeId',a.recipe_id,'date',pm.meal_date,'slot',pm.meal_slot,'servings',pm.servings,'skipped',pm.skipped,
 'protected',exists(select 1 from public.nutrition_logs l where l.user_id=a.user_id and l.planned_meal_app_id=a.id))), '[]'::jsonb)
 from public.cooking_assignments a join public.planned_meals pm on pm.user_id=a.user_id and pm.app_id=a.id
 join public.meal_plans p on p.row_id=pm.meal_plan_row_id
 where a.group_id=p_group and pm.meal_date>=p_week and pm.meal_date<p_week+7 and p.calendar_active
 and p.row_id=(select row_id from public.meal_plans where user_id=a.user_id and week_of=p.week_of and calendar_active order by version desc,row_id desc limit 1);
$$;
create function public.get_cooking_group_week(p_week_of date) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); state public.cooking_group_weeks; latest public.cooking_generations;
begin
 if gid is null then return jsonb_build_object('group',null,'weekOf',p_week_of,'recipes','[]'::jsonb,'assignments','[]'::jsonb,'grocery',null,'generation',null,'notices','[]'::jsonb,'revision',0); end if;
 if private.calendar_week(p_week_of,private.account_week_start(caller))<>p_week_of then perform private.raise_mutation_error('validation_failed','Choose the account week'); end if;
 select * into state from public.cooking_group_weeks where group_id=gid and week_of=p_week_of;
 select * into latest from public.cooking_generations where group_id=gid and week_of=p_week_of order by created_at desc,id desc limit 1;
 return jsonb_build_object('group',private.cooking_group_json(gid),'weekOf',p_week_of,
 'recipes',(select coalesce(jsonb_agg(private.cooking_recipe_json(m) order by m.name,m.app_id),'[]'::jsonb) from public.meals m where m.archived_at is null and (m.is_system or m.owner_user_id in (select user_id from public.cooking_group_members where group_id=gid)) and m.app_id not like 'group-copy-%'),
 'assignments',private.cooking_live_assignments(gid,p_week_of),'revision',coalesce(state.revision,0),
 'grocery',case when state.group_id is null then null else state.grocery||jsonb_build_object('id',gid::text||':'||p_week_of::text,'weekOf',p_week_of,'revision',state.revision) end,
 'generation',case when latest.id is null then null else private.cooking_generation_json(latest,caller) end,
 'notices',(select coalesce(jsonb_agg(private.cooking_generation_json(n,caller) order by n.created_at desc,n.id desc),'[]'::jsonb) from public.cooking_generations n join public.cooking_generation_notices r on r.generation_id=n.id and r.user_id=caller where n.group_id=gid and r.acknowledged_at is null));
end;
$$;

create function public.cooking_group_command(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid; group_row public.cooking_groups; invitation private.cooking_invitations;
 action text:=p_payload->>'action'; claim record; pin text; result jsonb; proposal public.cooking_week_proposals;
 member uuid; old_start integer; source_state jsonb; destination_state jsonb; dest date; source jsonb;
begin
 perform private.assert_json_shape(p_payload,'payload','object');
 gid:=private.cooking_group_for(caller);
 if action='inspect-pin' then
   insert into private.cooking_pin_attempts values(caller,now(),1) on conflict(user_id) do update set
     attempts=case when cooking_pin_attempts.started_at<now()-interval '15 minutes' then 1 else cooking_pin_attempts.attempts+1 end,
     started_at=case when cooking_pin_attempts.started_at<now()-interval '15 minutes' then now() else cooking_pin_attempts.started_at end;
   if (select attempts from private.cooking_pin_attempts where user_id=caller)>10 then return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.'); end if;
   select * into invitation from private.cooking_invitations where pin_hash=encode(extensions.digest(upper(btrim(p_payload->>'pin')),'sha256'),'hex') and consumed_at is null and expires_at>now();
   if invitation.id is null or invitation.created_by=caller or gid is not null then return jsonb_build_object('error','This PIN is invalid or expired.'); end if;
   select * into group_row from public.cooking_groups where id=invitation.group_id and archived_at is null;
   if group_row.id is null then return jsonb_build_object('error','This PIN is invalid or expired.'); end if;
   if private.account_week_start(caller)<>group_row.week_starts_on then return jsonb_build_object('error','Match the group Start of week in Settings before connecting.'); end if;
   return jsonb_build_object('group',private.cooking_group_json(group_row.id),'inviter',(select name from public.profiles where id=invitation.created_by));
 end if;
 -- Group lock precedes all existing account locks, including idempotency receipts.
 if action='join' then
   select * into invitation from private.cooking_invitations where pin_hash=encode(extensions.digest(upper(btrim(p_payload->>'pin')),'sha256'),'hex'); gid:=invitation.group_id;
 end if;
 if gid is not null then perform private.lock_cooking_group(gid); end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':calendar',0));
 select * into claim from private.claim_mutation(caller,'cooking_group_'||action,p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 if action='invite' then
   if gid is null then
     if not exists(select 1 from public.profiles where id=caller) then perform private.raise_mutation_error('validation_failed','Finish onboarding first'); end if;
     insert into public.cooking_groups(week_starts_on) values(private.account_week_start(caller)) returning id into gid;
     insert into public.cooking_group_members(user_id,group_id) values(caller,gid);
   end if;
   if (select count(*) from public.cooking_group_members where group_id=gid)>=6 then perform private.raise_mutation_error('validation_failed','This group already has six members'); end if;
   update private.cooking_invitations set consumed_at=now() where created_by=caller and consumed_at is null;
   loop
     pin:=upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,6));
     exit when not exists(select 1 from private.cooking_invitations where pin_hash=encode(extensions.digest(pin,'sha256'),'hex'));
   end loop;
   insert into private.cooking_invitations(group_id,created_by,pin_hash,expires_at) values(gid,caller,encode(extensions.digest(pin,'sha256'),'hex'),now()+interval '15 minutes');
   -- Receipt retains no recoverable PIN; an unchanged retry issues a replacement.
   result:=jsonb_build_object('group',private.cooking_group_json(gid),'expiresAt',now()+interval '15 minutes','success',true);
 elsif action='join' then
   select * into invitation from private.cooking_invitations where id=invitation.id for update;
   if invitation.id is null or invitation.consumed_at is not null or invitation.expires_at<=now() or private.cooking_group_for(caller) is not null then perform private.raise_mutation_error('validation_failed','This PIN is invalid or expired.'); end if;
   select * into group_row from public.cooking_groups where id=gid and archived_at is null for update;
   if group_row.revision is distinct from (p_payload->>'groupRevision')::integer then perform private.raise_mutation_error('stale_version','Group changed. Review the connection again.'); end if;
   if private.account_week_start(caller)<>group_row.week_starts_on or (select count(*) from public.cooking_group_members where group_id=gid)>=6 then perform private.raise_mutation_error('validation_failed','Match the week start and check group capacity.'); end if;
   insert into public.cooking_group_members(user_id,group_id) values(caller,gid);
   update private.cooking_invitations set consumed_at=now() where id=invitation.id;
   update public.cooking_week_proposals set status='invalidated' where group_id=gid and status='pending';
   update public.cooking_groups set revision=revision+1 where id=gid;
   result:=jsonb_build_object('group',private.cooking_group_json(gid),'success',true);
 elsif action='leave' then
   if gid is null or gid::text is distinct from p_payload->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
   if (select revision from public.cooking_groups where id=gid) is distinct from (p_payload->>'groupRevision')::integer then perform private.raise_mutation_error('stale_version','Group changed. Refresh and review.'); end if;
   delete from public.cooking_group_members where user_id=caller;
   update private.cooking_invitations set consumed_at=now() where created_by=caller;
   update public.cooking_week_proposals set status='invalidated' where group_id=gid and status='pending';
   update public.cooking_groups set revision=revision+1,archived_at=case when not exists(select 1 from public.cooking_group_members where group_id=gid) then now() else null end where id=gid;
   result:='{"success":true}'::jsonb;
 elsif action='acknowledge' then
   update public.cooking_generation_notices set acknowledged_at=coalesce(acknowledged_at,now()) where user_id=caller and generation_id=(p_payload->>'generationId')::uuid;
   result:='{"success":true}'::jsonb;
 elsif action in ('propose-week','vote-week') then
   if gid is null then perform private.raise_mutation_error('not_found','Group not found'); end if;
   select * into group_row from public.cooking_groups where id=gid for update;
   if group_row.revision is distinct from (p_payload->>'groupRevision')::integer then perform private.raise_mutation_error('stale_version','Group changed. Refresh and review.'); end if;
   if action='propose-week' then
     perform private.assert_finite_number(p_payload->>'day','day',0,6);
     if (p_payload->>'day')::numeric<>trunc((p_payload->>'day')::numeric) then perform private.raise_mutation_error('validation_failed','Choose a weekday'); end if;
     update public.cooking_week_proposals set status='invalidated' where group_id=gid and status='pending';
     insert into public.cooking_week_proposals(group_id,day,approvals) values(gid,(p_payload->>'day')::integer,array[caller]) returning * into proposal;
   else
     select * into proposal from public.cooking_week_proposals where id=(p_payload->>'proposalId')::uuid and group_id=gid and status='pending' for update;
     if proposal.id is null then perform private.raise_mutation_error('stale_version','Proposal changed. Refresh and review.'); end if;
     if (p_payload->>'approve')::boolean then update public.cooking_week_proposals set approvals=array(select distinct unnest(approvals||caller)) where id=proposal.id returning * into proposal;
     else update public.cooking_week_proposals set status='rejected' where id=proposal.id; end if;
   end if;
   if not exists(select 1 from public.cooking_group_members where group_id=gid and not(user_id=any(proposal.approvals))) and coalesce((p_payload->>'approve')::boolean,true) then
     select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) into source_state from public.cooking_group_weeks w where group_id=gid;
     perform set_config('app.cooking_calendar_transition','true',true);
     for member in select user_id from public.cooking_group_members where group_id=gid order by user_id loop
       old_start:=private.account_week_start(member);
       perform private.regroup_calendar(member,old_start,proposal.day);
       update public.profiles set week_starts_on=proposal.day,calendar_revision=calendar_revision+1 where id=member;
     end loop;
     delete from public.cooking_group_weeks where group_id=gid;
     for source in select value from jsonb_array_elements(source_state) order by value->>'week_of' loop
       dest:=private.calendar_week((source->>'week_of')::date,proposal.day);
       insert into public.cooking_group_weeks(group_id,week_of,revision,grocery) values(gid,dest,(source->>'revision')::integer+1,(source->'grocery')||jsonb_build_object('calendarReviewRequired',true,'totalAmountCarriedFromWeek',case when source->'grocery'->>'totalAmountCentavos' is not null then source->>'week_of' end)) on conflict(group_id,week_of) do nothing;
     end loop;
     update public.cooking_groups set week_starts_on=proposal.day where id=gid;
     update public.cooking_week_proposals set status='applied' where id=proposal.id;
     select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) into destination_state from public.cooking_group_weeks w where group_id=gid;
     insert into public.cooking_calendar_transitions(group_id,source_state,destination_state) values(gid,source_state,destination_state);
   end if;
   update public.cooking_groups set revision=revision+1 where id=gid;
   result:=jsonb_build_object('group',private.cooking_group_json(gid),'success',true);
 else perform private.raise_mutation_error('validation_failed','Unknown cooking group action'); end if;
 perform private.complete_mutation(claim.mutation_row_id,result);
 if action='invite' then return result||jsonb_build_object('pin',pin); end if;
 return result;
end;
$$;

-- Membership policies expose shared facts only. Profiles and actual logs retain owner-only policies.
do $$ declare t text; begin
 foreach t in array array['cooking_groups','cooking_group_members','cooking_week_proposals','cooking_group_weeks','cooking_generations','cooking_generation_notices','cooking_assignments','cooking_calendar_transitions'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
   execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy cooking_groups_read on public.cooking_groups for select to authenticated using(id=private.cooking_group_for((select auth.uid())));
create policy cooking_members_read on public.cooking_group_members for select to authenticated using(group_id=private.cooking_group_for((select auth.uid())));
create policy cooking_proposals_read on public.cooking_week_proposals for select to authenticated using(group_id=private.cooking_group_for((select auth.uid())));
create policy cooking_weeks_read on public.cooking_group_weeks for select to authenticated using(group_id=private.cooking_group_for((select auth.uid())));
create policy cooking_generations_read on public.cooking_generations for select to authenticated using(group_id=private.cooking_group_for((select auth.uid())));
create policy cooking_notices_read on public.cooking_generation_notices for select to authenticated using(user_id=(select auth.uid()));
create policy cooking_assignments_read on public.cooking_assignments for select to authenticated using(group_id=private.cooking_group_for((select auth.uid())) or user_id=(select auth.uid()));
create policy cooking_transitions_read on public.cooking_calendar_transitions for select to authenticated using(group_id=private.cooking_group_for((select auth.uid())));
revoke all on private.cooking_invitations,private.cooking_pin_attempts,private.cooking_previews from public,anon,authenticated;
revoke all on function private.cooking_group_for(uuid),private.lock_cooking_group(uuid),private.cooking_group_json(uuid),private.cooking_recipe_json(public.meals),private.cooking_generation_json(public.cooking_generations,uuid),private.cooking_live_assignments(uuid,date) from public,anon,authenticated;
grant execute on function private.cooking_group_for(uuid) to authenticated;
revoke all on function public.get_cooking_group_week(date),public.cooking_group_command(jsonb) from public,anon;
grant execute on function public.get_cooking_group_week(date),public.cooking_group_command(jsonb) to authenticated;

create function private.cooking_basis(p_group uuid,p_week date) returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object(
 'group',private.cooking_group_json(p_group),
 'profiles',(select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p where id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'targets',(select jsonb_agg(to_jsonb(t) order by row_id) from public.daily_targets t where user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'plans',(select jsonb_agg(to_jsonb(p) order by row_id) from public.meal_plans p where calendar_active and week_of=p_week and user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'planned',(select jsonb_agg(to_jsonb(p) order by row_id) from public.planned_meals p where week_of=p_week and user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'logs',(select jsonb_agg(to_jsonb(l) order by row_id) from public.nutrition_logs l where log_date>=p_week and log_date<p_week+7 and user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'recipes',(select jsonb_agg(to_jsonb(m) order by row_id) from public.meals m where is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'foods',(select jsonb_agg(to_jsonb(f) order by row_id) from public.foods f where is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'ingredients',(select jsonb_agg(to_jsonb(i) order by i.row_id) from public.meal_ingredients i join public.meals m on m.row_id=i.meal_row_id where m.is_system or m.owner_user_id in(select user_id from public.cooking_group_members where group_id=p_group)),
 'week',(select to_jsonb(w) from public.cooking_group_weeks w where group_id=p_group and week_of=p_week))::text,'sha256'),'hex');
$$;

-- Service-only: identity comes from an Edge-verified bearer token, never the request body.
create function public.get_group_planning_context(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(p_actor); selected_week date; profile public.profiles; recipe public.meals; plan public.meal_plans;
 recipes jsonb:='[]'; members jsonb:='[]'; allowed jsonb; days jsonb; occupied jsonb; metadata jsonb; day date; target public.daily_targets;
 used_calories numeric; used_carbs numeric; limit_carbs numeric; source_owner uuid;
begin
 if (select auth.role()) is distinct from 'service_role' then perform private.raise_mutation_error('not_authenticated','Server planning only'); end if;
 if gid is null or gid::text is distinct from p_input->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 perform private.assert_date_key(p_input->>'weekOf','weekOf'); selected_week:=(p_input->>'weekOf')::date;
 if private.calendar_week(selected_week,private.account_week_start(p_actor))<>selected_week then perform private.raise_mutation_error('validation_failed','Choose the account week'); end if;
 for recipe in select m.* from public.meals m where archived_at is null and app_id not like 'group-copy-%' and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid)) order by app_id loop
   source_owner:=coalesce(recipe.owner_user_id,p_actor);
   begin
     metadata:=private.normalize_planned_meal_record(jsonb_build_object('mealId',recipe.app_id,'servings',1),source_owner);
     recipes:=recipes||jsonb_build_array(jsonb_build_object('id',recipe.app_id,'name',recipe.name,'revision',recipe.revision,'yield',recipe.servings,'calories',(metadata->>'expectedCalories')::numeric,'carbs',(metadata->>'expectedCarbsG')::numeric,'slots',recipe.meal_slots,'image',recipe.image));
   exception when others then null; end;
 end loop;
 for profile in select p.* from public.profiles p join public.cooking_group_members m on m.user_id=p.id where m.group_id=gid order by p.id loop
   allowed:='[]'; days:='[]';
   for recipe in select m.* from public.meals m where m.app_id in(select r->>'id' from jsonb_array_elements(recipes) r) loop
     begin perform private.assert_generation_recipe(recipe,profile); allowed:=allowed||jsonb_build_array(recipe.app_id); exception when others then null; end;
   end loop;
   select * into plan from public.meal_plans where user_id=profile.id and week_of=selected_week and calendar_active order by version desc,row_id desc limit 1;
   select coalesce(jsonb_agg(jsonb_build_object('id',app_id,'date',meal_date,'slot',meal_slot,'name',label,
   'calories',case when skipped then 0 else expected_calories end,'carbs',case when skipped then 0 else expected_carbs_g end,
   'protected',exists(select 1 from public.nutrition_logs l where l.user_id=profile.id and l.log_date=pm.meal_date and l.meal_slot=pm.meal_slot))), '[]'::jsonb)
   into occupied from public.planned_meals pm where meal_plan_row_id=plan.row_id;
   occupied:=occupied||(select coalesce(jsonb_agg(jsonb_build_object('id','eaten:'||l.log_date::text||':'||l.meal_slot,'date',l.log_date,'slot',l.meal_slot,'name','Eaten entry','calories',0,'carbs',0,'protected',true)), '[]'::jsonb)
   from (select distinct log_date,meal_slot from public.nutrition_logs l where user_id=profile.id and log_date>=selected_week and log_date<selected_week+7
   and not exists(select 1 from public.planned_meals pm where meal_plan_row_id=plan.row_id and meal_date=l.log_date and pm.meal_slot=l.meal_slot)) l);
   for day in select selected_week+i from generate_series(0,6) i loop
     select * into target from public.daily_targets where user_id=profile.id and effective_date<=day order by effective_date desc,version desc limit 1;
     select coalesce(sum(expected_calories),0),coalesce(sum(expected_carbs_g),0) into used_calories,used_carbs from public.planned_meals pm where meal_plan_row_id=plan.row_id and meal_date=day and not skipped
       and not exists(select 1 from public.nutrition_logs l where l.user_id=profile.id and l.planned_meal_app_id=pm.app_id);
     used_calories:=used_calories+coalesce((select sum(calories) from public.nutrition_logs where user_id=profile.id and log_date=day),0);
     used_carbs:=used_carbs+coalesce((select sum(carbs_g) from public.nutrition_logs where user_id=profile.id and log_date=day),0);
     limit_carbs:=private.total_carb_limit(profile.dietary_pattern);
     days:=days||jsonb_build_array(jsonb_build_object('date',day,'calories',coalesce(target.calories,0),'remainingCalories',greatest(0,coalesce(target.calories,0)-used_calories),
       'remainingCarbs',case when limit_carbs is null then null else greatest(0,limit_carbs-used_carbs) end,
       'eligible',target.row_id is not null and target.safety_outcome<>'unsupported_population' and profile.eligibility_status<>'unsupported'));
   end loop;
   members:=members||jsonb_build_array(jsonb_build_object('id',profile.id,'allowed',allowed,'days',days,'occupied',occupied));
 end loop;
 return jsonb_build_object('basis',private.cooking_basis(gid,selected_week),'recipes',recipes,'members',members,'retained',private.cooking_live_assignments(gid,selected_week));
end;
$$;
create function public.store_group_planning_preview(p_actor uuid,p_input jsonb,p_preview jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(p_actor); saved private.cooking_previews;
begin
 if (select auth.role()) is distinct from 'service_role' then perform private.raise_mutation_error('not_authenticated','Server planning only'); end if;
 if gid is null or gid::text is distinct from p_input->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 if private.cooking_basis(gid,(p_input->>'weekOf')::date) is distinct from p_preview->>'basis' then perform private.raise_mutation_error('stale_version','Planning details changed. Refresh the preview.'); end if;
 delete from private.cooking_previews where expires_at<now();
 insert into private.cooking_previews(group_id,created_by,week_of,request,basis,preview) values(gid,p_actor,(p_input->>'weekOf')::date,p_input,p_preview->>'basis',p_preview) returning * into saved;
 return p_preview||jsonb_build_object('id',saved.id,'expiresAt',saved.expires_at);
end;
$$;

-- Copy complete immutable source records, retaining authored measurements and future schema fields.
create function private.cooking_copy_row(p_table text,p_id bigint,p_overrides jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare columns text; result bigint;
begin
 if p_table not in ('foods','meals','meal_ingredients','meal_plans','planned_meals') then raise exception 'Invalid copy table'; end if;
 select string_agg(format('%I',attname),',' order by attnum) into columns from pg_attribute where attrelid=('public.'||p_table)::regclass and attnum>0 and not attisdropped and attname<>'row_id';
 execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,(select to_jsonb(t) from public.%1$I t where row_id=$1)||$2) returning row_id',p_table,columns) into result using p_id,p_overrides;
 return result;
end;
$$;
create function private.cooking_copy_recipe(p_source bigint,p_user uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare recipe public.meals; ingredient public.meal_ingredients; food public.foods; copy_id bigint; food_id bigint; app text;
begin
 select * into recipe from public.meals where row_id=p_source;
 app:='group-copy-'||p_user::text||'-'||p_source::text||'-'||recipe.revision::text;
 select row_id into copy_id from public.meals where app_id=app;
 if copy_id is not null then return copy_id; end if;
 copy_id:=private.cooking_copy_row('meals',p_source,jsonb_build_object('app_id',app,'owner_user_id',p_user,'is_system',false,'archived_at',null));
 for ingredient in select * from public.meal_ingredients where meal_row_id=p_source order by ingredient_order loop
   select * into food from public.foods where row_id=ingredient.food_row_id;
   if food.is_system then food_id:=food.row_id;
   else
     app:='group-copy-'||p_user::text||'-food-'||food.row_id::text||'-'||md5(to_jsonb(food)::text);
     select row_id into food_id from public.foods where app_id=app;
     if food_id is null then food_id:=private.cooking_copy_row('foods',food.row_id,jsonb_build_object('app_id',app,'owner_user_id',p_user,'is_system',false)); end if;
   end if;
   perform private.cooking_copy_row('meal_ingredients',ingredient.row_id,jsonb_build_object('meal_row_id',copy_id,'food_row_id',food_id));
 end loop;
 return copy_id;
end;
$$;

create function private.reconcile_cooking_grocery(p_group uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$
declare state public.cooking_group_weeks; items jsonb:='[]'; generated record; old jsonb; custom jsonb; live jsonb:=private.cooking_live_assignments(p_group,p_week);
begin
 insert into public.cooking_group_weeks(group_id,week_of) values(p_group,p_week) on conflict do nothing;
 select * into state from public.cooking_group_weeks where group_id=p_group and week_of=p_week for update;
 for generated in
 with portions as(select a->>'recipeId' recipe_id,sum((a->>'servings')::numeric) portions from jsonb_array_elements(live) a where not coalesce((a->>'skipped')::boolean,false) group by 1),
 recipes as(select distinct on(a.recipe_id) a.recipe_id,m.* from public.cooking_assignments a join public.meals m on m.row_id=a.recipe_snapshot_row_id where a.group_id=p_group order by a.recipe_id,a.generation_id desc),
 totals as(select f.app_id,f.name,f.category,f.serving_unit,sum(i.servings*ceil(p.portions/m.servings)*case when f.serving_unit='piece' then 1 else f.serving_grams end) quantity
 from portions p join recipes m on m.recipe_id=p.recipe_id join public.meal_ingredients i on i.meal_row_id=m.row_id join public.foods f on f.row_id=i.food_row_id group by f.app_id,f.name,f.category,f.serving_unit)
 select 'cg-'||md5(lower(name)||':'||serving_unit) id,name,category,case when serving_unit='piece' then 'pcs' else 'g' end unit,
 sum(case when serving_unit='piece' then ceil(quantity) else round(quantity) end) quantity from totals group by name,category,serving_unit
 loop
   select value into old from jsonb_array_elements(state.grocery->'items') where value->>'id'=generated.id;
   items:=items||jsonb_build_array(jsonb_build_object('id',generated.id,'name',generated.name,'category',generated.category,'unit',generated.unit,
   'generatedQuantity',generated.quantity,'quantity',case when old is not null and old->>'quantity' is distinct from old->>'generatedQuantity' then (old->>'quantity')::numeric else generated.quantity end,
   'checked',coalesce((old->>'checked')::boolean,false),'removed',coalesce((old->>'removed')::boolean,false)));
 end loop;
 for custom in select value from jsonb_array_elements(state.grocery->'items') where coalesce((value->>'custom')::boolean,false) or not exists(select 1 from jsonb_array_elements(items) i where i->>'id'=value->>'id') and (coalesce((value->>'removed')::boolean,false) or value->>'quantity' is distinct from value->>'generatedQuantity') loop
   items:=items||jsonb_build_array(custom);
 end loop;
 update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('items',items),revision=revision+1 where group_id=p_group and week_of=p_week;
end;
$$;

create function public.commit_cooking_group_plan(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); preview private.cooking_previews; claim record; gen uuid;
 member uuid; old_plan public.meal_plans; next_plan bigint; target bigint; item jsonb; source_recipe public.meals; copy_recipe bigint; normalized jsonb; existing public.planned_meals;
 result jsonb; position integer;
begin
 if gid is null then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 select * into claim from private.claim_mutation(caller,'commit_cooking_group_plan',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 select * into preview from private.cooking_previews where id=(p_payload->>'previewId')::uuid and group_id=gid and created_by=caller for update;
 if preview.id is null or preview.expires_at<=now() or private.cooking_basis(gid,preview.week_of) is distinct from preview.basis then perform private.raise_mutation_error('stale_version','Planning details changed. Refresh and review the preview.'); end if;
 if coalesce((p_payload->>'acknowledged')::boolean,false)=false then perform private.raise_mutation_error('validation_failed','Review replacements, portions, and leftovers before saving'); end if;
 if jsonb_array_length(preview.preview->'assignments')=0 then perform private.raise_mutation_error('validation_failed','No assignments to save'); end if;
 insert into public.cooking_generations(group_id,week_of,generated_by,generator_name,member_ids,summary)
 values(gid,preview.week_of,caller,(select name from public.profiles where id=caller),array(select jsonb_array_elements_text(preview.request->'memberIds')::uuid),preview.preview) returning id into gen;
 for member in select jsonb_array_elements_text(preview.request->'memberIds')::uuid order by 1 loop
   if private.cooking_group_for(member) is distinct from gid then perform private.raise_mutation_error('stale_version','Membership changed. Review the preview.'); end if;
   select * into old_plan from public.meal_plans where user_id=member and week_of=preview.week_of and calendar_active order by version desc,row_id desc limit 1 for update;
   if old_plan.row_id is null then
     select row_id into target from public.daily_targets where user_id=member and effective_date<=preview.week_of+6 order by effective_date desc,version desc limit 1;
     if target is null then perform private.raise_mutation_error('validation_failed','An eligible target is required'); end if;
     insert into public.meal_plans(app_id,user_id,version,week_of,target_row_id) values('mp-'||preview.week_of::text,member,coalesce((select max(version)+1 from public.meal_plans where user_id=member and week_of=preview.week_of),1),preview.week_of,target) returning row_id into next_plan;
   else
     next_plan:=private.cooking_copy_row('meal_plans',old_plan.row_id,jsonb_build_object('version',old_plan.version+1,'supersedes_plan_row_id',old_plan.row_id,'created_at',now()));
     for existing in select * from public.planned_meals where meal_plan_row_id=old_plan.row_id loop
       if not exists(select 1 from jsonb_array_elements(preview.preview->'replacements') r where r->>'memberId'=member::text and r->>'id'=existing.app_id) then
         perform private.cooking_copy_row('planned_meals',existing.row_id,jsonb_build_object('meal_plan_row_id',next_plan));
       end if;
     end loop;
   end if;
   position:=coalesce((select max(sort_order) from public.planned_meals where meal_plan_row_id=next_plan),0);
   for item in select value from jsonb_array_elements(preview.preview->'assignments') where value->>'memberId'=member::text loop
     if not (preview.request->'selectedDates' ? (item->>'date')) then perform private.raise_mutation_error('validation_failed','Assignment outside selected days'); end if;
     select * into source_recipe from public.meals where app_id=item->>'recipeId' and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid));
     if source_recipe.row_id is null then perform private.raise_mutation_error('stale_version','Recipe unavailable'); end if;
     perform private.assert_generation_recipe(source_recipe,(select p from public.profiles p where id=member));
     copy_recipe:=private.cooking_copy_recipe(source_recipe.row_id,member);
     normalized:=private.normalize_planned_meal_record(jsonb_build_object('mealId',(select app_id from public.meals where row_id=copy_recipe),'servings',item->'servings'),member);
     position:=position+1;
     insert into public.planned_meals(meal_plan_row_id,user_id,week_of,app_id,meal_date,meal_slot,meal_row_id,label,servings,expected_calories,expected_protein_g,expected_carbs_g,expected_fat_g,source,source_version,assumptions,confidence,preparation_basis,slot_key,sort_order)
     values(next_plan,member,preview.week_of,item->>'id',(item->>'date')::date,item->>'slot',copy_recipe,source_recipe.name,(item->>'servings')::numeric,(normalized->>'expectedCalories')::numeric,(normalized->>'expectedProteinG')::numeric,(normalized->>'expectedCarbsG')::numeric,(normalized->>'expectedFatG')::numeric,normalized->>'source',normalized->>'sourceVersion',normalized->>'assumptions',normalized->>'confidence',normalized->>'preparationBasis','group:'||(item->>'id'),position);
     insert into public.cooking_assignments(id,user_id,group_id,generation_id,recipe_id,recipe_snapshot_row_id,meal_date,meal_slot) values(item->>'id',member,gid,gen,source_recipe.app_id,copy_recipe,(item->>'date')::date,item->>'slot');
   end loop;
   insert into public.cooking_generation_notices(generation_id,user_id) values(gen,member);
 end loop;
 perform private.reconcile_cooking_grocery(gid,preview.week_of);
 result:=jsonb_build_object('success',true,'generationId',gen);
 perform private.complete_mutation(claim.mutation_row_id,result);
 return result;
end;
$$;

revoke all on function private.cooking_basis(uuid,date),private.cooking_copy_row(text,bigint,jsonb),private.cooking_copy_recipe(bigint,uuid),private.reconcile_cooking_grocery(uuid,date) from public,anon,authenticated;
revoke all on function public.get_group_planning_context(uuid,jsonb),public.store_group_planning_preview(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.get_group_planning_context(uuid,jsonb),public.store_group_planning_preview(uuid,jsonb,jsonb) to service_role;
revoke all on function public.commit_cooking_group_plan(jsonb) from public,anon;
grant execute on function public.commit_cooking_group_plan(jsonb) to authenticated;

create function public.mutate_cooking_group_week(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); week date; state public.cooking_group_weeks;
 claim record; items jsonb; item jsonb; amount numeric; quantity numeric; result jsonb; assignment public.cooking_assignments; pm public.planned_meals; plan public.meal_plans; next_plan bigint; normalized jsonb;
begin
 if gid is null or gid::text is distinct from p_payload->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 select * into claim from private.claim_mutation(caller,'mutate_cooking_group_week',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 perform private.assert_date_key(p_payload->>'weekOf','weekOf'); week:=(p_payload->>'weekOf')::date;
 if private.calendar_week(week,private.account_week_start(caller))<>week then perform private.raise_mutation_error('stale_version','Calendar changed. Return to the newly grouped list.'); end if;
 insert into public.cooking_group_weeks(group_id,week_of) values(gid,week) on conflict do nothing;
 select * into state from public.cooking_group_weeks where group_id=gid and week_of=week for update;
 if state.revision is distinct from (p_payload->>'revision')::integer then perform private.raise_mutation_error('stale_version','Shared list changed. Refresh and review the latest value.'); end if;
 if p_payload->>'action'='edit-assignment' then
   select * into assignment from public.cooking_assignments where group_id=gid and id=p_payload->>'assignmentId';
   if assignment.id is null or private.cooking_group_for(assignment.user_id) is distinct from gid then perform private.raise_mutation_error('not_found','Assignment not found'); end if;
   select * into plan from public.meal_plans where user_id=assignment.user_id and week_of=week and calendar_active order by version desc,row_id desc limit 1 for update;
   select * into pm from public.planned_meals where meal_plan_row_id=plan.row_id and app_id=assignment.id;
   if pm.row_id is null then perform private.raise_mutation_error('stale_version','Assignment changed. Refresh and review.'); end if;
   if exists(select 1 from public.nutrition_logs where user_id=assignment.user_id and planned_meal_app_id=assignment.id) then perform private.raise_mutation_error('conflict','This meal is already logged. Its planned basis is preserved.'); end if;
   perform private.assert_finite_number(p_payload->>'servings','servings',.25,4);
   if (p_payload->>'servings')::numeric*4<>trunc((p_payload->>'servings')::numeric*4) then perform private.raise_mutation_error('validation_failed','Choose quarter servings'); end if;
   normalized:=private.normalize_planned_meal_record(jsonb_build_object('mealId',(select app_id from public.meals where row_id=pm.meal_row_id),'servings',p_payload->'servings'),assignment.user_id);
   if private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) is not null and (normalized->>'expectedCarbsG')::numeric+coalesce((select sum(expected_carbs_g) from public.planned_meals where meal_plan_row_id=plan.row_id and meal_date=pm.meal_date and not skipped and row_id<>pm.row_id),0)>private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) then perform private.raise_mutation_error('validation_failed','Portion exceeds this member’s planning limits'); end if;
   next_plan:=private.cooking_copy_row('meal_plans',plan.row_id,jsonb_build_object('version',plan.version+1,'supersedes_plan_row_id',plan.row_id,'created_at',now()));
   for item in select to_jsonb(p) from public.planned_meals p where meal_plan_row_id=plan.row_id loop
     perform private.cooking_copy_row('planned_meals',(item->>'row_id')::bigint,jsonb_build_object('meal_plan_row_id',next_plan)||case when item->>'app_id'=assignment.id then jsonb_build_object('servings',p_payload->'servings','skipped',(p_payload->>'skipped')::boolean,'expected_calories',normalized->'expectedCalories','expected_protein_g',normalized->'expectedProteinG','expected_carbs_g',normalized->'expectedCarbsG','expected_fat_g',normalized->'expectedFatG') else '{}'::jsonb end);
   end loop;
   perform private.reconcile_cooking_grocery(gid,week);
 elsif p_payload->>'operation'='refresh' then perform private.reconcile_cooking_grocery(gid,week);
 elsif p_payload->>'operation'='amount' then
   if jsonb_typeof(p_payload->'amount') is distinct from 'null' then
     perform private.assert_finite_number(p_payload->>'amount','amount',0,9007199254740991);
     amount:=(p_payload->>'amount')::numeric;
     if amount<>trunc(amount) then perform private.raise_mutation_error('validation_failed','Use integer centavos'); end if;
   end if;
   update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('totalAmountCentavos',amount,'totalAmountCarriedFromWeek',null),revision=revision+1 where group_id=gid and week_of=week;
 else
   items:='[]';
   if p_payload->>'operation'='add' then
     perform private.assert_nonblank(p_payload->>'name','name',256); perform private.assert_nonblank(p_payload->>'unit','unit',32);
     perform private.assert_finite_number(p_payload->>'quantity','quantity',0,1000000);
     items:=state.grocery->'items'||jsonb_build_array(jsonb_build_object('id','custom-'||gen_random_uuid()::text,'name',btrim(p_payload->>'name'),'unit',p_payload->>'unit','category','Other','quantity',(p_payload->>'quantity')::numeric,'generatedQuantity',0,'custom',true,'checked',false));
   else
     if not exists(select 1 from jsonb_array_elements(state.grocery->'items') i where i->>'id'=p_payload->>'itemId') then perform private.raise_mutation_error('not_found','Item not found'); end if;
     for item in select value from jsonb_array_elements(state.grocery->'items') loop
       if item->>'id'=p_payload->>'itemId' then
         case p_payload->>'operation'
         when 'quantity' then
           perform private.assert_finite_number(p_payload->>'quantity','quantity',0,1000000); quantity:=(p_payload->>'quantity')::numeric;
           item:=item||jsonb_build_object('quantity',quantity);
         when 'toggle' then item:=item||jsonb_build_object('checked',not coalesce((item->>'checked')::boolean,false));
         when 'remove' then item:=item||'{"removed":true}'::jsonb;
         else perform private.raise_mutation_error('validation_failed','Choose a grocery action'); end case;
       end if;
       items:=items||jsonb_build_array(item);
     end loop;
   end if;
   update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('items',items),revision=revision+1 where group_id=gid and week_of=week;
 end if;
 result:='{"success":true}'::jsonb; perform private.complete_mutation(claim.mutation_row_id,result); return result;
end;
$$;
revoke all on function public.mutate_cooking_group_week(jsonb) from public,anon;
grant execute on function public.mutate_cooking_group_week(jsonb) to authenticated;

-- Group images remain private. Existing immutable personal recipe copies retain access after leaving.
create function public.can_read_cooking_recipe_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.meals m where m.image->>'kind'='upload' and m.image->>'path'=p_path
 and (m.owner_user_id=(select auth.uid()) or m.owner_user_id in(select user_id from public.cooking_group_members where group_id=private.cooking_group_for((select auth.uid())))));
$$;
revoke all on function public.can_read_cooking_recipe_image(text) from public,anon;
grant execute on function public.can_read_cooking_recipe_image(text) to authenticated;
create policy cooking_recipe_images_read on storage.objects for select to authenticated using(bucket_id='recipe-covers' and public.can_read_cooking_recipe_image(name));

create function private.broadcast_cooking_change() returns trigger language plpgsql security definer set search_path='' as $$
declare gid uuid:=coalesce((to_jsonb(new)->>'group_id')::uuid,(to_jsonb(old)->>'group_id')::uuid,(to_jsonb(new)->>'id')::uuid);
begin
 perform realtime.send(jsonb_build_object('groupId',gid),'changed','cooking:'||gid::text,true);
 return coalesce(new,old);
end;
$$;
revoke all on function private.broadcast_cooking_change() from public,anon,authenticated;
create trigger cooking_week_broadcast after insert or update on public.cooking_group_weeks for each row execute function private.broadcast_cooking_change();
create trigger cooking_group_broadcast after update on public.cooking_groups for each row execute function private.broadcast_cooking_change();
create policy cooking_realtime_read on realtime.messages for select to authenticated using(extension='broadcast' and realtime.topic()='cooking:'||private.cooking_group_for((select auth.uid()))::text);

-- Preserve the existing receipt and calendar checks; acquire the group lock first.
CREATE OR REPLACE FUNCTION "private"."claim_mutation"("p_user_id" "uuid", "p_operation" "text", "p_idempotency_key" "text", "p_payload" "jsonb") RETURNS TABLE("mutation_row_id" bigint, "request_hash" "text", "replay" boolean, "status" "text", "result_refs" "jsonb", "error_code" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  -- Calendar revision is concurrency metadata; replay identity is the original business intent.
  current_hash text := private.request_hash(p_payload - 'calendarRevision');
  existing public.mutation_idempotency%rowtype;
begin
  if private.cooking_group_for(p_user_id) is not null then perform private.lock_cooking_group(private.cooking_group_for(p_user_id)); end if;
  if p_user_id is null then
    perform private.raise_mutation_error('not_authenticated');
  end if;
  if p_operation is null or btrim(p_operation) = '' then
    perform private.raise_mutation_error('validation_failed', 'operation is required');
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    perform private.raise_mutation_error('validation_failed', 'idempotency_key is required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':calendar',0));

  insert into public.mutation_idempotency (
    user_id, operation, idempotency_key, request_hash, status
  )
  values (p_user_id, p_operation, p_idempotency_key, current_hash, 'pending')
  on conflict (user_id, operation, idempotency_key) do nothing;

  select *
  into existing
  from public.mutation_idempotency
  where user_id = p_user_id
    and operation = p_operation
    and idempotency_key = p_idempotency_key
  for update;

  if existing.request_hash <> current_hash then
    perform private.raise_mutation_error('idempotency_key_reused');
  end if;

  if existing.status = 'completed' then
    return query
    select existing.row_id, existing.request_hash, true, existing.status,
           existing.result_refs, existing.error_code;
    return;
  end if;

  if (p_operation in ('complete_onboarding','update_profile','update_units','reset_plan','set_week_start','skip_planned_meal','edit_meal_plan','add_planned_meal','generate_nutrition_week','log_planned_meal','toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery') or p_payload ? 'grocery')
     and exists(select 1 from public.profiles where id=p_user_id and calendar_revision::text is distinct from p_payload->>'calendarRevision') then
    perform private.raise_mutation_error('stale_version','Calendar settings changed. Refresh your account and review this action again.');
  end if;

  if existing.status = 'failed' then
    update public.mutation_idempotency
    set status = 'pending', error_code = null, completed_at = null
    where row_id = existing.row_id;
    existing.status := 'pending';
    existing.error_code := null;
  end if;

  return query
  select existing.row_id, existing.request_hash, false, existing.status,
         existing.result_refs, existing.error_code;
end;
$$;
