-- Client roles cannot use the private schema. Keep one deliberate authorized
-- read wrapper, with all filtering performed by its private implementation.
alter function public.get_ingredient_conversions(text[]) security definer;
revoke all on function private.get_ingredient_conversions(text[]) from public,anon,authenticated;
revoke all on function public.get_ingredient_conversions(text[]) from public,anon,authenticated;
grant execute on function public.get_ingredient_conversions(text[]) to authenticated;
notify pgrst,'reload schema';
