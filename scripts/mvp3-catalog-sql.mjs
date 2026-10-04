import { readFileSync } from 'node:fs';

// Emits the reviewed, immutable catalog seed; no provider requests or credentials.
const sources = JSON.parse(readFileSync(new URL('../src/constants/mvp3FoodSources.json', import.meta.url)));
const quote = (text) => `'${String(text).replaceAll("'", "''")}'`;
const categories = { 173424: 'Protein', 171477: 'Protein', 169967: 'Produce', 174290: 'Protein', 171413: 'Pantry', 170567: 'Pantry' };
const names = { 173424: 'Hard-boiled egg', 171477: 'Roasted chicken breast, meat only', 169967: 'Broccoli, boiled without salt', 174290: 'Extra-firm tofu, prepared with nigari', 171413: 'Olive oil', 170567: 'Almonds' };
const output = ['-- Reviewed USDA SR Legacy records; new IDs preserve historical starter values.'];
for (const f of sources.foods) {
  const n = f.nutrientsPer100g;
  output.push(`insert into public.foods (app_id, is_system, name, serving_label, serving_grams, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, source_version, estimated, confidence, value_source, fdc_id, record_type, nutrients_per_100g)
values (${quote(`food-mvp3-${f.fdcId}`)}, true, ${quote(names[f.fdcId])}, ${quote(`100 g · ${f.description}`)}, 100, 'g', ${n.calories}, ${n.proteinG}, ${n.carbsG}, ${n.fatG}, ${n.fiberG}, ${quote(categories[f.fdcId])}, ${quote(sources.source)}, ${quote(`${f.recordType}:${f.fdcId}:2019-04-01`)}, false, 'high', 'trusted_catalog', ${f.fdcId}, ${quote(f.recordType)}, ${quote(JSON.stringify(n))}::jsonb);`);
}
const recipes = [
  ['eggs', 'Egg, Broccoli & Almond Plate', 'Weigh 100 g hard-boiled egg, 50 g boiled broccoli, 28 g almonds, and 20 g olive oil. Oil is included.', [[173424, 1], [169967, .5], [170567, .28], [171413, .2]]],
  ['chicken', 'Chicken & Broccoli Plate', 'Weigh 150 g cooked skinless chicken, 100 g boiled broccoli, and 25 g olive oil. Count all oil used.', [[171477, 1.5], [169967, 1], [171413, .25]]],
  ['tofu', 'Tofu & Broccoli Plate', 'Weigh 300 g extra-firm nigari tofu, 50 g boiled broccoli, and 30 g olive oil. Tofu brands differ.', [[174290, 3], [169967, .5], [171413, .3]]],
  ['tofu-almonds', 'Tofu, Broccoli & Almond Bowl', 'Weigh 200 g extra-firm nigari tofu, 50 g boiled broccoli, 28 g almonds, and 20 g olive oil. Count all oil used.', [[174290, 2], [169967, .5], [170567, .28], [171413, .2]]],
];
for (const [id, name, notes, ingredients] of recipes) {
  output.push(`insert into public.meals (app_id,is_system,name,servings,notes) values (${quote(`meal-mvp3-${id}`)},true,${quote(name)},1,${quote(notes)});`);
  ingredients.forEach(([food, quantity], index) => output.push(`insert into public.meal_ingredients (meal_row_id,food_row_id,ingredient_order,servings)
select m.row_id,f.row_id,${index + 1},${quantity} from public.meals m cross join public.foods f where m.app_id=${quote(`meal-mvp3-${id}`)} and f.app_id=${quote(`food-mvp3-${food}`)};`));
}
process.stdout.write(output.join('\n') + '\n');
