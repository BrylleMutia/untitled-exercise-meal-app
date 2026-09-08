import Image from "next/image";
import type { Exercise } from "@/types/domain";
import type { CardTone } from "@/components/ui/Card";

const toneClasses: Record<CardTone, string> = {
  white: "bg-cream",
  blush: "bg-blush-100",
  lavender: "bg-lav-100",
  peach: "bg-peach-100",
  mint: "bg-mint-100",
  coral: "bg-coral-100",
};

interface ExerciseIllustrationProps {
  exercise: Exercise;
  size?: number;
  tone?: CardTone;
  className?: string;
}

/**
 * Frame copied from @bryllim/workout-guide by scripts/copy-exercise-assets.
 * Visual assets are CC BY-SA 4.0 — attribution shown in the screen footer and
 * on the Settings page. On a missing frame the accessible text fallback shows.
 */
export function ExerciseIllustration({
  exercise,
  size = 140,
  tone = "lavender",
  className = "",
}: ExerciseIllustrationProps) {
  return (
    <div className={`grid place-items-center rounded-3xl ${toneClasses[tone]} ${className}`}>
      <Image
        src={`/exercises/${exercise.slug}.png`}
        alt={exercise.illustrationAlt}
        width={size}
        height={size}
        className="h-auto w-auto max-h-40"
      />
      <p className="sr-only">Illustration by Bryl Lim, CC BY-SA 4.0.</p>
    </div>
  );
}
