"use client";

import { useEffect, useRef, useState } from "react";

export type UsageMessage = { index: number; role: "user" | "assistant"; content: string; speaker?: string; media?: boolean };

export function ContextUsageRing({ kind, sessionId, project, messages, systemPrompt = "" }: {
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
    const controller = new AbortController();
    fetch("/api/context-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-iooi-token": localStorage.getItem("iooi-token") || "" },
      body: JSON.stringify({ kind, sessionId, project, messages, systemPrompt }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("usage unavailable");
      return response.json();
    }).then((data) => setUsage(data)).catch(() => { if (!controller.signal.aborted) setUsage(null); });
    return () => controller.abort();
  }, [kind, sessionId, project, messages, systemPrompt]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const fraction = usage ? Math.min(1, usage.tokens / usage.budget) : 0;
  const percent = usage ? Math.round(100 * fraction) : null;
  const label = kind === "group" ? "群聊" : "工作模式";
  return (
    <div className="context-usage-control" ref={rootRef}>
      <button type="button" className="context-usage-ring" onClick={() => setOpen((value) => !value)}
        aria-label={`${label}上下文用量${percent === null ? "暂不可用" : `约 ${percent}%`}`}
        aria-expanded={open} title="查看上下文用量">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle className="context-usage-track" cx="16" cy="16" r="12" />
          <circle className="context-usage-progress" cx="16" cy="16" r="12"
            style={{ strokeDasharray: `${(fraction * 75.4).toFixed(1)} 75.4` }} />
        </svg>
        <span>{percent === null ? "·" : percent}</span>
      </button>
      {open && <div className="context-usage-popover" role="dialog" aria-label={`${label}上下文用量`}>
        <b>{label}上下文</b>
        <p>{usage ? `约 ${Math.round(usage.tokens).toLocaleString("zh-CN")} / ${Math.round(usage.budget / 1000)}k tokens` : "暂时无法估算用量"}</p>
        <p>{kind === "group" ? "达到 100k 前会自动整理较早群聊。" : "达到 150k 前会自动整理较早工作对话。"}</p>
        {usage?.until ? <p>较早内容已整理为摘要。</p> : null}
        <small>输入量估算，图片按预留量计算；与模型实际计数可能不同。</small>
      </div>}
    </div>
  );
}
