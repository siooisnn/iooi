import type { PendingAttachment } from "./app-types";
import type { Sticker } from "./stickers";
import { MAX_IMAGES_PER_MESSAGE } from "./message-images";

export function addStickerToDraft(attachments: PendingAttachment[], sticker: Sticker, draftId: string): PendingAttachment[] | null {
  if (attachments.filter((a) => a.kind === "image").length >= MAX_IMAGES_PER_MESSAGE) return null;
  return [...attachments, { id: draftId, kind: "image", sticker: true, url: sticker.url, name: sticker.name }];
}

/** A picked sticker is just a draft attachment until the normal send action. */
export function stickerDraftMessage(text: string, attachments: PendingAttachment[]) {
  const onlyStickers = attachments.length > 0 && attachments.every((a) => a.kind === "image" && a.sticker);
  return {
    content: text.trim() || !onlyStickers ? text : `[表情包：${attachments.map((a) => a.name).join("、")}]`,
    ...(onlyStickers ? { source: text.trim() ? "sticker_message" : "sticker" } : {}),
  };
}
