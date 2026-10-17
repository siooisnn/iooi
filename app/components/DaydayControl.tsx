"use client";

import { useEffect, useRef, useState } from "react";
import { getDayday, postDayday } from "../lib/dayday-client";

export function DaydayControl() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void getDayday().then((state) => { if (alive) setEnabled(state.enabled); }).catch((e) => { if (alive) setMessage(e.message); }); };
    refresh(); window.addEventListener("dayday:changed", refresh);
    return () => { alive = false; window.removeEventListener("dayday:changed", refresh); };
  }, []);
  async function toggle() {
    if (lock.current || enabled === null) return;
    lock.current = true; setBusy(true);
    try { const state = await postDayday("configure", { enabled: !enabled }); setEnabled(state.enabled); setMessage(state.enabled ? "dayday 已开启，按生活时段醒来；每月15日发2000。" : "dayday 已关闭：不唤醒、不购物、不发月度额度。已有记录和物品保留。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "保存失败"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="settings-group"><h2 className="settings-group-title">day day</h2><p className="settings-hint">酥酥的生活小商城。默认关闭；关闭时不触发 dayday 唤醒，MCP 也不能购物或存取款。商品管理在 dayday → 设置。</p><button type="button" className={`model-option ${enabled ? "model-option-active" : ""}`} disabled={enabled === null || busy} aria-pressed={enabled === true} onClick={() => { void toggle(); }}><span className="model-option-dot" />{busy ? "保存中…" : enabled === null ? "读取中…" : enabled ? "On" : "Off"}</button>{message && <p className="settings-hint" role="status">{message}</p>}</div>;
}
