"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
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
import { buildAccountExportZip } from "@/utility/exportBundle";
import { DailyStepTargetSettings } from "@/components/DailyStepTargetSettings";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";

function SettingsSwitchRow({ label, description, descriptionId, checked, disabled, onToggle }: {
  label: string;
  description: string;
  descriptionId: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-cream p-3">
      <div className="min-w-0">
        <p className="text-sm font-extrabold">{label}</p>
        <p id={descriptionId} className="mt-1 text-xs font-semibold text-ink-soft">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={descriptionId}
        className="grid min-h-11 w-14 shrink-0 place-items-center rounded-full disabled:opacity-60"
        onClick={onToggle}
        disabled={disabled}
      >
        <span aria-hidden className={`relative h-8 w-14 rounded-full transition-colors motion-reduce:transition-none ${checked ? "bg-ink" : "bg-lav-200"}`}>
          <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-chip transition-transform motion-reduce:transition-none ${checked ? "translate-x-6" : "translate-x-0"}`} />
        </span>
      </button>
    </div>
  );
}

function ProfileInfoPill({ children }: { children: React.ReactNode }) {
  return <li className="rounded-full bg-white/70 px-1.5 py-1 text-xs font-semibold text-ink-soft sm:px-2.5">{children}</li>;
}

export default function SettingsPage() {
  const { snapshot, actions, pendingMutation } = useApp();
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
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
    setExportStatus(null);
    const data = await actions.exportData();
    setExporting(false);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data ?? null, null, 2) ?? "{}"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cali-exercise-meal-planner-export-${snapshot.userId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    setExportStatus(`JSON export download started: ${anchor.download}`);
    actions.notify("Export downloaded.");
  };

  const exportCsvBundle = async () => {
    setExporting(true);
    setExportStatus(null);
    const data = await actions.exportData();
    setExporting(false);
    if (!data) return;
    const exportedAt = new Date().toISOString();
    const zip = buildAccountExportZip(data, exportedAt);
    const url = URL.createObjectURL(new Blob([zip as unknown as BlobPart], { type: "application/zip" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cali-exercise-meal-planner-export-${exportedAt.slice(0, 10)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    setExportStatus(`CSV bundle download started: ${anchor.download}`);
    actions.notify("CSV export bundle downloaded.");
  };

  const deleteAccount = async () => {
    if (!window.confirm("Delete your account and all saved data? This cannot be undone.")) return;
    setDeleting(true);
    const deleted = await actions.deleteAccount();
    setDeleting(false);
    if (deleted) {
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith("calicoach:draft:v1:") && key.includes(encodeURIComponent(snapshot.userId))) {
            window.localStorage.removeItem(key);
          }
          if (key === `calicoach:onboarding-draft:${snapshot.userId}`) window.localStorage.removeItem(key);
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
      <Card tone="lavender" padding="compact" className="relative flex items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-xl font-extrabold">
          {profile?.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 sm:pr-20">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-lg font-extrabold">{profile?.name}</h2>
            <Button variant="primary" className="shrink-0 !min-h-11 !px-3 text-xs sm:absolute sm:top-1/2 sm:right-4 sm:-translate-y-1/2" onClick={() => router.push("/onboarding")}>
              <Pencil className="h-4 w-4" aria-hidden /> Edit
            </Button>
          </div>
          {profile ? <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Profile summary">
            <ProfileInfoPill>{profile.experience}</ProfileInfoPill>
            <ProfileInfoPill>{profile.daysPerWeek} days/week</ProfileInfoPill>
            <ProfileInfoPill>~{profile.sessionMinutes} min<span className="sr-only"> per session</span></ProfileInfoPill>
            <ProfileInfoPill>Goal: {profile.goal}</ProfileInfoPill>
          </ul> : null}
        </div>
      </Card>

      <Card>
        <HelpHeading title="Your targets"><p>{HEALTH_DISCLAIMER}</p><p>Formula: {target?.formula ?? "Not set"} · activity factor {target?.activityFactor ?? "Not set"} · effective {target?.effectiveDate ?? "Not set"} · version {target?.version ?? "Not set"}.</p></HelpHeading>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl bg-blush-100 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_44px]"><p className="pt-3 text-xs font-bold leading-4 text-ink-soft">BMR</p><HelpPopover title="BMR"><p>Basal metabolic rate estimates energy used at rest. It is calculated from your profile, not a measured calorie requirement.</p></HelpPopover></div>
            <p className="font-extrabold tabular-nums">{target?.bmr} kcal</p>
          </div>
          <div className="rounded-2xl bg-lav-100 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_44px]"><p className="pt-3 text-xs font-bold leading-4 text-ink-soft">BMI</p><HelpPopover title="BMI"><p>Body mass index compares weight with height. It is information only, not a diagnosis or a measure of body composition.</p></HelpPopover></div>
            <p className="font-extrabold tabular-nums">{target?.bmi}</p>
          </div>
          <div className="rounded-2xl bg-mint-100 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_44px]"><p className="pt-3 text-xs font-bold leading-4 text-ink-soft">TDEE</p><HelpPopover title="TDEE"><p>Total daily energy expenditure estimates daily energy use from BMR and an activity factor. Your actual needs can vary.</p></HelpPopover></div>
            <p className="font-extrabold tabular-nums">{target?.tdee} kcal</p>
          </div>
          <div className="rounded-2xl bg-peach-100 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_44px]"><p className="pt-3 text-xs font-bold leading-4 text-ink-soft">Daily target</p><HelpPopover title="Daily target"><p>This is an estimated daily calorie target based on your saved profile and goal. It can change when you update those inputs.</p></HelpPopover></div>
            <p className="font-extrabold tabular-nums">{target?.calories} kcal</p>
          </div>
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
              {u === "metric" ? "Metric" : "Imperial"}
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

      <DailyStepTargetSettings />

      <Card>
        <HelpHeading title="Gentle motivation"><p>Show personal firsts and participation milestones on Home. Rest days, missed entries, and calories never lose points.</p></HelpHeading>
        <SettingsSwitchRow
          label="Milestones"
          description="Show personal firsts and participation on Home."
          descriptionId="milestones-description"
          checked={profile?.celebrationsEnabled ?? false}
          disabled={Boolean(pendingMutation)}
          onToggle={() => void actions.setCelebrations(!profile?.celebrationsEnabled)}
        />
      </Card>

      <Card id="notifications">
        <HelpHeading title="Notifications"><p>This saves your preference for future reminders. Delivery is not enabled yet.</p></HelpHeading>
        <SettingsSwitchRow
          label="Allow future reminders"
          description="Reminders are not active yet."
          descriptionId="notifications-description"
          checked={profile?.notificationsEnabled ?? false}
          disabled={pendingMutation === "update_notification_preference"}
          onToggle={() => void actions.updateNotificationPreference(!(profile?.notificationsEnabled ?? false))}
        />
      </Card>

      <Card>
        <HelpHeading title="Data controls"><p>Export downloads your saved account data. Regenerating creates a future plan; completed history stays intact.</p><p>Account deletion permanently removes your saved data.</p></HelpHeading>
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 md:grid-cols-3">
            <Button variant="secondary" onClick={() => void exportData()} disabled={exporting}>
              <Download className="h-4 w-4" aria-hidden /> Export JSON
            </Button>
            <Button variant="secondary" onClick={() => void exportCsvBundle()} disabled={exporting}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV bundle
            </Button>
            <Button variant="secondary" onClick={actions.resetPlan}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Regenerate plan
            </Button>
          </div>
          {exportStatus ? <p className="rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">{exportStatus}</p> : null}
          <Button type="button" variant="danger" className="w-full" onClick={() => void signOut()} disabled={signingOut}>
            <LogOut className="h-4 w-4" aria-hidden /> {signingOut ? "Signing out…" : "Sign out"}
          </Button>
          <Button variant="danger" onClick={() => void deleteAccount()} disabled={deleting}>
            Permanently delete account
          </Button>
        </div>
      </Card>

      <Card>
        <HelpHeading title="Safety & sources"><p>Health and nutrition values are estimates, not medical advice. Food entries retain source, confidence, and estimate status.</p><p>Exercise illustrations by Bryl Lim (CC BY-SA 4.0) via @bryllim/workout-guide.</p><p>Export and deletion use authorized server workflows.</p></HelpHeading>
      </Card>
    </div>
  );
}
