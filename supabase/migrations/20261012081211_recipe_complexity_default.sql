create function private.normalize_recipe_complexity()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
$$;

revoke all on function private.normalize_recipe_complexity() from public, anon, authenticated;

create trigger meals_normalize_complexity
before insert or update of complexity on public.meals
for each row execute function private.normalize_recipe_complexity();

-- The existing revision/timestamp triggers invalidate stale authoring drafts.
update public.meals set complexity = 'medium' where complexity is null;
alter table public.meals alter column complexity set default 'medium';
alter table public.meals alter column complexity set not null;
