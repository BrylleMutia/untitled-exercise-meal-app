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
import { createClient } from "@/lib/supabase/client";
import { createSupabaseRepository } from "@/services/supabaseRepository";
import type {
  AddCustomGroceryInput,
  MutationOutcome,
  RepositoryError,
} from "@/types/backend";
import type {
  AppSnapshot,
  NutritionLog,
  SemanticEvent,
  Toast,
  UnitSystem,
  UserProfile,
  WorkoutSession,
} from "@/types/domain";
import type { SnapshotRepository } from "@/services/repository";

export interface AppActions {
  notify(message: string, tone?: Toast["tone"]): void;
  completeOnboarding(profile: UserProfile): Promise<boolean>;
  updateUnits(units: UnitSystem): Promise<void>;
  startSession(workoutId: string): Promise<string>;
  saveSession(session: WorkoutSession): Promise<void>;
  finishSession(sessionId: string): Promise<boolean>;
  abandonSession(sessionId: string): Promise<boolean>;
  logNutrition(input: Omit<NutritionLog, "id" | "createdAt">): Promise<void>;
  deleteNutrition(id: string): Promise<void>;
  logWeight(weightKg: number, date: string): Promise<void>;
  toggleGrocery(id: string): Promise<void>;
  setGroceryQuantity(id: string, quantity: number): Promise<void>;
  removeGroceryItem(id: string): Promise<void>;
  addCustomGrocery(name: string, quantity: number, unit: string): Promise<void>;
  regenerateGrocery(): Promise<void>;
  skipPlannedMeal(id: string): Promise<void>;
  resetPlan(): Promise<void>;
}

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
    target: null,
    plan: null,
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

export function AppProvider({
  children,
  initialSnapshot = null,
}: {
  children: ReactNode;
  initialSnapshot?: AppSnapshot | null;
}) {
  const repository = useMemo<SnapshotRepository | null>(() => {
    try {
      return createSupabaseRepository(createClient());
    } catch {
      return null;
    }
  }, []);
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
      operation: (current: AppSnapshot) => Promise<MutationOutcome>,
    ): Promise<MutationOutcome | null> => {
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
      setError(null);
      try {
        const outcome = await operation(snapshot);
        setSnapshot(outcome.snapshot);
        setEvents((current) => appendEvents(current, outcome));
        return outcome;
      } catch (reason: unknown) {
        const nextError = errorFromUnknown(reason);
        setError(nextError);
        notify(nextError.message, nextError.retryable ? "warn" : "info");
        return null;
      } finally {
        setPendingMutation(null);
      }
    },
    [notify, repository, snapshot],
  );

  const actions = useMemo<AppActions>(
    () => ({
      notify,

      async completeOnboarding(profile) {
        const outcome = await execute("complete_onboarding", (current) =>
          repository!.completeOnboarding({ profile, currentSnapshot: current }),
        );
        return Boolean(outcome);
      },

      async updateUnits(units) {
        await execute("update_units", (current) =>
          repository!.updateUnits({ units, currentSnapshot: current }),
        );
      },

      async startSession(workoutId) {
        const outcome = await execute("start_workout_session", (current) =>
          repository!.startSession({ workoutId, currentSnapshot: current }),
        );
        return outcome?.resultRefs?.session_id ?? "";
      },

      async saveSession(session) {
        await execute("save_workout_session", (current) =>
          repository!.saveSession({ session, currentSnapshot: current }),
        );
      },

      async finishSession(sessionId) {
        const session = snapshot.sessions.find((candidate) => candidate.id === sessionId);
        if (!session) return false;
        const outcome = await execute("finish_workout_session", (current) =>
          repository!.finishSession({ session, currentSnapshot: current }),
        );
        return Boolean(outcome);
      },

      async abandonSession(sessionId) {
        const outcome = await execute("abandon_workout_session", (current) =>
          repository!.abandonSession({ sessionId, currentSnapshot: current }),
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
        ];
        if (numericValues.some((value) => !Number.isFinite(value) || value <= 0)) {
          notify("Use positive numbers for servings and nutrition values.", "warn");
          return;
        }
        await execute("save_nutrition_log", () => repository!.saveNutrition({ entry: input }));
      },

      async deleteNutrition(id) {
        await execute("delete_nutrition_log", () =>
          repository!.deleteNutrition({ id }),
        );
      },

      async logWeight(weightKg, date) {
        if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 300) {
          notify("Weight must be between 35 and 300 kg.", "warn");
          return;
        }
        await execute("save_weight_entry", () =>
          repository!.saveWeight({ weightKg, date }),
        );
      },

      async toggleGrocery(id) {
        await execute("toggle_grocery_item", (current) =>
          repository!.updateGrocery({ type: "toggle", itemId: id }, current),
        );
      },

      async setGroceryQuantity(id, quantity) {
        if (!Number.isFinite(quantity) || quantity < 0) {
          notify("Quantity must be a non-negative number.", "warn");
          return;
        }
        await execute("set_grocery_quantity", (current) =>
          repository!.updateGrocery({ type: "quantity", itemId: id, quantity }, current),
        );
      },

      async removeGroceryItem(id) {
        await execute("remove_grocery_item", (current) =>
          repository!.updateGrocery({ type: "remove", itemId: id }, current),
        );
      },

      async addCustomGrocery(name, quantity, unit) {
        const item: AddCustomGroceryInput = {
          name,
          quantity,
          unit,
          currentSnapshot: snapshot,
        };
        await execute("add_custom_grocery_item", () =>
          repository!.addCustomGrocery(item),
        );
      },

      async regenerateGrocery() {
        await execute("regenerate_grocery", (current) =>
          repository!.regenerateGrocery({ currentSnapshot: current }),
        );
      },

      async skipPlannedMeal(id) {
        await execute("skip_planned_meal", (current) =>
          repository!.skipPlannedMeal({ id, currentSnapshot: current }),
        );
      },

      async resetPlan() {
        await execute("reset_plan", (current) =>
          repository!.resetPlan({ currentSnapshot: current }),
        );
      },
    }),
    [execute, notify, repository, snapshot],
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
