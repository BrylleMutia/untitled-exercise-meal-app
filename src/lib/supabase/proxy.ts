import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.generated";

/**
 * Refreshes Supabase auth cookies before Server Components render. The caller
 * still performs authorization; this boundary only keeps the session current.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/auth");

  if (!url || !key) {
    if (!isAuthRoute) return NextResponse.redirect(new URL("/auth/configuration", request.url));
    return response;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        if (headers) {
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        }
      },
    },
  });

  const claimsResult = await supabase.auth.getClaims();
  const claims = claimsResult.data?.claims;

  if (!claims && !isAuthRoute) {
    const next = `${pathname}${request.nextUrl.search}`;
    const signIn = new URL("/auth/sign-in", request.url);
    signIn.searchParams.set("next", next);
    return NextResponse.redirect(signIn);
  }

  const guestOnlyAuthRoute =
    pathname === "/auth/sign-in" ||
    pathname === "/auth/sign-up" ||
    pathname === "/auth/forgot-password" ||
    pathname === "/auth/check-email";
  if (claims && guestOnlyAuthRoute) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return response;
}
