import { messageTimestamp } from "./chat-timeline";
import { imageKey, messageImages } from "./message-images";
import type { AssistantMode, ChatSession, FragmentEntry, Message } from "./app-types";
import { getAppHour, parseMessageDateTime } from "./app-time";

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function mergeFragments(local: FragmentEntry[], incoming: FragmentEntry[]) {
  const byId = new Map<string, FragmentEntry>();
  for (const fragment of [...local, ...incoming]) {
    if (!fragment?.id) continue;
    const current = byId.get(fragment.id);
    const currentStamp = current ? new Date(current.updatedAt || current.createdAt).getTime() : 0;
    const nextStamp = new Date(fragment.updatedAt || fragment.createdAt).getTime();
    if (!current || nextStamp >= currentStamp) byId.set(fragment.id, fragment);
  }
  return Array.from(byId.values()).sort((a, b) =>
    new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );
}

export function createGroupSession(index = 1, id = "group-main"): ChatSession {
  return {
    id,
    name: `群聊 ${index}`,
    messages: [],
    createdAt: new Date().toISOString(),
    kind: "group",
  };
}

// 备忘 was removed: old memo windows left in localStorage or on the server
// are dropped whenever lists are merged.
function isRemovedMemo(session: { kind?: string }) {
  return session.kind === "memo";
}

export function chatMessageKey(message: Message) {
  const proposalId = message.proposal?.id;
  if (proposalId && message.source?.startsWith("summer_write_")) {
    return ["summer_proposal", proposalId].join("\u0001");
  }
  const content = (message.content || "").trim().replace(/\s+/g, " ");
  if (message.roundId && (message.role === "assistant" || message.source === "chat_nudge")) {
    return [message.role, message.speaker || "", message.source || "", message.roundId, content].join("\u0001");
  }
  if (message.role === "assistant" && message.source !== "summer_call" && content.length >= 4 && !imageKey(message) && !message.file) {
    return [message.role, message.speaker || "", message.source || "", content].join("\u0001");
  }
  return [
    message.role,
    message.speaker || "",
    message.source || "",
    message.time || "",
    message.date || "",
    content,
    imageKey(message),
    message.file || "",
  ].join("\u0001");
}

export function proposalMessageRank(message: Message) {
  if (message.source === "summer_write_committed" || message.proposal?.status === "committed") return 3;
  if (message.source === "summer_write_ignored" || message.proposal?.status === "discarded") return 2;
  if (message.source === "summer_write_proposal" || message.proposal?.status === "pending") return 1;
  return 0;
}

export function preferChatMessage(current: Message, incoming: Message) {
  if (current.proposal?.id && incoming.proposal?.id) {
    return proposalMessageRank(incoming) >= proposalMessageRank(current) ? { ...current, ...incoming } : current;
  }
  return { ...current, ...incoming };
}

export function mergeChatMessages(current: Message[], incoming: Message[]) {
  const messagesByKey = new Map<string, Message>();
  for (const message of current) {
    messagesByKey.set(chatMessageKey(message), message);
  }
  for (const message of incoming) {
    const key = chatMessageKey(message);
    const existing = messagesByKey.get(key);
    messagesByKey.set(key, existing ? preferChatMessage(existing, message) : message);
  }

  // The server snapshot is authoritative for ordering. This keeps a reply
  // recovered after an iOS/background disconnect beside its original user
  // message instead of appending it below newer local-only messages.
  const orderedKeys = [...incoming, ...current].map(chatMessageKey);
  const seen = new Set<string>();
  return orderedKeys.flatMap((key) => {
    if (seen.has(key)) return [];
    seen.add(key);
    const message = messagesByKey.get(key);
    return message ? [message] : [];
  });
}

