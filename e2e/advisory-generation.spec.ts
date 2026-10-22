import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createLocalAccount, createAuthenticatedContext, deleteLocalAccount, type LocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

async function fixture(account: LocalAccount, viewer: boolean) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account);
  if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id: login.data.user.id, name: "Same name", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: viewer ? "Vegan Keto-style" : "No restrictions", allergies: viewer ? ["soy"] : ["cucumber"], cookingTimeMinutes: 15, mealBudget: 4, notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() });
  return { client, repository };
}

test("advisory individual and connected previews remain savable with private recipient reviews", async ({ browser }, info) => {
  test.setTimeout(300000);
  const a = await createLocalAccount("advisory-owner"), b = await createLocalAccount("advisory-recipient");
  const ca = await createAuthenticatedContext(browser, info.project.use.baseURL!, a), cb = await createAuthenticatedContext(browser, info.project.use.baseURL!, b);
  try {
    const owner = await fixture(a, true), recipient = await fixture(b, false);
    console.log("Advisory fixtures ready");
    const snapshot = (await owner.repository.load())!;
    await owner.repository.saveRecipe({ currentSnapshot: snapshot, newFoods: [], idempotencyKey: crypto.randomUUID(), meal: {
      id: `advisory-${crypto.randomUUID()}`, name: "Advisory chicken", servings: 4, complexity: "easy", notes: "Cook and serve.", totalTimeMinutes: 45,
      mealSlots: ["breakfast", "lunch", "dinner", "snack"], ingredients: [{ foodId: "food-chicken", servings: 1 }],
      unmeasuredIngredients: [{ name: "Soy sauce", measurement: "To taste" }, { name: "Cucumber", measurement: "To taste" }],
      providedNutrition: { calories: 500, proteinG: 10, carbsG: 100, fatG: 5 },
    } });
    const pa = await ca.newPage(), pb = await cb.newPage();
    await pa.goto("/nutrition");
    for (let i = 0; i < 2; i++) await pa.getByRole("button", { name: "Next week", exact: true }).click();
    await pa.getByRole("button", { name: "Generate", exact: true }).click();
    const dialog = pa.getByRole("dialog", { name: "Generate plan", exact: true });
    await expect(dialog).toBeVisible();
    const choices = dialog.getByRole("group", { name: "Choose recipes", exact: true });
    await choices.getByRole("button", { name: "Clear", exact: true }).click();
    await choices.getByRole("checkbox", { name: "Advisory chicken", exact: true }).focus(); await pa.keyboard.press("Space");
    const warnings = dialog.getByRole("region", { name: "Recipe warnings", exact: true });
    await expect(warnings).toContainText("Soy sauce");
    await expect(warnings).toContainText("Vegan Keto-style");
    await expect(dialog.getByRole("region", { name: "Daily preference warnings" })).toContainText("100 g total carbs");
    const ack = dialog.getByRole("checkbox", { name: /^I reviewed the assignments/ });
    await expect(dialog.getByRole("button", { name: "Save plan", exact: true })).toBeDisabled();
    await ack.check();
    await warnings.getByRole("button", { name: "Remove recipe: Advisory chicken", exact: true }).click();
    await expect(choices.getByRole("checkbox", { name: "Advisory chicken", exact: true })).not.toBeChecked();
    await expect(ack).not.toBeChecked();
    await choices.getByRole("checkbox", { name: "Advisory chicken", exact: true }).focus(); await pa.keyboard.press("Space");
    await ack.check();
    await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    console.log("Individual advisory save verified");
    const invite = await owner.client.rpc("cooking_group_command", { p_payload: { action: "invite", idempotencyKey: crypto.randomUUID() } });
    if (invite.error) throw invite.error;
    const invitation = invite.data as { pin: string; group: { revision: number } };
    const inspected = await recipient.client.rpc("cooking_group_command", { p_payload: { action: "inspect-pin", pin: invitation.pin } });
    if (inspected.error) throw inspected.error;
    const joined = await recipient.client.rpc("cooking_group_command", { p_payload: { action: "join", pin: invitation.pin, groupRevision: invitation.group.revision, idempotencyKey: crypto.randomUUID() } });
    if (joined.error) throw joined.error;
    console.log("Advisory accounts connected");
    await pa.reload();
    for (let i = 0; i < 3; i++) await pa.getByRole("button", { name: "Next week", exact: true }).click();
    await pa.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(dialog.getByRole("checkbox", { name: "Same name (you)", exact: true })).toBeChecked();
    await choices.getByRole("button", { name: "Clear", exact: true }).click();
    await choices.getByRole("checkbox", { name: "Advisory chicken", exact: true }).focus(); await pa.keyboard.press("Space");
    await expect(warnings).toContainText("Soy sauce", { timeout: 45000 });
    await expect(warnings).not.toContainText("foods to avoid (cucumber)");
    await expect(ack).toBeEnabled();
    await ack.check();
    await warnings.getByRole("button", { name: "Remove recipe: Advisory chicken", exact: true }).click();
    await expect(ack).not.toBeChecked();
    await expect(choices.getByRole("checkbox", { name: "Advisory chicken", exact: true })).not.toBeChecked();
    await choices.getByRole("checkbox", { name: "Advisory chicken", exact: true }).focus(); await pa.keyboard.press("Space");
    await expect(ack).toBeEnabled({ timeout: 45000 });
    await pa.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 367, 390, 398, 469, 570, 594, 760, 1440]) {
      await pa.setViewportSize({ width, height: 930 });
      for (const enlarged of [false, true]) {
        await pa.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
        await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect(dialog.getByRole("button", { name: "Save plan", exact: true })).toBeInViewport();
      }
    }
    await pa.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await ack.check();
    await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
    const success = pa.getByRole("dialog", { name: "You're all set!", exact: true });
    await expect(success.getByRole("heading", { name: "Your review at generation" })).toBeVisible({ timeout: 45000 });
    await expect(success).toContainText("Selected people: Same name (you), Same name");
    await expect(success).toContainText("foods to avoid (soy)");
    await success.getByRole("button", { name: "Done", exact: true }).click();
    await pb.goto("/grocery");
    const notice = pb.getByRole("dialog", { name: "You're all set!", exact: true });
    await expect(notice).toContainText("foods to avoid (cucumber)", { timeout: 45000 });
    await expect(notice).not.toContainText("foods to avoid (soy)");
    await expect(notice.getByRole("list", { name: "Saved assignment counts" })).toContainText("Same name (you)");
    await notice.getByRole("button", { name: "Done", exact: true }).click();
    await pb.goto("/nutrition");
    await expect(notice).not.toBeVisible();
  } finally {
    await Promise.allSettled([ca.close(), cb.close()]);
    await Promise.all([deleteLocalAccount(a), deleteLocalAccount(b)]);
  }
});
