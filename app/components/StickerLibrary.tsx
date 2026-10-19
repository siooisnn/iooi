"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client-api";
import type { Sticker } from "../lib/stickers";
import { XpDialog } from "./XpDialog";

export function StickerLibrary({ onClose, onSelect }: { onClose: () => void; onSelect: (sticker: Sticker) => void }) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [manage, setManage] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState<Array<{ id: string; file: File; name: string; preview: string }>>([]);
  const previews = useRef<string[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { const urls = previews.current; return () => { urls.forEach((url) => URL.revokeObjectURL(url)); }; }, []);
  useEffect(() => {
    let alive = true;
    void apiFetch("/api/stickers", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (!d.ok) throw new Error(d.error || "表情库打不开。");
      setStickers(d.stickers); setLoaded(true);
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);
  function chooseFiles(files: File[]) {
    setError("");
    const picked = files.map((file) => {
      const preview = URL.createObjectURL(file); previews.current.push(preview);
      return { id: crypto.randomUUID(), file, preview, name: file.name.replace(/\.[^.]+$/, "").slice(0, 32) };
    });
    setUploads((current) => [...current, ...picked]);
  }
  async function upload() {
    setBusy(true); setError("");
    try {
      for (const item of uploads) {
        const form = new FormData(); form.append("file", item.file); form.append("name", item.name.trim());
        const r = await apiFetch("/api/stickers", { method: "POST", body: form });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(`${item.file.name}：${d.error || "上传失败"}`);
        setStickers(d.stickers); setLoaded(true);
        setUploads((current) => current.filter((u) => u.id !== item.id));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "没上传成功。"); }
    finally { setBusy(false); if (picker.current) picker.current.value = ""; }
  }
  async function change(action: "rename" | "remove", sticker: Sticker) {
    setBusy(true); setError("");
    try {
      const r = await apiFetch("/api/stickers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: sticker.id, name: drafts[sticker.id] ?? sticker.name }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "没存上。");
      setStickers(d.stickers);
    } catch (e) { setError(e instanceof Error ? e.message : "没存上。"); }
    finally { setBusy(false); }
  }
  return <div className="rd-screen dd-screen sticker-library-host"><XpDialog title="你和酥酥的表情包" className="sticker-library" onClose={() => { if (!busy) onClose(); }}>
    <div className="sticker-library-tools">
      <button type="button" disabled={busy || !loaded} onClick={() => picker.current?.click()}>{busy ? "正在保存…" : "＋ 上传表情"}</button>
      <button type="button" disabled={busy} aria-pressed={manage} onClick={() => setManage(!manage)}>{manage ? "完成管理" : "管理"}</button>
      <input ref={picker} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { if (e.target.files?.length) chooseFiles(Array.from(e.target.files)); e.target.value = ""; }} />
    </div>
    {uploads.length > 0 && <form className="sticker-upload-form" onSubmit={(e) => { e.preventDefault(); void upload(); }}>
      <b>给新表情填名字</b>
      <div className="sticker-upload-list">{uploads.map((u, index) => <label key={u.id}>
        <img src={u.preview} alt="待上传的表情" />
        <input required maxLength={32} autoFocus={index === 0} disabled={busy} aria-label={`表情名字：${u.file.name}`} placeholder="比如：抱抱、开心、委屈" value={u.name} onChange={(e) => setUploads((current) => current.map((item) => item.id === u.id ? { ...item, name: e.target.value } : item))} />
        <button type="button" disabled={busy} aria-label={`取消上传${u.file.name}`} onClick={() => setUploads((current) => current.filter((item) => item.id !== u.id))}>×</button>
      </label>)}</div>
      <div className="sticker-library-tools"><button type="submit" disabled={busy || uploads.some((u) => !u.name.trim())}>{busy ? "正在上传…" : "保存到表情库"}</button><button type="button" disabled={busy} onClick={() => setUploads([])}>取消</button></div>
    </form>}
    <p className="sticker-library-hint">{manage ? "把名字改成含义，如「开心」「抱抱」，酥酥更好挑。移出库不会删除历史图片。" : "点选后加入待发送区，可以和文字一起发送。支持动图，每张最多5MB，共100张。"}</p>
    {error && <p role="alert" className="sticker-library-error">{error}</p>}
    {!loaded && !error && <p>正在打开表情库…</p>}
    {loaded && !stickers.length && <p>还没有表情包，先传几张吧～</p>}
    <div className={`sticker-library-grid${manage ? " is-managing" : ""}`}>
      {stickers.map((s) => <div key={s.id} className="sticker-library-item">
        <button type="button" className="sticker-library-image" title={s.name} aria-label={`选择表情：${s.name}`} disabled={busy || manage} onClick={() => onSelect(s)}><img src={s.url} alt={s.name} loading="lazy" /></button>
        {manage ? <><input value={drafts[s.id] ?? s.name} maxLength={32} aria-label="表情含义" onChange={(e) => setDrafts({ ...drafts, [s.id]: e.target.value })} /><div className="sticker-library-item-actions"><button type="button" disabled={busy} onClick={() => void change("rename", s)}>保存</button><button type="button" disabled={busy} onClick={() => void change("remove", s)}>移出</button></div></> : <small>{s.name}</small>}
      </div>)}
    </div>
  </XpDialog></div>;
}
