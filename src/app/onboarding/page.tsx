"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { useAppOptional } from "@/contexts/AppContext";
import { Stepper, StepperActions } from "@/components/ui/Stepper";
import { OnboardingFrame } from "@/components/onboarding/OnboardingFrame";
import { nutritionMetricStyles } from "@/components/ui/nutritionMetrics";
import { Button } from "@/components/ui/Button";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { hasSamePlanInputs } from "@/utility/profilePlanInputs";
import { BirthDatePicker } from "@/components/ui/BirthDatePicker";
import { useLocalToday } from "@/hooks/useLocalToday";
import { ageOnDate, birthDateFromParts, birthDateParts, emptyBirthDate, validateBirthDate, type BirthDateParts } from "@/utility/birthDate";
import { MeasurementRuler } from "@/components/ui/MeasurementRuler";
import { convertMeasurement, measurementMetricValue, type MeasurementBasis } from "@/utility/measurementRuler";
import {
  HEALTH_DISCLAIMER,
  isAggressiveRate,
  validateProfileInput,
  buildDailyTarget,
  ELIGIBILITY_SCREENING_VERSION,
  cmToIn,
  kgToLb,
  lbToKg,
} from "@/utility/health";
import type {
  EquipmentId,
  ExperienceLevel,
  PrimaryGoal,
  SexForBmr,
  UnitSystem,
  UserProfile,
  TargetEligibility,
  TrainingProgram,
} from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { validateDailyStepTarget } from "@/utility/dailySteps";

const STEPS = ["About you", "Movement", "Food choices", "Your goal", "Review"] as const;

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

import { weekdayNames } from "@/utility/dates";
import type { Weekday } from "@/types/domain";

interface Draft {
  weekStartsOn: Weekday;
  name: string;
  age: string;
  birthday?: BirthDateParts;
  sex: SexForBmr;
  units: UnitSystem;
  height: string;
  weight: string;
  experience: ExperienceLevel;
  trainingProgram: TrainingProgram;
  equipment: EquipmentId[];
  daysPerWeek: number;
  sessionMinutes: number;
  dailyStepTarget: string;
  dietaryPattern: string;
  allergies: string;
  foodPreferences: string;
  cookingTimeMinutes: number;
  mealBudget: string;
  goal: PrimaryGoal;
  targetWeight: string;
  targetWeeks: string;
  confirmAggressive: boolean;
  targetEligibility: TargetEligibility;
  reviewAcknowledgementVersion?: string;
  measurementBasis?: Partial<Record<"height" | "weight", MeasurementBasis>>;
}

const initialDraft: Draft = {
  weekStartsOn: 0,
  name: "",
  age: "",
  sex: "female",
  units: "metric",
  height: "",
  weight: "",
  experience: "beginner",
  trainingProgram: "calisthenics",
  equipment: ["none"],
  daysPerWeek: 3,
  sessionMinutes: 45,
  dailyStepTarget: "",
  dietaryPattern: "No restrictions",
  allergies: "",
  foodPreferences: "",
  cookingTimeMinutes: 30,
  mealBudget: "",
  goal: "strength",
  targetWeight: "",
  targetWeeks: "",
  confirmAggressive: false,
  targetEligibility: "not_answered",
};

