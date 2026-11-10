import { createHash } from "crypto";

export const ABNORMAL_REPLY_NOTICE = "这次回复异常，已停止显示，也没有自动重试。你可以手动重试；如本轮调用过工具，请先查看操作记录，避免重复执行。";

export class AbnormalReplyError extends Error {
  constructor() {
    super(ABNORMAL_REPLY_NOTICE);
    this.name = "AbnormalReplyError";
  }
}

// Match actual protocol tags, not English prose or quoted/code examples.
const INTERNAL_TAG = /^<\/?(?:thinking_mode|reasoning_extraction)(?:\s[^<>]*)?>$/i;

/** Holds incomplete tags/delimiters across chunks; never emits internal tags. */
export function createReplyIntegrityGuard() {
  let pending = "";
  let code = "";
  let blocked = false;
  function push(chunk: string, flush = false): string {
    if (blocked) return "";
    pending += chunk;
    let out = "";
    while (pending) {
      const first = pending[0];
      if (first === "`" || first === "~") {
        const run = pending.match(first === "`" ? /^`+/ : /^~+/)![0];
        if (run.length === pending.length && !flush) break;
        if (first === "`" || run.length >= 3) {
          if (!code) code = run;
          else if (code === run) code = "";
        }
        out += run;
        pending = pending.slice(run.length);
      } else if (!code && first === "<") {
        const end = pending.indexOf(">");
        if (end < 0 && pending.length < 96 && !flush) break;
        const tag = end < 0 ? "" : pending.slice(0, end + 1);
        if (INTERNAL_TAG.test(tag) || (end < 0 && /^<\/?(?:thinking_mode|reasoning_extraction)(?:\s|$)/i.test(pending))) {
          blocked = true;
          pending = "";
          return "";
        }
        out += first;
        pending = pending.slice(1);
      } else {
        out += first;
        pending = pending.slice(1);
      }
    }
    return out;
  }
  return { push, finish: () => push("", true), get blocked() { return blocked; } };
}

export function hasInternalReplyTag(text: string): boolean {
  const guard = createReplyIntegrityGuard();
  guard.push(text);
  guard.finish();
  return guard.blocked;
}

// Verified paragraph fingerprints only. Values are UTF-16 offsets to the real
// answer; null excludes a planning-only paragraph. No private text is stored
// in source. Work on model-bound copies, including bubbles joined by the client.
const CONFIRMED_CONTEXT_PREFIXES: Readonly<Record<string, number | null | undefined>> = {
  ca11ce247b834388bc7f56d1781ece18f5a78cbb08caf082ccfa36b15d783686: 266,
  be5cb3aab44457ae1410567cc1e3d2943cf480532372f3db6f53e42e638a4c27: null,
  "35edbf7c3fcbfd030b70dcea80b79af9d4c3cc2ac9b88075d6fb76ffd04cdc41": 314,
};

export function cleanReplyContext<T extends { role: string; content?: unknown }>(
  message: T,
  prefixes = CONFIRMED_CONTEXT_PREFIXES,
): T | null {
  if (message.role !== "assistant" || typeof message.content !== "string") return message;
  if (message.content.startsWith(ABNORMAL_REPLY_NOTICE) || hasInternalReplyTag(message.content)) return null;
  let changed = false;
  let fence = "";
  const paragraphs = message.content.split(/\n{2,}/).flatMap((paragraph) => {
    const quoted = Boolean(fence);
    for (const match of paragraph.matchAll(/^[ \t]*(`{3,}|~{3,})/gm)) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = "";
    }
    if (quoted) return [paragraph];
    const text = paragraph.trim();
    const offset = prefixes[createHash("sha256").update(text).digest("hex")];
    if (offset === undefined) return [paragraph];
    changed = true;
    return offset === null ? [] : [text.slice(offset).trim()].filter(Boolean);
  });
  if (!changed) return message;
  const content = paragraphs.join("\n\n").trim();
  return content ? { ...message, content } : null;
}

export function excludeAbnormalReply(message: { role: string; content?: unknown }): boolean {
  return cleanReplyContext(message) === null;
}
