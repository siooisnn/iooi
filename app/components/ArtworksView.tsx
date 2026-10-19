"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client-api";
import type { Artwork } from "../lib/artworks";
import { ArtworkPreview, downloadArtwork, sendArtwork } from "./ArtworkPreview";

export function ArtworkGlyph() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 11h28v18H2z" fill="#7ab5e9" stroke="#285a9e" /><path d="M1 7h12l3 4h15v5H1z" fill="#a7d7ff" stroke="#285a9e" /><path d="m18 13 2 4 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#ffdd75" stroke="#b98732" /><path d="M5 19h4v6H5z" fill="#ffd5e6" /></svg>;
}
export function ArtworksView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<Artwork | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    let ticket = 0;
    async function reload() {
      const mine = ++ticket;
      try {
        const response = await apiFetch("/api/artworks", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "作品盒暂时打不开。");
        if (alive && mine === ticket) { setItems(data.items); setError(""); }
      } catch (e) { if (alive && mine === ticket) setError(e instanceof Error ? e.message : "作品盒暂时打不开。"); }
      finally { if (alive && mine === ticket) setLoading(false); }
    }
    const visible = () => { if (document.visibilityState === "visible") void reload(); };
    void reload();
    window.addEventListener("artworks-change", reload); document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("artworks-change", reload); document.removeEventListener("visibilitychange", visible); };
  }, []);
  async function act(action: string, item: Artwork) {
    if (busy) return;
    setBusy(true); setError("");
    try { const result = await sendArtwork(action, { id: item.id, title }); setItems((list) => list.map((a) => a.id === result.id ? result : a)); setEditing(null); }
    catch (e) { setError(e instanceof Error ? e.message : "这次没存上。"); }
    finally { setBusy(false); }
  }
  const shown = items.filter((a) => Boolean(a.removedAt) === archived);
  return <div className="xp-summer-screen rd-screen dd-screen aw-screen"><section className="xp-summer-window" aria-label="作品盒">
    <header className="xp-summer-titlebar"><span className="dd-title-icon"><ArtworkGlyph /></span><h1>作品盒</h1><div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭作品盒" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div></header>
    <div className="dd-strip"><b>作品盒</b><span>把聊天里的小惊喜收在这里</span></div>
    <div className="dd-body">
      <div className="aw-tabs" role="tablist" aria-label="作品分类"><button type="button" role="tab" aria-selected={!archived} onClick={() => setArchived(false)}>我的作品</button><button type="button" role="tab" aria-selected={archived} onClick={() => setArchived(true)}>收起的</button></div>
      {error && <p className="aw-error" role="alert">{error}</p>}
      {loading ? <p className="dd-empty">正在打开作品盒…</p> : !shown.length ? <div className="aw-empty"><ArtworkGlyph /><p>{archived ? "这里还没有收起的作品。" : "作品盒还空着。"}</p><small>普通聊天里点“预览小作品”，再点“存进作品盒”。</small></div> : <div className="aw-grid">{shown.map((a) => <article className="aw-item" key={a.id}>
        <button type="button" className="aw-cover" onClick={() => setOpen(a)} aria-label={`打开${a.title}`}><ArtworkGlyph /><span>HTML 小作品</span></button>
        {editing === a.id ? <form className="aw-rename" onSubmit={(e) => { e.preventDefault(); void act("rename", a); }}><input value={title} maxLength={80} aria-label="新作品名" onChange={(e) => setTitle(e.target.value)} /><button disabled={busy || !title.trim()}>保存</button><button type="button" onClick={() => setEditing(null)}>取消</button></form> : <h2>{a.title}</h2>}
        <time>{new Date(a.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</time>
        <div className="aw-item-actions"><button type="button" onClick={() => setOpen(a)}>打开</button><button type="button" onClick={() => downloadArtwork(a)}>下载</button><button type="button" disabled={busy} onClick={() => { setEditing(a.id); setTitle(a.title); }}>改名</button><button type="button" disabled={busy} onClick={() => void act(archived ? "restore" : "remove", a)}>{archived ? "放回来" : "收起"}</button></div>
      </article>)}</div>}
    </div>
    <footer className="xp-summer-statusbar"><span>{shown.length} 件作品</span><span>只在打开后运行</span></footer>
  </section>{open && <ArtworkPreview artwork={open} onClose={() => setOpen(null)} />}</div>;
}
