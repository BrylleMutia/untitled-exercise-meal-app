import fs from "node:fs";
// This reviewed catalog source is shared by application constants and SQL.
const recipes = JSON.parse(fs.readFileSync("src/constants/recipeCookingMeasurements.json", "utf8"));
const sql = value => "'" + String(value).replaceAll("'", "''") + "'";
for (const [id, recipe] of Object.entries(recipes)) {
  const canonical = recipe.measurements.map(({ foodId, servings }) => ({ foodId, servings }));
  const measurements = recipe.measurements.map(item => item.cookingMeasurement);
  console.log(`
do $catalog$
declare recipe_row public.meals; canonical jsonb; item jsonb; order_no integer:=0;
begin
  select * into recipe_row from public.meals where app_id=${sql(id)} and is_system;
  select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings) order by i.ingredient_order) into canonical
    from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=recipe_row.row_id;
  if canonical=${sql(JSON.stringify(canonical))}::jsonb and recipe_row.notes like 'Ingredients for %' then
    for item in select value from jsonb_array_elements(${sql(JSON.stringify(measurements))}::jsonb) loop
      order_no:=order_no+1;
      update public.meal_ingredients set cooking_measurement=item where meal_row_id=recipe_row.row_id and ingredient_order=order_no;
    end loop;
    update public.meals set notes=${sql(recipe.instructions)},nutrition_notes=${sql(recipe.nutritionNotes)},
      unmeasured_ingredients=${sql(JSON.stringify(recipe.unmeasuredIngredients))}::jsonb where row_id=recipe_row.row_id;
  end if;
end;
$catalog$;`);
}
console.log("notify pgrst,'reload schema';");
