// Browser-only helper: shrink phone photos before upload. Claude downsizes
// anything above ~1568px on the long edge anyway, so sending 12MP originals
// only wastes upload time and the per-image size budget.
const MAX_EDGE = 2048;
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.86;

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decodeImage(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to <img>, which some Safari versions decode more reliably.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

export async function prepareImageForUpload(file: File): Promise<File> {
  // GIF may be animated; re-encoding would flatten it.
  if (file.type === "image/gif") return file;
  let decoded: Decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    return file;
  }
  try {
    const { width, height } = decoded;
    if (!width || !height) return file;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const supported = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    // Small screenshots stay untouched so text remains crisp.
    if (scale === 1 && supported && file.size <= KEEP_ORIGINAL_BYTES) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#ffffff"; // JPEG has no alpha; avoid black backgrounds.
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas);
    if (!blob || (supported && scale === 1 && blob.size >= file.size)) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    decoded.close();
  }
}
