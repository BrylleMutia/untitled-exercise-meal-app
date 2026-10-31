import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createLocalAccount, createAuthenticatedContext, deleteLocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

test("recipe-wide cooking ingredients save without weights and preserve macro basis", async ({ browser }, info) => {
 test.setTimeout(180000);
 const account = await createLocalAccount("cooking-browser");
 let context: Awaited<ReturnType<typeof createAuthenticatedContext>> | undefined;
 try {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account); if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id: login.data.user.id, name: "Cooking browser", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() });
  context = await createAuthenticatedContext(browser, info.project.use.baseURL!, account);
  const page = await context.newPage(); await page.setViewportSize({ width: info.project.name === "mobile" ? 412 : 1440, height: 930 });
  await page.goto("/nutrition"); await page.getByRole("button", { name: "Create", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Create recipe", exact: true });
  await expect(dialog.getByLabel("Nutrition method", { exact: true })).toHaveValue("provided");
  await dialog.getByLabel("Recipe name", { exact: true }).fill("Rice and onion without weights");
  await dialog.getByLabel("Recipe servings", { exact: true }).fill("4");
  await dialog.getByLabel("Lunch", { exact: true }).check();
  await dialog.getByLabel("Macro basis", { exact: true }).selectOption("whole-recipe");
  for (const [label, value] of [["Provided calories (kcal)","1200"],["Provided protein (g)","24"],["Provided carbs (g)","240"],["Provided fat (g)","12"]]) await dialog.getByLabel(label,{exact:true}).fill(value);
  await dialog.getByRole("tab", { name: "Ingredients", exact: true }).click();
  for (const [name,unit,amount] of [["Rice","cup","2"],["Onion","piece","1"]]) {
   await dialog.getByRole("button", { name: "Add cooking ingredient", exact: true }).click();
   await dialog.locator('input[aria-label$=" cooking name"]').last().fill(name);
   await dialog.getByLabel(name+" unit",{exact:true}).selectOption(unit);
   await dialog.getByLabel(name+" quantity",{exact:true}).fill(amount);
  }
  await dialog.getByRole("tab",{name:"Instructions",exact:true}).click();
  await dialog.getByLabel("Instructions (required)",{exact:true}).fill("Cook rice and onion until ready.");
  await dialog.getByRole("tab",{name:"Details",exact:true}).click();
  await dialog.getByLabel("Macro basis", {exact:true}).scrollIntoViewIfNeeded();
  await dialog.screenshot({path: "output/recipe-nutrition-"+info.project.name+".png"});
  await dialog.getByRole("button",{name:"Save",exact:true}).click();
  await expect(dialog).toBeHidden();
  const saved=(await repository.load())!.savedMeals.find(item=>item.name==="Rice and onion without weights")!;
  expect(saved.ingredients).toHaveLength(0); expect(saved.cookingIngredients).toHaveLength(2); expect(saved.providedNutrition?.calories).toBe(300);
  await page.reload(); await page.getByRole("button",{name:"Edit Rice and onion without weights",exact:true}).click();
  dialog=page.getByRole("dialog",{name:"Edit recipe",exact:true});
  await expect(dialog.getByLabel("Macro basis",{exact:true})).toHaveValue("whole-recipe");
  await dialog.getByLabel("Recipe servings",{exact:true}).fill("6");
  await expect(dialog.getByText(/Per serving: 200 kcal/)).toBeVisible();
  await dialog.getByLabel("Nutrition method",{exact:true}).selectOption("ingredients");
  await expect(dialog.getByRole("button",{name:"Save changes",exact:true})).toBeDisabled();
  await dialog.getByLabel("Nutrition method",{exact:true}).selectOption("provided");
  await expect(dialog.getByLabel("Provided calories (kcal)",{exact:true})).toHaveValue("1200");
  await dialog.getByRole("tab",{name:"Ingredients",exact:true}).click();
  await dialog.getByLabel("Rice unit",{exact:true}).selectOption("g");
  await expect(dialog.getByText(/Conversion is optional/)).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Save changes",exact:true})).toBeEnabled();
  await page.reload(); await page.getByRole("button",{name:"Edit Rice and onion without weights",exact:true}).click();
  dialog=page.getByRole("dialog",{name:"Edit recipe",exact:true});
  await dialog.getByRole("tab",{name:"Ingredients",exact:true}).click();
  await expect(dialog.getByText(/Conversion is optional/)).toBeVisible();
  await dialog.getByRole("button",{name:"Enter a new measurement",exact:true}).click();
  await dialog.getByLabel("New quantity",{exact:true}).fill("350");
  await dialog.getByRole("button",{name:"Use new measurement",exact:true}).click();
  await expect(dialog.getByLabel("Rice quantity",{exact:true})).toHaveValue("350");
  for (const size of [100,200]) {
   const style=await page.addStyleTag({content: "html {font-size:"+size+"% !important}"});
   expect(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
   await style.evaluate(el=>(el as HTMLStyleElement).remove());
  }
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
 } finally { await context?.close(); await deleteLocalAccount(account); }
});
