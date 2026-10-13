import type { ChatSession, Message } from "./app-types";
import { messageTimestamp } from "./chat-timeline";
import { messageImages } from "./message-images";

export const PHONE_CONTACT_REMARK = "老婆";
export type PhoneChatEntry = { key: string; sessionId: string; timestamp: number; message: Message };

/** A view of the original private records. Roles and stored records stay intact. */
export function phoneConversation(sessions: ChatSession[]): PhoneChatEntry[] {
  const entries: PhoneChatEntry[] = [];
  for (const session of [...sessions].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    if (session.kind) continue;
    let timestamp = Date.parse(session.createdAt) || 0;
    session.messages.forEach((message, index) => {
      timestamp = messageTimestamp(message) || timestamp;
      if (message.speaker === "gpt" || message.source?.startsWith("summer_")
        || message.source?.startsWith("code_task_") || message.source === "blog_card"
        || !["user", "assistant"].includes(message.role)) return;
      if (!message.content?.trim() && !messageImages(message).length && !message.file) return;
      entries.push({ key: `${session.id}:${index}`, sessionId: session.id, timestamp, message });
    });
  }
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

export function phoneMessageSide(message: Pick<Message, "role">): "left" | "right" {
  return message.role === "assistant" ? "right" : "left";
}

export function phoneMessagePreview(message?: Message): string {
  if (!message) return "";
  return message.content?.trim() || (messageImages(message).length ? "[图片]" : message.file ? "[文件]" : "");
}
