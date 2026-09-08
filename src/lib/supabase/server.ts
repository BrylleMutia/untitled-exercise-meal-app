import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";

/**
 * Request-scoped server client factory placeholder. Copy the cookie adapter
 * from the Supabase Next.js SSR docs when implementing authentication.
 */
export function createClient(cookies: CookieMethodsServer) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return createServerClient(url, key, { cookies });
}
