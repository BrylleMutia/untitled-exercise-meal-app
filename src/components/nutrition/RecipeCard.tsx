"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { ChartNoAxesColumnIncreasing, ChartPie, Clock, Flame, Heart, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { RecipeCover } from "./RecipeCover";
import type { RecipeComplexity, RecipeImage } from "@/types/domain";
import type { RecipeCardMetadata } from "@/types/backend";
import { complexityLabels, recipeBadge } from "@/utility/recipeCard";

// Option 1: Cali's pastel banner introduces a recipe; the footer owns meal actions.
export function RecipeCard({ name, image, planned = false, context, calories, recipeServings, totalTimeMinutes, complexity,
  metadata, favoriteAvailable = false, favoritePending = false, onFavorite, onOpen, children, actions }: {
  name: string; image?: RecipeImage | null; planned?: boolean; context?: string;
  calories?: number; recipeServings?: number; totalTimeMinutes?: number; complexity?: RecipeComplexity;
  metadata?: RecipeCardMetadata; favoriteAvailable?: boolean; favoritePending?: boolean;
  onFavorite?: () => void; onOpen?: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode; actions: ReactNode;
}) {
  const badge = recipeBadge(metadata);
  const hasRecipe = recipeServings !== undefined;
  const banner = <><RecipeCover image={image} name={name} banner />
    {badge ? <span className="absolute right-[12px] top-[12px] inline-flex max-w-[calc(100%-24px)] items-center gap-[6px] rounded-full bg-white/90 px-[8px] py-1.5 text-xs font-extrabold text-ink">
      {badge === "Popular" ? <Flame className="h-[14px] w-[14px] shrink-0" aria-hidden /> : <Heart className="h-[14px] w-[14px] shrink-0 fill-current" aria-hidden />}<span className="min-w-0 [overflow-wrap:anywhere]">{badge}</span>
    </span> : null}</>;
  const bannerClass = `relative block h-36 w-full overflow-hidden rounded-2xl sm:h-40 ${planned ? "bg-blush-100" : "bg-lav-100"}`;
  return <Card className="recipe-card flex h-full min-w-0 flex-col !p-[12px] sm:!p-[16px]">
    {onOpen ? <button type="button" className={bannerClass} onClick={onOpen} aria-label={`View recipe image: ${name}`}>{banner}</button> : <div className={bannerClass}>{banner}</div>}
    <div className="flex items-start justify-between gap-2 pt-3">
      {onOpen ? <button type="button" className="min-h-11 min-w-0 flex-1 rounded-xl text-left text-lg font-extrabold leading-snug [overflow-wrap:anywhere]" aria-label={`View recipe: ${name}`} onClick={onOpen}>{name}</button>
        : <h4 className="min-w-0 flex-1 py-2 text-lg font-extrabold leading-snug [overflow-wrap:anywhere]">{name}</h4>}
      {onFavorite ? <button type="button" aria-pressed={metadata?.favorite ?? false} aria-label={`${metadata?.favorite ? "Remove from" : "Add to"} favorites: ${name}`}
        disabled={!favoriteAvailable || favoritePending} onClick={onFavorite}
        title={!favoriteAvailable ? "Load favorites before changing them" : undefined}
        className={`recipe-heart grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full disabled:opacity-50 ${metadata?.favorite ? "bg-blush-50 text-ink" : "bg-cream text-ink-soft"}`}>
        {favoritePending ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <span key={String(metadata?.favorite)} className={metadata?.favorite ? "recipe-heart-saved" : ""}><Heart className={`h-5 w-5 ${metadata?.favorite ? "fill-coral-200 text-ink" : ""}`} aria-hidden /></span>}
      </button> : null}
    </div>
    {context ? <p className="mb-1 text-xs font-semibold text-ink-soft">{context}</p> : null}
    <div className="flex flex-wrap gap-1.5 py-3 text-xs font-bold text-ink [overflow-wrap:anywhere]" role="group" aria-label="Recipe details">
      <span className="min-w-0 max-w-full rounded-full bg-coral-200 px-[12px] py-2 tabular-nums" role="img" aria-label={calories === undefined ? "Calories unavailable" : `Approximately ${Math.round(calories)} calories per serving`}>{calories === undefined ? "Calories unavailable" : `≈${Math.round(calories)} kcal`}</span>
      {hasRecipe ? <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-mint-100 px-[12px] py-2 tabular-nums" role="img" aria-label={`Recipe yields ${recipeServings} ${recipeServings === 1 ? "serving" : "servings"}`}><ChartPie className="h-3.5 w-3.5 shrink-0" aria-hidden /><span>{recipeServings}</span></span> : null}
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-lav-100 px-[12px] py-2" role="img" aria-label={totalTimeMinutes === undefined ? "Recipe time not set" : `Total recipe time: ${totalTimeMinutes} minutes`}><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="min-w-0">{totalTimeMinutes === undefined ? "Not set" : `${totalTimeMinutes} mins total`}</span></span>
      {hasRecipe ? <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-peach-100 px-[12px] py-2" role="img" aria-label={`Recipe complexity: ${complexityLabels[complexity ?? "medium"]}`}><ChartNoAxesColumnIncreasing className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="min-w-0">{complexityLabels[complexity ?? "medium"]}</span></span> : null}
    </div>
    {children ? <div className="grid min-w-0 gap-3 pb-3">{children}</div> : null}
    <div className="mt-auto grid min-w-0 gap-2 border-t border-ink/10 pt-3 [&_button]:min-w-0 [&_button]:[overflow-wrap:anywhere]">{actions}</div>
  </Card>;
}
