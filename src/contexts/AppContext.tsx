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
import type {
  AppSnapshot,
  GroceryItem,
  NutritionLog,
  SemanticEvent,
  Toast,
  UnitSystem,
  UserProfile,
  WorkoutSession,
} from "@/types/domain";
import { invalidSnapshotDetected, mockRepository } from "@/services/mockRepository";
import { buildDemoSnapshot } from "@/services/demo";
import { buildDailyTarget } from "@/utility/health";
import { generateWorkoutPlan } from "@/utility/plan";
import { generateMealPlan } from "@/utility/mealPlan";
import { generateGroceryList, mergeGroceryLists } from "@/utility/grocery";
import { FOODS } from "@/constants/foods";
import { SAVED_MEALS } from "@/constants/meals";
import { startOfWeek, todayKey } from "@/utility/dates";

const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

export interface AppActions {
  notify(message: string, tone?: Toast["tone"]): void;
  completeOnboarding(profile: UserProfile): void;
  updateUnits(units: UnitSystem): void;
  startSession(workoutId: string): string;
  saveSession(session: WorkoutSession): void;
  finishSession(sessionId: string): void;
  abandonSession(sessionId: string): void;
  logNutrition(input: Omit<NutritionLog, "id" | "createdAt">): void;
  deleteNutrition(id: string): void;
  logWeight(weightKg: number, date: string): void;
  toggleGrocery(id: string): void;
  setGroceryQuantity(id: string, quantity: number): void;
  removeGroceryItem(id: string): void;
  addCustomGrocery(name: string, quantity: number, unit: string): void;
  regenerateGrocery(): void;
  skipPlannedMeal(id: string): void;
  resetPlan(): void;
  eraseAll(): void;
  loadDemo(): void;
}

