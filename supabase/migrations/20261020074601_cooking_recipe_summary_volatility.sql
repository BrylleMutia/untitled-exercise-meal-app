-- The validated nutrition normalizer is declared VOLATILE. Match its declaration
-- while retaining this helper's read-only implementation and private-only access.
alter function private.cooking_library_recipe_json(public.meals) volatile;
revoke all on function private.cooking_library_recipe_json(public.meals) from public,anon,authenticated;
