import { randomUUID } from "node:crypto";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:56321";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function assertLocalSupabaseConfigured() {
  if (process.env.PLAYWRIGHT_LOCAL_TEST !== "1" || url !== LOCAL_SUPABASE_URL || !key) {
    throw new Error(`Authenticated release tests require local Supabase at ${LOCAL_SUPABASE_URL}.`);
  }
}

export type LocalAccount = { email: string; password: string };

export async function createLocalAccount(prefix: string): Promise<LocalAccount> {
  assertLocalSupabaseConfigured();
  const suffix = randomUUID();
  const account = { email: `${prefix}-${suffix}@example.test`, password: `Local-${suffix}-Pass!` };
  const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signUp(account);
  if (error) throw error;
  if (!data.session) {
    const login = await client.auth.signInWithPassword(account);
    if (login.error || !login.data.session) throw login.error ?? new Error("Local account sign-in returned no session.");
  }
  return account;
}

export async function createAuthenticatedContext(
  browser: Browser,
  baseURL: string,
  account: LocalAccount,
): Promise<BrowserContext> {
  assertLocalSupabaseConfigured();
  const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error || !data.session) throw error ?? new Error("Local browser account has no active session.");

  const cookieJar = new Map<string, string>();
  const browserClient = createBrowserClient(url!, key!, {
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
  const { error: sessionError } = await browserClient.auth.setSession(data.session);
  if (sessionError) throw sessionError;
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addCookies([...cookieJar.entries()].map(([name, value]) => ({ name, value, url: baseURL })));
  return context;
}

export async function writeStorageState(context: BrowserContext, destination: string) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await context.storageState({ path: destination });
}

export async function deleteLocalAccount(account: LocalAccount) {
  assertLocalSupabaseConfigured();
  const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error || !data.session) throw error ?? new Error("Could not authenticate cleanup for a local account.");
  const deleted = await client.rpc("delete_account", {
    p_payload: { idempotencyKey: `playwright-delete-${randomUUID()}` },
  });
  if (deleted.error) throw deleted.error;
}
