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

// One verified, untagged historical anomaly. Exact fingerprint only: do not
// generalize to English or planning-like language. Stored history stays intact.
const KNOWN_BAD_REPLY = "ca11ce247b834388bc7f56d1781ece18f5a78cbb08caf082ccfa36b15d783686";
export function excludeAbnormalReply(message: { role: string; content?: unknown }): boolean {
  if (message.role !== "assistant" || typeof message.content !== "string") return false;
  return message.content.startsWith(ABNORMAL_REPLY_NOTICE) || hasInternalReplyTag(message.content)
    || createHash("sha256").update(message.content.trim()).digest("hex") === KNOWN_BAD_REPLY;
}
