-- Authorization/validation helpers are volatile; do not advertise their caller
-- as STABLE to the planner or PostgREST.
alter function private.get_ingredient_conversions(text[]) volatile;
alter function public.get_ingredient_conversions(text[]) volatile;
notify pgrst,'reload schema';
