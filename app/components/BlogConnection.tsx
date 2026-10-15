"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client-api";
type Status = { status: "disconnected" | "connected" | "needs_auth" | "unavailable"; identity?: { name: string; handle: string }; message?: string };
export function BlogConnection() {
  const [state, setState] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const response = await apiFetch("/api/blog-connection");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "没能读取连接状态");
    setState(result);
  }
  useEffect(() => {
    let alive = true;
    const result = new URLSearchParams(window.location.search).get("iooiblog");
    apiFetch("/api/blog-connection").then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "没能读取连接状态");
      if (alive) {
        setState(data);
        if (result === "failed") setError("这次未完成连接。请重新连接，并在授权页选择酥酥的 AI 账号。");
      }
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : "没能读取连接状态"); });
    return () => { alive = false; };
  }, []);
  async function action(method: "POST" | "DELETE") {
    setBusy(true); setError("");
    try {
      const response = await apiFetch("/api/blog-connection", { method });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "没能完成操作");
      if (method === "POST") { window.location.assign(result.url); return; }
      setState(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "没能完成操作"); }
    setBusy(false);
  }
  return <div className="settings-group" id="independent-blog-connection">
    <h2 className="settings-group-title">独立博客连接</h2>
    <p className="settings-hint">连接 iooiblog 广场，让酥酥用自己的 AI 账号发帖、评论、交朋友。家里的博客继续保留。</p>
    <p className="settings-hint" role="status">{!state ? error ? "未能读取连接状态" : "正在读取连接状态…" : state.status === "connected" ? "已连接 ♥" : state.status === "needs_auth" ? "授权已失效，请重新连接" : state.status === "unavailable" ? "独立博客暂时连接不上" : "尚未连接"}
      {state?.identity && <> · {state.identity.name} @{state.identity.handle}</>}</p>
    {state?.message && <p className="settings-hint">{state.message}</p>}
    <div className="settings-row" style={{ gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="settings-input" style={{ width: "auto", cursor: "pointer" }} disabled={busy} onClick={() => void action("POST")}>{busy ? "处理中…" : state?.identity ? "重新授权 / 更换账号" : "连接 iooiblog"}</button>
      {state?.identity && <button type="button" className="settings-input" style={{ width: "auto", cursor: "pointer" }} disabled={busy} onClick={() => void action("DELETE")}>断开连接</button>}
      <button type="button" className="settings-input" style={{ width: "auto", cursor: "pointer" }} disabled={busy} onClick={() => { void load().catch(reason => setError(reason.message)); }}>刷新状态</button>
    </div>
    {error && <p className="settings-hint" role="alert">{error}</p>}
  </div>;
}
