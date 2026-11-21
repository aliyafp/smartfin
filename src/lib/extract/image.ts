/** Browser-side image checks and shrinking before upload. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 10;
const MAX_SIDE = 2000;
const MIN_SIDE = 300;

export class ImageFileError extends Error {
  constructor(public code: "unsupported" | "too_large" | "empty" | "corrupted" | "too_small", message: string) { super(message); }
}

/** Format/size check only (pure). Returns a user-facing problem or null. */
export function checkImageFile(f: { type: string; size: number; name: string }): ImageFileError | null {
  const type = f.type.toLowerCase();
  if (/heic|heif/.test(type) || /\.(heic|heif)$/i.test(f.name)) return new ImageFileError("unsupported", "HEIC photos aren't supported yet. Change your camera setting to “Most compatible” or share the photo as JPG.");
  if (type === "application/pdf" || /\.pdf$/i.test(f.name)) return new ImageFileError("unsupported", "PDFs aren't supported yet. Take a screenshot of the page instead.");
  if (!(ACCEPTED_TYPES as readonly string[]).includes(type)) return new ImageFileError("unsupported", "Use a JPG, PNG or WebP image.");
  if (f.size === 0) return new ImageFileError("empty", "This file is empty.");
  if (f.size > MAX_BYTES) return new ImageFileError("too_large", "Images can be up to 10 MB.");
  return null;
}

/** Decodes the image (detects corrupted files), checks it's big enough, and re-encodes as a ≤2000px JPEG. */
export async function prepareImage(file: File | Blob, name = "image"): Promise<{ blob: Blob; width: number; height: number }> {
  const problem = checkImageFile({ type: file.type, size: file.size, name });
  if (problem) throw problem;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new ImageFileError("corrupted", "This image couldn't be opened. It may be damaged — try another copy."); }
  const { width, height } = bitmap;
  if (Math.min(width, height) < MIN_SIDE) { bitmap.close(); throw new ImageFileError("too_small", "This image is too small to read. Use a sharper, larger photo."); }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new ImageFileError("corrupted", "This image couldn't be processed on this device."); }
  ctx.fillStyle = "#fff"; // flatten transparent PNGs
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!blob) throw new ImageFileError("corrupted", "This image couldn't be processed on this device.");
  return { blob, width: w, height: h };
}
