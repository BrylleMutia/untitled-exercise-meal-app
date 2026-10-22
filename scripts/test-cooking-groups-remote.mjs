import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { readRemoteTestEnv, remoteAccountCredentials } from "./remote-test-env.mjs";

const project = "ifunkhvbvkdxolhpxjvk";
const baseURL = process.env.COOKING_TEST_BASE_URL ?? "https://cali-meal-planner.vercel.app";
if (!["https://cali-meal-planner.vercel.app", "http://127.0.0.1:3000"].includes(baseURL)) throw new Error("Use the configured live app or the reviewed local client for hosted verification.");
const env = readRemoteTestEnv();
if (process.env.SUPABASE_RPC_REMOTE_CONFIRM !== project || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co`) throw new Error("Confirm the configured linked project before hosted group verification.");
const credentials = remoteAccountCredentials(env);
const clients = [];
let disposablePairVerified = false;
let browser;
async function session(credentials) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword(credentials);
  if (login.error || !login.data.session) throw new Error("The fresh disposable account must be confirmed and able to sign in.");
  const profile = await client.from("profiles").select("id").maybeSingle();
  if (profile.error || profile.data) throw new Error("Hosted group verification requires two fresh accounts without profiles; existing account data will not be changed.");
  clients.push(client);
  return login.data.session;
}
async function context(session) {
  const jar = new Map();
  const client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    isSingleton: false,
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => { for (const item of values) jar.set(item.name, item.value); } },
    auth: { persistSession: true, autoRefreshToken: false },
  });
  const result = await client.auth.setSession(session); if (result.error) throw new Error("Could not prepare disposable browser session.");
  const context = await browser.newContext({ baseURL, viewport: { width: baseURL.startsWith("http:") ? 760 : 390, height: 930 }, timezoneId: "Asia/Manila", reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: baseURL })));
  return context;
}
async function onboard(page, name) {
  await page.goto("/onboarding");
  await page.getByLabel("What should we call you?").fill(name);
  await page.getByLabel("Age", { exact: true }).fill("30");
  await page.getByText("None of the situations below apply to me", { exact: true }).click();
  await page.getByLabel("Height (cm)").fill("168"); await page.getByLabel("Weight (kg)").fill("68");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText("Maintain weight", { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Create my plan", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`, { timeout: 45000 });
}
try {
  const a = await session(credentials.a); const b = await session(credentials.b);
  assert.notEqual(a.user.id, b.user.id, "Two distinct disposable accounts are required.");
  disposablePairVerified = true;
  console.log("Verified two distinct fresh disposable accounts; starting linked-backend browser checks.");
  browser = await chromium.launch();
  const ca = await context(a); const cb = await context(b);
  const pa = await ca.newPage(); const pb = await cb.newPage();
  await onboard(pa, "Hosted Cooking Alice"); await onboard(pb, "Hosted Cooking Bea");
  await pa.goto("/settings"); await pa.getByRole("button", { name: "Generate PIN", exact: true }).click();
  const invitation = pa.locator("#cooking-group [role=status]");
  await expect(invitation).toContainText("Your connection PIN");
  const pin = (await invitation.innerText()).match(/\b[A-Z0-9]{6}\b/)?.[0]; assert.ok(pin);
  await pb.goto("/settings"); await pb.getByLabel("Connection PIN", { exact: true }).fill(pin);
  await pb.getByRole("button", { name: "Review connection", exact: true }).click();
  const consent = pb.getByRole("dialog", { name: "Connect cooking accounts" });
  await expect(consent.getByText("Week starts on Sunday.", { exact: true })).toBeVisible();
  await consent.getByRole("button", { name: "Connect and share", exact: true }).click();
  const connected = pb.getByRole("dialog", { name: "Accounts connected" });
  await expect(connected).toBeVisible(); await connected.getByRole("button", { name: "Done", exact: true }).click();
  await pa.goto("/nutrition");
  if (baseURL === "http://127.0.0.1:3000") await expect(pa.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
  const overviewAvailable = await pa.getByRole("button", { name: "Overview", exact: true }).count();
  if (overviewAvailable) {
    const recipes = pa.getByRole("region", { name: "Recipes", exact: true });
    await expect(recipes.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true })).toHaveCount(1);
    await pa.getByRole("button", { name: "Overview", exact: true }).click();
    const overview = pa.getByRole("dialog", { name: "Cooking overview", exact: true });
    await expect(overview.getByText("Nothing planned for the group this week.", { exact: true })).toBeVisible();
    await overview.getByRole("button", { name: "Close", exact: true }).click();
  }
  for (let i = 0; i < 2; i++) await pa.getByRole("button", { name: "Next week", exact: true }).click();
  await pa.getByRole("button", { name: "Generate", exact: true }).click();
  const generation = pa.getByRole("dialog", { name: "Generate plan" });
  await expect(generation.getByRole("checkbox", { name: /I reviewed the assignments/ })).toBeEnabled({ timeout: 45000 });
  await generation.getByRole("checkbox", { name: /I reviewed the assignments/ }).check();
  await generation.getByRole("button", { name: "Save plan", exact: true }).click();
  const summary = pa.getByRole("dialog", { name: "You're all set!" });
  await expect(summary).toBeVisible({ timeout: 45000 });
  await expect(summary.getByText("Generated by Hosted Cooking Alice", { exact: true })).toBeVisible();
  console.log("Onboarding, group consent, recipe identity, and shared weekly generation passed.");
  await pa.screenshot({ path: "output/grocery-amount/group-hosted-success.png" });
  await summary.getByRole("button", { name: "Done", exact: true }).press("Enter");
  if (overviewAvailable) {
    await pa.getByRole("button", { name: "Overview", exact: true }).click();
    const overview = pa.getByRole("dialog", { name: "Cooking overview", exact: true });
    await expect(overview.getByText(/assigned servings/).first()).toBeVisible();
    await expect(overview.getByRole("button", { name: "View generation summary", exact: true })).toBeVisible();
    await pa.screenshot({ path: "output/grocery-amount/overview-remote-database.png" });
    await overview.getByRole("button", { name: "Close", exact: true }).click();
  }
  await pb.goto("/grocery");
  const notice = pb.getByRole("dialog", { name: "You're all set!" });
  await expect(notice).toBeVisible({ timeout: 30000 }); await notice.getByRole("button", { name: "Done", exact: true }).press("Enter");
  await pb.goto("/nutrition"); await expect(pb.getByRole("dialog", { name: "You're all set!" })).toHaveCount(0);
  console.log(`${overviewAvailable ? "Cooking Overview and cross-route" : "Cross-route"} recipient notice acknowledgment passed.`);
  await pb.goto("/grocery");
  for (let i = 0; i < 2; i++) await pb.getByRole("button", { name: "Next grocery week", exact: true }).click();
  await pb.getByRole("region", { name: "Shared grocery spending", exact: true }).getByRole("button", { name: "Edit total amount", exact: true }).click();
  await pb.getByRole("textbox", { name: /Total amount \(PHP\)/ }).fill("1250.50");
  await pb.getByRole("button", { name: "Save amount", exact: true }).click();
  await expect(pb.getByText("₱1,250.50", { exact: true })).toBeVisible({ timeout: 30000 });
  await pb.getByRole("region", { name: "Shared grocery spending", exact: true }).screenshot({ path: "output/grocery-amount/group-hosted-spending-editor.png" });
  await pa.goto("/grocery");
  for (let i = 0; i < 2; i++) await pa.getByRole("button", { name: "Next grocery week", exact: true }).click();
  await expect(pa.getByText("₱1,250.50", { exact: true })).toBeVisible({ timeout: 30000 });
  await pa.getByRole("region", { name: "Shared grocery spending", exact: true }).screenshot({ path: "output/grocery-amount/group-hosted-spending-member.png" });
  console.log("Hosted cooking groups passed: onboarding, consent, server preview, atomic generation, cross-route notice acknowledgment, and shared spending across two fresh accounts.");
} catch (error) {
  let evidenceIndex = 0;
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    const url = new URL(page.url());
    if (url.origin !== baseURL || !["/nutrition", "/grocery"].includes(url.pathname)) continue;
    await page.screenshot({ path: `output/grocery-amount/group-hosted-failure-${++evidenceIndex}.png`, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  if (disposablePairVerified) for (const client of clients.reverse()) {
    const deleted = await client.rpc("delete_account", { p_payload: { idempotencyKey: `hosted-group-cleanup-${randomUUID()}` } });
    if (deleted.error) throw new Error("Hosted disposable-account cleanup failed; review the test accounts before retrying.");
  }
  for (const client of clients) await client.auth.signOut();
}
