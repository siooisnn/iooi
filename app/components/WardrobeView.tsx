"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WardrobeGlyph } from "./RetroDesktop";
import { XpDialog } from "./XpDialog";
import type { Settings } from "../lib/app-settings";
import { apiFetch } from "../lib/client-api";
import { prepareImageForUpload } from "../lib/image-compress";
import {
  CATEGORY_LABELS, OUTFIT_SLOTS, SLOT_LABELS, WARDROBE_CATEGORIES, WARDROBE_LIMITS,
  WARDROBE_SHAPES, slotOf, type Outfit, type OutfitSlot, type WardrobeCategory, type WardrobeItem,
} from "../lib/wardrobe";

// Real clothes, side by side on a little outfit board. The existing wardrobe
// and selected-outfit data stay intact, including older colour/shape metadata.
type Reply = { ok: boolean; error?: string; items?: WardrobeItem[]; outfit?: Outfit; item?: WardrobeItem };
type Tab = "all" | WardrobeCategory;

async function wardrobeApi(init: RequestInit = {}): Promise<Reply> {
  let response: Response;
  try { response = await apiFetch("/api/wardrobe", init); }
  catch { throw new Error("连不上衣柜，看看网络再试。"); }
  const data = await response.json().catch(() => null) as Reply | null;
  if (!response.ok || !data?.ok) throw new Error(data?.error || "衣柜出了点问题，请稍后再试。");
  return data;
}

function postWardrobe(body: Record<string, unknown>) {
  return wardrobeApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function uploadPhoto(file: File) {
  const form = new FormData();
  form.append("file", file);
  let response: Response;
  try { response = await apiFetch("/api/upload", { method: "POST", body: form }); }
  catch { throw new Error("照片没传上去，看看网络再试。"); }
  const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "照片没传上去。");
  return data.url;
}

function ClothingGlyph({ slot }: { slot: OutfitSlot }) {
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {slot === "top" ? <><path d="m23 14-13 7 7 12 7-4v23h16V29l7 4 7-12-13-7" /><path d="M23 14c1 11 17 11 18 0" /></>
      : slot === "outer" ? <><path d="m24 12-11 8-5 32h10l4-24-2 25h24l-2-25 4 24h10l-5-32-11-8" /><path d="m24 12 8 13-7 4 7 8m8-25-8 13 7 4-7 8v16" /></>
      : slot === "bottom" ? <><path d="M23 13h18l9 39H14z" /><path d="M22 18h20M25 24l-4 23m11-23v23m7-23 4 23" /></>
      : <><path d="M13 27h14l5 13 15 5v9H12V39z" /><path d="M14 34h12m-13 14h34M37 26h10l4 12" /></>}
  </svg>;
}

