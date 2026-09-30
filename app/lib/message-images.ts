// A chat bubble may carry one legacy `image` or several `images`. Older
// messages keep working because every reader goes through messageImages().
export const MAX_IMAGES_PER_MESSAGE = 9;

const UPLOAD_URL = /^\/uploads\/[A-Za-z0-9._-]{1,120}$/;

export function isUploadUrl(value: unknown): value is string {
  return typeof value === "string" && UPLOAD_URL.test(value) && !value.includes("..");
}

export function messageImages(message: { image?: unknown; images?: unknown } | null | undefined): string[] {
  if (!message) return [];
  const urls = [
    ...(typeof message.image === "string" && message.image ? [message.image] : []),
    ...(Array.isArray(message.images) ? message.images.filter((url): url is string => typeof url === "string" && Boolean(url)) : []),
  ];
  return [...new Set(urls)];
}

// One image stays in the legacy field so group chat, GPT and older clients
// render it unchanged; several images use the array field.
export function imageFields(urls: string[]): { image?: string; images?: string[] } {
  const unique = [...new Set(urls)].slice(0, MAX_IMAGES_PER_MESSAGE);
  if (unique.length === 0) return {};
  if (unique.length === 1) return { image: unique[0] };
  return { images: unique };
}

// Server-side cleanup for a user message coming from the browser: only
// iooi's own upload URLs are kept, capped at the per-message limit.
export function sanitizeMessageImages<T extends { image?: unknown; images?: unknown }>(message: T): T {
  const urls = messageImages(message).filter(isUploadUrl);
  const next = { ...message } as T & { image?: string; images?: string[] };
  delete next.image;
  delete next.images;
  return Object.assign(next, imageFields(urls));
}

export function imageKey(message: { image?: unknown; images?: unknown }) {
  return messageImages(message).join("|");
}
