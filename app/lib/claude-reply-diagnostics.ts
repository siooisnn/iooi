import { appendFileSync, chmodSync, existsSync, mkdirSync, renameSync, statSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

/** Bounded response evidence only: never prompt, thinking, tool input or credentials. */
export function summarizeClaudeReply(stdout: string, result: string) {
  const types: Record<string, number> = {};
  let textStart = "";
  let textEnd = "";
  let textLength = 0;
  let assistantText = "";
  const count = (name: unknown) => {
    if (typeof name !== "string" || !/^[a-z_]{1,48}$/.test(name) || Object.keys(types).length >= 40) return;
    types[name] = (types[name] || 0) + 1;
  };
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line);
      count(value.type);
      if (value.type === "assistant" && Array.isArray(value.message?.content)) {
        assistantText = value.message.content.filter((block: { type?: string; text?: unknown }) => block.type === "text" && typeof block.text === "string")
          .map((block: { text: string }) => block.text).join("\n");
      }
      if (value.type !== "stream_event") continue;
      count(value.event?.type);
      count(value.event?.content_block?.type);
      count(value.event?.delta?.type);
      if (value.event?.delta?.type === "text_delta" && typeof value.event.delta.text === "string") {
        const text = value.event.delta.text;
        textLength += text.length;
        textStart = (textStart + text).slice(0, 512);
        textEnd = (textEnd + text).slice(-512);
      }
    } catch { /* Malformed lines are counted without retaining their content. */ }
  }
  return { types, textLength, textStart, textEnd, assistantTextStart: assistantText.slice(0, 512),
    assistantTextLength: assistantText.length, resultLength: result.length,
    resultHash: createHash("sha256").update(result).digest("hex"),
    resultStart: result.slice(0, 1024), resultEnd: result.length > 1024 ? result.slice(-512) : "" };
}

export function recordClaudeReply(stdout: string, result: string, model: string, blocked: boolean, directory = join(process.cwd(), "data")) {
  try {
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "claude-reply-diagnostics.jsonl");
    if (existsSync(path) && statSync(path).size >= 256 * 1024) renameSync(path, `${path}.1`);
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), model, blocked, ...summarizeClaudeReply(stdout, result) })}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
  } catch {
    // Diagnostic failure must not turn a completed tool operation into a retry.
    console.error("[claude-reply-diagnostics] could not save response evidence");
  }
}