interface AppContextValue {
  hydrated: boolean;
  snapshot: AppSnapshot;
  actions: AppActions;
  toasts: Toast[];
  events: SemanticEvent[];
  storageUnavailable: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Seed with the deterministic demo snapshot so static prerendering and the
  // first client render agree; a stored browser snapshot replaces it on mount.
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() =>
    buildDemoSnapshot(new Date().toISOString().slice(0, 10)),
  );
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [events, setEvents] = useState<SemanticEvent[]>([]);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const toastSeq = useRef(0);
  const storageWarningShown = useRef(false);
  const preserveInvalidStorage = useRef(false);

  const notify = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    toastSeq.current += 1;
    setToasts((t) => [...t, { id: toastSeq.current, message, tone }]);
  }, []);

  useEffect(() => {
    const stored = mockRepository.load();
    if (stored) {
      // Browser storage is external state hydrated after the first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnapshot(stored);
    } else {
      preserveInvalidStorage.current = invalidSnapshotDetected;
      if (invalidSnapshotDetected) {
        notify("Stored demo data could not be read; it was kept for recovery.", "warn");
      }
      // Rebase the demo to the browser's local calendar date after hydration.
      // This avoids a UTC-server/local-browser date mismatch on the first paint.
      setSnapshot(buildDemoSnapshot());
    }
    setHydrated(true);
  }, [notify]);

  // Persist after the authoritative (demo repository) state changes.
  useEffect(() => {
    if (!hydrated || preserveInvalidStorage.current) return;
    const saved = mockRepository.save(snapshot);
    // Storage availability is external state synchronized after persistence.
    setStorageUnavailable(!saved);
    if (!saved && !storageWarningShown.current) {
      storageWarningShown.current = true;
      notify("Browser storage is unavailable; changes are not recoverable after refresh.", "warn");
    }
    if (saved) storageWarningShown.current = false;
  }, [hydrated, notify, snapshot]);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((t) => t.slice(1)), 3200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const emit = useCallback((event: SemanticEvent) => {
    setEvents((e) => [...e.slice(-19), event]);
  }, []);

  const update = useCallback((fn: (s: AppSnapshot) => AppSnapshot) => {
    preserveInvalidStorage.current = false;
    setSnapshot((current) => (current ? fn(current) : current));
  }, []);

  const rebuildForProfile = useCallback(
    (s: AppSnapshot, profile: UserProfile): AppSnapshot => {
      const today = todayKey();
      const targetBase = buildDailyTarget(profile, today);
      const target = {
        ...targetBase,
        version: (s.target?.version ?? 0) + 1,
      };
      const planBase = generateWorkoutPlan(profile, target.id, today);
      const plan = { ...planBase, version: (s.plan?.version ?? 0) + 1 };
      const mealPlanBase = generateMealPlan(target.id, startOfWeek(today), profile);
      const mealPlan = {
        ...mealPlanBase,
        version: (s.mealPlan?.version ?? 0) + 1,
      };
      const generated = generateGroceryList(mealPlan, SAVED_MEALS, FOODS, mealPlan.weekOf);
      const grocery = s.grocery ? mergeGroceryLists(s.grocery, generated) : generated;
      return { ...s, profile, target, plan, mealPlan, grocery, onboarded: true };
    },
    [],
  );

  const actions = useMemo<AppActions>(
    () => ({
      notify,

      completeOnboarding(profile) {
        update((s) => rebuildForProfile(s, profile));
        emit({ type: "target-updated", targetId: "target" });
        notify("Profile updated in demo mode — your week is ready.");
      },

      updateUnits(units) {
        update((s) => (s.profile ? { ...s, profile: { ...s.profile, units } } : s));
        notify("Units updated.");
      },

      startSession(workoutId) {
        const existing = snapshot.sessions.find(
          (session) =>
            session.status === "in_progress" && session.plannedWorkoutId === workoutId,
        );
        if (existing) return existing.id;
        const id = newId("ws");
        update((s) => ({
          ...s,
          sessions: [
            ...s.sessions,
            {
              id,
              plannedWorkoutId: workoutId,
              plannedPlanVersion: snapshot.plan?.version,
              date: todayKey(),
              startedAt: new Date().toISOString(),
              status: "in_progress",
              logs: [],
            },
          ],
        }));
        return id;
      },

      saveSession(session) {
        const valid = session.logs.every((log) => {
          const values = [log.actual.sets, log.actual.reps ?? 1, log.actual.holdSeconds ?? 1];
          return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
        });
        if (!valid) {
          notify("Workout values must be between 0 and 100.", "warn");
          return;
        }
        update((s) => ({
          ...s,
          sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
        }));
      },

      finishSession(sessionId) {
        const session = snapshot.sessions.find((x) => x.id === sessionId);
        const workout = snapshot.plan?.workouts.find(
          (x) => x.id === session?.plannedWorkoutId,
        );
        const complete = workout?.exercises.every((planned) => {
          const log = session?.logs.find((x) => x.exerciseId === planned.exerciseId);
          return Boolean(log && log.status === "completed" && log.actual.sets > 0 && !log.pain);
        });
        update((s) => {
          return {
            ...s,
            sessions: s.sessions.map((x) =>
              x.id === sessionId
                ? {
                    ...x,
                    status: complete ? "completed" : "partial",
                    finishedAt: new Date().toISOString(),
                  }
                : x,
            ),
          };
        });
        emit({ type: complete ? "workout-completed" : "workout-partially-logged", sessionId });
        notify(
          complete
            ? "Workout completed — nicely done."
            : "Partial workout saved — progression will wait for a safe full session.",
          complete ? "ok" : "info",
        );
      },

      abandonSession(sessionId) {
        update((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== sessionId) }));
        notify("Session discarded.", "info");
      },

      logNutrition(input) {
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
        const entry: NutritionLog = { ...input, id: newId("nl"), createdAt: new Date().toISOString() };
        update((s) => ({ ...s, nutritionLogs: [...s.nutritionLogs, entry] }));
        emit({ type: "nutrition-entry-saved", entryId: entry.id });
        notify("Meal added in demo mode.");
      },

      deleteNutrition(id) {
        update((s) => ({ ...s, nutritionLogs: s.nutritionLogs.filter((l) => l.id !== id) }));
        notify("Entry removed.", "info");
      },

      logWeight(weightKg, date) {
        if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 300) {
          notify("Weight must be between 35 and 300 kg.", "warn");
          return;
        }
        const entry = { id: newId("we"), date, weightKg };
        update((s) => ({ ...s, weights: [...s.weights, entry] }));
        emit({ type: "weight-entry-added", entryId: entry.id });
        notify("Weight added in demo mode.");
      },

      toggleGrocery(id) {
        update((s) =>
          s.grocery
            ? {
                ...s,
                grocery: {
                  ...s.grocery,
                  items: s.grocery.items.map((i) =>
                    i.id === id ? { ...i, checked: !i.checked } : i,
                  ),
                },
              }
            : s,
        );
      },

      setGroceryQuantity(id, quantity) {
        update((s) =>
          s.grocery
            ? {
                ...s,
                grocery: {
                  ...s.grocery,
                  items: s.grocery.items.map((i) => (i.id === id ? { ...i, quantity } : i)),
                },
              }
            : s,
        );
      },

      removeGroceryItem(id) {
        update((s) =>
          s.grocery
            ? {
                ...s,
                grocery: {
                  ...s.grocery,
                  items: s.grocery.items.map((i) =>
                    i.id === id ? { ...i, removed: true } : i,
                  ),
                },
              }
            : s,
        );
        notify("Item removed.", "info");
      },

      addCustomGrocery(name, quantity, unit) {
        update((s) => {
          if (!s.grocery) return s;
          const item: GroceryItem = {
            id: newId("gi-custom"),
            name,
            category: "Other",
            unit,
            generatedQuantity: quantity,
            quantity,
            checked: false,
            custom: true,
          };
          return { ...s, grocery: { ...s.grocery, items: [...s.grocery.items, item] } };
        });
        emit({ type: "grocery-list-updated", listId: "grocery" });
        notify("Item added.");
      },

      regenerateGrocery() {
        update((s) => {
          if (!s.mealPlan || !s.grocery) return s;
          const generated = generateGroceryList(s.mealPlan, SAVED_MEALS, FOODS, s.mealPlan.weekOf);
          return { ...s, grocery: mergeGroceryLists(s.grocery, generated) };
        });
        emit({ type: "grocery-list-updated", listId: "grocery" });
        notify("List regenerated — your checks and edits were kept.");
      },

      skipPlannedMeal(id) {
        update((s) => {
          if (!s.mealPlan || !s.grocery) return s;
          const mealPlan = {
            ...s.mealPlan,
            meals: s.mealPlan.meals.map((m) => (m.id === id ? { ...m, skipped: !m.skipped } : m)),
          };
          const generated = generateGroceryList(mealPlan, SAVED_MEALS, FOODS, mealPlan.weekOf);
          return {
            ...s,
            mealPlan: {
              ...mealPlan,
              version: s.mealPlan.version + 1,
              id: `${mealPlan.id}-v${s.mealPlan.version + 1}`,
            },
            grocery: mergeGroceryLists(s.grocery, generated),
          };
        });
        notify("Meal plan updated.");
      },

      resetPlan() {
        update((s) => {
          if (!s.profile) return s;
          return rebuildForProfile(s, s.profile);
        });
        emit({ type: "plan-generated", planId: "plan" });
        notify("Plan regenerated — history was kept.");
      },

      eraseAll() {
        const cleared = mockRepository.clear();
        preserveInvalidStorage.current = false;
        const fresh: AppSnapshot = {
          schemaVersion: 1,
          userId: "demo-user",
          onboarded: false,
          profile: null,
          target: null,
          plan: null,
          mealPlan: null,
          sessions: [],
          nutritionLogs: [],
          weights: [],
          grocery: null,
          savedMeals: SAVED_MEALS,
        };
        setSnapshot(fresh);
        emit({ type: "data-erased" });
        notify(
          cleared ? "Demo data cleared." : "Demo data cleared in memory; browser storage could not be cleared.",
          cleared ? "info" : "warn",
        );
      },

      loadDemo() {
        preserveInvalidStorage.current = false;
        setSnapshot(buildDemoSnapshot());
        notify("Demo data loaded.");
      },
    }),
    [emit, notify, rebuildForProfile, snapshot, update],
  );

  const value = useMemo<AppContextValue | null>(() => {
    if (!snapshot) return null;
    return { hydrated, snapshot, actions, toasts, events, storageUnavailable };
  }, [snapshot, hydrated, actions, toasts, events, storageUnavailable]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Full app state; throws while the snapshot is loading. */
export function useApp(): AppContextValue & { hydrated: true } {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("App snapshot is still loading");
  return ctx as AppContextValue & { hydrated: true };
}

/** Shell-safe access that tolerates the loading state. */
export function useAppOptional(): AppContextValue | null {
  return useContext(AppContext);
}
