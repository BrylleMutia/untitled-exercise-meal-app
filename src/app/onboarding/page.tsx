"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft, TriangleAlert } from "lucide-react";
import { useAppOptional } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import {
  HEALTH_DISCLAIMER,
  isAggressiveRate,
  validateProfileInput,
  buildDailyTarget,
  ELIGIBILITY_SCREENING_VERSION,
  cmToIn,
  inToCm,
  kgToLb,
  lbToKg,
} from "@/utility/health";
import { todayKey } from "@/utility/dates";
import type {
  EquipmentId,
  ExperienceLevel,
  PrimaryGoal,
  SexForBmr,
  UnitSystem,
  UserProfile,
  TargetEligibility,
} from "@/types/domain";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";

const STEPS = ["You", "Training", "Goal", "Your numbers"] as const;

const EQUIPMENT_OPTIONS: Array<{ id: EquipmentId; label: string }> = [
  { id: "none", label: "No equipment" },
  { id: "pullup_bar", label: "Pull-up bar" },
  { id: "bands", label: "Resistance bands" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "bench", label: "Bench / sturdy chair" },
];

const GOALS: Array<{ id: PrimaryGoal; label: string }> = [
  { id: "strength", label: "Build strength or skills" },
  { id: "lose", label: "Lose weight" },
  { id: "maintain", label: "Maintain weight" },
  { id: "gain", label: "Gain weight" },
  { id: "consistency", label: "Improve consistency" },
];

interface Draft {
  name: string;
  age: string;
  sex: SexForBmr;
  units: UnitSystem;
  height: string;
  weight: string;
  experience: ExperienceLevel;
  equipment: EquipmentId[];
  daysPerWeek: number;
  sessionMinutes: number;
  dietaryPattern: string;
  allergies: string;
  goal: PrimaryGoal;
  targetWeight: string;
  targetWeeks: string;
  confirmAggressive: boolean;
  targetEligibility: TargetEligibility;
}

const initialDraft: Draft = {
  name: "",
  age: "",
  sex: "female",
  units: "metric",
  height: "",
  weight: "",
  experience: "beginner",
  equipment: ["none"],
  daysPerWeek: 3,
  sessionMinutes: 45,
  dietaryPattern: "No restrictions",
  allergies: "",
  goal: "strength",
  targetWeight: "",
  targetWeeks: "",
  confirmAggressive: false,
  targetEligibility: "not_answered",
};

