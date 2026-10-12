-- Covers are optional presentation media, separate from transient meal analysis.
alter table public.meals add column image jsonb;
alter table public.meals add constraint meals_image_shape check (
  image is null or (jsonb_typeof(image) = 'object' and (
    (image->>'kind' = 'url' and jsonb_typeof(image->'url') = 'string' and char_length(image->>'url') <= 2048 and image->>'url' ~ '^https://[^/@[:space:]]+([/?#]|$)') or
    (image->>'kind' = 'upload' and jsonb_typeof(image->'path') = 'string' and image->>'path' ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')
  )) is true
);
create index meals_image_owner_path on public.meals(owner_user_id, (image->>'path')) where image->>'kind'='upload';

create table private.recipe_image_assets (
  path text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  checksum text not null,
  state text not null default 'staged' check (state in ('staged','attached','removing')),
  created_at timestamptz not null default now()
);
alter table private.recipe_image_assets enable row level security;
create index recipe_image_assets_owner_created on private.recipe_image_assets(user_id, created_at);
revoke all on private.recipe_image_assets from public, anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('recipe-covers','recipe-covers',false,5242880,array['image/webp']);

create function public.recipe_image_access(p_path text, p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from private.recipe_image_assets a where a.path=p_path
    and a.user_id=(select auth.uid()) and a.state <> 'removing'
    and (not p_write or a.state='staged'));
$$;
revoke all on function public.recipe_image_access(text,boolean) from public,anon;
grant execute on function public.recipe_image_access(text,boolean) to authenticated;
create function public.recipe_image_removable(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.recipe_image_assets a where a.path=p_path
    and a.user_id=(select auth.uid()) and a.state='removing');
$$;
revoke all on function public.recipe_image_removable(text) from public, anon;
grant execute on function public.recipe_image_removable(text) to authenticated;
create policy recipe_cover_read on storage.objects for select to authenticated
  using (bucket_id='recipe-covers' and (public.recipe_image_access(name,false) or public.recipe_image_removable(name)));
create policy recipe_cover_upload on storage.objects for insert to authenticated
  with check (bucket_id='recipe-covers' and public.recipe_image_access(name,true));
create policy recipe_cover_remove on storage.objects for delete to authenticated
  using (bucket_id='recipe-covers' and public.recipe_image_removable(name));

create function public.register_recipe_image(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;

create function public.claim_recipe_image_cleanup(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;

create function public.complete_recipe_image_cleanup(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.require_authenticated();
begin
  perform private.assert_json_shape(p_payload->'paths','paths','array');
  if jsonb_array_length(p_payload->'paths')>100 then perform private.raise_mutation_error('validation_failed','Too many cleanup paths'); end if;
  delete from private.recipe_image_assets a where a.user_id=caller and a.state='removing'
    and a.path in (select jsonb_array_elements_text(p_payload->'paths'))
    and not exists(select 1 from storage.objects o where o.bucket_id='recipe-covers' and o.name=a.path);
  return jsonb_build_object('completed',true);
end;
$$;
revoke all on function public.register_recipe_image(jsonb),public.claim_recipe_image_cleanup(jsonb),public.complete_recipe_image_cleanup(jsonb) from public,anon;
grant execute on function public.register_recipe_image(jsonb),public.claim_recipe_image_cleanup(jsonb),public.complete_recipe_image_cleanup(jsonb) to authenticated;

-- Queue media removal in the same transaction as account deletion. Storage
-- removal happens after commit, so a failed deletion retains every cover.
-- Jobs intentionally have no auth.users FK and survive its owner cascade.
create table private.deleted_recipe_images (
  path text primary key,
  queued_at timestamptz not null default now(),
  lease_id uuid,
  leased_until timestamptz
);
alter table private.deleted_recipe_images enable row level security;
revoke all on private.deleted_recipe_images from public, anon, authenticated;

create function private.queue_deleted_recipe_images()
returns trigger language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function private.queue_deleted_recipe_images() from public, anon, authenticated;
create trigger queue_deleted_recipe_images before delete on auth.users
  for each row execute function private.queue_deleted_recipe_images();

create function public.claim_deleted_recipe_images(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;
create function public.complete_deleted_recipe_images(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function public.claim_deleted_recipe_images(jsonb),public.complete_deleted_recipe_images(jsonb) from public, anon, authenticated;
grant execute on function public.claim_deleted_recipe_images(jsonb),public.complete_deleted_recipe_images(jsonb) to service_role;

create or replace function private.save_saved_meal(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller_id uuid:=private.require_authenticated(); result jsonb;
  recipe jsonb:=p_payload->'meal'; total_minutes numeric; cover jsonb:=recipe->'image'; asset private.recipe_image_assets;
begin
  perform private.assert_expected_versions('save_saved_meal',p_payload,caller_id);
  perform private.assert_saved_meal_access('save_saved_meal',p_payload,caller_id);
  if recipe ? 'reference' and char_length(coalesce(recipe->>'reference',''))>2000 then
    perform private.raise_mutation_error('validation_failed','Reference must be at most 2000 characters');
  end if;
  if recipe ? 'totalTimeMinutes' and recipe->'totalTimeMinutes'<>'null'::jsonb then
    if jsonb_typeof(recipe->'totalTimeMinutes')<>'number' then perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes or null'); end if;
    total_minutes:=(recipe->>'totalTimeMinutes')::numeric;
    if total_minutes<0 or total_minutes>2147483647 or trunc(total_minutes)<>total_minutes then
      perform private.raise_mutation_error('validation_failed','Recipe time must be whole minutes between 0 and 2147483647');
    end if;
  end if;
  if cover is not null and cover<>'null'::jsonb then
    if jsonb_typeof(cover)<>'object' or coalesce(cover->>'kind','') not in ('url','upload') then
      perform private.raise_mutation_error('validation_failed','Invalid recipe image');
    end if;
    if cover->>'kind'='url' then
      if jsonb_typeof(cover->'url')<>'string' or char_length(cover->>'url')>2048
        or coalesce(cover->>'url','') !~ '^https://[^/@[:space:]]+([/?#]|$)' then
        perform private.raise_mutation_error('validation_failed','Use a complete HTTPS image URL without credentials');
      end if;
      cover:=jsonb_build_object('kind','url','url',cover->>'url');
    else
      perform pg_advisory_xact_lock(hashtextextended(caller_id::text,0));
      select * into asset from private.recipe_image_assets where path=cover->>'path' and user_id=caller_id for update;
      if not found or asset.state='removing' or not exists(select 1 from storage.objects o where o.bucket_id='recipe-covers' and o.name=asset.path) then
        perform private.raise_mutation_error('validation_failed','The uploaded image is unavailable; upload it again or select the default');
      end if;
      cover:=jsonb_build_object('kind','upload','path',asset.path);
    end if;
  end if;
  result:=private.save_saved_meal_unchecked(p_payload);
  if coalesce((result->>'replayed')::boolean,false) then return result; end if;
  if recipe ? 'reference' or recipe ? 'totalTimeMinutes' or recipe ? 'image' then
    update public.meals set
      reference=case when recipe ? 'reference' then nullif(btrim(recipe->>'reference'),'') else reference end,
      total_time_minutes=case when recipe ? 'totalTimeMinutes' then total_minutes::integer else total_time_minutes end,
      image=case when recipe ? 'image' then nullif(cover,'null'::jsonb) else image end
    where app_id=recipe->>'id' and owner_user_id=caller_id;
  end if;
  if cover->>'kind'='upload' then update private.recipe_image_assets set state='attached' where path=cover->>'path' and user_id=caller_id; end if;
  perform private.reconcile_grocery_items(caller_id,p_payload->'grocery');
  return result;
end;
$$;
revoke all on function private.save_saved_meal(jsonb) from public,anon,authenticated;
revoke all on function public.save_saved_meal(jsonb),public.save_recipe(jsonb) from public,anon;
grant execute on function public.save_saved_meal(jsonb),public.save_recipe(jsonb) to authenticated;
notify pgrst,'reload schema';
