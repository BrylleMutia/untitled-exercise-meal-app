import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";
import { AppShell } from "@/components/layout/AppShell";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "Calisthenics & Nutrition Coach",
  description:
    "A pastel calisthenics and nutrition coach: editable weekly plans, meal logging, groceries, and progress. Demo build — estimates only, not medical advice.",
  applicationName: "CaliCoach",
};

export const viewport: Viewport = {
  themeColor: "#e2def6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
