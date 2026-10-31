-- Consent is per membership incarnation. Receipts outlive membership so a second
-- group can never import the same historical purchase or spending twice.
create table private.grocery_sharing (
  user_id uuid primary key references auth.users on delete cascade,
  group_id uuid not null references public.cooking_groups on delete cascade,
  joined_at timestamptz not null, enabled boolean not null default false,
  consented_at timestamptz not null default now()
);
create table private.grocery_transfers (
  source_list_id bigint primary key references public.grocery_lists on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  group_id uuid not null, source_week date not null, target_week date not null,
  source_revision integer not null, amount_centavos bigint,
  transferred_at timestamptz not null default now()
);
create index grocery_sharing_group_idx on private.grocery_sharing(group_id,user_id);
create index grocery_transfers_owner_idx on private.grocery_transfers(user_id,group_id);
alter table private.grocery_sharing enable row level security;
alter table private.grocery_transfers enable row level security;
revoke all on private.grocery_sharing,private.grocery_transfers from public,anon,authenticated;

-- Preserve the verified baseline implementations without renaming their OIDs:
-- existing callers must continue resolving the now-extended entry points.
do $copy$
declare signature text; definition text; name text;
begin
  foreach signature in array array['private.reconcile_cooking_grocery(uuid,date)','private.reconcile_personal_cooking_grocery(uuid,date)','public.get_nutrition_week(date)'] loop
    select pg_get_functiondef(signature::regprocedure),p.proname into definition,name from pg_proc p where p.oid=signature::regprocedure;
    execute replace(definition,split_part(signature,'(',1)||'(', 'private.before_shared_'||name||'(');
    execute 'revoke all on function private.before_shared_'||name||'('||split_part(signature,'(',2)||' from public,anon,authenticated';
  end loop;
end;
$copy$;

create function private.grocery_sharing_active(p_user uuid,p_group uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.grocery_sharing s join public.cooking_group_members m on m.user_id=s.user_id and m.group_id=s.group_id and m.joined_at=s.joined_at where s.user_id=p_user and s.group_id=p_group);
$$;

create function public.get_grocery_sharing_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); source public.grocery_lists; dest date; next jsonb; remaining integer; enabled boolean;
begin
 if gid is null then return jsonb_build_object('status','disconnected','remaining',0,'completed',0); end if;
 select count(*) into remaining from public.grocery_lists g where g.user_id=caller and g.calendar_active and not exists(select 1 from private.grocery_transfers t where t.source_list_id=g.row_id);
 if not private.grocery_sharing_active(caller,gid) then return jsonb_build_object('status','not-enabled','remaining',remaining,'completed',0); end if;
 select s.enabled into enabled from private.grocery_sharing s where user_id=caller;
 select * into source from public.grocery_lists g where g.user_id=caller and g.calendar_active and not exists(select 1 from private.grocery_transfers t where t.source_list_id=g.row_id) order by g.week_of,g.row_id limit 1;
 if source.row_id is not null then
   dest:=private.calendar_week(source.week_of,(select week_starts_on from public.cooking_groups where id=gid));
   next:=jsonb_build_object('sourceListId',source.row_id,'sourceRevision',source.revision,'sourceWeek',source.week_of,'targetWeek',dest,'targetRevision',coalesce((select revision from public.cooking_group_weeks where group_id=gid and week_of=dest),0));
 end if;
 return jsonb_build_object('status',case when enabled then 'enabled' else 'transferring' end,'remaining',remaining,'next',next,
 'completed',(select count(*) from private.grocery_transfers where user_id=caller and group_id=gid),
 'draftWeeks',(select coalesce(jsonb_agg(jsonb_build_object('sourceWeek',source_week,'targetWeek',private.calendar_week(source_week,(select week_starts_on from public.cooking_groups where id=gid)))),'[]') from private.grocery_transfers where user_id=caller and group_id=gid));
end;
$$;

