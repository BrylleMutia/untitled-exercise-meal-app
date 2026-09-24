import { test as setup } from "@playwright/test";
import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide the same values through the process environment.
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const authDirectory = path.resolve("playwright/.auth");

type Account = {
  name: "a" | "b";
  email: string | undefined;
  password: string | undefined;
};

const accounts: Account[] = [
  {
    name: "a",
    email: process.env.SUPABASE_RPC_REMOTE_USER_A_EMAIL,
    password: process.env.SUPABASE_RPC_REMOTE_USER_A_PASSWORD,
  },
  {
    name: "b",
    email: process.env.SUPABASE_RPC_REMOTE_USER_B_EMAIL,
    password: process.env.SUPABASE_RPC_REMOTE_USER_B_PASSWORD,
  },
];

async function createStorageState(account: Account, outputPath: string) {
  if (!account.email || !account.password) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase test environment is not configured.");

  const authClient = createSupabaseClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error || !data.session) {
    throw new Error(`Could not prepare Playwright account ${account.name}: ${error?.message ?? "no session"}`);
  }

  const cookieJar = new Map<string, string>();
  const browserClient = createBrowserClient(url, publishableKey, {
    isSingleton: false,
    cookies: {
      getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (items) => {
        for (const item of items) {
          if (item.options?.maxAge === 0) cookieJar.delete(item.name);
          else cookieJar.set(item.name, item.value);
        }
      },
    },
    auth: { persistSession: true, autoRefreshToken: false },
  });
  const { error: cookieError } = await browserClient.auth.setSession(data.session);
  if (cookieError) throw new Error(`Could not prepare session cookies for account ${account.name}.`);

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([...cookieJar.entries()].map(([name, value]) => ({
    name,
    value,
    url: baseURL,
  })));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await context.storageState({ path: outputPath });
  await context.close();
  await browser.close();
  return true;
}

setup("prepare authenticated storage states", async () => {
  const available = accounts.filter((account) => account.email && account.password);
  if (available.length === 0) {
    setup.skip(true, "Set the two confirmed disposable account variables to run authenticated release tests.");
    return;
  }

  for (const account of accounts) {
    await createStorageState(account, path.join(authDirectory, `user-${account.name}.json`));
  }
});
