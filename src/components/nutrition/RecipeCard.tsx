"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { Flame, Heart, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { RecipeCover } from "./RecipeCover";
import { RecipeResourcePills } from "./RecipeResourcePills";
import type { RecipeComplexity, RecipeImage } from "@/types/domain";
import type { RecipeCardMetadata } from "@/types/backend";
import { recipeBadge } from "@/utility/recipeCard";

export function RecipeCard({ name, image, planned = false, context, calories, recipeServings, totalTimeMinutes, complexity,
  metadata, favoriteAvailable = false, favoritePending = false, onFavorite, onOpen, children, actions, imageActions, mobileCompactResources = false }: {
  name: string; image?: RecipeImage | null; planned?: boolean; context?: string;
  calories?: number; recipeServings?: number; totalTimeMinutes?: number; complexity?: RecipeComplexity;
  metadata?: RecipeCardMetadata; favoriteAvailable?: boolean; favoritePending?: boolean;
  onFavorite?: () => void; onOpen?: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode; actions?: ReactNode; imageActions?: ReactNode; mobileCompactResources?: boolean;
}) {
  const badge = recipeBadge(metadata);
  const banner = <><RecipeCover image={image} name={name} banner />
    {badge ? <span className="absolute right-[12px] top-[12px] inline-flex max-w-[calc(100%-24px)] items-center gap-[6px] rounded-full bg-white/90 px-[8px] py-1.5 text-xs font-extrabold text-ink">
      {badge === "Popular" ? <Flame className="h-[14px] w-[14px] shrink-0" aria-hidden /> : <Heart className="h-[14px] w-[14px] shrink-0 fill-current" aria-hidden />}<span className="min-w-0 [overflow-wrap:anywhere]">{badge}</span>
    </span> : null}</>;
  const bannerClass = `relative block h-36 w-full overflow-hidden rounded-2xl sm:h-40 ${planned ? "bg-blush-100" : "bg-lav-100"}`;
  return <Card className="recipe-card flex h-full min-w-0 flex-col !p-[12px] sm:!p-[16px]">
    <div className="relative min-w-0">
      {onOpen ? <button type="button" className={bannerClass} onClick={onOpen} aria-label={`View recipe image: ${name}`}>{banner}</button> : <div className={bannerClass}>{banner}</div>}
      {imageActions ? <div className="absolute bottom-[12px] right-[12px] flex gap-[8px]">{imageActions}</div> : null}
    </div>
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
    <RecipeResourcePills mobileScrollable={mobileCompactResources} calories={calories} recipeServings={recipeServings} totalTimeMinutes={totalTimeMinutes} complexity={complexity} />
    {children ? <div className="grid min-w-0 gap-3 pb-3">{children}</div> : null}
    {actions ? <div className="mt-auto grid min-w-0 gap-2 border-t border-ink/10 pt-3 [&_button]:min-w-0 [&_button]:[overflow-wrap:anywhere]">{actions}</div> : null}
  </Card>;
}