export default function OnboardingPage() {
  const app = useAppOptional();
  const router = useRouter();
  const draftUserId = app?.snapshot.userId ?? "";
  const draftStorageKey = draftUserId ? `calicoach:onboarding-draft:${draftUserId}` : "";
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => {
    const base = profileToDraft(app?.snapshot.profile, app?.snapshot.goal);
    if (typeof window === "undefined") return base;
    try {
      const saved = draftStorageKey ? window.localStorage.getItem(draftStorageKey) : null;
      return saved ? { ...base, ...(JSON.parse(saved) as Partial<Draft>) } : base;
    } catch {
      return base;
    }
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const suppressDraftWriteRef = useRef(false);

  useEffect(() => {
    if (!draftUserId) return;
    let active = true;
    void readDraft<Draft>(draftUserId, "onboarding").then((saved) => {
      if (!active) return;
      if (saved) {
        setDraft((current) => ({ ...current, ...saved.payload }));
        setDraftWasRestored(true);
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftUserId]);

  useEffect(() => {
    if (!draftReady || !draftUserId) return;
    if (suppressDraftWriteRef.current) {
      suppressDraftWriteRef.current = false;
      return;
    }
    void writeDraft(createDraftEnvelope({
      userId: draftUserId,
      draftType: "onboarding",
      payload: draft,
      baseVersions: {
        profileRevision: app?.snapshot.profile?.revision,
        goalVersion: app?.snapshot.goal?.version,
        targetVersion: app?.snapshot.target?.version,
        workoutPlanVersion: app?.snapshot.plan?.version,
        mealPlanVersion: app?.snapshot.mealPlan?.version,
        groceryRevision: app?.snapshot.grocery?.revision,
      },
      ttlMs: 30 * 24 * 60 * 60 * 1000,
    }));
  }, [app?.snapshot, draft, draftReady, draftStorageKey, draftUserId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const changeUnits = (units: UnitSystem) => {
    if (units === draft.units) return;
    const nextHeight = draft.height
      ? units === "metric"
        ? String(Math.round(inToCm(Number(draft.height)) * 10) / 10)
        : String(Math.round(cmToIn(Number(draft.height)) * 10) / 10)
      : "";
    const nextWeight = draft.weight
      ? units === "metric"
        ? String(Math.round(lbToKg(Number(draft.weight)) * 10) / 10)
        : String(Math.round(kgToLb(Number(draft.weight)) * 10) / 10)
      : "";
    setDraft((current) => ({ ...current, units, height: nextHeight, weight: nextWeight }));
  };

  const weightKg = draft.units === "metric" ? Number(draft.weight) : lbToKg(Number(draft.weight));
  const heightCm = draft.units === "metric" ? Number(draft.height) : inToCm(Number(draft.height));

  const validationErrors = (): string[] => {
    if (step === 0) {
      const list: string[] = [];
      if (!draft.name.trim()) list.push("Tell us what to call you.");
      return [
        ...list,
        ...validateProfileInput({
          age: Number(draft.age),
          sex: draft.sex,
          heightCm: heightCm || 0,
          weightKg: weightKg || 0,
          daysPerWeek: draft.daysPerWeek,
          sessionMinutes: draft.sessionMinutes,
        }),
      ];
    }
    if (step === 2 && draft.targetWeight) {
      const targetKg = draft.units === "metric" ? Number(draft.targetWeight) : lbToKg(Number(draft.targetWeight));
      if (!Number.isFinite(targetKg) || targetKg <= 0) return ["Enter a valid target weight or leave it blank."];
      if (draft.targetWeeks && (!Number.isFinite(Number(draft.targetWeeks)) || Number(draft.targetWeeks) <= 0)) {
        return ["Enter a positive number of weeks or leave it blank."];
      }
    }
    if (step === 0 && draft.targetEligibility === "not_answered") {
      return ["Choose an option for the health screening before previewing automated targets."];
    }
    if (step === 2 && draft.targetWeight && draft.targetWeeks) {
      const targetKg =
        draft.units === "metric" ? Number(draft.targetWeight) : lbToKg(Number(draft.targetWeight));
      if (
        isAggressiveRate(weightKg, targetKg, Number(draft.targetWeeks)) &&
        !draft.confirmAggressive
      ) {
        return ["That rate is unusually aggressive. Tick the confirmation box to continue anyway."];
      }
    }
    return [];
  };

  const next = () => {
    const list = validationErrors();
    setErrors(list);
    if (list.length > 0) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finish = async () => {
    if (!app) return;
    const profile: UserProfile = {
      id: app.snapshot.userId || "authenticated-user",
      name: draft.name.trim(),
      age: Number(draft.age),
      sex: draft.sex,
      heightCm: Math.round(heightCm * 10) / 10,
      weightKg: Math.round(weightKg * 10) / 10,
      units: draft.units,
      experience: draft.experience,
      equipment: draft.equipment,
      daysPerWeek: draft.daysPerWeek,
      sessionMinutes: draft.sessionMinutes,
      goal: draft.goal,
      dietaryPattern: draft.dietaryPattern,
      allergies: draft.allergies.split(",").map((item) => item.trim()).filter(Boolean),
      foodPreferences: app.snapshot.profile?.foodPreferences ?? [],
      cookingTimeMinutes: app.snapshot.profile?.cookingTimeMinutes,
      mealBudget: app.snapshot.profile?.mealBudget,
      createdAt: new Date().toISOString(),
      targetEligibility: draft.targetEligibility,
      eligibilityVersion: ELIGIBILITY_SCREENING_VERSION,
    };
    const targetWeeks = Number(draft.targetWeeks);
    const validTargetWeeks = Number.isFinite(targetWeeks) && targetWeeks > 0;
    const goalTargetKg = draft.targetWeight
      ? draft.units === "metric" ? Number(draft.targetWeight) : lbToKg(Number(draft.targetWeight))
      : undefined;
    const validGoalTarget = goalTargetKg !== undefined && Number.isFinite(goalTargetKg);
    const goal = {
      targetWeightKg: draft.targetWeight
        ? validGoalTarget ? goalTargetKg : undefined
        : undefined,
      desiredRateKgPerWeek:
        validGoalTarget && validTargetWeeks && weightKg
          ? Math.round((Math.abs(weightKg - (goalTargetKg ?? 0)) / targetWeeks) * 100) / 100
          : undefined,
      targetDate:
        validTargetWeeks
          ? new Date(Date.now() + targetWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : undefined,
      weeklyWorkoutTarget: draft.daysPerWeek,
    };
    const saved = app.snapshot.profile
      ? await app.actions.updateProfile(profile, goal)
      : await app.actions.completeOnboarding(profile, goal);
    if (saved) {
      if (draftUserId) void clearDraft(draftUserId, "onboarding");
      if (draftStorageKey) {
        try { window.localStorage.removeItem(draftStorageKey); } catch { /* compatibility cleanup */ }
      }
      router.push("/");
    }
  };

  let preview: ReturnType<typeof buildDailyTarget> | null = null;
  let previewError = "";
  if (step === 3) {
    try {
      preview = buildDailyTarget(
          {
            id: "preview",
            name: draft.name,
            age: Number(draft.age),
            sex: draft.sex,
            heightCm,
            weightKg,
            units: draft.units,
            experience: draft.experience,
            equipment: draft.equipment,
            daysPerWeek: draft.daysPerWeek,
            sessionMinutes: draft.sessionMinutes,
            goal: draft.goal,
            dietaryPattern: draft.dietaryPattern,
            allergies: draft.allergies.split(",").map((item) => item.trim()).filter(Boolean),
            foodPreferences: app?.snapshot.profile?.foodPreferences ?? [],
            cookingTimeMinutes: app?.snapshot.profile?.cookingTimeMinutes,
            mealBudget: app?.snapshot.profile?.mealBudget,
             createdAt: new Date().toISOString(),
             targetEligibility: draft.targetEligibility,
             eligibilityVersion: ELIGIBILITY_SCREENING_VERSION,
           },
           todayKey(),
      );
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Automated targets are unavailable for these inputs.";
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
          Onboarding · step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">{STEPS[step]}</h1>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-lav-500" : "bg-lav-100"}`}
            />
          ))}
        </div>
      </div>

      {draftWasRestored ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
          <span>Onboarding draft restored from this device.</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => {
              suppressDraftWriteRef.current = true;
              if (draftUserId) void clearDraft(draftUserId, "onboarding");
              if (draftStorageKey) {
                try { window.localStorage.removeItem(draftStorageKey); } catch { /* compatibility cleanup */ }
              }
              setDraft(profileToDraft(app?.snapshot.profile, app?.snapshot.goal));
              setDraftWasRestored(false);
              setErrors([]);
              setStep(0);
            }}
          >
            Discard draft
          </button>
        </div>
      ) : null}

      {app?.error?.code === "stale_version" ? (
        <Card tone="peach" role="alert">
          <p className="font-extrabold">Your saved data changed elsewhere.</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            Your form is still here. Review it against the refreshed account data,
            then explicitly reapply or discard this draft.
          </p>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => void finish()}>
              Reapply draft
            </Button>
            <Button
              variant="soft"
              onClick={() => {
                suppressDraftWriteRef.current = true;
                if (draftUserId) void clearDraft(draftUserId, "onboarding");
                if (draftStorageKey) {
                  try { window.localStorage.removeItem(draftStorageKey); } catch { /* compatibility cleanup */ }
                }
                setDraft(profileToDraft(app.snapshot.profile, app.snapshot.goal));
                setDraftWasRestored(false);
                setErrors([]);
                app.actions.clearError();
              }}
            >
              Discard
            </Button>
          </div>
        </Card>
      ) : null}

      {errors.length > 0 ? (
        <div role="alert" className="rounded-3xl bg-coral-100 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <TriangleAlert className="h-4 w-4" aria-hidden /> Please check:
          </p>
          <ul className="mt-1 list-inside list-disc text-sm font-semibold text-ink-soft">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 0 ? (
        <Card className="grid gap-4">
          <Field label="What should we call you?">
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Alex"
              className="input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input
                value={draft.age}
                onChange={(e) => set("age", e.target.value)}
                inputMode="numeric"
                placeholder="29"
                className="input"
              />
            </Field>
            <Field label="Sex for BMR estimate">
              <select
                value={draft.sex}
                onChange={(e) => set("sex", e.target.value as SexForBmr)}
                className="input"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </Field>
          </div>
          <Field label="Health screening for automated targets">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => set("targetEligibility", "eligible")}
                aria-pressed={draft.targetEligibility === "eligible"}
                className={`min-h-12 rounded-2xl px-4 text-left text-sm font-bold ${draft.targetEligibility === "eligible" ? "bg-ink text-white" : "bg-lav-50 text-ink"}`}
              >
                None of the situations below apply to me
              </button>
              <button
                type="button"
                onClick={() => set("targetEligibility", "unsupported")}
                aria-pressed={draft.targetEligibility === "unsupported"}
                className={`min-h-12 rounded-2xl px-4 text-left text-sm font-bold ${draft.targetEligibility === "unsupported" ? "bg-ink text-white" : "bg-lav-50 text-ink"}`}
              >
                I am pregnant/postpartum, under 18, recovering from an eating disorder, managing a condition needing individualized care, or unsure
              </button>
            </div>
            <p className="text-xs font-semibold text-muted">We store only the outcome and screening version, not a reason or diagnosis.</p>
          </Field>
          <Field label="Units">
            <div className="grid grid-cols-2 gap-2">
              {(["metric", "imperial"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => changeUnits(u)}
                  aria-pressed={draft.units === u}
                  className={`min-h-12 rounded-2xl text-sm font-bold ${
                    draft.units === u ? "bg-ink text-white" : "bg-lav-50 text-ink"
                  }`}
                >
                  {u === "metric" ? "Metric (kg, cm)" : "Imperial (lb, in)"}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={draft.units === "metric" ? "Height (cm)" : "Height (in)"}>
              <input
                value={draft.height}
                onChange={(e) => set("height", e.target.value)}
                inputMode="decimal"
                placeholder={draft.units === "metric" ? "178" : "70"}
                className="input"
              />
            </Field>
            <Field label={draft.units === "metric" ? "Weight (kg)" : "Weight (lb)"}>
              <input
                value={draft.weight}
                onChange={(e) => set("weight", e.target.value)}
                inputMode="decimal"
                placeholder={draft.units === "metric" ? "76" : "168"}
                className="input"
              />
            </Field>
          </div>
          <p className="text-xs font-semibold text-muted">
            Adults 18+ only. We reject out-of-range values instead of silently
            clamping them.
          </p>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card className="grid gap-4">
          <Field label="Training experience">
            <div className="grid grid-cols-3 gap-2">
              {(["beginner", "intermediate", "advanced"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => set("experience", level)}
                  aria-pressed={draft.experience === level}
                  className={`min-h-12 rounded-2xl text-xs font-bold capitalize ${
                    draft.experience === level ? "bg-ink text-white" : "bg-lav-50 text-ink"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Available equipment">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((option) => {
                const active = draft.equipment.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      set(
                        "equipment",
                        active
                          ? draft.equipment.filter((e) => e !== option.id)
                          : [...draft.equipment.filter((e) => e !== "none"), ...(option.id === "none" ? [] : [option.id])],
                      )
                    }
                    className={`min-h-11 rounded-full px-4 text-xs font-bold ${
                      active ? "bg-ink text-white" : "bg-lav-50 text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dietary pattern">
              <select
                value={draft.dietaryPattern}
                onChange={(e) => set("dietaryPattern", e.target.value)}
                className="input"
              >
                <option>No restrictions</option>
                <option>Vegetarian</option>
                <option>Vegan</option>
              </select>
            </Field>
            <Field label="Allergies / exclusions">
              <input
                value={draft.allergies}
                onChange={(e) => set("allergies", e.target.value)}
                placeholder="none known"
                className="input"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Days per week">
              <select
                value={draft.daysPerWeek}
                onChange={(e) => set("daysPerWeek", Number(e.target.value))}
                className="input"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Typical duration">
              <select
                value={draft.sessionMinutes}
                onChange={(e) => set("sessionMinutes", Number(e.target.value))}
                className="input"
              >
                {[20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="grid gap-4">
          <Field label="Primary goal">
            <div className="grid gap-2">
              {GOALS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => set("goal", goal.id)}
                  aria-pressed={draft.goal === goal.id}
                  className={`min-h-12 rounded-2xl px-4 text-left text-sm font-bold ${
                    draft.goal === goal.id ? "bg-ink text-white" : "bg-lav-50 text-ink"
                  }`}
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </Field>
          {draft.goal === "lose" || draft.goal === "gain" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Target weight (${draft.units === "metric" ? "kg" : "lb"}) — optional`}>
                <input
                  value={draft.targetWeight}
                  onChange={(e) => set("targetWeight", e.target.value)}
                  inputMode="decimal"
                  className="input"
                />
              </Field>
              <Field label="In how many weeks? — optional">
                <input
                  value={draft.targetWeeks}
                  onChange={(e) => set("targetWeeks", e.target.value)}
                  inputMode="numeric"
                  className="input"
                />
              </Field>
            </div>
          ) : null}
          {draft.targetWeight && draft.targetWeeks ? (
            <label className="flex items-start gap-3 rounded-2xl bg-peach-100 p-3 text-xs font-bold">
              <input
                type="checkbox"
                checked={draft.confirmAggressive}
                onChange={(e) => set("confirmAggressive", e.target.checked)}
                className="mt-0.5 h-5 w-5"
              />
              I understand fast change rates are not a recommendation and may be
              inappropriate for me.
            </label>
          ) : null}
          <p className="text-xs font-semibold text-muted">
            This app never replaces medical or dietary care. If you are
            pregnant, recovering from an eating disorder, or managing a health
            condition, please work with a professional instead of automated
            targets.
          </p>
        </Card>
      ) : null}

      {step === 3 && preview ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile tone="lavender" label="BMR (est.)" value={`${preview.bmr} kcal`} sub="Mifflin-St Jeor" />
            <StatTile tone="peach" label="BMI (info only)" value={String(preview.bmi)} sub="Not a diagnosis" />
            <StatTile tone="mint" label="TDEE (est.)" value={`${preview.tdee} kcal`} sub={`Factor ${preview.activityFactor}`} />
            <StatTile tone="blush" label="Daily target" value={`${preview.calories} kcal`} sub={`From ${todayKey()}`} />
          </div>
          <Card tone="white">
            <h2 className="font-extrabold">Macro targets (estimates)</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Protein", value: preview.proteinG },
                { label: "Carbs", value: preview.carbsG },
                { label: "Fat", value: preview.fatG },
              ].map((m) => (
                <div key={m.label} className="rounded-2xl bg-lav-50 p-3">
                  <p className="text-xl font-extrabold tabular-nums">{m.value}g</p>
                  <p className="text-[11px] font-bold text-muted">{m.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-2xl bg-cream p-3 text-xs font-semibold text-muted">
              {HEALTH_DISCLAIMER} Formula: Mifflin-St Jeor · activity factor from
              your training days · effective {todayKey()}. Historical plans keep
              the version they were created with.
            </p>
          </Card>
        </div>
      ) : null}
      {step === 3 && !preview && previewError ? (
        <Card tone="peach" role="alert">
          <p className="font-extrabold">Automated target preview unavailable</p>
          <p className="mt-1 text-sm font-semibold text-muted">{previewError}</p>
          <p className="mt-2 text-xs font-semibold text-muted">You can still use manual workout and nutrition logging. Update the screening answer or inputs to continue.</p>
        </Card>
      ) : null}

      <div className="flex gap-3">
        {step > 0 ? (
          <Button variant="soft" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" onClick={next}>
            Continue <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            className="flex-1"
            onClick={finish}
            disabled={!preview && draft.targetEligibility !== "unsupported"}
          >
            {draft.targetEligibility === "unsupported" ? "Continue without automated targets" : "Create my plan"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-extrabold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function profileToDraft(profile: UserProfile | null | undefined, goal?: { targetWeightKg?: number; targetDate?: string } | null): Draft {
  if (!profile) return initialDraft;
  const displayHeight = profile.units === "metric" ? profile.heightCm : cmToDisplayIn(profile.heightCm);
  const displayWeight = profile.units === "metric" ? profile.weightKg : kgToDisplayLb(profile.weightKg);
  const goalWeightKg = goal?.targetWeightKg;
  return {
    name: profile.name,
    age: String(profile.age),
    sex: profile.sex,
    units: profile.units,
    height: String(Math.round(displayHeight * 10) / 10),
    weight: String(Math.round(displayWeight * 10) / 10),
    experience: profile.experience,
    equipment: profile.equipment,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    dietaryPattern: profile.dietaryPattern,
    allergies: profile.allergies.join(", "),
    goal: profile.goal,
    targetWeight: goalWeightKg === undefined
      ? ""
      : String(Math.round((profile.units === "metric" ? goalWeightKg : kgToDisplayLb(goalWeightKg)) * 10) / 10),
    targetWeeks: goal?.targetDate
      ? String(Math.max(1, Math.round((new Date(goal.targetDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))))
      : "",
    confirmAggressive: false,
    targetEligibility: profile.targetEligibility ?? "not_answered",
  };
}

function cmToDisplayIn(cm: number): number {
  return cm / 2.54;
}

function kgToDisplayLb(kg: number): number {
  return kg * 2.2046226218;
}
