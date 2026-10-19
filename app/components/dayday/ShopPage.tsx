"use client";

import { useState } from "react";
import { XpDialog } from "../XpDialog";
import { parseYuan, timeOf, dayLabel, dayKey, yuan, type Product, type Shelf } from "@/app/lib/dayday-ledger";
import { Art, Group, PhotoPicker, usePhoto } from "./DaydayParts";
import type { Dayday } from "./use-dayday";

type Area = "browse" | "cart" | "transit";
type Filter = "all" | "faved" | "carted";

/** Shelf chips shared by the shop and 我的物品, with ＋ for her own shelf. */
export function ShelfChips({ shelves, value, onChange, onAdd }: { shelves: Shelf[]; value: string; onChange: (id: string) => void; onAdd: () => void }) {
  return <div className="dd-chips" role="group" aria-label="分类">
    {[{ id: "all", label: "全部" }, ...shelves].map((s) => <button type="button" key={s.id} aria-pressed={value === s.id} onClick={() => onChange(s.id)}>{s.label}</button>)}
    <button type="button" className="dd-chip-add" onClick={onAdd} aria-label="加一个自定义分类">＋自定义</button>
  </div>;
}

export function ShelfDialog({ onSave, onClose }: { onSave: (label: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState("");
  return <XpDialog title="加一个分类" onClose={onClose} className="dd-dialog">
    <div className="dd-form"><label><span>名字</span><input value={label} maxLength={6} autoFocus placeholder="比如：包包" onChange={(e) => setLabel(e.target.value)} /></label></div>
    <div className="dd-dialog-buttons"><span /><button type="button" className="dd-btn" onClick={onClose}>取消</button>
      <button type="button" className="dd-btn is-pink" disabled={!label.trim()} onClick={() => { onSave(label.trim()); onClose(); }}>加上</button></div>
  </XpDialog>;
}

export function ShopPage({ dd, onAddShelf }: { dd: Dayday; onAddShelf: () => void }) {
  const { state, actions } = dd;
  const [area, setArea] = useState<Area>("browse");
  const [shelf, setShelf] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cart = state.products.filter((p) => p.carted);
  const shelfLabel = (id: string) => state.shelves.find((s) => s.id === id)?.label || "乱七八糟";
  const shown = state.products.filter((p) => (shelf === "all" || p.shelf === shelf) && (filter === "all" || p[filter]));
  const product = state.products.find((p) => p.id === open);

  return <>
    <div className="dd-tabs" role="tablist" aria-label="商城">
      {([["browse", "逛逛"], ["cart", `购物车${cart.length ? ` ${cart.length}` : ""}`], ["transit", `运输中${state.orders.length ? ` ${state.orders.length}` : ""}`]] as const).map(([id, label]) =>
        <button type="button" role="tab" key={id} aria-selected={area === id} onClick={() => setArea(id)}>{label}</button>)}
    </div>

    {area === "browse" && <div className="dd-tab-panel">
      <div className="dd-shop-head">
        <div className="dd-seg is-small" role="group" aria-label="筛选">
          {([["all", "全部"], ["faved", "♡ 已收藏"], ["carted", "已加购"]] as const).map(([id, label]) =>
            <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
        </div>
        <button type="button" className="dd-btn is-pink" onClick={() => setUploading(true)}>＋ 上传</button>
      </div>
      <ShelfChips shelves={state.shelves} value={shelf} onChange={setShelf} onAdd={onAddShelf} />
      {shown.length === 0 ? <p className="dd-empty">{state.products.length ? "这里还空着。" : "看到喜欢的就传上来，先放着慢慢挑。"}</p>
        : <div className="dd-grid">{shown.map((p) => <button type="button" className="dd-card" key={p.id} onClick={() => setOpen(p.id)}>
          <span className="dd-card-art"><Art image={p.image} shelf={p.shelf} name={p.name} />
            <span className="dd-badges">{p.faved && <em className="dd-chip is-pink">♡ 已收藏</em>}{p.carted && <em className="dd-chip is-blue">已加购</em>}</span>
            {p.susuSays && <i className="dd-said" title="酥酥说过话">酥</i>}
          </span>
          <span className="dd-card-name">{p.name}</span>
          <span className="dd-card-meta"><b>{yuan(p.price)}</b><small>{shelfLabel(p.shelf)}</small></span>
        </button>)}</div>}
    </div>}

    {area === "cart" && <div className="dd-tab-panel"><CartPanel dd={dd} products={cart} onDone={() => setArea("transit")} /></div>}

    {area === "transit" && <div className="dd-tab-panel">
      {state.orders.length === 0 ? <p className="dd-empty">没有在路上的东西。</p> : state.orders.map((o) => <div className="dd-row" key={o.id}>
        <Art image={o.image} shelf={o.shelf} name={o.name} className="is-thumb" />
        <span className="dd-row-text"><b>{o.name}</b><small>实付 {yuan(o.paid)} · {dayKey(o.at) === dd.today ? "今天" : dayLabel(dayKey(o.at))} {timeOf(o.at)} 下单</small></span>
        <span className="dd-row-actions">
          <button type="button" className="dd-btn" onClick={() => { if (window.confirm(`「${o.name}」退货？${yuan(o.paid)} 会退回来，这笔支出作废。`)) actions.returnOrder(o.id); }}>退货</button>
          <button type="button" className="dd-btn is-pink" onClick={() => actions.receive(o.id)}>确认收货</button>
        </span>
      </div>)}
      {state.orders.length > 0 && <p className="dd-hint">确认收货后会放进「我的物品」；退货就一键退款。</p>}
    </div>}

    {product && <ProductDialog dd={dd} product={product} shelfLabel={shelfLabel(product.shelf)} onClose={() => setOpen(null)} />}
    {uploading && <UploadDialog dd={dd} onAddShelf={onAddShelf} onClose={() => setUploading(false)} />}
  </>;
}

function CartPanel({ dd, products, onDone }: { dd: Dayday; products: Product[]; onDone: () => void }) {
  const [paid, setPaid] = useState<Record<string, string>>({});
  const value = (p: Product) => paid[p.id] ?? (p.price / 100).toString();
  const cents = products.map((p) => parseYuan(value(p)));
  const valid = cents.every((c) => c !== null);
  const total = cents.reduce<number>((sum, c) => sum + (c || 0), 0);
  const listed = products.reduce((sum, p) => sum + p.price, 0);
  const [busy, setBusy] = useState(false);
  async function order() {
    setBusy(true);
    const ok = await dd.actions.placeOrder(products.map((p, i) => ({ id: p.id, paid: cents[i] as number })));
    setBusy(false);
    if (ok) onDone();
  }

  if (products.length === 0) return <p className="dd-empty">购物车空空的。有计划了再把它加进来。</p>;
  return <>
    {products.map((p, i) => <div className="dd-row" key={p.id}>
      <Art image={p.image} shelf={p.shelf} name={p.name} className="is-thumb" />
      <span className="dd-row-text"><b>{p.name}</b><small>标价 {yuan(p.price)}</small>
        <label className="dd-paid">实付 ¥<input inputMode="decimal" value={value(p)} aria-invalid={cents[i] === null || undefined}
          onChange={(e) => setPaid({ ...paid, [p.id]: e.target.value })} /></label>
      </span>
      <button type="button" className="dd-x" aria-label={`把${p.name}移出购物车`} onClick={() => dd.actions.toggle(p.id, "carted")}>×</button>
    </div>)}
    <Group title="结算" className="dd-receipt">
      <p><span>标价合计</span><span>{yuan(listed)}</span></p>
      {valid && total !== listed && <p><span>{total < listed ? "省下" : "多付"}</span><span>{yuan(Math.abs(listed - total))}</span></p>}
      <p className="is-total"><span>实付</span><b>{valid ? yuan(total) : "—"}</b></p>
      <button type="button" className="dd-btn is-pink is-wide" disabled={!valid || busy} onClick={() => void order()}>{busy ? "下单中…" : "下单 · 先扣钱等收货"}</button>
    </Group>
  </>;
}

function ProductDialog({ dd, product, shelfLabel, onClose }: { dd: Dayday; product: Product; shelfLabel: string; onClose: () => void }) {
  const { actions } = dd;
  return <XpDialog title={product.name} onClose={onClose} className="dd-dialog is-wide">
    <Art image={product.image} shelf={product.shelf} name={product.name} className="is-big" />
    <div className="dd-detail-head"><b>{yuan(product.price)}</b><span className="dd-chip">{shelfLabel}</span>
      {product.link && <a href={product.link} target="_blank" rel="noreferrer">打开链接</a>}</div>
    <div className="dd-note-paper"><small>我为什么想要</small><p>{product.reason || "（还没写）"}</p></div>
    <div className="dd-susu-says"><span aria-hidden="true">酥</span><p>{product.susuSays || "酥酥还没看过这件。"}</p></div>
    <div className="dd-dialog-buttons">
      <button type="button" className="dd-btn is-danger" onClick={() => { if (window.confirm(`不要「${product.name}」了？`)) { actions.removeProduct(product.id); onClose(); } }}>删掉</button>
      <span />
      <button type="button" className={`dd-btn${product.faved ? " is-on" : ""}`} aria-pressed={product.faved} onClick={() => actions.toggle(product.id, "faved")}>{product.faved ? "♥ 已收藏" : "♡ 收藏"}</button>
      <button type="button" className={`dd-btn is-pink${product.carted ? " is-on" : ""}`} aria-pressed={product.carted} onClick={() => actions.toggle(product.id, "carted")}>{product.carted ? "✓ 已加购" : "加购物车"}</button>
    </div>
  </XpDialog>;
}

function UploadDialog({ dd, onAddShelf, onClose }: { dd: Dayday; onAddShelf: () => void; onClose: () => void }) {
  const photo = usePhoto();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shelf, setShelf] = useState(dd.state.shelves[0].id);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  async function save() {
    const cents = parseYuan(price);
    if (!name.trim()) { setError("给它起个名字。"); return; }
    if (!cents) { setError("价格写一个大于 0 的数。"); return; }
    if (link.trim() && !/^https?:\/\//.test(link.trim())) { setError("链接要以 http 或 https 开头。"); return; }
    setBusy(true);
    try {
      const image = await photo.upload();
      if (await dd.actions.addProduct({ name: name.trim(), price: cents, shelf, reason: reason.trim(), link: link.trim() || undefined, image })) onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "图片没传上去，再试一次。"); }
    setBusy(false);
  }
  return <XpDialog title="上传一件" onClose={onClose} className="dd-dialog">
    <PhotoPicker image={photo.image} onPick={photo.pick} />
    <div className="dd-form">
      <label><span>名称</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      <label><span>价格</span><input inputMode="decimal" placeholder="¥" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      <label><span>分类</span><span className="dd-select-row">
        <select value={shelf} onChange={(e) => setShelf(e.target.value)}>{dd.state.shelves.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <button type="button" className="dd-btn" onClick={onAddShelf}>＋</button></span></label>
      <label className="is-tall"><span>为什么想要</span><textarea rows={3} value={reason} maxLength={300} placeholder="写给酥酥看" onChange={(e) => setReason(e.target.value)} /></label>
      <label><span>链接</span><input value={link} placeholder="可以不填" onChange={(e) => setLink(e.target.value)} /></label>
    </div>
    {error && <p className="dd-error" role="alert">{error}</p>}
    <div className="dd-dialog-buttons"><span /><button type="button" className="dd-btn" onClick={onClose}>取消</button>
      <button type="button" className="dd-btn is-pink" disabled={busy} onClick={() => void save()}>{busy ? "正在放…" : "放进商城"}</button></div>
  </XpDialog>;
}
