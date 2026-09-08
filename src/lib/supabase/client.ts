import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for the future authenticated path. The demo
 * mockup does not call it; wiring servers/credentials without shipped auth is
 * the next step.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return createBrowserClient(url, key);
}
