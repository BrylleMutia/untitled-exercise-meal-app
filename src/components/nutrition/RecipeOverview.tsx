"use client";

import { mealSlotLabels, parseMealSlots } from "@/utility/recipeMealSlots";
import { useState, type RefObject } from "react";
import { Clock, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { NutritionPills } from "@/components/ui/NutritionPills";
import { RecipeCover } from "./RecipeCover";
import { RecipeTabs, type RecipeTab } from "./RecipeTabs";
import { mealNutrition } from "@/utility/nutrition";
import { complexityLabels } from "@/utility/recipeCard";
import { safeRecipeReference } from "@/utility/recipeEditor";
import { formatCookingMeasurement } from "@/utility/cookingMeasurement";
import type { Food, Meal } from "@/types/domain";

export function RecipeOverview({ meal, foods, returnFocus, onClose, onEdit, editLabel = "Edit" }: {
  meal: Meal; foods: Food[]; returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void; onEdit: () => void; editLabel?: string;
}) {
  const [tab, setTab] = useState<RecipeTab>("details");
  const known = meal.ingredients.length > 0 && meal.ingredients.every(item => foods.some(food => food.id === item.foodId));
  const reference = safeRecipeReference(meal.reference);
  const nutrition = <div className="grid min-w-0 gap-2 rounded-2xl bg-lav-50 p-3">
    <h3 className="text-sm font-extrabold">Per serving · {meal.providedNutrition ? "source-provided macros" : "estimates"}</h3>
    {known ? <NutritionPills values={mealNutrition(meal, foods).perServing} precision={1} approximate label="Recipe nutrition per serving" />
      : <p className="text-sm text-ink-soft">Nutrition is unavailable because an ingredient is missing.</p>}
  </div>;
  return <Modal open title="Recipe overview" returnFocus={returnFocus} onClose={onClose}
    help={<HelpPopover title="Saved recipe"><p>Ingredient quantities describe the whole recipe. Nutrition is estimated per serving. Editing this recipe does not rewrite logged meals.</p></HelpPopover>}
    footer={<div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="soft" onClick={onClose}>Close</Button>
        <Button onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden />{editLabel}</Button>
      </div>
    </div>}>
    <div className="grid min-w-0 gap-5">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center gap-3 rounded-2xl bg-lav-50 px-3 py-4 text-center">
        <RecipeCover image={meal.image} name={meal.name} />
        <h3 className="max-w-full break-words text-2xl font-extrabold leading-tight">{meal.name}</h3>
      </div>
      <RecipeTabs active={tab} onChange={setTab} panels={{
        ingredients: <div className="grid min-w-0 gap-4">
          <h3 className="text-sm font-extrabold">For the whole recipe</h3>
          <ul className="grid min-w-0 gap-2">{meal.ingredients.map((item, index) => {
            const food = foods.find(food => food.id === item.foodId);
            return <li key={`${item.foodId}-${index}`} className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-2xl bg-cream p-3">
              <div className="min-w-0 flex-[1_1_10rem]"><p className="break-words text-sm font-bold">{item.cookingMeasurement?.name ?? food?.name ?? "Ingredient unavailable"}{item.cookingMeasurement?.optional ? " (optional)" : ""}</p>
                {item.cookingMeasurement?.note ? <p className="break-words text-xs text-ink-soft">{item.cookingMeasurement.note}</p> : null}</div>
              <p className="max-w-full break-words text-sm font-bold tabular-nums">{formatCookingMeasurement(item, food)}</p>
            </li>;
          })}{meal.unmeasuredIngredients?.map((item, index) => <li key={`unmeasured-${index}`} className="flex min-w-0 flex-wrap justify-between gap-2 rounded-2xl bg-cream p-3"><span className="break-words text-sm font-bold">{item.name}{item.optional ? " (optional)" : ""}</span><span className="text-sm font-bold">{item.measurement}</span></li>)}</ul>{!meal.ingredients.length && !meal.unmeasuredIngredients?.length ? <p className="text-sm text-ink-soft">No ingredients added.</p> : null}
        </div>,
        details: <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft" aria-label="Recipe metadata">
            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden />{meal.servings} {meal.servings === 1 ? "serving" : "servings"}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden />{meal.totalTimeMinutes !== undefined ? `${meal.totalTimeMinutes} mins` : "Not set"}</span>
            <span>Complexity: {complexityLabels[meal.complexity ?? "medium"]}</span>
          </div>
          <p className="text-sm text-ink-soft"><span className="font-bold">Use this recipe for: </span>{parseMealSlots(meal.mealSlots).map(slot => mealSlotLabels[slot]).join(", ") || "Not assigned — edit to include in weekly generation."}</p>{nutrition}
          <p className="text-sm text-ink-soft">{meal.ingredients.length + (meal.unmeasuredIngredients?.length ?? 0)} ingredients · {meal.isSystem ? "Catalog recipe" : "Your saved recipe"}</p>
          <section className="grid min-w-0 gap-2" aria-label="Nutrition basis"><h3 className="text-sm font-extrabold">Nutrition basis</h3>
            {meal.nutritionNotes ? <p className="whitespace-pre-wrap break-words text-xs text-ink-soft">{meal.nutritionNotes}</p> : null}
            <ul className="grid gap-2">{meal.ingredients.map((item, index) => { const food = foods.find(food => food.id === item.foodId); return <li key={index} className="break-words text-xs text-ink-soft">{item.cookingMeasurement?.name ?? food?.name ?? "Ingredient unavailable"}: {food ? `${formatCookingMeasurement({ ...item, cookingMeasurement: undefined }, food)} · ${food.preparationBasis ?? "basis unknown"} · ${food.source}` : "Nutrition source unavailable."}{item.cookingMeasurement?.kind === "range" ? " · upper range amount used" : ""}</li>; })}</ul>
            {meal.unmeasuredIngredients?.length ? <p className="text-xs text-ink-soft">Unmeasured seasonings are excluded from nutrition and generated grocery quantities.</p> : null}
          </section>
          <div className="grid gap-1"><h3 className="text-sm font-extrabold">Reference</h3>{reference ? <a href={reference} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-ink-soft underline">{meal.reference}</a> : <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{meal.reference || "Reference not added."}</p>}</div>
        </div>,
        instructions: <div className="grid gap-2"><h3 className="text-lg font-extrabold">Instructions</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">{meal.notes || "Instructions not added. This recipe can still be logged."}</p></div>,
      }} />
    </div>
  </Modal>;
}
