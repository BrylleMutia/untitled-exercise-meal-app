import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";
import { AppShell } from "@/components/layout/AppShell";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { loadAppSnapshot } from "@/services/supabaseSnapshot";
import type { AppSnapshot } from "@/types/domain";

export const metadata: Metadata = {
  title: "Cali - Exercise and Meal Planner",
  description:
    "Cali - Exercise and Meal Planner helps you build editable workout and meal plans, log food, manage groceries, and review progress. Estimates only, not medical advice.",
  applicationName: "Cali - Exercise and Meal Planner",
};

export const viewport: Viewport = {
  themeColor: "#e2def6",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let initialSnapshot: AppSnapshot | null = null;
  try {
    const supabase = await createServerClient();
    const { data: claimsData, error } = await supabase.auth.getClaims();
    const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
    if (!error && userId) initialSnapshot = await loadAppSnapshot(supabase, userId);
  } catch {
    // Auth routes and the configuration screen must remain renderable when
    // Supabase is not configured or the remote read model is unavailable.
  }

  return (
    <html lang="en">
      <body>
        <AppProvider initialSnapshot={initialSnapshot}>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
