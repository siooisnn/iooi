"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client-api";
import { CLAWD_STORAGE_KEY } from "../lib/clawd-pet";
import type { ClawdSnapshot } from "../lib/clawd-shared";

export function useClawd() {
  const [state, setState] = useState<ClawdSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const ticket = useRef(0);
  const alive = useRef(true);
  const pendingRequest = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    async function reload() {
      const mine = ++ticket.current;
      try {
        let response = await apiFetch("/api/clawd", { cache: "no-store" });
        let data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "小砖暂时没连上。");
        if (!data.pet) {
          let pet: unknown = null;
          let visits: unknown = [];
          try { pet = JSON.parse(localStorage.getItem(CLAWD_STORAGE_KEY) || "null"); visits = JSON.parse(localStorage.getItem("iooi-clawd-log") || "[]"); }
          catch { throw new Error("本机的小砖记录暂时读不出来，已保留原记录，先不迁移。"); }
          response = await apiFetch("/api/clawd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "initialize", pet, visits }) });
          data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || "小砖还没搬过来。");
        }
        if (!disposed && mine === ticket.current) { setState(data); setReady(true); setError(""); }
      } catch (e) { if (!disposed && mine === ticket.current) setError(e instanceof Error ? e.message : "小砖暂时没连上。"); }
    }
    const visible = () => { if (document.visibilityState === "visible" && !lock.current) void reload(); };
    void reload();
    const timer = window.setInterval(visible, 30_000);
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; alive.current = false; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);

  async function send(action: string, input: Record<string, unknown> = {}) {
    if (lock.current || !ready) return null;
    lock.current = true; setBusy(true); setError(""); ++ticket.current;
    const signature = JSON.stringify({ action, input });
    const requestId = pendingRequest.current?.signature === signature ? pendingRequest.current.id : crypto.randomUUID();
    pendingRequest.current = { signature, id: requestId };
    try {
      const response = await apiFetch("/api/clawd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, action, requestId }), signal: AbortSignal.timeout(60_000) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "这次没存上。");
      pendingRequest.current = null;
      if (alive.current) { ++ticket.current; setState(data); window.dispatchEvent(new Event("clawd-change")); }
      return data as ClawdSnapshot & { reply?: string; refusal?: string };
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "小砖暂时没连上。"); return null; }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return { state, ready, error, busy, send };
}
