"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Info,
  LogOut,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { HEALTH_DISCLAIMER, kgToLb, lbToKg } from "@/utility/health";
import { signOutAction } from "@/app/auth/actions";
import { clearUserDrafts } from "@/services/draftStore";

export default function SettingsPage() {
  const { snapshot, actions } = useApp();
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const profile = snapshot.profile;
  const target = snapshot.target;

  const displayWeight =
    profile?.units === "imperial"
      ? kgToLb(profile.weightKg)
      : profile?.weightKg ?? 0;

  const exportData = async () => {
    setExporting(true);
    const data = await actions.exportData();
    setExporting(false);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data ?? null, null, 2) ?? "{}"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `calicoach-export-${snapshot.userId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    actions.notify("Export downloaded.");
  };

  const deleteAccount = async () => {
    if (!window.confirm("Delete your account and all saved data? This cannot be undone.")) return;
    setDeleting(true);
    const deleted = await actions.deleteAccount();
    setDeleting(false);
    if (deleted) {
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith("calicoach:onboarding-draft:") || key.startsWith("calicoach:session:")) window.localStorage.removeItem(key);
        }
      } catch { /* best-effort cleanup */ }
      router.push("/auth/sign-in");
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    await clearUserDrafts(snapshot.userId);
    await signOutAction();
  };

  return (
    <div className="grid gap-4 pb-4">
      <Card tone="lavender" className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-xl font-extrabold">
          {profile?.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-extrabold">{profile?.name}</h2>
          <p className="text-xs font-semibold text-ink-soft">
            {profile?.experience} · {profile?.daysPerWeek} days/week · ~
            {profile?.sessionMinutes} min sessions · goal: {profile?.goal}
          </p>
        </div>
        <Link href="/onboarding" className="ml-auto">
          <Button variant="soft" className="!min-h-11 !px-3 text-xs">
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </Button>
        </Link>
      </Card>

      <Card>
        <h2 className="font-extrabold">Your targets</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl bg-cream p-3">
            <p className="text-[10px] font-bold text-muted">BMR</p>
            <p className="font-extrabold tabular-nums">{target?.bmr} kcal</p>
          </div>
          <div className="rounded-2xl bg-cream p-3">
            <p className="text-[10px] font-bold text-muted">BMI</p>
            <p className="font-extrabold tabular-nums">{target?.bmi}</p>
          </div>
          <div className="rounded-2xl bg-cream p-3">
            <p className="text-[10px] font-bold text-muted">TDEE</p>
            <p className="font-extrabold tabular-nums">{target?.tdee} kcal</p>
          </div>
          <div className="rounded-2xl bg-cream p-3">
            <p className="text-[10px] font-bold text-muted">Daily target</p>
            <p className="font-extrabold tabular-nums">{target?.calories} kcal</p>
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-mint-100 p-3 text-xs font-semibold text-ink-soft">
          {HEALTH_DISCLAIMER} Formula: {target?.formula} · activity factor{" "}
          {target?.activityFactor} · effective {target?.effectiveDate} · version{" "}
          {target?.version}.
        </div>
      </Card>

      <Card>
        <h2 className="font-extrabold">Units & weight</h2>
        <div className="mt-3 flex gap-2" role="group" aria-label="Units">
          {(["metric", "imperial"] as const).map((u) => (
            <Button
              key={u}
              variant={profile?.units === u ? "primary" : "soft"}
              onClick={() => actions.updateUnits(u)}
              aria-pressed={profile?.units === u}
              className="!min-h-11 !px-4 text-xs"
            >
              {u}
            </Button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder={
              profile?.units === "metric" ? "Weight in kg" : "Weight in lb"
            }
            className="input max-w-40"
            aria-label="New weight entry"
          />
          <Button
            className="!min-h-12"
            disabled={!weight}
            onClick={() => {
              const kg =
                profile?.units === "metric"
                  ? Number(weight)
                  : lbToKg(Number(weight));
              if (!kg) return;
              const today = new Date();
              const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
              actions.logWeight(Math.round(kg * 10) / 10, key);
              setWeight("");
            }}
          >
            Log {displayWeight ? `(${displayWeight.toFixed(1)} ${profile?.units === "metric" ? "kg" : "lb"} now)` : ""}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-extrabold">Data controls</h2>
        <div className="mt-3 grid gap-2">
          <Button variant="soft" onClick={() => void exportData()} disabled={exporting}>
            <Download className="h-4 w-4" aria-hidden /> Export JSON
          </Button>
          <Button variant="soft" onClick={actions.resetPlan}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Regenerate plan from current profile
          </Button>
          <Button type="button" variant="danger" className="w-full" onClick={() => void signOut()} disabled={signingOut}>
            <LogOut className="h-4 w-4" aria-hidden /> {signingOut ? "Signing out…" : "Sign out"}
          </Button>
          <Button variant="danger" onClick={() => void deleteAccount()} disabled={deleting}>
            Permanently delete account
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-extrabold">Safety & sources</h2>
        <ul className="mt-2 grid gap-2 text-xs font-semibold text-ink-soft">
          <li className="flex gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            Health and nutrition values are estimates, not medical advice.
          </li>
          <li className="flex gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            Food entries show source, confidence, and estimate status. Replace
            the current catalog with the selected production nutrition database.
          </li>
          <li className="flex gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            Exercise illustrations by Bryl Lim (CC BY-SA 4.0) via
            @bryllim/workout-guide.
          </li>
          <li className="flex gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            Export and deletion use authorized server workflows; deletion is
            permanent and removes your saved history.
          </li>
        </ul>
      </Card>
    </div>
  );
}
