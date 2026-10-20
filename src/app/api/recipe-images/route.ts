import { createHash } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { cleanupRecipeImages } from "@/services/recipeImageServer";
import { maxRecipeImageBytes, parseRecipeImage, recipeImageBucket, recipeImageTypes } from "@/utility/recipeImage";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const error = (message: string, status: number) => Response.json({ message }, { status, headers });

async function uploadForm(request: Request) {
  const limit = maxRecipeImageBytes + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit || !request.body) throw new Error("ImageTooLarge");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("ImageTooLarge"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return error("This upload must come from the app.", 403);
  const client = await createClient();
  const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) return error("Sign in again to upload an image. Your recipe draft is retained.", 401);
  let form: FormData;
  try { form = await uploadForm(request); } catch { return error("Choose a JPEG, PNG, or WebP image up to 5 MB.", 400); }
  const file = form.get("image"); const uploadId = form.get("uploadId");
  if (!(file instanceof File) || !recipeImageTypes.includes(file.type) || !file.size || file.size > maxRecipeImageBytes
    || typeof uploadId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uploadId)) {
    return error("Choose a JPEG, PNG, or WebP image up to 5 MB.", 400);
  }
  let encoded: Buffer;
  try {
    const pipeline = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000, failOn: "warning" });
    const meta = await pipeline.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format) || !meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new Error("UnsupportedImage");
    encoded = await pipeline.autoOrient().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (encoded.length > maxRecipeImageBytes) throw new Error("ImageTooLarge");
  } catch { return error("This image could not be read. Choose a still JPEG, PNG, or WebP image with at most 25 million pixels.", 400); }
  await cleanupRecipeImages(client);
  const registration = await client.rpc("register_recipe_image", { p_payload: { uploadId, checksum: createHash("sha256").update(encoded).digest("hex") } });
  if (registration.error) return error(registration.error.code === "PGRST202" || registration.error.code === "42883"
    ? "Image uploads need the database update. Your recipe draft is retained; use the default image or retry after the update."
    : "The image could not be prepared. Your recipe draft is retained; choose the image again or retry.", 409);
  const image = parseRecipeImage({ kind: "upload", path: (registration.data as { path?: string } | null)?.path });
  if (!image || image.kind !== "upload" || !image.path.startsWith(`${data.user.id}/`)) return error("The upload could not be authorized.", 403);
  const upload = await client.storage.from(recipeImageBucket).upload(image.path, encoded, { contentType: "image/webp", upsert: false });
  if (upload.error) {
    // A replay may already have uploaded this exact registered checksum/path.
    const existing = await client.storage.from(recipeImageBucket).createSignedUrl(image.path, 60);
    if (existing.error) return error("Image upload failed. Your recipe draft is retained; retry or use the default image.", 503);
  }
  return Response.json({ image }, { headers });
}

export async function GET(request: Request) {
  const client = await createClient(); const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) return error("Sign in to view this image.", 401);
  const image = parseRecipeImage({ kind: "upload", path: new URL(request.url).searchParams.get("path") });
  if (!image || image.kind !== "upload") return error("This image is unavailable.", 404);
  if (!image.path.startsWith(`${data.user.id}/`)) {
    const allowed = await client.rpc("can_read_cooking_recipe_image", { p_path: image.path });
    if (allowed.error || allowed.data !== true) return error("This image is unavailable.", 404);
    // A group URL must recheck membership on every image fetch, including after leaving.
    if (new URL(request.url).searchParams.get("content") === "1") {
      const downloaded = await client.storage.from(recipeImageBucket).download(image.path);
      if (downloaded.error || !downloaded.data) return error("This image is unavailable.", 404);
      return new Response(downloaded.data, { headers: { ...headers, "Content-Type": "image/webp" } });
    }
    return Response.json({ url: `/api/recipe-images?path=${encodeURIComponent(image.path)}&content=1` }, { headers });
  }
  const signed = await client.storage.from(recipeImageBucket).createSignedUrl(image.path, 3600);
  if (signed.error) return error("This image is unavailable.", 404);
  return Response.json({ url: signed.data.signedUrl }, { headers });
}
