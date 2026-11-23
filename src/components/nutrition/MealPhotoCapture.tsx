"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, SwitchCamera, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { captureMealPhoto, normalizeMealPhoto } from "@/services/mealPhoto";
import { parseNutritionPhoto } from "@/services/nutritionProvider";
import { createClient } from "@/lib/supabase/client";
import type { PhotoExtraction } from "../../../supabase/functions/_shared/photoContract";

export function MealPhotoCapture({ onResult, onClose }: { onResult: (result: PhotoExtraction) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [live, setLive] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  function stopCamera() {
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    function hidden() {
      if (document.hidden) { generation.current++; stopCamera(); request.current?.abort(); setWorking(false); setLive(false); }
    }
    document.addEventListener("visibilitychange", hidden);
    // This counter invalidates pending permission and decoding work on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; stopCamera(); request.current?.abort(); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  async function openCamera(next = facing) {
    const id = ++generation.current;
    request.current = null;
    setAnalyzing(false);
    stopCamera(); setImage(null); setError(""); setWorking(true); setLive(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Use the device camera or upload a photo. Live camera requires HTTPS or localhost.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next } }, audio: false });
      if (id !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      if (id !== generation.current) return;
      setFacing(next); setLive(true);
    } catch (reason) {
      if (id === generation.current) { stopCamera(); setError(reason instanceof DOMException ? "Camera access is unavailable. Check permission, close other camera apps, or upload a photo." : reason instanceof Error ? reason.message : "Camera unavailable. Upload a photo instead."); }
    } finally { if (id === generation.current) setWorking(false); }
  }
  async function selectPhotoFile(file: Blob) {
    const id = ++generation.current;
    request.current = null;
    setAnalyzing(false);
    stopCamera(); setLive(false); setWorking(true); setError("");
    try { const data = await normalizeMealPhoto(file); if (id === generation.current) setImage(data); }
    catch (reason) { if (id === generation.current) setError(reason instanceof Error ? reason.message : "Could not open this photo."); }
    finally { if (id === generation.current) setWorking(false); }
  }
  async function capture() {
    if (!video.current || working) return;
    const id = generation.current;
    setWorking(true);
    try { const file = await captureMealPhoto(video.current); if (id === generation.current) await selectPhotoFile(file); }
    catch (reason) { if (id === generation.current) { setWorking(false); setError(reason instanceof Error ? reason.message : "Could not take the photo."); } }
  }
  async function analyze() {
    if (!image || working) return;
    const id = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    setAnalyzing(true);
    setWorking(true); setError("");
    try {
      const result = await parseNutritionPhoto(createClient(), image, note, AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]));
      if (id !== generation.current) return;
      setImage(null);
      if (result.status !== "ok") { setError(result.status === "no_food" ? "No meal was identified. Take another photo or enter your meal manually." : "This photo is unclear. Try better lighting or enter your meal manually."); return; }
      onResult(result);
    } catch (reason) {
      if (id !== generation.current) return;
      const code = reason instanceof Error ? reason.message.split(":")[0] : "";
      setError(code === "photo_disabled" ? "Photo estimates are not enabled yet. Use search or manual entry."
        : code === "rate_limited" ? "Photo analysis is temporarily rate-limited. Keep this screen open and retry later."
        : code === "not_authenticated" ? "Your session expired. Sign in again, then retake or upload your photo."
        : "The estimate could not be completed. Your photo is still here; retry or return to manual entry.");
    } finally { if (id === generation.current) setWorking(false); }
  }
  return <section className="grid min-w-0 gap-3" aria-label="Meal photo">
    <h3 className="text-lg font-extrabold">Take a meal photo</h3>
    <p className="text-sm text-ink-soft">Include the whole meal. Portions, oils, and sauces may need correcting.</p>
    <video ref={video} autoPlay playsInline muted aria-label="Live meal camera" className={`${live ? "" : "hidden"} max-h-[45dvh] w-full rounded-2xl bg-ink object-contain`} />
    {/* A transient local data URL must never enter Next image optimization or storage. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image ? <img src={image} alt="Meal photo ready for analysis" className="max-h-[45dvh] w-full rounded-2xl object-contain" /> : null}
    {error ? <p role="alert" className="text-sm font-semibold text-danger-900">{error}</p> : null}
    {working ? <p role="status" className="text-sm font-semibold">{analyzing ? "Analyzing meal…" : "Preparing photo…"}</p> : null}
    <div className="flex flex-wrap gap-2">
      {!image && !live ? <Button disabled={working} onClick={() => void openCamera()}><Camera className="h-5 w-5" aria-hidden />Open camera</Button> : null}
      {live ? <><Button disabled={working} onClick={() => void capture()}><Camera className="h-5 w-5" aria-hidden />Take photo</Button><Button variant="soft" disabled={working} onClick={() => void openCamera(facing === "environment" ? "user" : "environment")}><SwitchCamera className="h-5 w-5" aria-hidden />Switch camera</Button></> : null}
      {image ? <Button variant="soft" disabled={working} onClick={() => void openCamera()}>Retake</Button> : null}
      <Button variant="soft" disabled={working} onClick={() => upload.current?.click()}><Upload className="h-5 w-5" aria-hidden />Upload photo</Button>
      {!live && !image ? <Button variant="soft" disabled={working} onClick={() => nativeCamera.current?.click()}>Use device camera</Button> : null}
    </div>
    <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload meal photo" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void selectPhotoFile(file); }} />
    <input ref={nativeCamera} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take meal photo with device camera" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void selectPhotoFile(file); }} />
    {image ? <><label className="grid gap-1 text-sm font-bold">Anything we should know? (optional)<textarea className="input" maxLength={1000} value={note} disabled={working} onChange={event => setNote(event.target.value)} placeholder="Dish name, known weight, cooking method…" /></label>
      <p className="text-sm text-ink-soft">Estimate meal sends this photo and note to DeepSeek. Cali does not save the photo in your meal history. Estimates need your review before saving.</p>
      <a className="text-sm underline" href="https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html" target="_blank" rel="noreferrer">DeepSeek data handling</a>
      <Button disabled={working} onClick={() => void analyze()}>Estimate meal</Button></> : null}
    <Button variant="ghost" onClick={() => { generation.current++; request.current?.abort(); stopCamera(); setImage(null); onClose(); }}>Back to meal entry</Button>
  </section>;
}
