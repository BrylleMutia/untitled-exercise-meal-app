import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Exchanges Supabase PKCE email links for the server session cookie. */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const token = searchParams.get("token");
  const type = (searchParams.get("type") as EmailOtpType | null) ?? "email";
  const next = safeNextPath(searchParams.get("next"));

  try {
    const supabase = await createClient();

    // SSR email links commonly return a one-time PKCE code.
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    }

    // Custom Supabase email templates can send the token hash directly.
    const tokenHashValue = tokenHash ?? token;
    if (tokenHashValue) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHashValue,
      });
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    }
  } catch {
    // Do not expose token or provider details in the URL/error page.
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error?reason=invalid-link", request.url));
}
