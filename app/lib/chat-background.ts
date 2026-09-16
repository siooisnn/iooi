// Keep the photo in the existing settings sync, just like the profile avatars.
export async function prepareChatBackground(file: File): Promise<string> {
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
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片处理失败，请重新选择。");
    context.fillStyle = "#f5f1f4";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.68, 0.5]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= 1_200_000) return result;
    }
    throw new Error("这张照片处理后仍然太大，请换一张较小的图片。");
  } finally {
    URL.revokeObjectURL(url);
  }
}
