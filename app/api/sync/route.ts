import { readStore, withStore } from "@/app/lib/store";

type StoredMessage = {
  role?: string;
  content?: string;
  time?: string;
  date?: string;
  image?: string;
  file?: string;
  thinking?: string;
  source?: string;
  proposal?: { id?: string; status?: string };
};

type StoredSession = {
  id?: string;
  name?: string;
  messages?: StoredMessage[];
  createdAt?: string;
  summary?: string;
  summarizedUntil?: number;
};

function messageKey(message: StoredMessage) {
  const proposalId = message.proposal?.id;
  if (proposalId && message.source?.startsWith("summer_write_")) {
    return ["summer_proposal", proposalId].join("\u0001");
  }
  const content = (message.content || "").trim().replace(/\s+/g, " ");
  if (message.role === "assistant" && content.length >= 20 && !message.image && !message.file) {
    return [message.role || "", message.source || "", content].join("\u0001");
  }
  return [
    message.role || "",
    message.source || "",
    message.time || "",
    message.date || "",
    content,
    message.image || "",
    message.file || "",
  ].join("\u0001");
}

function proposalRank(message: StoredMessage) {
  if (message.source === "summer_write_committed" || message.proposal?.status === "committed") return 3;
  if (message.source === "summer_write_ignored" || message.proposal?.status === "discarded") return 2;
  if (message.source === "summer_write_proposal" || message.proposal?.status === "pending") return 1;
  return 0;
}

function preferMessage(current: StoredMessage, incoming: StoredMessage) {
  if (current.proposal?.id && incoming.proposal?.id) {
    const currentRank = proposalRank(current);
    const incomingRank = proposalRank(incoming);
    if (incomingRank >= currentRank) return { ...current, ...incoming };
    return current;
  }
  return { ...current, ...incoming };
}

function mergeMessages(local: StoredMessage[] = [], incoming: StoredMessage[] = []) {
  const merged: StoredMessage[] = [];
  const indexes = new Map<string, number>();
  const pushOrReplace = (message: StoredMessage) => {
    const key = messageKey(message);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(message);
    } else {
      merged[existingIndex] = preferMessage(merged[existingIndex], message);
    }
  };
  for (const message of local) {
    pushOrReplace(message);
  }
  for (const message of incoming) {
    pushOrReplace(message);
  }
  return merged;
}

function mergeSessions(local: StoredSession[] = [], incoming: StoredSession[] = []) {
  const byId = new Map<string, StoredSession>();
  for (const session of local) {
    if (session?.id) byId.set(session.id, { ...session, messages: session.messages || [] });
  }
  for (const session of incoming) {
    if (!session?.id) continue;
    const current = byId.get(session.id);
    if (!current) {
      byId.set(session.id, { ...session, messages: session.messages || [] });
      continue;
    }
    byId.set(session.id, {
      ...current,
      ...session,
      messages: mergeMessages(current.messages || [], session.messages || []),
      summary: session.summary || current.summary,
      summarizedUntil: Math.max(current.summarizedUntil || 0, session.summarizedUntil || 0),
    });
  }
  const order = [...incoming, ...local].map((s) => s?.id).filter(Boolean) as string[];
  const used = new Set<string>();
  return order
    .filter((id) => {
      if (used.has(id)) return false;
      used.add(id);
      return byId.has(id);
    })
    .map((id) => byId.get(id));
}

export async function GET() {
  const data = readStore();
  if (!data) {
    return Response.json({ sessions: [], diary: [], settings: null });
  }
  return Response.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await withStore((store) => {
      const next = { ...body };
      if (Array.isArray(body.sessions)) {
        next.sessions = mergeSessions(store.sessions as StoredSession[] | undefined, body.sessions);
      }
      Object.assign(store, next);
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: "保存失败" }, { status: 500 });
  }
}
