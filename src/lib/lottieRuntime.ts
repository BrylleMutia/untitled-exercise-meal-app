export const animationAssets = {
  pan: "/animations/pan-loading.lottie",
  panPoster: "/animations/pan-loading.png",
  check: "/animations/check-done.lottie",
  checkPoster: "/animations/check-done.png",
  wasm: "/animations/dotlottie-player.wasm",
};

let runtime: Promise<typeof import("@lottiefiles/dotlottie-web")> | undefined;
const animations = new Map<string, Promise<ArrayBuffer>>();
async function loadAsset(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Animation artwork is unavailable.");
  return response.arrayBuffer();
}
export function loadLottieRuntime() {
  return runtime ??= Promise.all([import("@lottiefiles/dotlottie-web"), loadAsset(animationAssets.wasm)]).then(([module, wasm]) => {
    if (!WebAssembly.validate(wasm)) throw new Error("Animation runtime is unavailable.");
    // One page-scoped local WASM blob keeps expected fetch failures in our fallback.
    module.DotLottie.setWasmUrl(URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })));
    return module;
  }).catch(error => { runtime = undefined; throw error; });
}
export function loadLottieData(src: string) {
  let data = animations.get(src);
  if (!data) {
    data = loadAsset(src).catch(error => { animations.delete(src); throw error; });
    animations.set(src, data);
  }
  return data;
}
