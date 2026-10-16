"use client";

import { useEffect, useState } from "react";
import type { RecipeImage } from "@/types/domain";
import { defaultRecipeImage, parseRecipeImage, recipeCatalogImages } from "@/utility/recipeImage";
import { recipeImageDisplayUrl } from "@/services/recipeImages";

export function RecipeCover({ image, name, compact = false, banner = false, selection = false }: { image?: RecipeImage | null; name: string; compact?: boolean; banner?: boolean; selection?: boolean }) {
  const valid = parseRecipeImage(image);
  const path = valid?.kind === "upload" ? valid.path : null;
  const external = valid?.kind === "url" ? valid.url : valid?.kind === "asset" ? recipeCatalogImages[valid.id] : null;
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let active = true;
    const resolve = () => { void recipeImageDisplayUrl(path).then(url => { if (active) { setResolved({ path, url }); setFailedSource(null); } }).catch(() => { if (active) setFailedSource(path); }); };
    resolve();
    const timer = setInterval(resolve, 45 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [path]);
  const sourceKey = path ?? external;
  const url = failedSource === sourceKey ? null : external ?? (resolved?.path === path ? resolved.url : null);
  const src = url ?? defaultRecipeImage;
  const Container = compact || banner || selection ? "span" : "figure";
  return <Container className={`m-0 grid min-w-0 justify-items-center gap-1 ${selection ? "w-full" : banner ? "absolute -left-5 -top-7 h-52 w-52 sm:h-60 sm:w-60" : compact ? "shrink-0" : "w-full"}`}>
    {/* External covers load directly with no referrer; never proxy arbitrary URLs through the server. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={url ? `Cover for ${name || "this recipe"}` : ""} referrerPolicy="no-referrer"
      width={compact ? 56 : 240} height={compact ? 56 : 240}
      className={selection ? "aspect-square h-full w-full rounded-xl bg-lav-50 object-cover" : banner ? "h-full w-full rounded-full object-cover" : compact ? "h-14 w-14 rounded-xl bg-lav-50 object-cover" : "aspect-square h-auto w-44 max-w-full rounded-2xl bg-lav-50 object-cover sm:w-52"}
      onError={() => setFailedSource(sourceKey ?? "default")} />
    {!compact && !banner && !selection && !url && path && failedSource !== path ? <figcaption className="sr-only" role="status">Loading image…</figcaption> : null}
    {!compact && !banner && !selection && sourceKey && failedSource === sourceKey ? <figcaption className="text-xs text-ink-soft" role="status">Image unavailable · default shown</figcaption> : null}
    {!compact && !banner && !selection && sourceKey && failedSource === sourceKey ? <button type="button" className="min-h-11 rounded-xl px-3 text-xs font-bold text-ink-soft underline" onClick={() => {
      if (!path) { setFailedSource(null); return; }
      void recipeImageDisplayUrl(path).then(url => { setResolved({ path, url }); setFailedSource(null); }).catch(() => setFailedSource(path));
    }}>Retry image</button> : null}
  </Container>;
}
