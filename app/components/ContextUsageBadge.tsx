"use client";

import { useEffect, useRef, useState } from "react";

export type UsageMessage = { index: number; role: "user" | "assistant"; content: string; speaker?: string; media?: boolean };

// A small "37%" pill beside the header's right-hand control. It is absolutely
// positioned (see .context-usage-control) so it never pushes the centred
// avatar, room name or group title off the middle of the header.
export function ContextUsageBadge({ kind, sessionId, project, messages, systemPrompt = "" }: {
  kind: "group" | "work";
  sessionId: string;
  project?: "iooi" | "summer";
  messages: UsageMessage[];
  systemPrompt?: string;
}) {
  const [usage, setUsage] = useState<{ tokens: number; budget: number; until: number } | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Messages change on every streamed chunk; wait until they settle.
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/context-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-iooi-token": localStorage.getItem("iooi-token") || "" },
        body: JSON.stringify({ kind, sessionId, project, messages, systemPrompt }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("usage unavailable");
        return response.json();
      }).then((data) => setUsage(data)).catch(() => { if (!controller.signal.aborted) setUsage(null); });
    }, 600);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, sessionId, project, messages, systemPrompt]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const percent = usage && usage.budget > 0 ? Math.min(100, Math.round((100 * usage.tokens) / usage.budget)) : null;
  const label = kind === "group" ? "群聊" : "工作模式";
  return (
    <div className="context-usage-control" ref={rootRef}>
      <button type="button" className="context-usage-badge" onClick={() => setOpen((value) => !value)}
        aria-label={`${label}上下文用量${percent === null ? "暂不可用" : `约 ${percent}%`}`}
        aria-expanded={open} title="查看上下文用量">
        {percent === null ? "—" : `${percent}%`}
      </button>
      {open && <div className="context-usage-popover" role="dialog" aria-label={`${label}上下文用量`}>
        <b>{label}上下文 {percent === null ? "" : `${percent}%`}</b>
        <p>{usage ? `约 ${Math.round(usage.tokens).toLocaleString("zh-CN")} / ${Math.round(usage.budget / 1000)}k tokens` : "暂时无法估算用量"}</p>
        <p>{kind === "group" ? "到 100k 前会自动整理较早的群聊。" : "到 150k 前会自动整理较早的工作对话。"}</p>
        {usage?.until ? <p>较早内容已整理成摘要。</p> : null}
        <small>按输入量估算，图片按预留量算，和模型实际计数可能有出入。</small>
      </div>}
    </div>
  );
}
