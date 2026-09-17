"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseRepository } from "@/services/supabaseRepository";
import type {
  DraftEnvelope,
  MutationOutcome,
  RepositoryError,
  WorkoutPlanOverrideInput,
} from "@/types/backend";
import type {
  AppSnapshot,
  Meal,
  NutritionLog,
  SemanticEvent,
  Toast,
  UnitSystem,
  UserProfile,
  WorkoutSession,
} from "@/types/domain";
import type { SnapshotRepository } from "@/services/repository";
import { clearDraft, clearUserDrafts, readDraft } from "@/services/draftStore";

export interface AppActions {
  notify(message: string, tone?: Toast["tone"]): void;
  clearError(): void;
  restoreDraft<T>(draftType: string): Promise<DraftEnvelope<T> | null>;
  discardDraft(draftType: string): Promise<void>;
  completeOnboarding(profile: UserProfile, goal?: OnboardingGoal): Promise<boolean>;
  updateProfile(profile: UserProfile, goal?: OnboardingGoal): Promise<boolean>;
  updateUnits(units: UnitSystem): Promise<void>;
  startSession(workoutId: string): Promise<string>;
  saveSession(session: WorkoutSession): Promise<void>;
  finishSession(sessionId: string): Promise<boolean>;
  abandonSession(sessionId: string): Promise<boolean>;
  logNutrition(input: Omit<NutritionLog, "id" | "createdAt">): Promise<boolean>;
  logSavedMeal(
    date: string,
    slot: NutritionLog["slot"],
    entries: Array<Omit<NutritionLog, "id" | "createdAt">>,
  ): Promise<void>;
  deleteNutrition(id: string): Promise<void>;
  logWeight(weightKg: number, date: string): Promise<void>;
  toggleGrocery(id: string): Promise<void>;
  setGroceryQuantity(id: string, quantity: number): Promise<void>;
  removeGroceryItem(id: string): Promise<void>;
  addCustomGrocery(name: string, quantity: number, unit: string): Promise<boolean>;
  regenerateGrocery(): Promise<void>;
  skipPlannedMeal(id: string): Promise<void>;
  resetPlan(): Promise<void>;
  applyWorkoutOverride(input: Omit<WorkoutPlanOverrideInput, "currentSnapshot">): Promise<void>;
  saveMeal(meal: Meal): Promise<void>;
  exportData(): Promise<unknown | null>;
  deleteAccount(): Promise<boolean>;
  retryLast(): Promise<boolean>;
}

type OnboardingGoal = {
  targetWeightKg?: number;
  desiredRateKgPerWeek?: number;
  targetDate?: string;
  weeklyWorkoutTarget?: number;
  skillTargets?: Record<string, number>;
};

interface AppContextValue {
  hydrated: boolean;
  pendingMutation: string | null;
  error: RepositoryError | null;
  snapshot: AppSnapshot;
  actions: AppActions;
  toasts: Toast[];
  events: SemanticEvent[];
}

const AppContext = createContext<AppContextValue | null>(null);

function createEmptySnapshot(userId = ""): AppSnapshot {
  return {
    schemaVersion: 1,
    userId,
    onboarded: false,
    profile: null,
    goal: null,
    target: null,
    plan: null,
    workoutOverrides: [],
    mealPlan: null,
    sessions: [],
    nutritionLogs: [],
    weights: [],
    grocery: null,
    savedMeals: [],
  };
}

function errorFromUnknown(value: unknown): RepositoryError {
  if (value && typeof value === "object" && "repositoryError" in value) {
    const candidate = (value as { repositoryError?: RepositoryError }).repositoryError;
    if (candidate) return candidate;
  }
  return {
    code: "retryable",
    message: value instanceof Error ? value.message : "The request could not be completed.",
    retryable: true,
  };
}

function appendEvents(current: SemanticEvent[], outcome: MutationOutcome) {
  return [...current, ...outcome.events].slice(-20);
}

type MutationOperation = (
  current: AppSnapshot,
  idempotencyKey: string,
) => Promise<MutationOutcome>;

type RetryIntent =
  | { kind: "mutation"; label: string; operation: MutationOperation; mutationKey: string }
  | { kind: "export"; mutationKey: string };

