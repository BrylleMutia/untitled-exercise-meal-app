import Image from "next/image";
import type { Exercise } from "@/types/domain";
import type { CardTone } from "@/components/ui/Card";

const toneClasses: Record<CardTone, string> = {
  // The workout-guide frames use white line art on transparency. Keep the
  // illustration surface dark enough for the artwork to remain legible while
  // preserving a slightly softer option for the pastel card tones.
  white: "bg-ink",
  blush: "bg-ink-soft",
  lavender: "bg-ink-soft",
  peach: "bg-ink-soft",
  mint: "bg-ink-soft",
  coral: "bg-ink",
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
