import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AuthConfigurationPage() {
  return (
    <AuthShell
      eyebrow="Setup required"
      title="Connect Supabase first"
      description="This app now requires an authenticated Supabase project. Add the project URL and publishable key to .env.local, then restart the development server."
      footer={<Link href="/auth/sign-in" className="font-extrabold text-ink underline underline-offset-4">Try again</Link>}
    >
      <div className="flex gap-3 rounded-2xl bg-peach-100 p-4 text-sm font-bold">
        <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden />
        <p>Never add a service-role key to NEXT_PUBLIC_* variables.</p>
      </div>
    </AuthShell>
  );
}
