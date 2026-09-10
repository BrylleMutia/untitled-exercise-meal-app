import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";
import { AppShell } from "@/components/layout/AppShell";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { loadAppSnapshot } from "@/services/supabaseSnapshot";
import type { AppSnapshot } from "@/types/domain";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "Calisthenics & Nutrition Coach",
  description:
    "A pastel calisthenics and nutrition coach: editable weekly plans, meal logging, groceries, and progress. Estimates only, not medical advice.",
  applicationName: "CaliCoach",
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
    <html lang="en" className={nunito.variable}>
      <body>
        <AppProvider initialSnapshot={initialSnapshot}>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
