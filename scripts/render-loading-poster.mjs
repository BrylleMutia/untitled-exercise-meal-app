// Regenerate a reduced-motion poster: node scripts/render-loading-poster.mjs [pan|check].
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artwork = {
  pan: { source: "assets/pan loading.lottie", poster: "assets/pan-loading.png", frame: 31, size: 192 },
  check: { source: "assets/check-done.lottie", poster: "assets/check-done.png", frame: 179, size: 512 },
}[process.argv[2] ?? "pan"];
if (!artwork) throw new Error("Choose pan or check.");
const files = {
  "/player.js": ["node_modules/@lottiefiles/dotlottie-web/dist/index.js", "text/javascript"],
  "/player.wasm": ["node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm", "application/wasm"],
  "/animation.lottie": [artwork.source, "application/zip"],
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: artwork.size, height: artwork.size }, deviceScaleFactor: 1 });
  await page.route("http://loading-asset.local/**", async route => {
    const file = files[new URL(route.request().url()).pathname];
    if (file) return route.fulfill({ body: await readFile(join(root, file[0])), contentType: file[1] });
    return route.fulfill({ contentType: "text/html", body: `<style>body{margin:0}canvas{display:block;width:${artwork.size}px;height:${artwork.size}px}</style><canvas width="${artwork.size}" height="${artwork.size}"></canvas><script type="module">
      import { DotLottie } from '/player.js';
      DotLottie.setWasmUrl('/player.wasm');
      const player = new DotLottie({canvas:document.querySelector('canvas'),src:'/animation.lottie',autoplay:false,loop:false});
      player.addEventListener('load',()=>{player.setFrame(${artwork.frame});requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true'));});
      player.addEventListener('loadError',()=>document.body.dataset.ready='failed');
    </script>` });
  });
  await page.goto("http://loading-asset.local/");
  await page.waitForSelector('body[data-ready="true"]');
  await page.locator("canvas").screenshot({ path: join(root, artwork.poster), omitBackground: true });
} finally { await browser.close(); }
