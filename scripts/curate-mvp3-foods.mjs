import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.argv.includes("--selected")) {
  const ids = [173424, 171477, 169967, 174290, 171413, 170567];
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods?api_key=DEMO_KEY&fdcIds=${ids.join(",")}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Selected USDA lookup failed (${response.status}).`);
  const records = await response.json();
  const fields = { calories: 1008, proteinG: 1003, carbsG: 1005, fatG: 1004, fiberG: 1079 };
  const foods = records.map((record) => {
    const nutrients = Object.fromEntries(Object.entries(fields).map(([name, id]) => {
      const nutrient = record.foodNutrients.find((item) => item.nutrient.id === id);
      if (name !== "fiberG" && (!nutrient || !Number.isFinite(nutrient.amount))) throw new Error(`Missing required nutrient for FDC ${record.fdcId}.`);
      return [name, nutrient?.amount ?? 0];
    }));
    return { fdcId: String(record.fdcId), description: record.description, recordType: record.dataType, publicationDate: record.publicationDate, nutrientsPer100g: nutrients };
  });
  if (foods.length !== ids.length) throw new Error("USDA returned an incomplete selection.");
  writeFileSync("src/constants/mvp3FoodSources.json", JSON.stringify({ retrievedOn: "2026-10-01", source: "USDA FoodData Central", foods }, null, 2) + "\n");
  console.log(JSON.stringify(foods, null, 2));
  process.exit();
}
// USDA's documented public exploration key has a 30-request hourly limit.
// This six-query review script never writes application or account data.
const results = {};
for (const query of ["egg whole cooked hard boiled", "chicken breast cooked roasted", "broccoli cooked boiled", "tofu firm", "olive oil", "almonds"]) {
  const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dataType: ["SR Legacy"], pageSize: 10 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`USDA catalog lookup failed (${response.status}).`);
  results[query] = (await response.json()).foods;
}
const destination = path.join(tmpdir(), "cali-mvp3-food-search.json");
writeFileSync(destination, JSON.stringify({ retrievedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify({ destination, candidates: Object.fromEntries(Object.entries(results).map(([query, candidates]) => [query, candidates.slice(0, 6).map(({ fdcId, description, dataType }) => ({ fdcId, description, dataType }))])) }, null, 2));
