-- Read existing saved grocery names; no separate learned-name store or writes.
create function private.grocery_name_match_tier(p_name text,p_query text) returns integer
language sql immutable set search_path='' as $$
 select case
  when private.grocery_name_key(p_name)=private.grocery_name_key(p_query) then 0
  when starts_with(private.grocery_name_key(p_name),private.grocery_name_key(p_query)) then 1
  when btrim(regexp_replace(private.grocery_name_key(p_query),'[^[:alnum:]]+',' ','g'))<>'' and
    strpos(' '||regexp_replace(private.grocery_name_key(p_name),'[^[:alnum:]]+',' ','g'),
           ' '||btrim(regexp_replace(private.grocery_name_key(p_query),'[^[:alnum:]]+',' ','g')))>0 then 2
 end;
$$;
create function public.get_grocery_name_suggestions(p_query text,p_group_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); result jsonb;
begin
 if p_group_id is not null then
  perform private.lock_cooking_group(p_group_id);
  if private.cooking_group_for(caller) is distinct from p_group_id then perform private.raise_mutation_error('not_found','Group not found'); end if;
 end if;
 if p_query is null or length(p_query)>256 then perform private.raise_mutation_error('validation_failed','Enter a grocery name up to 256 characters'); end if;
 if length(regexp_replace(normalize(p_query,NFKC),'[[:space:]]','','g'))<2 then return '[]'::jsonb; end if;
 if p_group_id is null then
  with matches as (
   select i.name,private.grocery_name_key(i.name) name_key,g.week_of::text seen,i.row_id,
          private.grocery_name_match_tier(i.name,p_query) tier
   from public.grocery_lists g join public.grocery_items i on i.grocery_list_row_id=g.row_id and i.user_id=caller
   where g.user_id=caller and g.calendar_active and not i.removed and length(btrim(i.name)) between 1 and 256
  ), ranked as (
   select name,name_key,tier,count(*) over(partition by name_key) occurrences,max(seen) over(partition by name_key) last_seen,
    row_number() over(partition by name_key order by seen desc,row_id desc) representative
   from matches where tier is not null
  ), limited as (
   select * from ranked where representative=1 order by tier,occurrences desc,last_seen desc,name_key limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'occurrences',occurrences,'lastSeenWeek',last_seen) order by tier,occurrences desc,last_seen desc,name_key),'[]'::jsonb) into result from limited;
 else
  with matches as (
   select item->>'name' name,private.grocery_name_key(item->>'name') name_key,w.week_of::text seen,w.week_of,
          private.grocery_name_match_tier(item->>'name',p_query) tier
   from public.cooking_group_weeks w cross join lateral jsonb_array_elements(coalesce(w.grocery->'items','[]'::jsonb)) item
   where w.group_id=p_group_id and not coalesce((item->>'removed')::boolean,false) and length(btrim(item->>'name')) between 1 and 256
  ), ranked as (
   select name,name_key,tier,count(*) over(partition by name_key) occurrences,max(seen) over(partition by name_key) last_seen,
    row_number() over(partition by name_key order by seen desc,week_of desc,name) representative
   from matches where tier is not null
  ), limited as (
   select * from ranked where representative=1 order by tier,occurrences desc,last_seen desc,name_key limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'occurrences',occurrences,'lastSeenWeek',last_seen) order by tier,occurrences desc,last_seen desc,name_key),'[]'::jsonb) into result from limited;
 end if;
 return result;
end; $$;
revoke all on function private.grocery_name_match_tier(text,text),public.get_grocery_name_suggestions(text,uuid) from public,anon,authenticated;
grant execute on function public.get_grocery_name_suggestions(text,uuid) to authenticated;
notify pgrst,'reload schema';
