"use client";

import { useState } from "react";
import NextImage from "next/image";
import type { FormEvent } from "react";
import { XpDialog } from "./XpDialog";
import { DaydayHumanAccount } from "./DaydayHumanAccount";
import { DaydayChips, DaydayFold } from "./DaydayPocket";
import { DAYDAY_CATEGORIES, daydayDiscountText, money, type DaydayProduct, type DaydaySnapshot } from "../lib/dayday";
import { apiFetch } from "../lib/client-api";
import { prepareImageForUpload } from "../lib/image-compress";

const PAGE = 30;
type Mutate = (action: string, input: Record<string, unknown>, message?: string) => Promise<boolean>;
function ProductEditor({ product, busy, mutate, onClose, notice }: {
  product: DaydayProduct | null; busy: boolean; mutate: Mutate; onClose: () => void; notice: string;
}) {
  const [name, setName] = useState(product?.name || "");
  const [category, setCategory] = useState(product?.category || "饮食");
  const [price, setPrice] = useState(product ? money(product.price) : "");
  const [tiers, setTiers] = useState((product?.discountTiers || []).map((t) => ({ quantity: String(t.quantity), discount: String(t.percent / 10) })));
  const [description, setDescription] = useState(product?.description || "");
  const [photo, setPhoto] = useState(product?.photo || "");
  const [stock, setStock] = useState(product?.stock === null || product?.stock === undefined ? "" : String(product.stock));
  const [usage, setUsage] = useState(product?.usage ? String(product.usage.amount) : "");
  const [unit, setUnit] = useState<"day" | "month">(product?.usage?.unit || "month");
  const [active, setActive] = useState(product?.active !== false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  async function upload(file: File) {
    setUploading(true); setError("");
    try {
      const body = new FormData(); body.append("file", await prepareImageForUpload(file));
      const response = await apiFetch("/api/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "图片上传失败。");
      setPhoto(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : "图片上传失败。"); }
    finally { setUploading(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || uploading) return;
    const saved = await mutate("save_product", { ...(product ? { id: product.id, expectedUpdatedAt: product.updatedAt } : {}), name, category, price, description, photo,
      discountTiers: tiers.map((t) => ({ quantity: Number(t.quantity), percent: Math.round(Number(t.discount) * 10) })),
      stock: stock === "" ? null : Number(stock), active, usage: category === "日用" && usage ? { amount: Number(usage), unit } : null }, "商品已保存，历史订单价格与消耗规则保持原样。");
    if (saved) onClose(); else setFailed(true);
  }
  return <XpDialog title={product ? "修改商品" : "上传新商品"} onClose={onClose} className="dd-dialog"><form className="dd-form" onSubmit={(e) => { void submit(e); }}>
    <fieldset disabled={busy || uploading}>
      <label>商品照片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>
      {photo && <div className="dd-edit-photo"><NextImage src={photo} alt="商品预览" width={180} height={180} unoptimized /><button type="button" onClick={() => setPhoto("")}>移除照片</button></div>}
      <label>名称<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：100g 牙膏" /></label>
      <label>分类<select aria-label="分类" value={category} onChange={(e) => setCategory(e.target.value)}>{[...DAYDAY_CATEGORIES, ...(product && !DAYDAY_CATEGORIES.includes(product.category as typeof DAYDAY_CATEGORIES[number]) ? [product.category] : [])].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      {category === "日用" && <label>每份可用时长（留空则不自动消耗）<div className="dd-inline"><input aria-label="每份可用时长" type="number" min="1" max={unit === "month" ? 120 : 3650} step="1" value={usage} onChange={(e) => setUsage(e.target.value)} /><select aria-label="时长单位" value={unit} onChange={(e) => setUnit(e.target.value as "day" | "month")}><option value="month">个月</option><option value="day">天</option></select></div><small>例如 100g 牙膏填 2 个月，一提卫生纸填 1 个月。多份依次使用。</small></label>}
      <div className="dd-two"><label>单价（元）<input required type="number" min="0" max="9999999.99" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label><label>库存<input type="number" min="0" max="1000000" step="1" placeholder="留空＝不限量" value={stock} onChange={(e) => setStock(e.target.value)} /></label></div>
      <div className="dd-pricing"><label>计价方式<select aria-label="计价方式" value={tiers.length ? "tiered" : "single"} onChange={(e) => setTiers(e.target.value === "single" ? [] : [{ quantity: "2", discount: "9" }])}><option value="single">每件按单价</option><option value="tiered">单价＋多件折扣</option></select></label>
        {tiers.map((t, index) => <div className="dd-discount-row" key={index}><label>满几件<input required type="number" min="2" max="99" step="1" value={t.quantity} onChange={(e) => setTiers(tiers.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} /></label><label>享几折<input required type="number" min="0.1" max="9.9" step="0.1" value={t.discount} onChange={(e) => setTiers(tiers.map((row, i) => i === index ? { ...row, discount: e.target.value } : row))} /></label><button type="button" className="dd-link" onClick={() => setTiers(tiers.filter((_, i) => i !== index))}>移除</button></div>)}
        {tiers.length > 0 && <><small>同款达到件数后全部打折，自动使用最优惠档。例：单价10元，满2件9折，共18元。</small><button type="button" className="dd-link" disabled={tiers.length >= 8} onClick={() => setTiers([...tiers, { quantity: String(Math.min(99, Math.max(...tiers.map((t) => Number(t.quantity) || 2)) + 1)), discount: "8" }])}>＋ 添加一档折扣</button></>}
      </div>
      <label>说明<textarea maxLength={2000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="dd-setting"><span>上架商品</span><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /></label>
      {product?.category === "饮食" && category !== "饮食" && <p className="dd-muted">分类变更只影响以后下的订单；原饮食订单仍不可退。</p>}
      <button type="submit" className="dd-primary">{busy ? "保存中…" : "保存商品"}</button>
    </fieldset>
    {uploading && <p role="status">正在上传图片…</p>}{error && <p role="alert">{error}</p>}{failed && <p role="alert">{notice}</p>}
  </form></XpDialog>;
}

export function DaydayManager({ state, mutate, busy, notice }: { state: DaydaySnapshot; mutate: Mutate; busy: boolean; notice: string }) {
  const [editing, setEditing] = useState<{ product: DaydayProduct | null } | null>(null);
  const [category, setCategory] = useState("全部");
  const [shown, setShown] = useState(PAGE);
  // Only categories that hold products; a stale filter falls back to 全部.
  const categories = [...new Set([...DAYDAY_CATEGORIES, ...state.products.map((p) => p.category)])].filter((c) => state.products.some((p) => p.category === c));
  const current = category === "全部" || categories.includes(category) ? category : "全部";
  const visible = current === "全部" ? state.products : state.products.filter((p) => p.category === current);
  // Same full save as the editor, so stock and price checks stay in one place.
  const toggle = (p: DaydayProduct) => mutate("save_product", { id: p.id, expectedUpdatedAt: p.updatedAt, name: p.name, category: p.category, price: money(p.price), description: p.description, photo: p.photo,
    discountTiers: p.discountTiers || [], stock: p.stock, usage: p.usage, active: !p.active }, p.active ? `「${p.name}」已下架，商城里不再显示。` : `「${p.name}」已重新上架。`);
  const remove = async (p: DaydayProduct) => {
    if (!window.confirm(`删除「${p.name}」？删除后不能恢复，商城和这里都不再显示。已买过的订单、物品和收支统计会保留。只是暂时不卖的话，可以点「下架」。`)) return;
    await mutate("delete_product", { id: p.id }, `「${p.name}」已删除，历史订单保持原样。`);
  };
  return <>
    <DaydayHumanAccount state={state} />
    <section className="dd-paper"><h3>首次额度</h3><p className="dd-muted">由你手动发放一次 ¥2000，独立于每月15日的额度；关闭期间也可先准备好。不会自动开启 dayday。</p>
      {state.initialGrant ? <p className="dd-muted">已发放 ¥{money(state.initialGrant.amount)} · {new Date(state.initialGrant.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p> : <button type="button" className="dd-primary" disabled={busy} onClick={() => { if (window.confirm("给酥酥发放一次首次额度 ¥2000？不影响以后每月15日的额度，也不会开启 dayday。")) void mutate("initial_grant", {}, "首次额度 ¥2000 已到账，仅可发放一次。"); }}>发放首次额度 ¥2000</button>}
    </section>
    <DaydayFold title="分类与商品管理" meta={`${state.products.length} 件`}
      action={<button type="button" className="dd-primary dd-fold-action" disabled={busy} onClick={(e) => { e.preventDefault(); setEditing({ product: null }); }}>＋ 上传商品</button>}>
      <p className="dd-muted">选择分类，设置单价、多件折扣、库存和日用品消耗时长。「下架」先藏起来，以后还能上架；「删除」会彻底移除，买过的订单不受影响。</p>
      {state.products.length > 0 && <DaydayChips label="按分类查看商品" value={current} onChange={(id) => { setCategory(id); setShown(PAGE); }}
        options={[{ id: "全部", name: "全部", count: state.products.length }, ...categories.map((c) => ({ id: c, name: c, count: state.products.filter((p) => p.category === c).length }))]} />}
      {!state.products.length ? <p className="dd-empty">还没有商品，先布置酥酥的小货架吧。</p> : !visible.length ? <p className="dd-empty">这个分类还没有商品。</p> : visible.slice(0, shown).map((p) => <div className="dd-setting" key={p.id}><span><b>{p.name}</b><small>{p.category} · ¥{money(p.price)} · {p.stock === null ? "不限量" : `库存 ${p.stock}`}{daydayDiscountText(p) ? ` · ${daydayDiscountText(p)}` : ""} · {p.active ? "已上架" : "已下架"}{p.usage ? ` · 每份 ${p.usage.amount}${p.usage.unit === "month" ? "个月" : "天"}` : ""}</small></span><span className="dd-setting-actions"><button type="button" className="dd-link" disabled={busy} onClick={() => setEditing({ product: p })}>编辑</button><button type="button" className="dd-link" disabled={busy} onClick={() => { void toggle(p); }}>{p.active ? "下架" : "上架"}</button><button type="button" className="dd-link dd-danger" disabled={busy} onClick={() => { void remove(p); }}>删除</button></span></div>)}
      {shown < visible.length && <button type="button" className="dd-link dd-fold-more" onClick={() => setShown(shown + PAGE)}>再看 {Math.min(PAGE, visible.length - shown)} 件（还有 {visible.length - shown}）</button>}
    </DaydayFold>
    <section className="dd-paper"><h3>生活心跳与通知</h3><p className="dd-muted">总开关在控制面板 → day day。关闭时不唤醒、不发月度额度；已有日用品继续按购买规则计算余量。</p>
      {([{ key: "meals", label: "早、中、晚考虑吃饭" }, { key: "walks", label: "白天与晚间逛一逛" }, { key: "notify", label: "下单、退款、余额不足和客服通知" }] as const).map(({ key, label }) => <label className="dd-setting" key={key}><span>{label}</span><input type="checkbox" disabled={busy} checked={state.routine[key]} onChange={(e) => { void mutate("configure", { routine: { [key]: e.target.checked } }, "生活安排已保存。"); }} /></label>)}
      <label className="dd-setting"><span>每天最多几次生活机会<small>沿用现有半小时心跳；错过时段不集中补醒。</small></span><select disabled={busy} aria-label="每天生活唤醒机会" value={state.routine.times} onChange={(e) => { void mutate("configure", { routine: { times: Number(e.target.value) } }, "生活次数已保存。"); }}>{Array.from({ length: 10 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n} 次</option>)}</select></label>
      <p className="dd-muted">吃饭时段：08、12、18 点；默认另有 10、15、20、22 点逛街机会。仅逛街或不活动只写日志。</p>
    </section>
    <section className="dd-paper"><h3>额度与活动规则</h3><p className="dd-muted">每月15日发放 ¥2000，上月结余叠加；关闭期间不发、不补发。存取银行由酥酥自己决定。活期暂不计息。</p><p className="dd-muted">饮食不可退；不含饮食的订单购买后10分钟内可整单退回实际付款。优惠券、满减和单件退款本次不开放。</p></section>
    {editing && <ProductEditor product={editing.product} busy={busy} mutate={mutate} notice={notice} onClose={() => setEditing(null)} />}
  </>;
}
