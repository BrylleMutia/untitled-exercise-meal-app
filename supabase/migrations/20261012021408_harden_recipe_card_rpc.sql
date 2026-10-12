-- Retain the established private mutation boundary and index both FKs.
create index recipe_favorites_meal_idx on public.recipe_favorites(meal_row_id);
alter policy recipe_favorites_read on public.recipe_favorites rename to "users can read their recipe favorites";

create or replace function public.get_recipe_card_metadata(p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare caller uuid:=(select auth.uid()); as_of date;
begin
  if caller is null then raise exception 'not_authenticated: Sign in to load favorites'; end if;
  if jsonb_typeof(p_payload->'asOfDate') is distinct from 'string' or coalesce(p_payload->>'asOfDate','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'validation_failed: Invalid local date';
  end if;
  as_of:=(p_payload->>'asOfDate')::date;
  return (
    with eligible as (
      select row_id,app_id from public.meals where archived_at is null and (is_system or owner_user_id=caller)
    ), usage as (
      select e.row_id,count(*) as uses,max(lm.log_date) as last_eaten
      from public.logged_meals lm join eligible e on e.row_id=lm.meal_row_id
      where lm.user_id=caller and lm.log_date between as_of-29 and as_of group by e.row_id
    ), popular as (
      select u.row_id,u.uses,row_number() over(order by u.uses desc,u.last_eaten desc,e.app_id asc) as rank
      from usage u join eligible e on e.row_id=u.row_id
      order by u.uses desc,u.last_eaten desc,e.app_id asc limit 5
    )
    select jsonb_build_object('asOfDate',as_of::text,'recipes',coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object('mealId',e.app_id,'favorite',coalesce(f.favorite,false),
        'favoriteRevision',coalesce(f.revision,0),'popularRank',p.rank,'usageCount',coalesce(u.uses,0))) order by e.app_id),'[]'::jsonb))
    from eligible e left join public.recipe_favorites f on f.meal_row_id=e.row_id and f.user_id=caller
      left join popular p on p.row_id=e.row_id left join usage u on u.row_id=e.row_id
  );
end;
$$;


create function private.set_recipe_favorite(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated(); recipe_row bigint; current_revision integer; claim record; result jsonb;
begin
  perform private.assert_nonblank(p_payload->>'mealId','mealId',128);
  if jsonb_typeof(p_payload->'favorite') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number'
    or (p_payload->>'expectedRevision')::numeric<0
    or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric)
    or (p_payload->>'expectedRevision')::numeric>2147483647 then
    perform private.raise_mutation_error('validation_failed','Invalid favorite state or version');
  end if;
  -- Validate the date before any mutation; read-model construction is atomic.
  perform public.get_recipe_card_metadata(jsonb_build_object('asOfDate',p_payload->>'asOfDate'));
  select * into claim from private.claim_mutation(caller,'set_recipe_favorite',p_payload->>'idempotencyKey',p_payload);
  if claim.replay then return public.get_recipe_card_metadata(jsonb_build_object('asOfDate',p_payload->>'asOfDate')); end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':'||(p_payload->>'mealId'),0));
  select row_id into recipe_row from public.meals where app_id=p_payload->>'mealId'
    and archived_at is null and (is_system or owner_user_id=caller) for share;
  if recipe_row is null then perform private.raise_mutation_error('not_found','Recipe is unavailable'); end if;
  select revision into current_revision from public.recipe_favorites where user_id=caller and meal_row_id=recipe_row for update;
  if coalesce(current_revision,0)<>(p_payload->>'expectedRevision')::integer then
    perform private.raise_mutation_error('stale_version','Favorites changed elsewhere');
  end if;
  insert into public.recipe_favorites(user_id,meal_row_id,favorite) values(caller,recipe_row,(p_payload->>'favorite')::boolean)
    on conflict(user_id,meal_row_id) do update set favorite=excluded.favorite,revision=public.recipe_favorites.revision+1,updated_at=now();
  perform private.complete_mutation(claim.mutation_row_id,jsonb_build_object('meal_id',p_payload->>'mealId'));
  result:=public.get_recipe_card_metadata(jsonb_build_object('asOfDate',p_payload->>'asOfDate'));
  return result;
end;
$$;

create or replace function public.set_recipe_favorite(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return private.set_recipe_favorite(p_payload); end;
$$;
revoke all on function private.set_recipe_favorite(jsonb) from public,anon,authenticated;
revoke all on function public.set_recipe_favorite(jsonb) from public,anon;
grant execute on function public.set_recipe_favorite(jsonb) to authenticated;
