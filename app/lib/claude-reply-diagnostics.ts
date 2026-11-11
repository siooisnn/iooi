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
  appendDiagnostic({ at: new Date().toISOString(), model, blocked, ...summarizeClaudeReply(stdout, result) }, directory);
}

function appendDiagnostic(row: object, directory: string) {
  try {
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "claude-reply-diagnostics.jsonl");
    if (existsSync(path) && statSync(path).size >= 256 * 1024) renameSync(path, `${path}.1`);
    appendFileSync(path, `${JSON.stringify(row)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
  } catch {
    // Diagnostic failure must not turn a completed tool operation into a retry.
    console.error("[claude-reply-diagnostics] could not save response evidence");
  }
}

export type ClaudeFailurePhase = "spawn" | "exit" | "timeout" | "abort" | "output_limit" | "parse" | "result" | "integrity";

type ClaudeFailure = {
  phase: ClaudeFailurePhase;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
};

// Only fixed error labels and numeric status codes leave this parser. Never
// retain raw stderr/errors: providers may echo prompts, image data or tokens.
export function summarizeClaudeFailure(stdout: string, stderr: string, failure: ClaudeFailure) {
  const providerErrors = new Set<string>();
  const httpStatuses = new Set<number>();
  const categories = new Set<string>();
  let hasResult = false;
  let resultIsError = false;
  let resultSubtype: string | undefined;
  const knownErrors = ["invalid_request_error", "authentication_error", "permission_error", "not_found_error",
    "request_too_large", "rate_limit_error", "api_error", "overloaded_error"];
  const inspectText = (text: string) => {
    for (const name of knownErrors) {
      if (new RegExp(`\\b${name}\\b`).test(text)) providerErrors.add(name);
    }
    for (const match of text.matchAll(/\b(?:HTTP(?:\/[\d.]+)?(?:\s+(?:status|error))?|API\s+Error|status(?:\s+code)?)\s*[:=]?\s*([45]\d{2})\b/gi)) {
      httpStatuses.add(Number(match[1]));
    }
    if (/reasoning_extraction/i.test(text)) categories.add("reasoning_extraction");
    if (/\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE)\b/.test(text)
      || /fetch failed|connection (?:closed|reset|refused)/i.test(text)) categories.add("connection");
  };
  const inspectError = (value: unknown, depth = 0) => {
    if (depth > 4) return;
    if (typeof value === "string") inspectText(value);
    else if (Array.isArray(value)) value.slice(0, 20).forEach((entry) => inspectError(entry, depth + 1));
    else if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      for (const key of ["status", "status_code"]) {
        if (typeof row[key] === "number" && Number.isInteger(row[key]) && row[key] >= 400 && row[key] <= 599) httpStatuses.add(row[key]);
      }
      for (const key of ["type", "code", "message", "error", "errors"]) inspectError(row[key], depth + 1);
    }
  };
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== "object") continue;
      if (row.type === "result") {
        hasResult = true;
        resultIsError = row.is_error === true;
        if (["success", "error_during_execution", "error_max_turns", "error_max_budget_usd", "error_max_structured_output_retries"].includes(row.subtype)) resultSubtype = row.subtype;
        if (row.is_error === true) { inspectError(row.errors); inspectError(row.result); inspectError(row.error); }
      } else if (row.type === "error") inspectError(row);
      // Do not inspect assistant/thinking/tool text for supposed error codes.
    } catch { /* Parse failure is represented by phase, never by the raw line. */ }
  }
  inspectText(stderr);
  if (failure.error) inspectText(failure.error.message);
  return {
    phase: failure.phase, exitCode: failure.exitCode ?? null, signal: failure.signal ?? null,
    hasResult, resultIsError, ...(resultSubtype ? { resultSubtype } : {}),
    providerErrors: [...providerErrors].sort(), httpStatuses: [...httpStatuses].sort(), categories: [...categories].sort(),
  };
}

export function recordClaudeFailure(stdout: string, stderr: string, model: string, failure: ClaudeFailure, directory = join(process.cwd(), "data")) {
  try {
    appendDiagnostic({ at: new Date().toISOString(), kind: "failure", model,
      ...summarizeClaudeFailure(stdout, stderr, failure) }, directory);
  } catch {
    console.error("[claude-reply-diagnostics] could not summarize failure evidence");
  }
}