export function AppProvider({
  children,
  initialSnapshot = null,
}: {
  children: ReactNode;
  initialSnapshot?: AppSnapshot | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);
  const repository = useMemo<SnapshotRepository | null>(() => {
    return supabase ? createSupabaseRepository(supabase) : null;
  }, [supabase]);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(
    () => initialSnapshot ?? createEmptySnapshot(),
  );
  const [hydrated, setHydrated] = useState(
    () => Boolean(initialSnapshot) || !repository,
  );
  const [pendingMutation, setPendingMutation] = useState<string | null>(null);
  const [error, setError] = useState<RepositoryError | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [events, setEvents] = useState<SemanticEvent[]>([]);
  const toastSequence = useRef(0);
  const retryRef = useRef<RetryIntent | null>(null);
  const snapshotRef = useRef(snapshot);
  const pendingRef = useRef(false);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const notify = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    toastSequence.current += 1;
    setToasts((toasts) => [
      ...toasts,
      { id: toastSequence.current, message, tone },
    ]);
  }, []);

  useEffect(() => {
    if (initialSnapshot || !repository) {
      return;
    }

    let active = true;
    void repository
      .load()
      .then((loaded) => {
        if (!active) return;
        setSnapshot(loaded ?? createEmptySnapshot());
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const nextError = errorFromUnknown(reason);
        setError(nextError);
        notify("Your saved data could not be loaded. Retry from this screen.", "warn");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [initialSnapshot, notify, repository]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(1)), 3200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const execute = useCallback(
    async (
      label: string,
      operation: MutationOperation,
      fixedKey?: string,
    ): Promise<MutationOutcome | null> => {
      if (pendingRef.current) {
        notify("Please wait for the current save to finish.", "info");
        return null;
      }
      if (!repository) {
        const nextError: RepositoryError = {
          code: "not_authenticated",
          message: "Supabase is not configured for durable data.",
          retryable: false,
        };
        setError(nextError);
        notify(nextError.message, "warn");
        return null;
      }

      setPendingMutation(label);
      pendingRef.current = true;
      setError(null);
      const mutationKey = fixedKey ?? (
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      try {
        const outcome = await operation(snapshotRef.current, mutationKey);
        retryRef.current = null;
        setSnapshot(outcome.snapshot);
        setEvents((current) => appendEvents(current, outcome));
        return outcome;
      } catch (reason: unknown) {
        let nextError = errorFromUnknown(reason);
        if (nextError.code === "not_authenticated" && supabase) {
          let refreshFailed = false;
          let refreshedUserId: string | undefined;
          const expectedUserId = snapshotRef.current.userId || undefined;
          try {
            const refreshed = await supabase.auth.refreshSession();
            if (refreshed.error) {
              refreshFailed = true;
            }
            refreshedUserId = refreshed.data.session?.user.id;
          } catch {
            refreshFailed = true;
          }
          if (!refreshFailed && refreshedUserId && expectedUserId && refreshedUserId === expectedUserId) {
            try {
              const replayed = await operation(snapshotRef.current, mutationKey);
              retryRef.current = null;
              setSnapshot(replayed.snapshot);
              setEvents((current) => appendEvents(current, replayed));
              notify("Your session was refreshed and the save was retried.", "ok");
              return replayed;
            } catch (replayReason: unknown) {
              nextError = errorFromUnknown(replayReason);
              if (nextError.code === "not_authenticated") refreshFailed = true;
            }
          }
          if (refreshFailed || !refreshedUserId || !expectedUserId || refreshedUserId !== expectedUserId) {
            const returnPath = typeof window === "undefined"
              ? "/"
              : `${window.location.pathname}${window.location.search}`;
            if (typeof window !== "undefined") {
              router.replace(`/auth/sign-in?next=${encodeURIComponent(returnPath)}`);
              return null;
            }
          }
        }
        if (nextError.code === "stale_version") {
          try {
            const refreshedSnapshot = await repository.load();
            if (refreshedSnapshot) setSnapshot(refreshedSnapshot);
            notify("Your saved data changed elsewhere. Review your draft and apply it again.", "warn");
          } catch {
            // The original draft remains in the form/draft repository for a later retry.
          }
        }
        retryRef.current = { kind: "mutation", label, operation, mutationKey };
        setError(nextError);
        notify(nextError.message, nextError.retryable ? "warn" : "info");
        return null;
      } finally {
        pendingRef.current = false;
        setPendingMutation(null);
      }
    },
    [notify, repository, router, supabase],
  );

  const actions = useMemo<AppActions>(
    () => ({
      notify,
      clearError() {
        setError(null);
      },
      async restoreDraft<T>(draftType: string) {
        const userId = snapshotRef.current.userId;
        return userId ? readDraft<T>(userId, draftType) : null;
      },
      async discardDraft(draftType: string) {
        const userId = snapshotRef.current.userId;
        if (userId) await clearDraft(userId, draftType);
      },

      async completeOnboarding(profile, goal) {
        const outcome = await execute("complete_onboarding", (current, idempotencyKey) =>
          repository!.completeOnboarding({ profile, goal, currentSnapshot: current, idempotencyKey }),
        );
        return Boolean(outcome);
      },

      async updateProfile(profile, goal) {
        const outcome = await execute("update_profile", (current, idempotencyKey) =>
          repository!.updateProfile({ profile, goal, currentSnapshot: current, idempotencyKey }),
        );
        return Boolean(outcome);
      },

      async updateUnits(units) {
        await execute("update_units", (current, idempotencyKey) =>
          repository!.updateUnits({ units, currentSnapshot: current, idempotencyKey }),
        );
      },

      async startSession(workoutId) {
        const outcome = await execute("start_workout_session", (current, idempotencyKey) =>
          repository!.startSession({ workoutId, currentSnapshot: current, idempotencyKey }),
        );
        return outcome?.resultRefs?.session_id ?? "";
      },

      async saveSession(session) {
        await execute("save_workout_session", (current, idempotencyKey) =>
          repository!.saveSession({ session, currentSnapshot: current, idempotencyKey }),
        );
      },

      async finishSession(sessionId) {
        const session = snapshotRef.current.sessions.find((candidate) => candidate.id === sessionId);
        if (!session) return false;
        const outcome = await execute("finish_workout_session", (current, idempotencyKey) =>
          repository!.finishSession({ session, currentSnapshot: current, idempotencyKey }),
        );
        return Boolean(outcome);
      },

      async abandonSession(sessionId) {
        const outcome = await execute("abandon_workout_session", (current, idempotencyKey) =>
          repository!.abandonSession({ sessionId, currentSnapshot: current, idempotencyKey }),
        );
        return Boolean(outcome);
      },

      async logNutrition(input) {
        const numericValues = [
          input.servings,
          input.calories,
          input.proteinG,
          input.carbsG,
          input.fatG,
          ...(input.fiberG === undefined ? [] : [input.fiberG]),
        ];
        if (!Number.isFinite(input.servings) || input.servings <= 0 || numericValues.slice(1).some((value) => !Number.isFinite(value) || value < 0)) {
          notify("Servings must be positive; nutrition values may be zero or higher.", "warn");
          return false;
        }
        const outcome = await execute("save_nutrition_log", (_current, idempotencyKey) => repository!.saveNutrition({ entry: input, idempotencyKey }));
        return Boolean(outcome);
      },

      async logSavedMeal(date, slot, entries) {
        if (entries.length === 0) {
          notify("This meal has no ingredients to log.", "info");
          return;
        }
        if (entries.some((entry) => !Number.isFinite(entry.servings) || entry.servings <= 0 || [entry.calories, entry.proteinG, entry.carbsG, entry.fatG, ...(entry.fiberG === undefined ? [] : [entry.fiberG])].some((value) => !Number.isFinite(value) || value < 0))) {
          notify("This saved meal has invalid nutrition values.", "warn");
          return;
        }
        await execute("log_saved_meal", (_current, idempotencyKey) => repository!.saveSavedMealLog({ date, slot, entries, idempotencyKey }));
      },

      async deleteNutrition(id) {
        await execute("delete_nutrition_log", (current, idempotencyKey) =>
          repository!.deleteNutrition({
            id,
            expectedVersions: {
              recordRevision: current.nutritionLogs.find((entry) => entry.id === id)?.revision,
            },
            idempotencyKey,
          }),
        );
      },

      async logWeight(weightKg, date) {
        if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 300) {
          notify("Weight must be between 35 and 300 kg.", "warn");
          return;
        }
        await execute("save_weight_entry", (_current, idempotencyKey) =>
          repository!.saveWeight({ weightKg, date, idempotencyKey }),
        );
      },

      async toggleGrocery(id) {
        await execute("toggle_grocery_item", (current, idempotencyKey) =>
          repository!.updateGrocery({ type: "toggle", itemId: id, idempotencyKey }, current),
        );
      },

      async setGroceryQuantity(id, quantity) {
        if (!Number.isFinite(quantity) || quantity < 0) {
          notify("Quantity must be a non-negative number.", "warn");
          return;
        }
        await execute("set_grocery_quantity", (current, idempotencyKey) =>
          repository!.updateGrocery({ type: "quantity", itemId: id, quantity, idempotencyKey }, current),
        );
      },

      async removeGroceryItem(id) {
        await execute("remove_grocery_item", (current, idempotencyKey) =>
          repository!.updateGrocery({ type: "remove", itemId: id, idempotencyKey }, current),
        );
      },

      async addCustomGrocery(name, quantity, unit) {
        const outcome = await execute("add_custom_grocery_item", (current, idempotencyKey) =>
          repository!.addCustomGrocery({ name, quantity, unit, currentSnapshot: current, idempotencyKey }),
        );
        return Boolean(outcome);
      },

      async regenerateGrocery() {
        await execute("regenerate_grocery", (current, idempotencyKey) =>
          repository!.regenerateGrocery({ currentSnapshot: current, idempotencyKey }),
        );
      },

      async skipPlannedMeal(id) {
        await execute("skip_planned_meal", (current, idempotencyKey) =>
          repository!.skipPlannedMeal({ id, currentSnapshot: current, idempotencyKey }),
        );
      },

      async resetPlan() {
        await execute("reset_plan", (current, idempotencyKey) =>
          repository!.resetPlan({ currentSnapshot: current, idempotencyKey }),
        );
      },

      async applyWorkoutOverride(input) {
        await execute("apply_workout_override", (current, idempotencyKey) =>
          repository!.applyWorkoutOverride({ ...input, currentSnapshot: current, idempotencyKey }),
        );
      },

      async saveMeal(meal) {
        await execute("save_saved_meal", (current, idempotencyKey) => repository!.saveMeal({
          meal,
          expectedVersions: {
            profileRevision: current.profile?.revision,
            recordRevision: meal.revision,
          },
          idempotencyKey,
        }));
      },

      async exportData() {
        if (pendingRef.current) {
          notify("Please wait for the current save to finish.", "info");
          return null;
        }
        if (!repository) {
          notify("Supabase is not configured for durable data.", "warn");
          return null;
        }
        setPendingMutation("export_account_data");
        pendingRef.current = true;
        setError(null);
        const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          const outcome = await repository.exportData({ idempotencyKey });
          retryRef.current = null;
          setEvents((current) => [...current, ...outcome.events].slice(-20));
          return outcome.data;
        } catch (reason: unknown) {
          const nextError = errorFromUnknown(reason);
          retryRef.current = { kind: "export", mutationKey: idempotencyKey };
          setError(nextError);
          notify(nextError.message, "warn");
          return null;
        } finally {
          pendingRef.current = false;
          setPendingMutation(null);
        }
      },

      async deleteAccount() {
        const outcome = await execute("delete_account", (_current, idempotencyKey) =>
          repository!.deleteAccount({ confirmation: "DELETE", idempotencyKey }),
        );
        if (outcome) {
          const deletedUserId = snapshotRef.current.userId;
          await clearUserDrafts(deletedUserId);
          try { await supabase?.auth.signOut(); } catch { /* server deletion already completed */ }
        }
        return Boolean(outcome);
      },

      async retryLast() {
        const retry = retryRef.current;
        if (!retry) return false;
        if (retry.kind === "mutation") {
          return Boolean(await execute(retry.label, retry.operation, retry.mutationKey));
        }
        if (pendingRef.current || !repository) return false;
        setPendingMutation("export_account_data");
        pendingRef.current = true;
        setError(null);
        try {
          const outcome = await repository.exportData({ idempotencyKey: retry.mutationKey });
          retryRef.current = null;
          setEvents((current) => [...current, ...outcome.events].slice(-20));
          return true;
        } catch (reason: unknown) {
          const nextError = errorFromUnknown(reason);
          setError(nextError);
          notify(nextError.message, "warn");
          return false;
        } finally {
          pendingRef.current = false;
          setPendingMutation(null);
        }
      },
    }),
    [execute, notify, repository, supabase],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      pendingMutation,
      error,
      snapshot,
      actions,
      toasts,
      events,
    }),
    [actions, error, events, hydrated, pendingMutation, snapshot, toasts],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("App context is unavailable");
  return ctx;
}

export function useAppOptional(): AppContextValue | null {
  return useContext(AppContext);
}
