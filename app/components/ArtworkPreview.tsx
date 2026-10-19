"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { XpDialog } from "./XpDialog";
import { apiFetch } from "../lib/client-api";
import { artworkDocument, type Artwork, type ArtworkDraft } from "../lib/artworks";

export function downloadArtwork(artwork: ArtworkDraft) {
  const url = URL.createObjectURL(new Blob([artwork.html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${artwork.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 70) || "小作品"}.html`;
  link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function sendArtwork(action: string, input: Record<string, unknown>) {
  const response = await apiFetch("/api/artworks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, action }) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "作品没存上，再试一次。");
  window.dispatchEvent(new Event("artworks-change"));
  return data.result as Artwork;
}
export function ArtworkPreview({ artwork, onClose, onSaved }: { artwork: ArtworkDraft & { id?: string }; onClose: () => void; onSaved?: (item: Artwork) => void }) {
  const [view, setView] = useState<"preview" | "source">("preview");
  const [size, setSize] = useState<"phone" | "desktop">("phone");
  const [run, setRun] = useState(0);
  const [title, setTitle] = useState(artwork.title);
  const [saved, setSaved] = useState(Boolean(artwork.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy || saved) return;
    setBusy(true); setError("");
    try { const item = await sendArtwork("save", { title, html: artwork.html }); setTitle(item.title); setSaved(true); onSaved?.(item); }
    catch (e) { setError(e instanceof Error ? e.message : "没存上。"); }
    finally { setBusy(false); }
  }
  return createPortal(<div className="rd-screen aw-screen aw-dialog-host"><XpDialog title={artwork.title} onClose={onClose} className="aw-preview">
    <div className="aw-toolbar">
      <div className="aw-tabs" role="tablist" aria-label="作品视图">
        <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => setView("preview")}>效果</button>
        <button type="button" role="tab" aria-selected={view === "source"} onClick={() => setView("source")}>源码</button>
      </div>
      <div className="aw-size" role="group" aria-label="预览尺寸"><button type="button" aria-pressed={size === "phone"} onClick={() => setSize("phone")}>手机</button><button type="button" aria-pressed={size === "desktop"} onClick={() => setSize("desktop")}>电脑</button></div>
      <button type="button" onClick={() => setRun((n) => n + 1)}>重新运行</button>
      <button type="button" onClick={() => downloadArtwork({ ...artwork, title })}>下载 HTML</button>
    </div>
    <div className="aw-canvas" role="tabpanel">
      {view === "source" ? <pre className="aw-source">{artwork.html}</pre> : <iframe key={run} title={`${artwork.title} · 作品效果`} srcDoc={artworkDocument(artwork.html)} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'" className={`aw-frame is-${size}`} />}
    </div>
    <div className="aw-save"><label>作品名<input value={title} maxLength={80} disabled={saved} onChange={(e) => setTitle(e.target.value)} /></label><button type="button" disabled={busy || saved || !title.trim()} onClick={() => void save()}>{saved ? "已在作品盒" : busy ? "保存中…" : "存进作品盒"}</button></div>
    <p className="aw-preview-note">保存作品本身，重新打开时从头运行。</p>
    {error && <p className="aw-error" role="alert">{error}</p>}
  </XpDialog></div>, document.body);
}