function GarmentPhoto({ item, src = item?.photo || "" }: { item?: WardrobeItem; src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src
    // Uploaded photos have arbitrary sizes and are served by the authenticated upload route.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={item?.name || "衣服照片"} draggable={false} onError={() => setFailedSrc(src)} />
    : <span className="wd-photo-placeholder"><ClothingGlyph slot={item ? slotOf(item.category) : "top"} />
      <small>{src ? "照片暂时打不开" : "还没有照片"}</small></span>;
}

function GarmentDialog({ item, category, onClose, onSave, onDelete }: {
  item: WardrobeItem | null; category: WardrobeCategory; onClose: () => void;
  onSave: (input: Record<string, unknown>) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [form, setForm] = useState({ category: item?.category || category, name: item?.name || "", note: item?.note || "" });
  const [photo, setPhoto] = useState({ src: item?.photo || "", file: null as File | null });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef("");
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  async function pickPhoto(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) { setError("要选一张图片。"); return; }
    setBusy("正在读照片…"); setError("");
    try {
      const ready = await prepareImageForUpload(file);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(ready);
      setPhoto({ src: objectUrl.current, file: ready });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "照片打不开，请换一张。"); }
    finally { setBusy(""); }
  }

  async function save() {
    if (busy) return;
    setError("");
    try {
      let url = photo.src ? item?.photo || "" : "";
      if (photo.file) { setBusy("正在传照片…"); url = await uploadPhoto(photo.file); }
      setBusy("正在放进衣柜…");
      // Keep the existing API's metadata for old items; new ones receive its defaults.
      const sameCategory = item?.category === form.category;
      await onSave({ ...form, photo: url,
        shape: sameCategory ? item.shape : WARDROBE_SHAPES[form.category][0].id,
        colors: item?.colors || ["#c8b6a6", "#8a6f5c"],
        ...(item ? {} : { pattern: "solid" }),
      });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "没存上，请再试一次。"); setBusy(""); }
  }

  return <XpDialog title={item ? `「${item.name}」` : "放一件衣服进来"} onClose={onClose} className="wd-dialog">
    <form className="rd-form wd-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="wd-photo-editor"><div className="wd-photo-preview"><GarmentPhoto item={item || undefined} src={photo.src} /></div>
        <div className="wd-photo-actions"><button type="button" className="rd-button" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>{photo.src ? "换照片" : "选照片"}</button>
          {photo.src && <button type="button" className="rd-button" disabled={Boolean(busy)} onClick={() => setPhoto({ src: "", file: null })}>移除照片</button>}
        </div><small>平铺照片、挂拍，或商品截图都可以。</small>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      <fieldset className="wd-field"><legend>分类</legend><div className="wd-chips">
        {WARDROBE_CATEGORIES.map((key) => <button type="button" key={key} disabled={Boolean(busy)} aria-pressed={form.category === key}
          onClick={() => setForm((current) => ({ ...current, category: key }))}>{CATEGORY_LABELS[key]}</button>)}
      </div></fieldset>
      <label><span>名字</span><input value={form.name} disabled={Boolean(busy)} maxLength={WARDROBE_LIMITS.name} placeholder="给这件衣服取个名字"
        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <label className="wd-note"><span>备注</span><textarea value={form.note} disabled={Boolean(busy)} maxLength={WARDROBE_LIMITS.note} rows={3}
        placeholder="在哪买的、多少钱、配什么好看…" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
      {error && <p className="rd-error" role="alert">{error}</p>}
      <div className="rd-dialog-buttons wd-buttons">
        {item && <button type="button" className="rd-button wd-delete" disabled={Boolean(busy)} onClick={async () => {
          if (!window.confirm(`把「${item.name}」从衣柜里拿走？`)) return;
          setBusy("正在拿走…");
          try { await onDelete(); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "没删掉，请再试一次。"); setBusy(""); }
        }}>拿走</button>}
        <button type="submit" className="rd-button rd-button-default" disabled={Boolean(busy)}>{busy || (item ? "保存" : "放进衣柜")}</button>
        <button type="button" className="rd-button" disabled={Boolean(busy)} onClick={onClose}>取消</button>
      </div>
    </form>
  </XpDialog>;
}

