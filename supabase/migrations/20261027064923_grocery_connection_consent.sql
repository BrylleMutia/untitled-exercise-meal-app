-- Prompt choices belong to the authenticated membership, never to another member.
create table private.grocery_sharing_prompt_dismissals (
  user_id uuid primary key references auth.users on delete cascade,
  group_id uuid not null references public.cooking_groups on delete cascade,
  joined_at timestamptz not null,
  dismissed_at timestamptz not null default now()
);
alter table private.grocery_sharing_prompt_dismissals enable row level security;
revoke all on private.grocery_sharing_prompt_dismissals from public, anon, authenticated;

-- Extend the verified implementations in place, preserving the established
-- group/calendar lock order, mutation receipts, PIN secrecy and validation.
do $migration$
declare definition text; original text;
begin
  definition := pg_get_functiondef('private.cooking_group_command(jsonb)'::regprocedure);
  original := definition;
  definition := replace(definition,
    ' perform private.assert_json_shape(p_payload,''payload'',''object'');',
    $code$ perform private.assert_json_shape(p_payload,'payload','object');
 if action in ('invite','join') and p_payload->>'grocerySharingAcknowledgment' is distinct from 'all-weeks-v1' then
   perform private.raise_mutation_error('conflict','Refresh required. Review grocery sharing before generating a PIN or connecting.');
 end if;$code$);
  if definition = original then raise exception 'Connection acknowledgment insertion point changed'; end if;
  original := definition;
  definition := replace(definition,
    ' perform private.complete_mutation(claim.mutation_row_id,result);',
    $code$ if action in ('invite','join') then
   -- Consent is part of the successful connection transaction; importing history
   -- remains the existing resumable per-week operation.
   insert into private.grocery_sharing(user_id,group_id,joined_at,enabled)
     select caller,gid,m.joined_at,not exists(
       select 1 from public.grocery_lists g where g.user_id=caller and g.calendar_active
       and not exists(select 1 from private.grocery_transfers t where t.source_list_id=g.row_id)
     ) from public.cooking_group_members m where m.user_id=caller and m.group_id=gid
   on conflict(user_id) do update set group_id=excluded.group_id,joined_at=excluded.joined_at,
     enabled=case when grocery_sharing.group_id=excluded.group_id and grocery_sharing.joined_at=excluded.joined_at then grocery_sharing.enabled else excluded.enabled end,
     consented_at=case when grocery_sharing.group_id=excluded.group_id and grocery_sharing.joined_at=excluded.joined_at then grocery_sharing.consented_at else now() end;
   delete from private.grocery_sharing_prompt_dismissals where user_id=caller;
   result:=result||jsonb_build_object('sharing',public.get_grocery_sharing_status());
 end if;
 perform private.complete_mutation(claim.mutation_row_id,result);$code$);
  if definition = original then raise exception 'Connection consent insertion point changed'; end if;
  execute definition;

  definition := pg_get_functiondef('public.get_grocery_sharing_status()'::regprocedure);
  original := definition;
  definition := replace(definition,
    'jsonb_build_object(''status'',''not-enabled'',''remaining'',remaining,''completed'',0)',
    $code$jsonb_build_object('status','not-enabled','remaining',remaining,'completed',0,
      'promptDismissed',exists(select 1 from private.grocery_sharing_prompt_dismissals d
        join public.cooking_group_members m on m.user_id=d.user_id and m.group_id=d.group_id and m.joined_at=d.joined_at
        where d.user_id=caller and d.group_id=gid))$code$);
  if definition = original then raise exception 'Sharing status insertion point changed'; end if;
  execute definition;

  definition := pg_get_functiondef('private.share_cooking_groceries(jsonb)'::regprocedure);
  original := definition;
  definition := replace(definition,
    ' if p_payload->>''action''=''share-groceries'' then',
    $code$ if p_payload->>'action'='dismiss-grocery-sharing' then
   if (p_payload->>'groupRevision')::integer is distinct from (select revision from public.cooking_groups where id=gid) then
     perform private.raise_mutation_error('stale_version','Group changed. Refresh and review its members.');
   end if;
   insert into private.grocery_sharing_prompt_dismissals(user_id,group_id,joined_at)
     values(caller,gid,membership.joined_at)
   on conflict(user_id) do update set group_id=excluded.group_id,joined_at=excluded.joined_at,dismissed_at=now();
 elsif p_payload->>'action'='share-groceries' then$code$);
  if definition = original then raise exception 'Sharing dismissal insertion point changed'; end if;
  execute definition;

  definition := pg_get_functiondef('private.grocery_sharing_membership_left()'::regprocedure);
  original := definition;
  definition := replace(definition,
    ' delete from private.grocery_sharing where user_id=old.user_id;',
    ' delete from private.grocery_sharing where user_id=old.user_id; delete from private.grocery_sharing_prompt_dismissals where user_id=old.user_id;');
  if definition = original then raise exception 'Membership cleanup insertion point changed'; end if;
  execute definition;
end;
$migration$;

revoke all on function private.cooking_group_command(jsonb),private.share_cooking_groceries(jsonb),private.grocery_sharing_membership_left() from public,anon,authenticated;
revoke all on function public.cooking_group_command(jsonb),public.get_grocery_sharing_status(),public.share_cooking_groceries(jsonb) from public,anon;
grant execute on function public.cooking_group_command(jsonb),public.get_grocery_sharing_status(),public.share_cooking_groceries(jsonb) to authenticated;
