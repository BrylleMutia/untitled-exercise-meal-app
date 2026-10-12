import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

const archive = unzipSync(readFileSync("output/korean-beef-bowl/usda-sr-legacy.zip"));
function rows(name) {
  const key = Object.keys(archive).find(key => key.endsWith(`/${name}`) || key === name);
  const lines = strFromU8(archive[key]).trim().split(/\r?\n/);
  const parse = line => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(match => match[1].startsWith('"') ? match[1].slice(1, -1).replaceAll('""', '"') : match[1]);
  const header = parse(lines.shift());
  return lines.map(line => Object.fromEntries(parse(line).map((value, i) => [header[i], value])));
}
const foods = rows("food.csv");
const names = [/Beef, ground, 95% lean meat \/ 5% fat, raw/i, /^Rice, white, long-grain, regular, raw, enriched$/i, /^Soy sauce made from soy and wheat \(shoyu\)$/i, /^Oil, sesame, salad or cooking$/i, /^Garlic, raw$/i, /^Ginger root, raw$/i, /^Carrots, raw$/i, /^Cucumber, with peel, raw$/i, /^Seeds, sesame seeds, whole, dried$/i, /^Onions, spring or scallions \(includes tops and bulb\), raw$/i];
const selected = names.map(name => {
  const found = foods.filter(food => name.test(food.description));
  if (found.length !== 1) throw new Error(`Expected one match for ${name}: ${JSON.stringify(found)}`);
  return found[0];
});
const nutrientNames = {1008: "calories",1003:"proteinG",1005:"carbsG",1004:"fatG",1079:"fiberG"};
const values = rows("food_nutrient.csv");
const records = selected.map(food => ({ fdcId: Number(food.fdc_id), description: food.description, url: `https://fdc.nal.usda.gov/food-details/${food.fdc_id}/nutrients`, nutrientsPer100g: Object.fromEntries(values.filter(value => value.fdc_id === food.fdc_id && nutrientNames[value.nutrient_id]).map(value => [nutrientNames[value.nutrient_id], Number(value.amount)])) }));
writeFileSync("src/constants/koreanBeefBowlFoodSources.json", `${JSON.stringify({source:"USDA FoodData Central",downloadUrl:"https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",reviewedAt:"2026-10-12",foods:records},null,2)}\n`);
console.log(JSON.stringify(records,null,2));
