"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DotLottie } from "@lottiefiles/dotlottie-web";
import { loadLottieData, loadLottieRuntime } from "@/lib/lottieRuntime";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(notify: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
export function useReducedAnimationMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
}

type ArtworkProps = { src: string; poster: string; playing: boolean; loop?: boolean };
export function LottieArtwork(props: ArtworkProps) {
  return <LottieCanvas key={`${props.src}:${Boolean(props.loop)}`} {...props} />;
}
function LottieCanvas({ src, poster, playing, loop = false }: ArtworkProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<DotLottie | null>(null);
  const shouldPlay = useRef(playing);
  const completed = useRef(false);
  const [activated, setActivated] = useState(playing);
  if (playing && !activated) setActivated(true);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!activated) return;
    let active = true;
    let instance: DotLottie | undefined;
    void Promise.all([loadLottieRuntime(), loadLottieData(src)]).then(([{ DotLottie: Player }, data]) => {
      if (!active || !canvas.current) return;
      instance = new Player({ canvas: canvas.current, data, loop, autoplay: false, renderConfig: { freezeOnOffscreen: true } });
      player.current = instance;
      instance.addEventListener("load", () => {
        if (!active || !instance) return;
        if (shouldPlay.current && !completed.current) instance.play();
        else instance.freeze();
      });
      const onRender = () => { if (active) setRendered(true); instance?.removeEventListener("render", onRender); };
      const onError = () => { if (active) { setFailed(true); instance?.freeze(); } };
      instance.addEventListener("render", onRender);
      instance.addEventListener("loadError", onError);
      instance.addEventListener("renderError", onError);
      instance.addEventListener("complete", () => {
        if (active && !loop) { completed.current = true; setComplete(true); instance?.freeze(); }
      });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; player.current = null; instance?.destroy(); };
  }, [activated, loop, src]);
  useEffect(() => {
    shouldPlay.current = playing;
    if (playing && !completed.current) { player.current?.unfreeze(); player.current?.play(); }
    else player.current?.freeze();
  }, [playing]);
  return <>
    <LottiePoster src={poster} hidden={rendered && !failed} />
    <canvas ref={canvas} width={256} height={256} data-lottie-canvas data-pan-canvas={loop || undefined}
      data-playing={playing && !failed && !complete} data-lottie-complete={complete} data-lottie-loop={loop}
      className={`absolute inset-0 h-full w-full ${rendered && !failed ? "" : "invisible"}`} />
  </>;
}

export function LottiePoster({ src, hidden = false }: { src: string; hidden?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={256} height={256} className={`h-full w-full object-contain ${hidden ? "invisible" : ""}`} />;
}
