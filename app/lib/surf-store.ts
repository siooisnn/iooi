// The forum on disk (surf.json), and what he can do there with his own hands:
// the MCP tools (work mode, claude.ai, his own time) and his own time's
// automatic thread all come through here. Her page goes through /api/surf.

import { readStore, readSurfStore, withStore, withSurfStore } from "@/app/lib/store";
import { addLifeEntry, ensureLifeLog } from "@/app/lib/life-log";
import { hisName } from "@/app/lib/blog-him";
import { describePushResult, sendPushToAll } from "@/app/lib/push";
import { addThread, findThread, readBoard, replyThread, surfHost, waitingForHim } from "@/app/lib/surf-board";
import type { SurfThread } from "@/app/lib/surf-board";

/** His own threads from another window, per CST day. His own time posts through life-beat, one per go. */
export const HIS_THREADS_PER_DAY = 5;

export function listBoard() {
  return readBoard(readSurfStore());
}

export function getThread(id: string) {
  return findThread(readSurfStore(), id);
}

function cstDay(ms: number) {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

function clock(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function me() {
  return hisName(((readStore() || {}).settings || {}) as Record<string, unknown>);
}

async function notify(title: string, body: string) {
  try {
    const push = await sendPushToAll({ title, body: body.replace(/\s+/g, " ").slice(0, 100) });
    console.info(`[surf] ${title} · ${describePushResult(push)}`);
  } catch {}
}

async function logSurf(entry: { text: string; ref: string; links?: SurfThread["links"]; source: "life" | "elsewhere" }) {
  await withStore((store) => {
    ensureLifeLog(store);
    addLifeEntry(store, { kind: "surf", ...entry, ...(entry.source === "elsewhere" ? { note: "在别的窗口里" } : {}) });
  }).catch(() => undefined);
}

const who = (value: "her" | "him") => (value === "her" ? "她" : "你");

/** The board for him: every thread with floors and who spoke last. */
export function boardDigest(threads: SurfThread[], max = 20) {
  if (!threads.length) return "论坛上还没有帖子。";
  const waiting = new Set(waitingForHim(threads).map((thread) => thread.id));
  const lines = threads.slice(0, max).map((thread) => {
    const last = thread.replies[thread.replies.length - 1];
    const tail = last ? `最后回帖：${who(last.who)} ${clock(last.at)}` : "还没人回";
    return `- [${thread.id}] 《${thread.title}》 楼主：${who(thread.who)} · ${thread.replies.length} 条回帖 · ${tail}${waiting.has(thread.id) ? " · 等你回" : ""}`;
  });
  return [`论坛共 ${threads.length} 个帖子，按最后回帖排：`, ...lines, threads.length > max ? `……还有 ${threads.length - max} 个更早的。` : ""]
    .filter(Boolean).join("\n");
}

/** One thread, floor by floor. */
export function threadText(thread: SurfThread) {
  const links = thread.links.map((link) => `  · ${link.title} ${link.url}${link.why ? `\n    ${link.why}` : ""}`);
  return [
    `《${thread.title}》 id=${thread.id}`,
    `1楼 楼主 ${who(thread.who)} · ${clock(thread.at)}`,
    thread.content || "（只贴了链接）",
    ...(links.length ? ["链接：", ...links] : []),
    ...thread.replies.map((reply, index) => `\n${index + 2}楼 ${who(reply.who)} · ${clock(reply.at)} · reply_id=${reply.id}\n${reply.content}`),
  ].join("\n");
}

/**
 * A thread from him. `push` off when the caller pushes for itself (his own
 * time already sends "上线网络冲浪了").
 */
export async function postFromHim(
  input: { title?: unknown; content?: unknown; links?: unknown },
  { source, push = true }: { source: "life" | "elsewhere"; push?: boolean },
): Promise<SurfThread> {
  const thread = await withSurfStore((store) => {
    const today = cstDay(Date.now());
    if (source === "elsewhere"
      && readBoard(store).filter((item) => item.who === "him" && item.source === "elsewhere" && cstDay(item.at) === today).length >= HIS_THREADS_PER_DAY) {
      throw new Error(`今天已经发了 ${HIS_THREADS_PER_DAY} 个帖子，明天再发吧。`);
    }
    return addThread(store, { who: "him", source, title: input.title, content: input.content, links: input.links });
  });
  await logSurf({
    text: `在论坛发了帖《${thread.title}》${thread.links.length ? `，贴了 ${thread.links.map((link) => surfHost(link.url) || link.title).join("、")}` : ""}`,
    ref: thread.id,
    links: thread.links,
    source,
  });
  if (push) await notify(`${me()}在论坛发了新帖`, thread.title);
  return thread;
}

export async function replyFromHim(threadId: string, content: unknown, source: "life" | "elsewhere") {
  const { thread, reply } = await withSurfStore((store) => replyThread(store, threadId, "him", content));
  await logSurf({ text: `在论坛回了帖《${thread.title}》（${thread.replies.length + 1} 楼）`, ref: thread.id, source });
  await notify(`${me()}回了帖子`, `《${thread.title}》${reply.content}`);
  return { thread, reply };
}
