import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "public", "animations");
mkdirSync(destination, { recursive: true });
copyFileSync(join(root, "assets", "pan loading.lottie"), join(destination, "pan-loading.lottie"));
copyFileSync(join(root, "assets", "pan-loading.png"), join(destination, "pan-loading.png"));
copyFileSync(join(root, "assets", "check-done.lottie"), join(destination, "check-done.lottie"));
copyFileSync(join(root, "assets", "check-done.png"), join(destination, "check-done.png"));
copyFileSync(join(root, "node_modules", "@lottiefiles", "dotlottie-web", "dist", "dotlottie-player.wasm"), join(destination, "dotlottie-player.wasm"));