export function WardrobeView({ settings, onBack }: { settings: Settings; onBack: () => void }) {
  const herName = settings.userName || "宝宝";
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [outfit, setOutfit] = useState<Outfit>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<{ item: WardrobeItem | null } | null>(null);
  const saving = useRef(false);
  const apply = useCallback((reply: Reply) => {
    if (reply.items) setItems(reply.items);
    if (reply.outfit) setOutfit(reply.outfit);
  }, []);
  useEffect(() => {
    let alive = true;
    wardrobeApi().then((reply) => { if (alive) apply(reply); })
      .catch((error: Error) => { if (alive) setNotice(error.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apply]);

  const byId = new Map(items.map((item) => [item.id, item]));
  const selected = new Set(Object.values(outfit));
  const shown = tab === "all" ? items : items.filter((item) => item.category === tab);
  const counts = Object.fromEntries(WARDROBE_CATEGORIES.map((key) => [key, items.filter((item) => item.category === key).length])) as Record<WardrobeCategory, number>;

  async function choose(next: Outfit) {
    if (saving.current) return;
    saving.current = true;
    const before = outfit;
    setOutfit(next); setBusy(true);
    try { apply(await postWardrobe({ action: "wear", outfit: next })); setNotice(""); }
    catch (failure) { setOutfit(before); setNotice(failure instanceof Error ? failure.message : "搭配没存上，请再试一次。"); }
    finally { saving.current = false; setBusy(false); }
  }

  function toggle(item: WardrobeItem) {
    const slot = slotOf(item.category);
    const next = { ...outfit };
    if (next[slot] === item.id) delete next[slot]; else next[slot] = item.id;
    void choose(next);
  }

  return <div className="xp-summer-screen rd-screen wd-screen">
    <section className="xp-summer-window" aria-label="wardrobe">
      <header className="xp-summer-titlebar"><span className="rd-title-icon"><WardrobeGlyph /></span><h1>{herName}的衣柜 - wardrobe</h1>
        <div className="xp-summer-controls"><i className="xp-summer-window-button xp-summer-min" aria-hidden="true" /><i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
          <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口" onClick={onBack}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div>
      </header>
      <div className="rd-toolbar"><button type="button" className="rd-tool" disabled={loading || busy} onClick={() => setEditing({ item: null })}><span aria-hidden="true">＋</span> 放衣服</button>
        <button type="button" className="rd-tool" disabled={loading || busy || !selected.size} onClick={() => { void choose({}); }}>清空搭配</button>
        <span className="rd-toolbar-note">{items.length} 件</span></div>
      {notice && <div className="rd-notice" role="alert"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
      <div className="rd-content wd-content">
        <section className="wd-stage" aria-label="搭配板">
          <div className="wd-board-heading"><div><small>OUTFIT NOTES</small><h2>今天这样搭</h2></div><span>{busy ? "保存中…" : loading ? "正在打开…" : selected.size ? `${selected.size} 件 · 已保存` : "从衣柜里选几件"}</span></div>
          <div className="wd-board">
            {OUTFIT_SLOTS.map((slot) => {
              const item = outfit[slot] ? byId.get(outfit[slot]!) : undefined;
              return <div key={slot} className={`wd-board-piece wd-board-${slot}${item ? " has-item" : ""}`}>
                <span className="wd-board-label">{SLOT_LABELS[slot]}</span>
                <button type="button" className="wd-board-photo" disabled={loading || busy} aria-label={item ? `查看${item.name}` : `选择${SLOT_LABELS[slot]}`}
                  onClick={() => { if (item) setEditing({ item }); else setTab(slot === "bottom" ? "all" : slot); }}>
                  {item ? <GarmentPhoto item={item} /> : <span className="wd-board-empty"><ClothingGlyph slot={slot} /><small>选一件{SLOT_LABELS[slot]}</small></span>}
                </button>
                {item && <div className="wd-board-caption"><span>{item.name}</span><button type="button" disabled={busy} aria-label={`移出${item.name}`} onClick={() => {
                  const next = { ...outfit }; delete next[slot]; void choose(next);
                }}>×</button></div>}
              </div>;
            })}
          </div>
          <p className="wd-board-hint">把喜欢的几件放在一起，看看颜色和感觉。</p>
        </section>
        <section className="wd-closet" aria-label="衣柜">
          <div className="wd-closet-heading"><h2>我的衣服</h2><span>点一件，加入这套</span></div>
          <div className="rd-tabs wd-tabs" role="tablist" aria-label="分类">
            {(["all", ...WARDROBE_CATEGORIES] as Tab[]).map((key) => <button type="button" role="tab" id={`wardrobe-tab-${key}`} aria-controls="wardrobe-panel" key={key} aria-selected={tab === key}
              onClick={() => setTab(key)}>{key === "all" ? "全部" : CATEGORY_LABELS[key]}{key !== "all" && counts[key] ? ` ${counts[key]}` : ""}</button>)}
          </div>
          <div id="wardrobe-panel" className="rd-tab-panel wd-panel" role="tabpanel" aria-labelledby={`wardrobe-tab-${tab}`}>
            {loading ? <p className="rd-muted rd-loading" role="status">正在打开衣柜…</p>
              : !shown.length ? <div className="rd-empty"><WardrobeGlyph /><p>{items.length ? `还没有${CATEGORY_LABELS[tab as WardrobeCategory]}。` : "把你的第一件衣服放进来。"}</p>
                <small>留住真实照片，慢慢搭出自己的衣柜。</small><button type="button" className="rd-button" onClick={() => setEditing({ item: null })}>选一张照片</button></div>
              : <ul className="wd-grid">{shown.map((item) => {
                const on = selected.has(item.id);
                return <li key={item.id} className={on ? "is-on" : undefined}>
                  <button type="button" className="wd-tile" aria-pressed={on} disabled={busy} onClick={() => toggle(item)} title={on ? "移出这套搭配" : "加入这套搭配"}>
                    <span className="wd-tile-art"><GarmentPhoto item={item} /></span><span className="wd-tile-name">{item.name}</span><span className="wd-tile-category">{CATEGORY_LABELS[item.category]}</span>
                    {on && <i className="wd-tile-on">这套</i>}</button>
                  <button type="button" className="wd-tile-edit" disabled={busy} aria-label={`编辑${item.name}`} onClick={() => setEditing({ item })}>✎</button>
                </li>;
              })}</ul>}
          </div>
        </section>
      </div>
      <footer className="xp-summer-statusbar"><span>{busy ? "正在保存搭配…" : "点衣服组合搭配，✎ 修改照片和备注"}</span><span>今天穿什么呢</span></footer>
    </section>
    {editing && <GarmentDialog key={editing.item?.id || "new"} item={editing.item} category={tab === "all" ? "top" : tab} onClose={() => setEditing(null)}
      onSave={async (input) => {
        const reply = editing.item ? await postWardrobe({ action: "edit", id: editing.item.id, item: input }) : await postWardrobe({ action: "add", item: input });
        apply(reply);
        if (!editing.item && reply.item && tab !== "all" && tab !== reply.item.category) setTab(reply.item.category);
        setEditing(null); setNotice("");
      }} onDelete={async () => { apply(await postWardrobe({ action: "delete", id: editing.item!.id })); setEditing(null); }} />}
  </div>;
}
