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

// iOS dictation, stickers and Genmoji can leave U+FFFC (the "object
// replacement" placeholder for an inline attachment) in a plain textarea.
// Models read it as an image that failed to load, so it never reaches them.
const OBJECT_PLACEHOLDER = /￼/g;

export function stripObjectPlaceholders(text: string) {
  return text.replace(OBJECT_PLACEHOLDER, "");
}

// Server-side cleanup for every incoming chat message, including history
// saved before placeholders were stripped in the browser.
export function sanitizeIncomingMessage<T extends { content?: unknown; image?: unknown; images?: unknown }>(message: T): T {
  const next = sanitizeMessageImages(message);
  return typeof next.content === "string"
    ? { ...next, content: stripObjectPlaceholders(next.content) }
    : next;
}

// The Claude subscription channel flattens the whole transcript into one user
// turn, so any image re-sent from history looks freshly attached. Only messages
// after the model's last reply belong to the current round; in group chat that
// still covers her image followed by the other member's comment.
export function currentRoundStart(messages: Array<{ role?: unknown }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index + 1;
  }
  return 0;
}

export function imageKey(message: { image?: unknown; images?: unknown }) {
  return messageImages(message).join("|");
}
