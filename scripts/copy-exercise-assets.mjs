// Copies the frame-1 illustration for each catalog slug from
// @bryllim/workout-guide into public/exercises so illustrations are bundled
// and work offline. Assets are CC BY-SA 4.0 (Bryl Lim), attribution required.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const slugs = [
  "knee-push-up",
  "incline-push-up",
  "push-up",
  "diamond-push-up",
  "pike-push-up",
  "dip",
  "inverted-row",
  "pull-up",
  "bodyweight-squat",
  "goblet-squat",
  "bulgarian-split-squat",
  "glute-bridge",
  "good-morning",
  "single-leg-romanian-deadlift",
  "plank",
  "side-plank",
  "dead-bug",
  "bird-dog",
  "mountain-climber",
  "hanging-knee-raise",
  "superman-hold",
];

const dest = join(root, "public", "exercises");
mkdirSync(dest, { recursive: true });

let copied = 0;
for (const slug of slugs) {
  const from = join(root, "node_modules", "@bryllim", "workout-guide", "assets", slug, "frame-1.png");
  if (existsSync(from)) {
    cpSync(from, join(dest, `${slug}.png`));
    copied += 1;
  } else {
    console.warn(`missing asset for ${slug}`);
  }
}
console.log(`copied ${copied}/${slugs.length} exercise illustrations`);
