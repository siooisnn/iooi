type StoredMessage = {
  role?: string;
  content?: string;
  time?: string;
  date?: string;
  image?: string;
  file?: string;
  thinking?: string;
  source?: string;
  speaker?: "claude" | "gpt";
  proposal?: { id?: string; status?: string };
};

type StoredSession = {
  id?: string;
  name?: string;
  messages?: StoredMessage[];
  createdAt?: string;
  kind?: string;
  summary?: string;
  summarizedUntil?: number;
};

type StoreAccess = {
  read: () => Record<string, unknown> | null;
  write: <T>(fn: (store: Record<string, unknown>) => T) => Promise<T>;
};

function deletedIdSet(...lists: unknown[]) {
  const ids = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const id of list) {
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return ids;
}

function messageKey(message: StoredMessage) {
  const proposalId = message.proposal?.id;
  if (proposalId && message.source?.startsWith("summer_write_")) {
    return ["summer_proposal", proposalId].join("\u0001");
  }
  const content = (message.content || "").trim().replace(/\s+/g, " ");
  if (message.role === "assistant" && content.length >= 4 && !message.image && !message.file) {
    return [message.role || "", message.speaker || "", message.source || "", content].join("\u0001");
  }
  return [
    message.role || "",
    message.speaker || "",
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
  for (const message of local) pushOrReplace(message);
  for (const message of incoming) pushOrReplace(message);
  return merged;
}

function isEmptyNormalSession(session: StoredSession) {
  return session.kind !== "memo" && (!Array.isArray(session.messages) || session.messages.length === 0);
}

function mergeSessions(local: StoredSession[] = [], incoming: StoredSession[] = [], deletedIds = new Set<string>()) {
  const byId = new Map<string, StoredSession>();
  for (const session of local) {
    if (session && isEmptyNormalSession(session)) continue;
    if (session?.id && session.kind !== "memo" && deletedIds.has(session.id)) continue;
    if (session?.id) byId.set(session.id, { ...session, messages: session.messages || [] });
  }
  for (const session of incoming) {
    if (!session?.id || isEmptyNormalSession(session)) continue;
    if (session.kind !== "memo" && deletedIds.has(session.id)) continue;
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
  const order = [...incoming, ...local].map((session) => session?.id).filter(Boolean) as string[];
  const used = new Set<string>();
  return order
    .filter((id) => {
      if (used.has(id)) return false;
      used.add(id);
      return !deletedIds.has(id) && byId.has(id);
    })
    .map((id) => byId.get(id));
}

export function createSessionSyncHandlers(access: StoreAccess) {
  async function GET() {
    return Response.json(access.read() || { sessions: [] });
  }

  async function POST(request: Request) {
    try {
      const body = await request.json();
      await access.write((store) => {
        const next = { ...body };
        const deletedIds = deletedIdSet(store.deletedSessionIds, body.deletedSessionIds);
        next.deletedSessionIds = Array.from(deletedIds);
        if (Array.isArray(body.sessions)) {
          next.sessions = mergeSessions(store.sessions as StoredSession[] | undefined, body.sessions, deletedIds);
        }
        Object.assign(store, next);
      });
      return Response.json({ ok: true });
    } catch {
      return Response.json({ ok: false, error: "保存失败" }, { status: 500 });
    }
  }

  return { GET, POST };
}