export default function OnboardingPage() {
  const app = useAppOptional();
  const today = useLocalToday();
  const router = useRouter();
  const draftUserId = app?.snapshot.userId ?? "";
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => profileToDraft(app?.snapshot.profile, app?.snapshot.goal));
  const [errors, setErrors] = useState<string[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
  const suppressDraftWriteRef = useRef(false);
  const finalizingRef = useRef(false);
  const lastAttemptDraftRef = useRef<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const validationAlertRef = useRef<HTMLDivElement>(null);
  const saveAlertRef = useRef<HTMLElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    const alert = errors.length ? validationAlertRef.current : app?.error ? saveAlertRef.current : null;
    if (!alert) return;
    alert.focus({ preventScroll: true });
    alert.scrollIntoView({ block: "start", behavior: "instant" });
  }, [errors, app?.error]);

  useEffect(() => {
    if (!draftUserId) return;
    let active = true;
    void readDraft<Draft>(draftUserId, "onboarding").then((saved) => {
      if (!active) return;
      if (saved) {
        setDraft((current) => ({
          ...current,
          ...saved.payload,
          targetEligibility: saved.payload.reviewAcknowledgementVersion === ELIGIBILITY_SCREENING_VERSION
            ? saved.payload.targetEligibility : "not_answered",
        }));
        setDraftWasRestored(true);
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftUserId]);

  useEffect(() => {
    if (!draftReady || !draftUserId || finalizing) return;
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
      ttlMs: draftTtlMs("onboarding"),
    })).then((saved) => setDraftWriteUnavailable(!saved));
  }, [app?.snapshot, draft, draftReady, draftUserId, finalizing]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value,
      ...((key === "height" || key === "weight") ? { measurementBasis: { ...d.measurementBasis, [key]: undefined } } : {}),
    }));

  const changeUnits = (units: UnitSystem) => {
    if (units === draft.units) return;
    const height = convertMeasurement(draft.height, draft.units, units, "height", draft.measurementBasis?.height);
    const weight = convertMeasurement(draft.weight, draft.units, units, "weight", draft.measurementBasis?.weight);
    setDraft((current) => ({ ...current, units, height: height.value, weight: weight.value,
      measurementBasis: { height: height.basis, weight: weight.basis },
    }));
  };

  const weightKg = measurementMetricValue(draft.weight, draft.units, "weight", draft.measurementBasis?.weight);
  const heightCm = measurementMetricValue(draft.height, draft.units, "height", draft.measurementBasis?.height);
  const eligibilityAnswered = draft.reviewAcknowledgementVersion === ELIGIBILITY_SCREENING_VERSION && draft.targetEligibility !== "not_answered";
  const birthday = draft.birthday ?? emptyBirthDate;
  const selectedBirthDate = birthDateFromParts(birthday);
  const birthdayTouched = Object.values(birthday).some(value => value !== null);
  const legacyAge = app?.snapshot.profile && !app.snapshot.profile.birthDate && !birthdayTouched ? Number(draft.age) : undefined;
  const age = selectedBirthDate ? ageOnDate(selectedBirthDate, today) ?? Number.NaN : legacyAge ?? Number.NaN;
  const birthdayError = legacyAge !== undefined ? null : validateBirthDate(selectedBirthDate, today);

  const measurementErrors = validateProfileInput({ age: age, sex: draft.sex, heightCm, weightKg, daysPerWeek: draft.daysPerWeek, sessionMinutes: draft.sessionMinutes });
  const heightError = measurementErrors.find(message => message.startsWith("Height"));
  const weightError = measurementErrors.find(message => message.startsWith("Weight"));

  const acknowledge = (outcome: TargetEligibility) => setDraft(current => ({ ...current,
    targetEligibility: outcome, reviewAcknowledgementVersion: ELIGIBILITY_SCREENING_VERSION,
  }));

  const validationErrors = (): string[] => {
    if (step === 1 || step === 4) {
      const invalid = validateDailyStepTarget(draft.dailyStepTarget.trim() ? Number(draft.dailyStepTarget) : null);
      if (invalid) return [invalid];
    }
    if (step === 0) {
      const list: string[] = [];
      if (!draft.name.trim()) list.push("Tell us what to call you.");
      return [
        ...list,
        ...(birthdayError ? [birthdayError] : []),
        ...validateProfileInput({
          age,
          sex: draft.sex,
          heightCm: heightCm || 0,
          weightKg: weightKg || 0,
          daysPerWeek: draft.daysPerWeek,
          sessionMinutes: draft.sessionMinutes,
        }).filter(message => !birthdayError || !message.startsWith("Age")),
      ];
    }
    if (step === 3 && draft.targetWeight) {
      const targetKg = draft.units === "metric" ? Number(draft.targetWeight) : lbToKg(Number(draft.targetWeight));
      if (!Number.isFinite(targetKg) || targetKg <= 0) return ["Enter a valid target weight or leave it blank."];
      if (draft.targetWeeks && (!Number.isFinite(Number(draft.targetWeeks)) || Number(draft.targetWeeks) <= 0)) {
        return ["Enter a positive number of weeks or leave it blank."];
      }
    }
    if (step === 3 && draft.targetWeight && draft.targetWeeks) {
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
    if (!app || finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    try {
    if (!eligibilityAnswered) { setErrors(["Review the health acknowledgement or choose manual logging before continuing."]); return; }
    if (draft.targetEligibility === "eligible" && !preview) { setErrors(["An automated target could not be created. Review your inputs before saving."]); return; }
    if (birthdayError) { setErrors([birthdayError]); return; }
    const invalidProfile = validateProfileInput({ age: age, sex: draft.sex, heightCm, weightKg, daysPerWeek: draft.daysPerWeek, sessionMinutes: draft.sessionMinutes });
    if (invalidProfile.length) { setErrors(invalidProfile); return; }
    const invalidTarget = validateDailyStepTarget(draft.dailyStepTarget.trim() ? Number(draft.dailyStepTarget) : null);
    if (invalidTarget) { setErrors([invalidTarget]); return; }
    const profile: UserProfile = {
      id: app.snapshot.userId || "authenticated-user",
      name: draft.name.trim(),
      age,
      ...(selectedBirthDate ? { birthDate: selectedBirthDate } : {}),
      sex: draft.sex,
      heightCm: Math.round(heightCm * 10) / 10,
      weightKg: Math.round(weightKg * 10) / 10,
      units: draft.units,
      experience: draft.experience,
      trainingProgram: draft.trainingProgram,
      equipment: draft.equipment,
      daysPerWeek: draft.daysPerWeek,
      sessionMinutes: draft.sessionMinutes,
      weekStartsOn: draft.weekStartsOn ?? 0,
      dailyStepTarget: draft.dailyStepTarget.trim() ? Number(draft.dailyStepTarget) : undefined,
      goal: draft.goal,
      dietaryPattern: draft.dietaryPattern,
      allergies: draft.allergies.split(",").map((item) => item.trim()).filter(Boolean),
      foodPreferences: draft.foodPreferences.split(",").map((item) => item.trim()).filter(Boolean),
      cookingTimeMinutes: draft.cookingTimeMinutes,
      mealBudget: draft.mealBudget ? Number(draft.mealBudget) : undefined,
      notificationsEnabled: app.snapshot.profile?.notificationsEnabled ?? false,
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
    const attemptDraft = JSON.stringify(draft);
    const canRetry = app.error?.retryable && lastAttemptDraftRef.current === attemptDraft;
    lastAttemptDraftRef.current = attemptDraft;
    const saved = canRetry
      ? await app.actions.retryLast()
      : app.snapshot.profile
        ? await app.actions.updateProfile(profile, goal)
        : await app.actions.completeOnboarding(profile, goal);
    if (saved) {
      setDraftReady(false);
      if (draftUserId) await clearDraft(draftUserId, "onboarding");
      router.push("/");
    }
    } finally {
      finalizingRef.current = false;
      setFinalizing(false);
    }
  };

  let preview: ReturnType<typeof buildDailyTarget> | null = null;
  let previewError = "";
  if (step === 4 && eligibilityAnswered && draft.targetEligibility === "eligible") {
    try {
      const previewProfile: UserProfile = {
        id: "preview",
        name: draft.name,
        age,
        ...(selectedBirthDate ? { birthDate: selectedBirthDate } : {}),
        sex: draft.sex,
        heightCm,
        weightKg,
        units: draft.units,
        weekStartsOn: draft.weekStartsOn ?? 0,
        experience: draft.experience,
        trainingProgram: draft.trainingProgram,
        equipment: draft.equipment,
        daysPerWeek: draft.daysPerWeek,
        sessionMinutes: draft.sessionMinutes,
        goal: draft.goal,
        dietaryPattern: draft.dietaryPattern,
        allergies: draft.allergies.split(",").map((item) => item.trim()).filter(Boolean),
        foodPreferences: draft.foodPreferences.split(",").map((item) => item.trim()).filter(Boolean),
        cookingTimeMinutes: draft.cookingTimeMinutes,
        mealBudget: draft.mealBudget ? Number(draft.mealBudget) : undefined,
        notificationsEnabled: app?.snapshot.profile?.notificationsEnabled ?? false,
        createdAt: new Date().toISOString(),
        targetEligibility: draft.targetEligibility,
        eligibilityVersion: ELIGIBILITY_SCREENING_VERSION,
      };
      preview = app?.snapshot.profile && app.snapshot.target && hasSamePlanInputs(app.snapshot.profile, previewProfile)
        ? app.snapshot.target : buildDailyTarget(previewProfile, today);
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Automated targets are unavailable for these inputs.";
    }
  }

  return (
    <OnboardingFrame stepKey={step}
      header={<Stepper label="Onboarding" steps={STEPS} step={step} headingRef={headingRef} help={<HelpPopover title={STEPS[step]}>
          {step === 0 ? <><p>Your profile is used to estimate targets and build plans. Choose your birthday to calculate your current age. The calorie formula uses age, height, weight, and the selected sex.</p><p>Swipe the rulers or tap a value to type. A health acknowledgement on Review checks whether automated targets are suitable. Adults 18+ only; invalid values are rejected rather than clamped.</p></> : step === 1 ? <><p>Both workout programs stay editable. Pilates foundations use controlled beginner movements without special equipment.</p><p>Your experience, equipment, days, and session time shape the plan.</p></> : step === 2 ? <><p>Choose foods that work for you; you can change these later. Meals use measured portions and respect your exclusions. When no meal fits, the slot stays open.</p><p>Meal cost preferences compare the starter catalog; they are not prices or a money budget.</p></> : step === 3 ? <p>Goals guide estimated targets. Automated targets do not replace medical or dietary care; some health situations need professional advice.</p> : <><p>Review your answers and acknowledge eligibility before estimated targets appear. Plans remain editable, and later changes do not rewrite completed history.</p><p>Screening saves only your choice and policy version, without a reason or diagnosis.</p></>}
        </HelpPopover>} />}
      footer={<>
        <StepperActions className="flex-wrap [&>button:last-child]:basis-40" step={step} total={STEPS.length} busy={finalizing} onBack={() => setStep(value => value - 1)} onContinue={next} finalAction={<Button
            className="min-w-0 flex-1 basis-40 py-3 @max-[20rem]:!px-3"
            onClick={finish}
            disabled={finalizing || !eligibilityAnswered || (!preview && draft.targetEligibility !== "unsupported")}
            aria-busy={finalizing}
          >
            <span className="min-w-0 wrap-anywhere">{finalizing ? "Saving your plan…" : app?.error?.retryable ? "Retry saving" : draft.targetEligibility === "unsupported" ? "Continue without automated targets" : "Create my plan"}</span>
            {finalizing ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />}
          </Button>} />
      {finalizing ? <p role="status" className="text-center text-sm font-semibold text-muted">Finalizing your account and saving your plan…</p> : null}
      </>}
    >
      {draftWasRestored ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
          <span>Onboarding draft restored from this device.</span>
          <button
            type="button"
            disabled={finalizing}
            className="min-h-11 max-w-full wrap-anywhere text-left underline underline-offset-2"
            onClick={() => {
              suppressDraftWriteRef.current = true;
              if (draftUserId) void clearDraft(draftUserId, "onboarding");
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

      {draftWriteUnavailable ? (
        <div className="rounded-2xl bg-peach-100 px-3 py-2 text-xs font-bold text-ink-soft" role="status">
          Draft recovery is unavailable on this device right now. Keep this page open until your save is confirmed.
        </div>
      ) : null}

      {app?.error?.code === "stale_version" ? (
        <section ref={saveAlertRef} tabIndex={-1} role="alert" className="rounded-2xl bg-danger-100 p-4 text-danger-900">
          <p className="font-extrabold">Your saved data changed elsewhere.</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            Your form is still here. Review it against the refreshed account data,
            then explicitly reapply or discard this draft.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="flex-1" disabled={finalizing} onClick={() => void finish()}>
              Reapply draft
            </Button>
            <Button
              variant="soft"
              disabled={finalizing}
              onClick={() => {
                suppressDraftWriteRef.current = true;
                if (draftUserId) void clearDraft(draftUserId, "onboarding");
                setDraft(profileToDraft(app.snapshot.profile, app.snapshot.goal));
                setDraftWasRestored(false);
                setErrors([]);
                app.actions.clearError();
              }}
            >
              Discard
            </Button>
          </div>
        </section>
      ) : null}

      {app?.error && app.error.code !== "stale_version" ? (
        <section ref={saveAlertRef} tabIndex={-1} role="alert" className="rounded-2xl bg-danger-100 p-4 text-danger-900">
          <h2 className="font-extrabold">Your save was not confirmed</h2>
          <p className="mt-1 text-sm font-semibold text-ink-soft">{app.error.message}</p>
          <p className="mt-2 text-xs font-semibold text-muted">Your answers are still here. Check your connection, then try saving again.</p>
        </section>
      ) : null}

      {errors.length > 0 ? (
        <div ref={validationAlertRef} tabIndex={-1} role="alert" className="rounded-2xl bg-danger-100 p-4 text-danger-900">
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
        <section className="grid min-w-0 gap-4">
          <Field label="What should we call you?">
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Alex"
              className="input"
            />
          </Field>
          <BirthDatePicker value={birthday} onChange={value => set("birthday", value)} referenceDate={today}
            age={Number.isFinite(age) ? age : null} legacyAge={legacyAge} disabled={finalizing}
            error={birthdayTouched || errors.length ? birthdayError ?? undefined : undefined} />
          <fieldset disabled={finalizing} className="grid min-w-0 gap-1.5" role="radiogroup">
            <legend className="mb-1.5 text-xs font-extrabold text-ink-soft">Gender</legend>
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-2">
              {(["female", "male"] as const).map(value => (
                <label key={value} className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-2xl px-2 py-2 text-sm font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-lav-500 ${draft.sex === value ? "bg-lav-100" : "bg-lav-50 hover:bg-lav-100"} ${finalizing ? "cursor-not-allowed opacity-50" : ""}`}>
                  <input type="radio" name="onboarding-gender" value={value} checked={draft.sex === value}
                    onChange={() => set("sex", value)} className="size-4 shrink-0 accent-ink" />
                  <span className="min-w-0 wrap-anywhere">{value === "female" ? "Female" : "Male"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid min-w-0 gap-1.5">
            <legend className="mb-1.5 text-xs font-extrabold text-ink-soft">Units</legend>
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
              {(["metric", "imperial"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => changeUnits(u)}
                  aria-pressed={draft.units === u}
                  className={`min-h-12 min-w-0 wrap-anywhere rounded-2xl px-2 py-2 text-sm font-bold ${
                    draft.units === u ? "bg-ink text-white" : "bg-lav-50 text-ink"
                  }`}
                >
                  {u === "metric" ? "Metric (kg, cm)" : "Imperial (lb, in)"}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid min-w-0 gap-4">
            <MeasurementRuler label="Height" unit={draft.units === "metric" ? "cm" : "in"}
              value={draft.height} onChange={value => set("height", value)} disabled={finalizing}
              min={draft.units === "metric" ? 120 : cmToIn(120)} max={draft.units === "metric" ? 230 : cmToIn(230)}
              defaultPosition={draft.units === "metric" ? 170 : cmToIn(170)}
              position={draft.units === "metric" ? heightCm : cmToIn(heightCm)}
              tickInterval={draft.units === "metric" ? 1 : 0.2}
              error={draft.height.trim() || errors.length ? heightError : undefined} />
            <MeasurementRuler label="Weight" unit={draft.units === "metric" ? "kg" : "lb"}
              value={draft.weight} onChange={value => set("weight", value)} disabled={finalizing}
              min={draft.units === "metric" ? 35 : kgToLb(35)} max={draft.units === "metric" ? 300 : kgToLb(300)}
              defaultPosition={draft.units === "metric" ? 70 : kgToLb(70)}
              position={draft.units === "metric" ? weightKg : kgToLb(weightKg)}
              tickInterval={draft.units === "metric" ? 0.2 : 0.5}
              error={draft.weight.trim() || errors.length ? weightError : undefined} />
          </div>
          <p className="text-xs font-semibold text-muted">
            Adults 18+ only.
          </p>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="grid min-w-0 gap-4">
          <Field label="Workout program">
            <select className="input" value={draft.trainingProgram} onChange={(event) => set("trainingProgram", event.target.value as TrainingProgram)}>
              <option value="calisthenics">Calisthenics · bodyweight strength</option>
              <option value="pilates">Pilates foundations · gentle mat practice</option>
            </select>
          </Field>
          <Field label="Training experience">
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,6rem),1fr))] gap-2">
              {(["beginner", "intermediate", "advanced"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => set("experience", level)}
                  aria-pressed={draft.experience === level}
                  className={`min-h-12 min-w-0 wrap-anywhere rounded-2xl px-2 py-2 text-xs font-bold capitalize ${
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
                    className={`min-h-11 max-w-full wrap-anywhere rounded-full px-4 py-2 text-xs font-bold ${
                      active ? "bg-ink text-white" : "bg-lav-50 text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Start of week"><select className="input" aria-label="Start of week" value={draft.weekStartsOn ?? 0} onChange={event => set("weekStartsOn", Number(event.target.value) as Weekday)}>{weekdayNames.map((name, day) => <option key={name} value={day}>{name}</option>)}</select><p className="mt-1 text-xs font-semibold text-ink-soft">Used across calendars, plans, groceries, and weekly progress. Change it later in Settings.</p></Field>
          <div className="grid gap-2"><div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><label htmlFor="onboarding-step-target" className="min-w-0 wrap-anywhere text-sm font-bold">Daily step target (optional)</label><HelpPopover title="Daily step target"><p>Choose a target that suits your routine. You can change or remove it in Settings.</p><p>Use a whole number from 1 to 200,000, or leave blank for no target. This range is a technical limit, not a recommendation.</p></HelpPopover></div><input id="onboarding-step-target" className="input" inputMode="numeric" value={draft.dailyStepTarget} placeholder="Leave blank for no target" onChange={(event) => set("dailyStepTarget", event.target.value)} /></div>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3">
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
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid min-w-0 gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eating style">
              <select value={draft.dietaryPattern} onChange={(e) => set("dietaryPattern", e.target.value)} className="input">
                <option>No restrictions</option>
                <option>Vegetarian</option>
                <option>Vegan</option>
                <option>Low-carb</option>
                <option>Keto-style</option>
                <option>Vegetarian low-carb</option>
                <option>Vegan low-carb</option>
                <option>Vegetarian Keto-style</option>
                <option>Vegan Keto-style</option>
              </select>
            </Field>
            <Field label="Foods to avoid, including allergies">
              <input value={draft.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="e.g. peanuts, or none known" className="input" />
            </Field>
            <Field label="Foods you like (optional)">
              <input value={draft.foodPreferences} onChange={(e) => set("foodPreferences", e.target.value)} placeholder="e.g. tofu, berries" className="input" />
            </Field>
            <Field label="Time available to cook">
              <select value={draft.cookingTimeMinutes} onChange={(e) => set("cookingTimeMinutes", Number(e.target.value))} className="input">
                {[10, 20, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </select>
            </Field>
          </div>
          {draft.dietaryPattern.toLowerCase().includes("low-carb") || draft.dietaryPattern.includes("Keto-style") ? (
            <p className="rounded-2xl bg-peach-100 p-3 text-xs font-semibold text-ink-soft">
              {draft.dietaryPattern.toLowerCase().includes("low-carb") ? "Low-carb plans allow at most 130 g total carbs each day." : "Keto-style plans allow at most 50 g total carbs each day. This does not guarantee ketosis."} These are planning preferences, not dietary care. Unresolved slots mean the day has not been fully planned.
            </p>
          ) : null}
          <Field label="Meal cost preference">
            <select value={draft.mealBudget} onChange={(e) => set("mealBudget", e.target.value)} className="input">
              <option value="4">Budget-friendly</option>
              <option value="7">Balanced</option>
              <option value="">Flexible</option>
              {draft.mealBudget && draft.mealBudget !== "4" && draft.mealBudget !== "7" ? <option value={draft.mealBudget}>Your saved custom preference</option> : null}
            </select>
          </Field>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid min-w-0 gap-4">
          <Field label="Primary goal">
            <div className="grid gap-2">
              {GOALS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => set("goal", goal.id)}
                  aria-pressed={draft.goal === goal.id}
                  className={`min-h-12 min-w-0 wrap-anywhere rounded-2xl px-4 py-3 text-left text-sm font-bold ${
                    draft.goal === goal.id ? "bg-ink text-white" : "bg-lav-50 text-ink"
                  }`}
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </Field>
          {draft.goal === "lose" || draft.goal === "gain" ? (
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3">
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
            <label className="flex min-w-0 flex-wrap items-start gap-3 rounded-2xl bg-peach-100 p-3 text-xs font-bold">
              <input
                type="checkbox"
                checked={draft.confirmAggressive}
                onChange={(e) => set("confirmAggressive", e.target.checked)}
                className="mt-0.5 h-5 w-5"
              />
              <span className="min-w-0 flex-1 basis-48 wrap-anywhere">I understand fast change rates are not a recommendation and may be
              inappropriate for me.</span>
            </label>
          ) : null}
          <p className="text-xs font-semibold text-muted">
            This app never replaces medical or dietary care. If you are
            pregnant, recovering from an eating disorder, or managing a health
            condition, please work with a professional instead of automated
            targets.
          </p>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="grid min-w-0 gap-3">
          <h2 className="font-extrabold">Before your estimates</h2>
          <label className={`flex min-h-11 min-w-0 cursor-pointer flex-wrap items-start gap-3 rounded-2xl p-3 text-sm font-semibold ${draft.targetEligibility === "eligible" && eligibilityAnswered ? "bg-lav-50" : "bg-cream"}`}>
            <input type="checkbox" checked={eligibilityAnswered && draft.targetEligibility === "eligible"}
              onChange={event => acknowledge(event.target.checked ? "eligible" : "not_answered")}
              disabled={finalizing} className="mt-0.5 size-5 shrink-0 accent-ink" />
            <span className="min-w-0 flex-1 basis-48 wrap-anywhere">I understand these targets are estimates, not medical, dietary, or exercise care. I confirm I am 18 or older and am not pregnant or postpartum, recovering from an eating disorder, or managing a condition requiring individualized care.</span>
          </label>
          <button type="button" disabled={finalizing} onClick={() => acknowledge("unsupported")}
            aria-pressed={eligibilityAnswered && draft.targetEligibility === "unsupported"}
            className={`min-h-11 min-w-0 wrap-anywhere rounded-2xl px-3 py-2 text-left text-sm font-bold ${eligibilityAnswered && draft.targetEligibility === "unsupported" ? "bg-ink text-white" : "bg-lav-50 text-ink hover:bg-lav-100"}`}>
            These situations apply to me / I’m unsure
          </button>
          <p className="text-xs font-semibold text-ink-soft" role="status">
            {!eligibilityAnswered ? "Choose an option above before continuing. Your estimates stay hidden until you confirm eligibility. " : ""}
            {draft.targetEligibility === "unsupported" && eligibilityAnswered ? "Automated targets are off. " : ""}
            Manual food and workout logging remains available without automated targets.
          </p>
        </section>
      ) : null}

      {step === 4 && preview ? (
        <div className="grid gap-4">
          <section className={`rounded-2xl ${nutritionMetricStyles.calories.surface} p-4`}>
            <HelpHeading title="Your estimated daily food target"><p>A starting point based on your answers. You can adjust your goal later.</p></HelpHeading>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">≈{preview.calories} kcal</p>
            {preview.id === app?.snapshot.target?.id ? <p className="mt-2 text-xs font-semibold text-ink-soft">Your saved targets are unchanged. Updating your name or units does not create a new plan.</p> : null}
          </section>
          <section className="min-w-0 border-t border-ink/10 pt-5">
            <HelpHeading title="Macro targets (estimates)"><p>{HEALTH_DISCLAIMER}</p><p>Formula: Mifflin-St Jeor · activity factor {preview.activityFactor} from training days · effective {preview.effectiveDate}. Historical plans retain their original target version.</p><p>{preview.calculationAssumptions}</p><p>Energy at rest (BMR): {preview.bmr} kcal. Daily energy use (TDEE): {preview.tdee} kcal. Both are estimates.</p><p>BMI: {preview.bmi}. It compares weight with height and is information only, not a diagnosis.</p></HelpHeading>
            <div className="mt-3 grid gap-2 text-center sm:grid-cols-3">
              {[
                { label: "Protein", value: preview.proteinG, metric: "proteinG" as const },
                { label: "Carbs", value: preview.carbsG, metric: "carbsG" as const },
                { label: "Fat", value: preview.fatG, metric: "fatG" as const },
              ].map((m) => (
                <div key={m.label} className={`rounded-2xl ${nutritionMetricStyles[m.metric].surface} p-3`}>
                  <p className="text-xl font-extrabold tabular-nums">{m.value}g</p>
                  <p className="text-xs font-bold text-ink-soft">{m.label}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {step === 4 && !preview && previewError ? (
        <section role="alert" className="rounded-2xl bg-peach-100 p-4">
          <p className="font-extrabold">Automated target preview unavailable</p>
          <p className="mt-1 text-sm font-semibold text-muted">{previewError}</p>
          <p className="mt-2 text-xs font-semibold text-muted">You can still use manual workout and nutrition logging. Update the screening answer or inputs to continue.</p>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="min-w-0 border-t border-ink/10 pt-5">
          <h2 className="font-extrabold">Review your choices</h2>
          <div className="mt-3 grid gap-3">
            {[
              { label: "About you", value: `${draft.name} · ${age} years${selectedBirthDate ? ` · Birthday: ${selectedBirthDate}` : " · Birthday not set"} · ${draft.height} ${draft.units === "metric" ? "cm" : "in"} · ${draft.weight} ${draft.units === "metric" ? "kg" : "lb"}`, editStep: 0 },
              { label: "Movement", value: `${draft.trainingProgram === "pilates" ? "Pilates foundations" : "Calisthenics"} · ${draft.experience} · ${draft.daysPerWeek} days/week · ${draft.sessionMinutes} min`, editStep: 1 },
              { label: "Start of week", value: weekdayNames[draft.weekStartsOn ?? 0], editStep: 1 },
              { label: "Daily step target", value: draft.dailyStepTarget.trim() ? `${Number(draft.dailyStepTarget).toLocaleString()} steps` : "Not set", editStep: 1 },
              { label: "Food choices", value: `${draft.dietaryPattern} · ${draft.mealBudget === "4" ? "Budget-friendly" : draft.mealBudget === "7" ? "Balanced" : draft.mealBudget ? "Saved custom cost preference" : "Flexible"} · ${draft.cookingTimeMinutes} min to cook`, editStep: 2 },
              { label: "Your goal", value: GOALS.find((goal) => goal.id === draft.goal)?.label ?? draft.goal, editStep: 3 },
            ].map((choice) => (
              <div key={choice.label} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-2xl bg-cream p-3">
                <div className="min-w-0 flex-1 basis-40">
                  <h3 className="text-xs font-extrabold">{choice.label}</h3>
                  <p className="mt-1 wrap-anywhere text-sm font-semibold text-ink-soft">{choice.value}</p>
                </div>
                <Button className="min-w-0 max-w-full !px-3" variant="ghost" disabled={finalizing} onClick={() => setStep(choice.editStep)} aria-label={`Edit ${choice.label.toLowerCase()}`}>Edit</Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

    </OnboardingFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5">
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
    birthday: birthDateParts(profile.birthDate),
    sex: profile.sex,
    units: profile.units,
    height: String(Math.round(displayHeight * 10) / 10),
    weight: String(Math.round(displayWeight * 10) / 10),
    measurementBasis: {
      height: { displayValue: String(Math.round(displayHeight * 10) / 10), units: profile.units, metricValue: profile.heightCm },
      weight: { displayValue: String(Math.round(displayWeight * 10) / 10), units: profile.units, metricValue: profile.weightKg },
    },
    experience: profile.experience,
    trainingProgram: profile.trainingProgram ?? "calisthenics",
    equipment: profile.equipment,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    weekStartsOn: profile.weekStartsOn ?? 0,
    dailyStepTarget: profile.dailyStepTarget?.toString() ?? "",
    dietaryPattern: profile.dietaryPattern,
    allergies: profile.allergies.join(", "),
    foodPreferences: (profile.foodPreferences ?? []).join(", "),
    cookingTimeMinutes: profile.cookingTimeMinutes ?? 30,
    mealBudget: profile.mealBudget === undefined ? "" : String(profile.mealBudget),
    goal: profile.goal,
    targetWeight: goalWeightKg === undefined
      ? ""
      : String(Math.round((profile.units === "metric" ? goalWeightKg : kgToDisplayLb(goalWeightKg)) * 10) / 10),
    targetWeeks: goal?.targetDate
      ? String(Math.max(1, Math.round((new Date(goal.targetDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))))
      : "",
    confirmAggressive: false,
    targetEligibility: "not_answered",
  };
}

function cmToDisplayIn(cm: number): number {
  return cm / 2.54;
}

function kgToDisplayLb(kg: number): number {
  return kg * 2.2046226218;
}
