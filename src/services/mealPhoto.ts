import { maxPhotoBytes, maxPhotoDimension } from "../../supabase/functions/_shared/photoImage";

/** Re-encoding removes EXIF (including location) before anything leaves the device. */
export async function normalizeMealPhoto(file: Blob): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo. For HEIC, take a new photo or export it as JPEG.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a photo smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error("This photo could not be opened. Try another image."); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000) throw new Error("This photo is too large to process. Choose a smaller image.");
    const scale = Math.min(1, maxPhotoDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable. Try another browser.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if ((data.length - 23) * 3 / 4 <= maxPhotoBytes) return data;
    }
    throw new Error("This photo is still too large. Try a closer crop or a smaller image.");
  } finally { URL.revokeObjectURL(url); }
}

export async function captureMealPhoto(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("Wait for the camera preview before taking a photo.");
  const scale = Math.min(1, maxPhotoDimension / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo capture is unavailable. Upload a photo instead.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not capture the photo. Try again.")), "image/jpeg", 0.85));
}
