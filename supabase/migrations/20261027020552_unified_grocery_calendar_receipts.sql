-- Calendar regrouping carries the shared purchase facts itself. Its new personal
-- headers are internal projections, not fresh purchases eligible for import.
do $copy$
declare definition text;
begin
 definition:=pg_get_functiondef('private.regroup_calendar(uuid,integer,integer)'::regprocedure);
 execute replace(definition,'private.regroup_calendar(','private.before_sharing_regroup_calendar(');
 definition:=pg_get_functiondef('private.sync_shared_personal_grocery(uuid,date)'::regprocedure);
 if position($needle$if p_week<private.calendar_week$needle$ in definition)=0 then raise exception 'Unexpected personal grocery reconciliation baseline'; end if;
 definition:=replace(definition,$needle$if p_week<private.calendar_week$needle$,$replacement$if current_setting('app.cooking_calendar_transition',true)='true' then return; end if;
 if p_week<private.calendar_week$replacement$);
 if position($needle$where value->>'id'=incoming->>'id';$needle$ in definition)=0 then raise exception 'Unexpected grocery identity baseline'; end if;
 definition:=replace(definition,$needle$where value->>'id'=incoming->>'id';$needle$,
 $replacement$where value->>'id'=incoming->>'id' or (value->>'sourceOwner'=member.user_id::text and value->>'sourceItemId'=item.app_id and private.calendar_week((value->>'sourceWeek')::date,day)=p_week) order by (value->>'id'=incoming->>'id') desc limit 1;$replacement$);
 definition:=replace(definition,$needle$if old is not null then incoming:=incoming||jsonb_build_object('quantity',$needle$,$replacement$if old is not null then incoming:=incoming||jsonb_build_object('id',old->>'id','sourceWeek',old->'sourceWeek','quantity',$replacement$);
 execute definition;
end;
$copy$;
revoke all on function private.before_sharing_regroup_calendar(uuid,integer,integer) from public,anon,authenticated;

create or replace function private.regroup_calendar(p_user uuid,p_from integer,p_to integer) returns void language plpgsql security definer set search_path='' as $$
declare gid uuid:=private.cooking_group_for(p_user);
begin
 if gid is not null and exists(select 1 from private.grocery_sharing s join public.cooking_group_members m on m.user_id=s.user_id and m.group_id=s.group_id and m.joined_at=s.joined_at where s.group_id=gid and not s.enabled) then
   perform private.raise_mutation_error('conflict','Finish the grocery transfer before changing the group calendar.');
 end if;
 perform private.before_sharing_regroup_calendar(p_user,p_from,p_to);
 if gid is not null and private.grocery_sharing_active(p_user,gid) and exists(select 1 from private.grocery_sharing where user_id=p_user and enabled) then
   insert into private.grocery_transfers(source_list_id,user_id,group_id,source_week,target_week,source_revision)
   select g.row_id,p_user,gid,g.week_of,private.calendar_week(g.week_of,p_to),g.revision from public.grocery_lists g where g.user_id=p_user and g.calendar_active on conflict do nothing;
 end if;
end;
$$;
