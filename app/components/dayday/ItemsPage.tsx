"use client";

import { useState } from "react";
import { XpDialog } from "../XpDialog";
import { dayKey, parseYuan, yuan, type Item } from "@/app/lib/dayday-ledger";
import { Art, PhotoPicker, usePhoto } from "./DaydayParts";
import { ShelfChips } from "./ShopPage";
import type { Dayday } from "./use-dayday";

const fullDay = (key: string) => key.replaceAll("-", ".");

export function ItemsPage({ dd, onAddShelf }: { dd: Dayday; onAddShelf: () => void }) {
  const { state } = dd;
  const [shelf, setShelf] = useState("all");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const shown = state.items.filter((i) => shelf === "all" || i.shelf === shelf);
  const shelfLabel = (id: string) => state.shelves.find((s) => s.id === id)?.label || "乱七八糟";

  return <>
    <div className="dd-page-head">
      <div><h2>我的物品</h2><p>一共 {state.items.length} 件 · 商城收到的会自己跑进来</p></div>
      <button type="button" className="dd-btn is-pink" onClick={() => setAdding(true)}>＋ 添加</button>
    </div>
    <ShelfChips shelves={state.shelves} value={shelf} onChange={setShelf} onAdd={onAddShelf} />
    {shown.length === 0 ? <p className="dd-empty">这一格还空着。</p>
      : <div className="dd-grid is-items">{shown.map((item) => <button type="button" className="dd-card is-polaroid" key={item.id} onClick={() => setOpen(item)}>
        <span className="dd-card-art"><Art image={item.image} shelf={item.shelf} name={item.name} />
          {item.fromShop && <span className="dd-badges"><em className="dd-chip is-yellow">商城来的</em></span>}</span>
        <span className="dd-card-name">{item.name}</span>
        <span className="dd-card-meta"><small>{fullDay(item.gotAt)}</small>{item.paid ? <b>{yuan(item.paid)}</b> : <small>—</small>}</span>
      </button>)}</div>}

    {adding && <ItemDialog dd={dd} onAddShelf={onAddShelf} onClose={() => setAdding(false)} />}
    {open && <XpDialog title={open.name} onClose={() => setOpen(null)} className="dd-dialog is-wide">
      <Art image={open.image} shelf={open.shelf} name={open.name} className="is-big" />
      <div className="dd-detail-head">{open.paid ? <b>{yuan(open.paid)}</b> : <b className="is-muted">没记价格</b>}<span className="dd-chip">{shelfLabel(open.shelf)}</span><small>{fullDay(open.gotAt)} 入手</small></div>
      {open.note && <div className="dd-note-paper"><small>备注</small><p>{open.note}</p></div>}
      <div className="dd-dialog-buttons">
        <button type="button" className="dd-btn is-danger" onClick={() => { if (window.confirm(`把「${open.name}」从物品里拿掉？`)) { dd.actions.removeItem(open.id); setOpen(null); } }}>拿掉</button>
        <span /><button type="button" className="dd-btn" onClick={() => setOpen(null)}>关上</button>
      </div>
    </XpDialog>}
  </>;
}

function ItemDialog({ dd, onAddShelf, onClose }: { dd: Dayday; onAddShelf: () => void; onClose: () => void }) {
  const photo = usePhoto();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [shelf, setShelf] = useState(dd.state.shelves[1]?.id || dd.state.shelves[0].id);
  const [paid, setPaid] = useState("");
  const [gotAt, setGotAt] = useState(dayKey());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function save() {
    const cents = paid.trim() ? parseYuan(paid) : undefined;
    if (!name.trim()) { setError("给它起个名字。"); return; }
    if (cents === null) { setError("价格不对，不记的话就空着。"); return; }
    setBusy(true);
    try {
      const image = await photo.upload();
      if (await dd.actions.addItem({ name: name.trim(), shelf, paid: cents, gotAt, note: note.trim() || undefined, image })) onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "图片没传上去，再试一次。"); }
    setBusy(false);
  }
  return <XpDialog title="添加物品" onClose={onClose} className="dd-dialog">
    <PhotoPicker image={photo.image} onPick={photo.pick} />
    <div className="dd-form">
      <label><span>名称</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      <label><span>分类</span><span className="dd-select-row">
        <select value={shelf} onChange={(e) => setShelf(e.target.value)}>{dd.state.shelves.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <button type="button" className="dd-btn" onClick={onAddShelf}>＋</button></span></label>
      <label><span>价格</span><input inputMode="decimal" placeholder="不记得可以不填" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
      <label><span>入手</span><input type="date" value={gotAt} max={dayKey()} onChange={(e) => setGotAt(e.target.value)} /></label>
      <label><span>备注</span><input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} /></label>
    </div>
    <p className="dd-hint">原来就有的东西加在这里不会记账。</p>
    {error && <p className="dd-error" role="alert">{error}</p>}
    <div className="dd-dialog-buttons"><span /><button type="button" className="dd-btn" onClick={onClose}>取消</button>
      <button type="button" className="dd-btn is-pink" disabled={busy} onClick={() => void save()}>{busy ? "正在放…" : "放进来"}</button></div>
  </XpDialog>;
}
