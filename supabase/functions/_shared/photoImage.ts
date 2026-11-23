export const maxPhotoBytes = 2 * 1024 * 1024;
export const maxPhotoDimension = 1600;

/** Inspect the actual JPEG frame, never client-supplied dimensions or MIME alone. */
export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8
    || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += length;
  }
  return null;
}
export function validPhotoDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > Math.ceil(maxPhotoBytes / 3) * 4 + 23
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const bytes = Uint8Array.from(atob(value.slice(23)), char => char.charCodeAt(0));
    const size = jpegDimensions(bytes);
    return bytes.length <= maxPhotoBytes && size !== null && Math.max(size.width, size.height) <= maxPhotoDimension;
  } catch { return false; }
}
