-- Saved recipes can contain 100 measured ingredients. Keep the smaller AI
-- review limit without changing authorization, provenance or linked-log rules.
do $migration$
declare definition text;
  previous text := 'if jsonb_typeof(ingredients) is distinct from ''array'' or jsonb_array_length(ingredients) < 1 or jsonb_array_length(ingredients) > 10 then perform private.raise_mutation_error(''validation_failed'', ''one to ten ingredients are required''); end if;';
  replacement text := $body$if jsonb_typeof(ingredients) is distinct from 'array' then
      perform private.raise_mutation_error('validation_failed', 'reviewed ingredients must be an array');
    end if;
    if jsonb_array_length(ingredients) < 1 then
      perform private.raise_mutation_error('validation_failed', 'at least one reviewed ingredient is required');
    end if;
    if jsonb_array_length(ingredients) > (case when p_payload->>'sourceMode' = 'saved_meal' then 100 else 10 end) then
      perform private.raise_mutation_error('validation_failed', case when p_payload->>'sourceMode' = 'saved_meal'
        then 'saved recipes support at most 100 reviewed ingredients' else 'AI reviews support at most 10 ingredients' end);
    end if;$body$;
begin
  select pg_get_functiondef('private.save_reviewed_meal_before_provided_nutrition(jsonb)'::regprocedure) into definition;
  if position(previous in definition) = 0 then
    raise exception 'Unexpected saved-recipe logging validation baseline';
  end if;
  execute replace(definition, previous, replacement);
end;
$migration$;

revoke all on function private.save_reviewed_meal_before_provided_nutrition(jsonb) from public, anon, authenticated;
