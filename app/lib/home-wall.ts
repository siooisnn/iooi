// Home "photo wall": four wooden frames whose pictures sync with settings.
// Frame 0 is landscape 4:3, frames 1-3 are square.
export const HOME_WALL_FRAME_COUNT = 4;
export const HOME_WALL_ASPECTS = [4 / 3, 1, 1, 1] as const;

// ~240 KB each: four of these sit in settings next to the chat backgrounds,
// which also live in localStorage.
const MAX_PHOTO_LENGTH = 320_000;

export type HomeStyle = "moon" | "wall";

export function normalizeHomeStyle(value: unknown): HomeStyle {
  return value === "wall" ? "wall" : "moon";
}

export function normalizeHomeWallPhoto(value: unknown): string {
  return typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(value)
    && value.length <= MAX_PHOTO_LENGTH ? value : "";
}

export function normalizeHomeWallPhotos(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: HOME_WALL_FRAME_COUNT }, (_, index) => normalizeHomeWallPhoto(list[index]));
}

// Frames are small on screen, so crop to the frame shape and keep ~1-2 hundred KB.
export async function prepareHomeWallPhoto(file: File, aspect: number): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > 25 * 1024 * 1024) throw new Error("图片太大，请选择小于 25MB 的照片。");

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法读取这张照片，请换一张 JPG、PNG 或 WebP 图片。"));
      image.src = url;
    });
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("无法读取这张照片，请换一张。");

    // Center crop to the frame's aspect ratio.
    let cropWidth = sourceWidth;
    let cropHeight = sourceWidth / aspect;
    if (cropHeight > sourceHeight) {
      cropHeight = sourceHeight;
      cropWidth = sourceHeight * aspect;
    }
    const cropX = (sourceWidth - cropWidth) / 2;
    const cropY = (sourceHeight - cropHeight) / 2;

    const longEdge = 800;
    const scale = Math.min(1, longEdge / Math.max(cropWidth, cropHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropWidth * scale));
    canvas.height = Math.max(1, Math.round(cropHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片处理失败，请重新选择。");
    // Transparent drawings sit on the same cream as the frame mat.
    context.fillStyle = "#fffdf8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.72, 0.6, 0.48]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= MAX_PHOTO_LENGTH) return result;
    }
    throw new Error("这张照片处理后仍然太大，请换一张较小的图片。");
  } finally {
    URL.revokeObjectURL(url);
  }
}
