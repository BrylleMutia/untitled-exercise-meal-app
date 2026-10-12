alter table public.meals add column complexity text
  check (complexity is null or complexity in ('easy','medium','hard'));

-- Wrap the existing validated recipe/media transaction, preserving omission in
-- legacy logging paths and updating complexity only in the same atomic save.
alter function private.save_saved_meal(jsonb) rename to save_saved_meal_without_complexity;
create function private.save_saved_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;
alter function private.save_authored_recipe(jsonb) rename to save_authored_recipe_without_complexity;
create function private.save_authored_recipe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_authenticated();
  if jsonb_typeof(p_payload->'meal'->'complexity') is distinct from 'string'
    or p_payload->'meal'->>'complexity' not in ('easy','medium','hard') then
    perform private.raise_mutation_error('validation_failed','Choose Easy, Medium, or Hard complexity');
  end if;
  return private.save_authored_recipe_without_complexity(p_payload);
end;
$$;
revoke all on function private.save_saved_meal(jsonb),private.save_saved_meal_without_complexity(jsonb),
  private.save_authored_recipe(jsonb),private.save_authored_recipe_without_complexity(jsonb) from public,anon,authenticated;

-- Keep false rows so removing a favorite retains its concurrency version.
create table public.recipe_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_row_id bigint not null references public.meals(row_id) on delete cascade,
  favorite boolean not null default false,
  revision integer not null default 1 check (revision>0),
  updated_at timestamptz not null default now(),
  primary key(user_id,meal_row_id)
);
alter table public.recipe_favorites enable row level security;
create policy recipe_favorites_read on public.recipe_favorites for select to authenticated
  using ((select auth.uid())=user_id);
revoke all on public.recipe_favorites from public,anon,authenticated;
grant select on public.recipe_favorites to authenticated;
create index if not exists logged_meals_user_recipe_date on public.logged_meals(user_id,log_date,meal_row_id);

create function public.get_recipe_card_metadata(p_payload jsonb)
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
        'favoriteRevision',coalesce(f.revision,0),'popularRank',p.rank,'usageCount',coalesce(p.uses,0))) order by e.app_id),'[]'::jsonb))
    from eligible e left join public.recipe_favorites f on f.meal_row_id=e.row_id and f.user_id=caller
      left join popular p on p.row_id=e.row_id
  );
end;
$$;

-- Direct writes are denied. The authorized wrapper owns validation, retry
-- claims, pair-level serialization and optimistic concurrency.
create function public.set_recipe_favorite(p_payload jsonb)
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
revoke all on function public.get_recipe_card_metadata(jsonb),public.set_recipe_favorite(jsonb) from public,anon;
grant execute on function public.get_recipe_card_metadata(jsonb),public.set_recipe_favorite(jsonb) to authenticated;

alter function private.build_account_export() rename to build_account_export_without_recipe_favorites;
create function private.build_account_export() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated();
begin
  return private.build_account_export_without_recipe_favorites() || jsonb_build_object('recipeFavorites',coalesce((
    select jsonb_agg(jsonb_build_object('mealId',m.app_id,'favorite',f.favorite,'revision',f.revision,'updatedAt',f.updated_at) order by m.app_id)
    from public.recipe_favorites f join public.meals m on m.row_id=f.meal_row_id where f.user_id=caller
  ),'[]'::jsonb));
end;
$$;
revoke all on function private.build_account_export(),private.build_account_export_without_recipe_favorites() from public,anon,authenticated;