export function mergeChatSessionLists(
  localSessions: ChatSession[],
  serverSessions: ChatSession[],
  deletedIds: Set<string>,
) {
  const localById = new Map(localSessions.map((session) => [session.id, session]));
  const serverById = new Map(serverSessions.map((session) => [session.id, session]));
  const orderedIds = [
    ...serverSessions.map((session) => session.id),
    ...localSessions.map((session) => session.id),
  ];
  const seen = new Set<string>();
  const merged: ChatSession[] = [];

  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    seen.add(id);

    const local = localById.get(id);
    const server = serverById.get(id);
    const session = server || local;
    if (!session || isRemovedMemo(session) || deletedIds.has(id)) continue;

    if (local && server) {
      merged.push({
        ...local,
        ...server,
        summary: server.summary || local.summary,
        summarizedUntil: Math.max(local.summarizedUntil || 0, server.summarizedUntil || 0) || undefined,
        messages: mergeChatMessages(local.messages || [], server.messages || []),
      });
    } else {
      merged.push({
        ...session,
        messages: mergeChatMessages([], session.messages || []),
      });
    }
  }

  return merged;
}

export function hasLaterUserMessage(messages: Message[], userMsg: Message) {
  const index = messages.findIndex((m) =>
    m.role === "user" &&
    m.content === userMsg.content &&
    m.time === userMsg.time &&
    m.date === userMsg.date &&
    (!m.roundId || !userMsg.roundId || m.roundId === userMsg.roundId)
  );
  if (index < 0) return false;
  return messages.slice(index + 1).some((m) => m.role === "user");
}

// Home View
export function getIdleStatus(): string {
  const h = getAppHour();
  if (h < 7) return "睡着了 😴";
  if (h < 9) return "刚醒 🥱";
  if (h < 12) return "在发呆 ☁️";
  if (h < 14) return "吃饭中 🍜";
  if (h < 18) return "在想你 💭";
  if (h < 21) return "等你来聊 🌙";
  if (h < 23) return "有点困了 😪";
  return "睡着了 😴";
}

export function getLatestSessionMessage(session: ChatSession) {
  return session.messages.reduce<Message | undefined>((latest, message) => {
    if (message.source?.startsWith("summer_")) return latest;
    return !latest || messageTimestamp(message) >= messageTimestamp(latest) ? message : latest;
  }, undefined);
}

export function getSessionStamp(session: ChatSession) {
  return parseMessageDateTime(getLatestSessionMessage(session)) || new Date(session.createdAt);
}

export function getChatStatusLabel(aiMood: { emoji: string; ts: number }, complete = false) {
  const raw = aiMood.emoji || getIdleStatus();
  const label = raw.replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, " ").trim() || "期待";
  return complete ? label : `${label.split(/\s+/)[0]}…`;
}

export function shouldShowChatRoomTime(message: Message, prevMessage?: Message | null) {
  if (!prevMessage) return true;
  const current = parseMessageDateTime(message);
  const prev = parseMessageDateTime(prevMessage);
  if (!current || !prev) return message.date !== prevMessage.date;
  const minutes = Math.abs(current.getTime() - prev.getTime()) / 60000;
  return message.date !== prevMessage.date || minutes >= 2;
}

export function getSessionPreview(message?: Message) {
  if (!message) return "还没有消息";
  const imageCount = messageImages(message).length;
  if (imageCount) return message.content || (imageCount > 1 ? `发来 ${imageCount} 张图片` : "发来一张图片");
  if (message.file) return message.content || "发来一个文件";
  return message.content || "还没有消息";
}

export function isSummerUtilityMessage(message: Message) {
  return message.source === "summer_call" ||
    message.source === "summer_write_proposal" ||
    message.source === "summer_write_committed";
}

export function sortByStamp(sessions: ChatSession[]) {
  return [...sessions].sort((a, b) => getSessionStamp(b).getTime() - getSessionStamp(a).getTime());
}

// Private windows worth listing: for Claude only windows that have been
// written in (an untouched draft is reused by ＋ instead).
export function listedPrivateSessions(sessions: ChatSession[], mode: AssistantMode) {
  return sortByStamp(sessions.filter((s) => mode === "gpt" || s.messages.length > 0));
}

export function latestPrivateSession(sessions: ChatSession[], mode: AssistantMode) {
  return listedPrivateSessions(sessions, mode)[0] || sortByStamp(sessions)[0];
}
