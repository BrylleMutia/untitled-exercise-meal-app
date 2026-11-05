import type { ReactNode } from "react";
import type { RecipeImage } from "@/types/domain";
import { RecipeCover } from "./RecipeCover";

export function RecipeSwipeCard({ name, image, children }: { name: string; image?: RecipeImage | null; children: ReactNode }) {
  return <div className="grid min-w-0 gap-3 p-3">
    <div className="rounded-xl bg-lav-100 p-2"><div className="relative aspect-[4/3] w-full max-h-[20dvh] overflow-hidden rounded-lg"><RecipeCover image={image} name={name} fill /></div></div>
    <h4 className="break-words text-xl font-extrabold leading-tight [overflow-wrap:anywhere]">{name}</h4>
    {children}
  </div>;
}
