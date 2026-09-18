"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DayStrip } from "@/components/DayStrip";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { FOODS, foodById } from "@/constants/foods";
import { parseMealText, type ParsedCandidate } from "@/utility/textMeal";
import { dayStatus, entriesForDate, totalsForDate, foodMacros, mealNutrition } from "@/utility/nutrition";
import { todayKey } from "@/utility/dates";
import type { Confidence, Food, Meal, MealSlot, PlannedMeal, RecipeIngredient } from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const slotLabels: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const confidenceClasses: Record<Confidence, string> = {
  high: "bg-mint-100 text-ink",
  medium: "bg-peach-100 text-ink",
  low: "bg-coral-100 text-ink",
};

type Mode = "search" | "custom" | "text";

export default function NutritionPage() {
  const { snapshot, actions } = useApp();
  const [selected, setSelected] = useState(todayKey());
  const [openSlot, setOpenSlot] = useState<MealSlot | null>(null);
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [editingPlannedMealId, setEditingPlannedMealId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [showNewRecipe, setShowNewRecipe] = useState(false);

  const isToday = selected === todayKey();
  const totals = totalsForDate(snapshot.nutritionLogs, selected);
  const entries = entriesForDate(snapshot.nutritionLogs, selected);
  const status = dayStatus(snapshot.nutritionLogs, selected);
  const target = snapshot.target;

  const todaysPlan = useMemo(
    () => snapshot.mealPlan?.meals.filter((m) => m.date === selected) ?? [],
    [snapshot.mealPlan, selected],
  );

  async function savePlannedMeal(nextMeal: PlannedMeal) {
    if (!snapshot.mealPlan) return false;
    const meals = snapshot.mealPlan.meals.some((meal) => meal.id === nextMeal.id)
      ? snapshot.mealPlan.meals.map((meal) => meal.id === nextMeal.id ? nextMeal : meal)
      : [...snapshot.mealPlan.meals, nextMeal];
    const saved = await actions.editMealPlan({ ...snapshot.mealPlan, meals });
    if (saved) setEditingPlannedMealId(null);
    return saved;
  }

  return (
    <div className="grid min-w-0 gap-4 pb-4">
      <Card tone="blush">
        <DayStrip selected={selected} onSelect={setSelected} />
        <div className="mt-4 flex items-center justify-between">
          <div>
            <h2 className="font-extrabold">
              {isToday ? "Today" : selected}
            </h2>
            <p className="text-xs font-bold text-ink-soft">
              {status === "complete"
                ? "Fully logged"
                : status === "partial"
                  ? "Partially logged — missing slots are not zero"
                  : "Unlogged day — no entries, that is fine"}
            </p>
          </div>
          <span className="text-sm font-extrabold tabular-nums">
            {Math.round(totals.calories)} / {target?.calories ?? 0} kcal
          </span>
        </div>
        <div className="mt-3 grid gap-2.5">
          <ProgressBar label="Protein" value={totals.proteinG} target={target?.proteinG ?? 0} unit=" g" barClassName="bg-lav-300" />
          <ProgressBar label="Carbs" value={totals.carbsG} target={target?.carbsG ?? 0} unit=" g" barClassName="bg-peach-200" />
          <ProgressBar label="Fat" value={totals.fatG} target={target?.fatG ?? 0} unit=" g" barClassName="bg-mint-200" />
        </div>
      </Card>

      {/* Planned meals for the day */}
      {snapshot.mealPlan ? (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-extrabold">Planned for this day</h2>
            <Button
              variant="soft"
              className="!min-h-11 !px-3 text-xs"
              onClick={() => setEditingPlannedMealId("new")}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add meal
            </Button>
          </div>
          {todaysPlan.length > 0 ? (
            <ul className="mt-2 grid gap-1.5">
              {todaysPlan.map((pm) => (
              <li
                key={pm.id}
                className={`grid gap-2 rounded-xl bg-cream px-3 py-2 text-sm font-semibold sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                  pm.skipped ? "opacity-50" : ""
                }`}
              >
                <span className="min-w-20 font-bold text-ink-soft">{slotLabels[pm.slot]}</span>
                <span className={pm.skipped ? "line-through" : ""}>{pm.label} ×{pm.servings}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingPlannedMealId(pm.id)}
                    className="min-h-11 rounded-full px-3 text-xs font-extrabold text-ink underline underline-offset-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.skipPlannedMeal(pm.id)}
                    className="min-h-11 rounded-full px-3 text-xs font-extrabold text-muted underline underline-offset-2"
                  >
                    {pm.skipped ? "plan again" : "skip"}
                  </button>
                </div>
              </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-xl bg-cream px-3 py-3 text-sm font-semibold text-muted">
              No meal is planned for this day yet. Add one to the future plan.
            </p>
          )}
          {editingPlannedMealId ? (
            <PlannedMealEditor
              key={editingPlannedMealId}
              plannedMeal={editingPlannedMealId === "new" ? undefined : todaysPlan.find((meal) => meal.id === editingPlannedMealId)}
              date={selected}
              savedMeals={snapshot.savedMeals}
              onSave={savePlannedMeal}
              onCancel={() => setEditingPlannedMealId(null)}
            />
          ) : null}
          <p className="mt-2 text-[11px] font-semibold text-muted">
            Skipping only changes the future plan snapshot — logged history is
            untouched.
          </p>
        </Card>
      ) : null}

      {/* Log entries by slot */}
      <div className="grid gap-3">
        {SLOTS.map((slot) => {
          const list = entries[slot];
          const open = openSlot === slot;
          return (
            <Card key={slot} className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold">{slotLabels[slot]}</h3>
                <Button
                  variant="soft"
                  className="!min-h-11 !px-3 text-xs"
                  onClick={() => {
                    setOpenSlot(open ? null : slot);
                    setMode("search");
                    setQuery("");
                  }}
                  aria-expanded={open}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add
                </Button>
              </div>

              {list.length > 0 ? (
                <ul className="mt-2 grid gap-1.5">
                  {list.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {entry.foodId ? foodById(entry.foodId)?.name : entry.customName}
                          <span className="ml-1 font-semibold text-muted">
                            ×{entry.servings}
                          </span>
                        </p>
                        <p className="text-[11px] font-semibold text-muted">
                          {Math.round(entry.calories)} kcal · P {Math.round(entry.proteinG)} · C{" "}
                          {Math.round(entry.carbsG)} · F {Math.round(entry.fatG)} ·{" "}
                          <span className={`rounded-full px-1.5 py-0.5 ${confidenceClasses[entry.confidence]}`}>
                            {entry.estimated ? `estimate (${entry.confidence})` : "your entry"}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => actions.deleteNutrition(entry.id)}
                        aria-label={`Delete ${entry.foodId ? foodById(entry.foodId)?.name : entry.customName}`}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {open ? (
                <EntryEditor
                  slot={slot}
                  mode={mode}
                  query={query}
                  onMode={setMode}
                  onQuery={setQuery}
                  onDone={() => setOpenSlot(null)}
                />
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* Saved meals */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold">Saved meals</h2>
            <p className="text-xs font-semibold text-muted">
              Create, reuse, or adjust recipes without changing logged history.
            </p>
          </div>
          <Button
            variant="soft"
            className="!min-h-11 !px-3 text-xs"
            onClick={() => { setShowNewRecipe(true); setEditingRecipeId(null); }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Create
          </Button>
        </div>
        {showNewRecipe || editingRecipeId ? (
          <RecipeEditor
            key={editingRecipeId ?? "new"}
            meal={editingRecipeId ? snapshot.savedMeals.find((meal) => meal.id === editingRecipeId) : undefined}
            onSave={async (meal) => {
              const saved = await actions.saveMeal(meal);
              if (saved) { setShowNewRecipe(false); setEditingRecipeId(null); }
              return saved;
            }}
            onCancel={() => { setShowNewRecipe(false); setEditingRecipeId(null); }}
          />
        ) : null}
        <ul className="mt-3 grid gap-1.5">
          {snapshot.savedMeals.map((meal) => (
            <li key={meal.id} className="grid gap-2 rounded-xl bg-cream px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-sm font-bold">{meal.name}</p>
                <p className="text-[11px] font-semibold text-muted">
                  {meal.ingredients.length} ingredients · {meal.servings}{" "}
                  {meal.servings === 1 ? "serving" : "servings"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {!meal.isSystem ? (
                  <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={() => setEditingRecipeId(meal.id)}>
                    Edit
                  </Button>
                ) : null}
                <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={() => void actions.duplicateMeal(meal.id)}>
                  Duplicate
                </Button>
                <Button
                  variant="soft"
                  className="!min-h-11 !px-3 text-xs"
                  onClick={() => void logMeal(actions, meal.ingredients, selected, "snack", meal.name)}
                >
                  Log it
                </Button>
                {!meal.isSystem ? (
                  <Button
                    variant="ghost"
                    className="!min-h-11 !px-3 text-xs text-coral-300"
                    onClick={() => void actions.archiveMeal(meal.id)}
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );

  function EntryEditor({
    slot,
    mode,
    query,
    onMode,
    onQuery,
    onDone,
  }: {
    slot: MealSlot;
    mode: Mode;
    query: string;
    onMode: (m: Mode) => void;
    onQuery: (q: string) => void;
    onDone: () => void;
  }) {
    return (
      <div className="mt-3 rounded-2xl bg-cream p-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Entry type">
          {(["search", "custom", "text"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => onMode(m)}
              className={`min-h-11 rounded-full px-3 text-xs font-extrabold ${
                mode === m ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              {m === "search" ? "Search" : m === "custom" ? "Custom" : "Text → review"}
            </button>
          ))}
        </div>

        {mode === "search" ? (
          <SearchPicker
            slot={slot}
            query={query}
            onQuery={onQuery}
            onDone={onDone}
          />
        ) : null}
        {mode === "custom" ? <CustomForm slot={slot} onDone={onDone} /> : null}
        {mode === "text" ? <TextParser slot={slot} onDone={onDone} /> : null}
      </div>
    );
  }

  function SearchPicker({
    slot,
    query,
    onQuery,
    onDone,
  }: {
    slot: MealSlot;
    query: string;
    onQuery: (q: string) => void;
    onDone: () => void;
  }) {
    const results = FOODS.filter((f) =>
      f.name.toLowerCase().includes(query.toLowerCase()),
    ).slice(0, 6);
    return (
      <div className="mt-3">
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search foods (egg, rice, tofu…)"
          className="input"
          aria-label="Search the food catalog"
        />
        <ul className="mt-2 grid gap-1">
          {results.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={async () => {
                  if (await addFood(actions, slot, selected, food, 1)) onDone();
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold"
              >
                <span>
                  {food.name}
                  <span className="block text-[11px] font-semibold text-muted">
                    {food.servingLabel} · {food.calories} kcal
                  </span>
                </span>
                <Plus className="h-4 w-4 text-muted" aria-hidden />
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-muted">
              No match — add it under <strong>Custom</strong> or describe it in
              <strong> Text</strong>.
            </li>
          ) : null}
        </ul>
      </div>
    );
  }

  function CustomForm({ slot, onDone }: { slot: MealSlot; onDone: () => void }) {
    const [name, setName] = useState("");
    const [calories, setCalories] = useState("");
    const [protein, setProtein] = useState("");
    const [carbs, setCarbs] = useState("");
    const [fat, setFat] = useState("");
    const [assumption, setAssumption] = useState("");
    const [restored, setRestored] = useState(false);
    const [draftWasRestored, setDraftWasRestored] = useState(false);
    const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
    const draftType = `nutrition-custom:${selected}:${slot}`;
    const userId = snapshot.userId;
    const profileRevision = snapshot.profile?.revision;
    useEffect(() => {
      if (!userId) return;
      let active = true;
      void readDraft<{ name: string; calories: string; protein: string; carbs: string; fat: string; assumption: string }>(userId, draftType).then((saved) => {
        if (!active) return;
        if (saved) {
          setName(saved.payload.name);
          setCalories(saved.payload.calories);
          setProtein(saved.payload.protein);
          setCarbs(saved.payload.carbs);
          setFat(saved.payload.fat);
          setAssumption(saved.payload.assumption);
          setDraftWasRestored(true);
        }
        setRestored(true);
      });
      return () => { active = false; };
    }, [draftType, userId]);
    useEffect(() => {
      if (!restored || !userId) return;
      void writeDraft(createDraftEnvelope({
        userId,
        draftType,
        payload: { name, calories, protein, carbs, fat, assumption },
        baseVersions: { profileRevision },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
    }, [assumption, calories, carbs, draftType, fat, name, profileRevision, protein, restored, userId]);
    const numericFields = [calories, protein, carbs, fat];
    const validNumbers = numericFields.every(
      (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0),
    );
    const valid = Boolean(
      name.trim() &&
        numericFields.every((value) => value !== "") &&
        validNumbers,
    );
    return (
      <div className="mt-3 grid gap-2">
        {draftWasRestored ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
            <span>Draft restored from this device.</span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              onClick={() => {
                if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
                setDraftWasRestored(false);
                onDone();
              }}
            >
              Discard draft
            </button>
          </div>
        ) : null}
        {draftWriteUnavailable ? (
          <p className="rounded-xl bg-peach-100 px-3 py-2 text-[11px] font-bold text-ink-soft" role="status">
            Draft recovery is unavailable on this device right now. Keep this form open until the entry is confirmed.
          </p>
        ) : null}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Food name"
          className="input"
          aria-label="Custom food name"
        />
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "kcal", value: calories, set: setCalories },
            { label: "P g", value: protein, set: setProtein },
            { label: "C g", value: carbs, set: setCarbs },
            { label: "F g", value: fat, set: setFat },
          ].map((field) => (
            <input
              key={field.label}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder={field.label}
              aria-label={field.label}
              inputMode="decimal"
              className="input !min-h-11 text-sm"
            />
          ))}
        </div>
        <input
          value={assumption}
          onChange={(e) => setAssumption(e.target.value)}
          placeholder="Assumption (e.g. restaurant portion estimate)"
          className="input"
          aria-label="Assumption note"
        />
        <Button
          disabled={!valid}
          onClick={async () => {
            const saved = await actions.logNutrition({
              date: selected,
              slot,
              customName: name.trim(),
              servings: 1,
              calories: Number(calories) || 0,
              proteinG: Number(protein) || 0,
              carbsG: Number(carbs) || 0,
              fatG: Number(fat) || 0,
              estimated: false,
              confidence: "high",
              source: "User-provided",
             assumptions: assumption || undefined,
            });
            if (saved) {
              if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
              onDone();
            }
          }}
        >
          Save entry
        </Button>
        {!validNumbers ? (
          <p className="text-[11px] font-bold text-coral-300">
            Nutrition values must be finite, non-negative numbers.
          </p>
        ) : null}
        <p className="text-[11px] font-semibold text-muted">
          Enter all four nutrition values. Custom entries are marked as your
          values — distinct from catalog estimates.
        </p>
      </div>
    );
  }

  function TextParser({ slot, onDone }: { slot: MealSlot; onDone: () => void }) {
    const [text, setText] = useState("");
    const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
    const [restored, setRestored] = useState(false);
    const [draftWasRestored, setDraftWasRestored] = useState(false);
    const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
    const draftType = `nutrition-text:${selected}:${slot}`;
    const userId = snapshot.userId;
    const profileRevision = snapshot.profile?.revision;
    useEffect(() => {
      if (!userId) return;
      let active = true;
      void readDraft<{ text: string; candidates: ParsedCandidate[] }>(userId, draftType).then((saved) => {
        if (!active) return;
        if (saved) {
          setText(saved.payload.text);
          setCandidates(saved.payload.candidates);
          setDraftWasRestored(true);
        }
        setRestored(true);
      });
      return () => { active = false; };
    }, [draftType, userId]);
    useEffect(() => {
      if (!restored || !userId) return;
      void writeDraft(createDraftEnvelope({
        userId,
        draftType,
        payload: { text, candidates },
        baseVersions: { profileRevision },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
    }, [candidates, draftType, profileRevision, restored, text, userId]);

    const review = () => {
      setCandidates(parseMealText(text, FOODS));
    };

    return (
      <div className="mt-3 grid gap-2">
        {draftWasRestored ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
            <span>Text draft restored from this device.</span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              onClick={() => {
                if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
                setDraftWasRestored(false);
                onDone();
              }}
            >
              Discard draft
            </button>
          </div>
        ) : null}
        {draftWriteUnavailable ? (
          <p className="rounded-xl bg-peach-100 px-3 py-2 text-[11px] font-bold text-ink-soft" role="status">
            Draft recovery is unavailable on this device right now. Keep this form open until the entry is confirmed.
          </p>
        ) : null}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Two eggs, two slices of whole wheat toast with butter, and a banana"
          className="input"
          aria-label="Describe the meal in plain text"
        />
        <Button variant="soft" onClick={review} disabled={!text.trim()}>
          <Sparkles className="h-4 w-4" aria-hidden /> Review estimate
        </Button>
        {candidates.length > 0 ? (
          <ul className="grid gap-1.5">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="rounded-xl bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      {candidate.matched?.name ?? candidate.name} ×{candidate.quantity}
                    </p>
                    <p className="text-[11px] font-semibold text-muted">
                      {candidate.matched
                        ? `${Math.round(candidate.matched.calories * candidate.quantity)} kcal · ${candidate.matched.servingLabel}`
                        : "no catalog match"}
                    </p>
                    {candidate.assumptions.length > 0 ? (
                      <p className="mt-0.5 flex items-start gap-1 text-[11px] font-semibold text-muted">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        {candidate.assumptions.join(" ")}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${confidenceClasses[candidate.confidence]}`}
                  >
                    {candidate.confidence}
                  </span>
                </div>
                {candidate.matched ? (
                  <Button
                    variant="ghost"
                    className="!min-h-11 !px-3 text-xs"
                    onClick={async () => {
                      if (await addFood(actions, slot, selected, candidate.matched!, candidate.quantity)) {
                        if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
                        onDone();
                      }
                    }}
                  >
                    <Check className="h-4 w-4" aria-hidden /> Confirm & save
                  </Button>
                ) : (
                  <p className="mt-1 text-[11px] font-bold text-coral-300">
                    Correct or add a custom entry — this gets no false precision.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[11px] font-semibold text-muted">
          Temporary parser — production runs this on a protected Edge Function with
          schema-validated JSON. Calculations always use the food catalog, never
          model numbers.
        </p>
      </div>
    );
  }
}

function clientId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function PlannedMealEditor({
  plannedMeal,
  date,
  savedMeals,
  onSave,
  onCancel,
}: {
  plannedMeal?: PlannedMeal;
  date: string;
  savedMeals: Meal[];
  onSave: (meal: PlannedMeal) => Promise<boolean>;
  onCancel: () => void;
}) {
  const availableMeals = savedMeals.filter((meal) => !meal.archivedAt);
  const initialReference = plannedMeal?.mealId
    ? `meal:${plannedMeal.mealId}`
    : plannedMeal?.foodId
      ? `food:${plannedMeal.foodId}`
      : availableMeals[0]
        ? `meal:${availableMeals[0].id}`
        : `food:${FOODS[0]?.id ?? ""}`;
  const [reference, setReference] = useState(initialReference);
  const [slot, setSlot] = useState<MealSlot>(plannedMeal?.slot ?? "snack");
  const [servings, setServings] = useState(String(plannedMeal?.servings ?? 1));
  const [saving, setSaving] = useState(false);
  const selectedMeal = reference.startsWith("meal:")
    ? availableMeals.find((meal) => meal.id === reference.slice(5))
    : undefined;
  const selectedFood = reference.startsWith("food:")
    ? foodById(reference.slice(5))
    : undefined;
  const amount = Number(servings);

  async function submit() {
    if (!Number.isFinite(amount) || amount <= 0 || (!selectedMeal && !selectedFood)) return;
    const next: PlannedMeal = {
      id: plannedMeal?.id ?? clientId("pm"),
      date,
      slot,
      label: selectedMeal?.name ?? selectedFood?.name ?? "Choose a meal that fits",
      servings: amount,
      ...(plannedMeal?.skipped ? { skipped: true } : {}),
      ...(selectedMeal ? { mealId: selectedMeal.id } : { foodId: selectedFood!.id }),
      ...(selectedMeal
        ? (() => {
            const nutrition = mealNutrition(selectedMeal, FOODS).perServing;
            return {
              expectedCalories: Math.round(nutrition.calories * amount),
              expectedProteinG: Math.round(nutrition.proteinG * amount * 10) / 10,
              expectedCarbsG: Math.round(nutrition.carbsG * amount * 10) / 10,
              expectedFatG: Math.round(nutrition.fatG * amount * 10) / 10,
              source: "saved-meal",
              sourceVersion: "user-editable",
              assumptions: "Estimated from the saved recipe and catalog serving sizes.",
              confidence: "medium" as const,
              preparationBasis: "as_labeled" as const,
            };
          })()
        : {
            expectedCalories: Math.round(selectedFood!.calories * amount),
            expectedProteinG: Math.round(selectedFood!.proteinG * amount * 10) / 10,
            expectedCarbsG: Math.round(selectedFood!.carbsG * amount * 10) / 10,
            expectedFatG: Math.round(selectedFood!.fatG * amount * 10) / 10,
            ...(selectedFood!.fiberG === undefined ? {} : { expectedFiberG: Math.round(selectedFood!.fiberG * amount * 10) / 10 }),
            source: selectedFood!.source,
            sourceVersion: selectedFood!.sourceVersion,
            assumptions: "Estimated from the catalog serving size.",
            confidence: selectedFood!.confidence,
            preparationBasis: "as_labeled" as const,
          }),
    };
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 rounded-2xl bg-lav-50 p-3" role="group" aria-label="Planned meal editor">
      <p className="text-xs font-extrabold">Edit future meal</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select className="input" value={reference} onChange={(event) => setReference(event.target.value)} aria-label="Planned meal choice">
          <optgroup label="Saved meals">
            {availableMeals.map((meal) => <option key={`meal:${meal.id}`} value={`meal:${meal.id}`}>{meal.name}</option>)}
          </optgroup>
          <optgroup label="Catalog foods">
            {FOODS.map((food) => <option key={`food:${food.id}`} value={`food:${food.id}`}>{food.name}</option>)}
          </optgroup>
        </select>
        <select className="input" value={slot} onChange={(event) => setSlot(event.target.value as MealSlot)} aria-label="Planned meal slot">
          {SLOTS.map((candidate) => <option key={candidate} value={candidate}>{slotLabels[candidate]}</option>)}
        </select>
        <input className="input" type="number" min="0.25" step="0.25" value={servings} onChange={(event) => setServings(event.target.value)} aria-label="Planned meal servings" />
      </div>
      <p className="text-[11px] font-semibold text-muted">This creates a new future plan version. Logged nutrition history is unchanged.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={onCancel}>Cancel</Button>
        <Button className="!min-h-11 !px-3 text-xs" disabled={saving || !Number.isFinite(amount) || amount <= 0 || (!selectedMeal && !selectedFood)} onClick={() => void submit()}>
          {saving ? "Saving…" : "Save meal"}
        </Button>
      </div>
    </div>
  );
}

type IngredientDraft = { foodId: string; servings: string };

function RecipeEditor({
  meal,
  onSave,
  onCancel,
}: {
  meal?: Meal;
  onSave: (meal: Meal) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? "");
  const [servings, setServings] = useState(String(meal?.servings ?? 1));
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    () => meal?.ingredients.map((ingredient) => ({ foodId: ingredient.foodId, servings: String(ingredient.servings) }))
      ?? [{ foodId: FOODS[0]?.id ?? "", servings: "1" }],
  );
  const [saving, setSaving] = useState(false);
  const recipeServings = Number(servings);
  const validIngredients = ingredients.length > 0 && ingredients.every((ingredient) => {
    const quantity = Number(ingredient.servings);
    return Boolean(foodById(ingredient.foodId)) && Number.isFinite(quantity) && quantity > 0;
  });

  async function submit() {
    if (!name.trim() || !Number.isFinite(recipeServings) || recipeServings <= 0 || !validIngredients) return;
    const next: Meal = {
      id: meal?.id ?? clientId("meal"),
      name: name.trim(),
      servings: recipeServings,
      ...(meal?.notes ? { notes: meal.notes } : {}),
      ...(meal?.revision === undefined ? {} : { revision: meal.revision }),
      ingredients: ingredients.map((ingredient): RecipeIngredient => ({ foodId: ingredient.foodId, servings: Number(ingredient.servings) })),
    };
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 rounded-2xl bg-lav-50 p-3" role="group" aria-label={meal ? "Edit saved meal" : "Create saved meal"}>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Recipe name" aria-label="Recipe name" />
        <input className="input" type="number" min="0.25" step="0.25" value={servings} onChange={(event) => setServings(event.target.value)} aria-label="Recipe servings" />
      </div>
      <div className="grid gap-2">
        {ingredients.map((ingredient, index) => (
          <div key={`${index}-${ingredient.foodId}`} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <select className="input" value={ingredient.foodId} onChange={(event) => setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, foodId: event.target.value } : item))} aria-label={`Ingredient ${index + 1}`}>
              {FOODS.map((food) => <option key={food.id} value={food.id}>{food.name} · {food.servingLabel}</option>)}
            </select>
            <input className="input" type="number" min="0.25" step="0.25" value={ingredient.servings} onChange={(event) => setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, servings: event.target.value } : item))} aria-label={`Ingredient ${index + 1} quantity`} />
            <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={ingredients.length <= 1} onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="soft" className="!min-h-11 !px-3 text-xs" onClick={() => setIngredients((current) => [...current, { foodId: FOODS[0]?.id ?? "", servings: "1" }])}><Plus className="h-4 w-4" aria-hidden /> Ingredient</Button>
        <div className="flex gap-2">
          <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={onCancel}>Cancel</Button>
          <Button className="!min-h-11 !px-3 text-xs" disabled={saving || !name.trim() || !Number.isFinite(recipeServings) || recipeServings <= 0 || !validIngredients} onClick={() => void submit()}>{saving ? "Saving…" : "Save recipe"}</Button>
        </div>
      </div>
      <p className="text-[11px] font-semibold text-muted">Nutrition is calculated from the trusted catalog. Editing a recipe does not rewrite existing logs.</p>
    </div>
  );
}

async function addFood(
  actions: ReturnType<typeof useApp>["actions"],
  slot: MealSlot,
  date: string,
  food: Food,
  servings: number,
) {
  const macros = foodMacros(food, servings);
  return actions.logNutrition({
    date,
    slot,
    foodId: food.id,
    servings,
    calories: macros.calories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * servings * 10) / 10 }),
    estimated: food.estimated,
    confidence: food.confidence,
    source: `${food.source} ${food.sourceVersion}`,
    sourceVersion: food.sourceVersion,
    preparationBasis: "as_labeled" as const,
  });
}

async function logMeal(
  actions: ReturnType<typeof useApp>["actions"],
  ingredients: { foodId: string; servings: number }[],
  date: string,
  slot: MealSlot,
  mealName: string,
) {
  const entries = [];
  for (const ing of ingredients) {
    const food = FOODS.find((f) => f.id === ing.foodId);
    if (!food) continue;
    const macros = foodMacros(food, ing.servings);
    entries.push({
      date,
      slot,
      foodId: food.id,
      servings: ing.servings,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * ing.servings * 10) / 10 }),
      estimated: food.estimated,
      confidence: food.confidence,
      source: `${food.source} ${food.sourceVersion}`,
      sourceVersion: food.sourceVersion,
      preparationBasis: "as_labeled" as const,
    });
  }
  await actions.logSavedMeal(date, slot, entries);
  void mealName;
}
