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
  return [
    message.role || "",
    message.time || "",
    message.date || "",
    message.content || "",
    message.image || "",
    message.file || "",
  ].join("\u0001");
}

function mergeMessages(local: StoredMessage[] = [], incoming: StoredMessage[] = []) {
  const merged = [...local];
  const seen = new Set(merged.map(messageKey));
  for (const message of incoming) {
    const key = messageKey(message);
    if (!seen.has(key)) {
      merged.push(message);
      seen.add(key);
    }
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