create function private.shared_grocery_item(p_item public.grocery_items,p_source public.grocery_lists) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','pg-'||p_item.row_id,'name',p_item.name,'category',p_item.category,'unit',p_item.unit,
 'quantity',p_item.quantity,'generatedQuantity',p_item.generated_quantity,'checked',p_item.checked,'removed',p_item.removed,'custom',true,
 'personalGenerated',not p_item.custom_item,'sourceOwner',p_item.user_id,'sourceItemId',p_item.app_id,'sourceWeek',p_source.week_of,'sourceListId',p_source.row_id)
 ||case when p_item.carried_from_week is not null then jsonb_build_object('carriedFromWeek',p_item.carried_from_week) else '{}'::jsonb end;
$$;

create function private.sync_shared_personal_grocery(p_group uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$
declare member record; source public.grocery_lists; item public.grocery_items; old jsonb; incoming jsonb; items jsonb; day integer;
begin
 select week_starts_on into day from public.cooking_groups where id=p_group;
 if p_week<private.calendar_week(current_date,day) then return; end if;
 select grocery->'items' into items from public.cooking_group_weeks where group_id=p_group and week_of=p_week for update;
 for member in select s.user_id from private.grocery_sharing s join public.cooking_group_members m on m.user_id=s.user_id and m.group_id=s.group_id and m.joined_at=s.joined_at where s.group_id=p_group and s.enabled order by s.user_id loop
   -- Personal plans retain their owner; only their shopping requirements are shared.
   if not exists(select 1 from public.meal_plans where user_id=member.user_id and week_of=p_week and calendar_active) then continue; end if;
   select * into source from public.grocery_lists where user_id=member.user_id and week_of=p_week and calendar_active for update;
   if source.row_id is null then
     insert into public.grocery_lists(app_id,user_id,week_of) values('gl-shared-'||gen_random_uuid(),member.user_id,p_week) returning * into source;
   end if;
   if exists(select 1 from private.grocery_transfers where source_list_id=source.row_id and group_id<>p_group) then continue; end if;
   perform private.before_shared_reconcile_personal_cooking_grocery(member.user_id,p_week);
   insert into private.grocery_transfers(source_list_id,user_id,group_id,source_week,target_week,source_revision)
     values(source.row_id,member.user_id,p_group,source.week_of,p_week,source.revision) on conflict do nothing;
   for item in select * from public.grocery_items where grocery_list_row_id=source.row_id and not custom_item order by row_id loop
     incoming:=private.shared_grocery_item(item,source);
     select value into old from jsonb_array_elements(coalesce(items,'[]')) where value->>'id'=incoming->>'id';
     if old is not null then incoming:=incoming||jsonb_build_object('quantity',case when old->>'quantity' is distinct from old->>'generatedQuantity' then old->'quantity' else incoming->'generatedQuantity' end,'checked',old->'checked','removed',coalesce((old->>'removed')::boolean,false) or item.removed); end if;
     items:=(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(coalesce(items,'[]')) where value->>'id'<>incoming->>'id')||jsonb_build_array(incoming);
   end loop;
 end loop;
 update public.cooking_group_weeks set grocery=jsonb_set(grocery,'{items}',coalesce(items,'[]')) where group_id=p_group and week_of=p_week;
end;
$$;

create or replace function private.reconcile_cooking_grocery(p_group uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.before_shared_reconcile_cooking_grocery(p_group,p_week);
 perform private.sync_shared_personal_grocery(p_group,p_week);
end;
$$;
create or replace function private.reconcile_personal_cooking_grocery(p_user uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(p_user);
begin
 if gid is not null and private.grocery_sharing_active(p_user,gid) and exists(select 1 from private.grocery_sharing where user_id=p_user and enabled) then
   perform private.reconcile_cooking_grocery(gid,p_week);
 else perform private.before_shared_reconcile_personal_cooking_grocery(p_user,p_week); end if;
end;
$$;

create function public.share_cooking_groceries(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); membership public.cooking_group_members;
 source public.grocery_lists; target public.cooking_group_weeks; dest date; amount numeric; items jsonb; claim record; result jsonb; day integer;
begin
 if gid is null or gid::text is distinct from p_payload->>'groupId' then perform private.raise_mutation_error('not_found','Cooking group not found.'); end if;
 perform private.lock_cooking_group(gid);
 perform 1 from public.profiles where id=caller for update;
 select * into membership from public.cooking_group_members where user_id=caller and group_id=gid for update;
 select week_starts_on into day from public.cooking_groups where id=gid;
 select * into claim from private.claim_mutation(caller,'share_cooking_groceries',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return jsonb_build_object('success',true,'sharing',public.get_grocery_sharing_status()); end if;
 if p_payload->>'action'='share-groceries' then
   if p_payload->'acknowledged' is distinct from 'true'::jsonb then perform private.raise_mutation_error('validation_failed','Confirm sharing all saved weeks and adding recorded spending.'); end if;
   if (p_payload->>'groupRevision')::integer is distinct from (select revision from public.cooking_groups where id=gid) then perform private.raise_mutation_error('stale_version','Group changed. Refresh and review its members.'); end if;
   insert into private.grocery_sharing(user_id,group_id,joined_at) values(caller,gid,membership.joined_at)
   on conflict(user_id) do update set group_id=excluded.group_id,joined_at=excluded.joined_at,enabled=case when grocery_sharing.group_id=excluded.group_id and grocery_sharing.joined_at=excluded.joined_at then grocery_sharing.enabled else false end,consented_at=now();
 elsif p_payload->>'action'='transfer-grocery-week' then
   if not private.grocery_sharing_active(caller,gid) then perform private.raise_mutation_error('forbidden','Enable sharing your own groceries first.'); end if;
   select * into source from public.grocery_lists where row_id=(p_payload->>'sourceListId')::bigint and user_id=caller and calendar_active for update;
   if source.row_id is null then perform private.raise_mutation_error('not_found','Personal grocery week not found.'); end if;
   if not exists(select 1 from private.grocery_transfers where source_list_id=source.row_id) then
     if source.revision is distinct from (p_payload->>'sourceRevision')::integer then perform private.raise_mutation_error('stale_version','Personal week changed. Refresh and review before retrying.'); end if;
     dest:=private.calendar_week(source.week_of,day);
     insert into public.cooking_group_weeks(group_id,week_of) values(gid,dest) on conflict do nothing;
     select * into target from public.cooking_group_weeks where group_id=gid and week_of=dest for update;
     if target.revision is distinct from (p_payload->>'targetRevision')::integer then perform private.raise_mutation_error('stale_version','Shared week changed. Refresh and review before retrying.'); end if;
     amount:=case when source.total_amount_centavos is null then (target.grocery->>'totalAmountCentavos')::numeric else coalesce((target.grocery->>'totalAmountCentavos')::numeric,0)+source.total_amount_centavos end;
     if amount>9007199254740991 then perform private.raise_mutation_error('validation_failed','Combined spending exceeds the supported amount. Correct a recorded amount before retrying.'); end if;
     select coalesce(jsonb_agg(private.shared_grocery_item(i,source) order by i.row_id),'[]') into items from public.grocery_items i where grocery_list_row_id=source.row_id;
     update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('items',coalesce(grocery->'items','[]')||items,'totalAmountCentavos',amount,
       'calendarReviewRequired',coalesce((grocery->>'calendarReviewRequired')::boolean,false) or source.week_of<>dest,
       'totalAmountCarriedFromWeek',case when source.week_of<>dest and source.total_amount_centavos is not null then to_jsonb(source.week_of) else grocery->'totalAmountCarriedFromWeek' end), revision=revision+1 where group_id=gid and week_of=dest;
     insert into private.grocery_transfers(source_list_id,user_id,group_id,source_week,target_week,source_revision,amount_centavos) values(source.row_id,caller,gid,source.week_of,dest,source.revision,source.total_amount_centavos);
   end if;
 else perform private.raise_mutation_error('validation_failed','Choose a grocery sharing action.'); end if;
 if not exists(select 1 from public.grocery_lists g where g.user_id=caller and g.calendar_active and not exists(select 1 from private.grocery_transfers t where t.source_list_id=g.row_id)) then
   update private.grocery_sharing set enabled=true where user_id=caller;
 end if;
 result:=jsonb_build_object('success',true,'sharing',public.get_grocery_sharing_status());
 perform private.complete_mutation(claim.mutation_row_id,result);
 return result;
end;
$$;

-- Guard old clients at the authoritative entry point; domain-driven plan updates
-- may still reconcile requirements, but direct personal shopping edits must stop.
create function private.assert_personal_grocery_writable() returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller);
begin
 if gid is not null and private.grocery_sharing_active(caller,gid) then perform private.raise_mutation_error('conflict','Groceries are shared now. Refresh and use the shared Grocery list.'); end if;
end;
$$;
do $guards$
declare name text;
begin
 foreach name in array array['toggle_grocery_item','set_grocery_quantity','remove_grocery_item','add_custom_grocery_item','regenerate_grocery','set_grocery_total_amount'] loop
   execute format('create or replace function public.%I(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='''' as $body$ begin perform private.assert_personal_grocery_writable(); return private.%I(p_payload); end; $body$;',name,name);
 end loop;
end;
$guards$;

create or replace function public.get_nutrition_week(p_week_of date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=private.before_shared_get_nutrition_week(p_week_of);
begin
 if exists(select 1 from public.grocery_lists g join private.grocery_transfers t on t.source_list_id=g.row_id where g.user_id=(select auth.uid()) and g.week_of=p_week_of and g.calendar_active) then result:=result||'{"grocery":null,"groceryItems":[]}'::jsonb; end if;
 return result;
end;
$$;

-- A future independent plan change must invalidate the shared shopping baseline.
create function private.personal_plan_shared_grocery_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(new.user_id); day integer;
begin
 if gid is not null and exists(select 1 from private.grocery_sharing where user_id=new.user_id and enabled) and private.grocery_sharing_active(new.user_id,gid) then
   select week_starts_on into day from public.cooking_groups where id=gid;
   perform private.reconcile_cooking_grocery(gid,private.calendar_week(new.meal_date,day));
 end if;
 return null;
end;
$$;
create constraint trigger personal_plan_shared_grocery_changed after insert or update on public.planned_meals deferrable initially deferred for each row execute function private.personal_plan_shared_grocery_changed();

-- Leaving retains group purchases, but starts fresh personal shopping rather than
-- bringing transferred amounts/items back or exposing them to a second group.
create function private.grocery_sharing_membership_left() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.grocery_lists g set calendar_active=false where g.user_id=old.user_id and g.calendar_active and exists(select 1 from private.grocery_transfers t where t.source_list_id=g.row_id);
 delete from private.grocery_sharing where user_id=old.user_id;
 return old;
end;
$$;
create trigger grocery_sharing_membership_left after delete on public.cooking_group_members for each row execute function private.grocery_sharing_membership_left();

revoke all on function private.grocery_sharing_active(uuid,uuid),private.shared_grocery_item(public.grocery_items,public.grocery_lists),private.sync_shared_personal_grocery(uuid,date),private.assert_personal_grocery_writable(),private.personal_plan_shared_grocery_changed(),private.grocery_sharing_membership_left() from public,anon,authenticated;
revoke all on function public.get_grocery_sharing_status(),public.share_cooking_groceries(jsonb) from public,anon;
grant execute on function public.get_grocery_sharing_status(),public.share_cooking_groceries(jsonb) to authenticated;
