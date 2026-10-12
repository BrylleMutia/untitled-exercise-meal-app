"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Link, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { RecipeImage } from "@/types/domain";
import { uploadRecipeImage } from "@/services/recipeImages";
import { safeRecipeImageUrl } from "@/utility/recipeImage";

export function RecipeImagePicker({ image, onChange, disabled, onBusy }: {
  image: RecipeImage | null; onChange: (image: RecipeImage | null) => void;
  disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploadIdentity = useRef<{ file: File; id: string } | null>(null);
  const panelId = useId();
  async function upload(file?: File) {
    if (!file || busy) return;
    if (uploadIdentity.current?.file !== file) uploadIdentity.current = { file, id: crypto.randomUUID() };
    setBusy(true); onBusy(true); setMessage(""); setUploadFailed(false);
    try { onChange(await uploadRecipeImage(file, uploadIdentity.current.id)); setMessage("Image uploaded for this draft. Save the recipe to attach it."); }
    catch (error) { setUploadFailed(true); setMessage(error instanceof Error ? error.message : "Image upload failed. Retry or use the default image."); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className="grid min-w-0 justify-items-center gap-2">
    <Button variant="soft" className="!min-h-11 bg-lav-100 !px-4" disabled={disabled || busy} aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}><ImagePlus className="h-4 w-4" aria-hidden />Change image</Button>
    <div id={panelId} hidden={!expanded} className="w-full min-w-0">
      <div className="flex flex-wrap justify-center gap-1">
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={disabled || busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" aria-hidden />Upload image</Button>
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={disabled || busy} onClick={() => { setUrlMode(value => !value); setUrl(image?.kind === "url" ? image.url : ""); setMessage(""); }}><Link className="h-4 w-4" aria-hidden />Use image URL</Button>
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={disabled || busy || !image} onClick={() => { onChange(null); setUrlMode(false); setMessage("Default image selected. Save to apply this change."); }}><RotateCcw className="h-4 w-4" aria-hidden />Reset to default</Button>
      </div>
      <input ref={input} className="sr-only" tabIndex={-1} type="file" aria-label="Upload recipe image" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={event => void upload(event.target.files?.[0])} />
      <p className="text-center text-xs text-ink-soft">JPEG, PNG, or WebP · up to 5 MB</p>
      {urlMode ? <div className="mt-3 grid min-w-0 gap-2 rounded-2xl bg-cream p-3">
        <label className="grid min-w-0 gap-1 text-sm font-bold">Image URL<input className="input !bg-white" type="url" maxLength={2048} placeholder="https://example.com/recipe.jpg" value={url} disabled={disabled || busy} onChange={event => setUrl(event.target.value)} /></label>
        <p className="text-xs text-ink-soft">Use a direct HTTPS image link. The external host receives an image request; availability depends on that host.</p>
        <Button variant="soft" className="w-fit !min-h-11 !px-3" disabled={disabled || busy || !safeRecipeImageUrl(url)} onClick={() => { onChange({ kind: "url", url: safeRecipeImageUrl(url)! }); setUrlMode(false); setMessage("Image URL selected. Save the recipe to apply it."); }}>Use this image</Button>
        {url && !safeRecipeImageUrl(url) ? <p className="text-xs font-semibold" role="status">Enter a complete HTTPS URL without a username or password.</p> : null}
      </div> : null}
      {busy ? <p className="mt-2 text-center text-sm font-bold" role="status">Uploading image…</p> : null}
      {!busy && uploadFailed ? <Button variant="soft" className="mt-2 !min-h-11 !px-3" disabled={disabled} onClick={() => void upload(uploadIdentity.current?.file)}>Retry upload</Button> : null}
      {message ? <p className="mt-2 break-words text-center text-xs text-ink-soft" role="status">{message}</p> : null}
    </div>
  </div>;
}
