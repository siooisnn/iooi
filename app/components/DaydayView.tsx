"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { DaydayGlyph } from "./RetroDesktop";
import { XpDialog } from "./XpDialog";
import { DaydayManager } from "./DaydayManager";
import type { Settings } from "../lib/app-settings";
import { money, type DaydayProduct, type DaydaySnapshot } from "../lib/dayday";
import { getDayday, postDayday } from "../lib/dayday-client";

const PAGES = [
  { id: "shop", name: "商城", icon: "⌂" }, { id: "cart", name: "购物车", icon: "🛒" },
  { id: "bank", name: "银行", icon: "▤" }, { id: "mine", name: "我的", icon: "♡" },
  { id: "settings", name: "设置", icon: "⚙" },
] as const;
type Page = typeof PAGES[number]["id"];
const BAG_KEY = "iooi:dayday:bag:v2";
const ICONS: Record<string, string> = { 饮食: "🍱", 衣物: "👕", 日用: "🧻", 书籍: "📖", 小砖专属: "🎁" };
const date = (at: number) => new Date(at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

export function DaydayView({ settings, onBack, onOpenHeartbeat }: {
  settings: Settings; onBack: () => void; onOpenHeartbeat: () => void;
}) {
  const [page, setPage] = useState<Page>("shop");
  const [category, setCategory] = useState("全部");
  const [area, setArea] = useState("购物区");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<DaydaySnapshot | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [wishes, setWishes] = useState<string[]>([]);
  const [product, setProduct] = useState<DaydayProduct | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [page]);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void getDayday().then((data) => { if (alive && !lock.current) setState(data); }).catch((e) => { if (alive) setNotice(e.message); }); };
    refresh();
    const frame = requestAnimationFrame(() => {
      try {
        const raw = JSON.parse(localStorage.getItem(BAG_KEY) || "{}");
        const clean: Record<string, number> = {};
        for (const [id, count] of Object.entries(raw.cart || {})) if (typeof count === "number" && Number.isInteger(count) && count > 0 && count <= 99) clean[id] = count;
        setCart(clean); setWishes(Array.isArray(raw.wishes) ? raw.wishes.filter((id: unknown) => typeof id === "string") : []);
      } catch {}
    });
    window.addEventListener("focus", refresh);
    return () => { alive = false; cancelAnimationFrame(frame); window.removeEventListener("focus", refresh); };
  }, []);
  function saveBag(nextCart: Record<string, number>, nextWishes = wishes) {
    setCart(nextCart); setWishes(nextWishes);
    try { localStorage.setItem(BAG_KEY, JSON.stringify({ cart: nextCart, wishes: nextWishes })); }
    catch { setNotice("本机存储不可用，购物车与心愿单仅在当前页面保留。"); }
  }
  function quantity(id: string, amount: number) {
    const next = { ...cart };
    if (amount <= 0) delete next[id]; else next[id] = Math.min(99, amount);
    saveBag(next);
  }
  function wish(item: DaydayProduct) {
    const exists = wishes.includes(item.id);
    saveBag(cart, exists ? wishes.filter((id) => id !== item.id) : [...wishes, item.id]);
    setNotice(exists ? "已移出心愿单。" : "已加入心愿单。");
  }
  async function mutate(action: string, input: Record<string, unknown>, message = "已保存。") {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try { setState(await postDayday(action, input)); setNotice(message); return true; }
    catch (e) { setNotice(e instanceof Error ? e.message : "保存失败。"); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function reload() {
    try { setState(await getDayday()); setNotice("已刷新。"); }
    catch (e) { setNotice(e instanceof Error ? e.message : "刷新失败。"); }
  }
  const products = state?.products || [];
  const cartProducts = products.filter((p) => cart[p.id]);
  const count = cartProducts.reduce((sum, p) => sum + cart[p.id], 0);
  const total = cartProducts.reduce((sum, p) => sum + cart[p.id] * p.price, 0);
  const visible = products.filter((p) => p.active && (category === "全部" || p.category === category) && p.name.includes(query.trim()));
  const spent = state?.monthlySpent || 0;
  async function checkout() {
    if (!state?.enabled || !count || busy) return;
    if (!window.confirm(`代酥酥下单 ${count} 件，共 ¥${money(total)}？含饮食的整单不可退，其他整单10分钟内可退。`)) return;
    if (await mutate("buy", { items: cartProducts.map((p) => ({ productId: p.id, quantity: cart[p.id] })), expectedTotal: total, reason: "在 dayday 页面下单" }, "下单成功，已扣款并放入物品口袋。")) saveBag({});
  }
  function art(item: DaydayProduct, className = "dd-art") {
    return <span className={`${className} dd-${item.category === "饮食" ? "peach" : item.category === "日用" ? "cream" : "blue"}`}>
      {item.photo ? <NextImage src={item.photo} alt={item.name} width={256} height={256} unoptimized /> : <span aria-hidden="true">{ICONS[item.category] || "🛍️"}</span>}
    </span>;
  }
  function cards(items: DaydayProduct[]) {
    return <div className="dd-products">{items.map((item) => <button type="button" className="dd-product" key={item.id} onClick={() => setProduct(item)}>
      {art(item)}<span className="dd-product-name">{item.name}</span><span className="dd-product-meta">{item.category}<b>¥ {money(item.price)}</b></span><small className="dd-muted">{!item.active ? "已下架" : item.stock === null ? "现货" : `库存 ${item.stock}`}</small>
    </button>)}</div>;
  }
  return <div className="xp-summer-screen rd-screen dd-screen">
    <section className="xp-summer-window" aria-label="dayday 商城">
      <header className="xp-summer-titlebar"><span className="dd-title-icon"><DaydayGlyph /></span><h1>dayday · 酥酥的生活小商城</h1>
        <div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭 dayday" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div>
      </header>
      <div className="dd-preview">{state?.enabled ? "dayday 已开启" : "dayday 未开启"}<span>{state?.enabled ? "酥酥按生活时段醒来 · 每月15日发2000" : "暂停唤醒与发钱 · 可先管理商品"}</span><button type="button" className="dd-link" disabled={busy} onClick={() => { void reload(); }}>刷新</button></div>
      <div className="dd-body" ref={bodyRef}>
        <header className="dd-brand"><div><small>EVERY LITTLE DAY</small><h2>dayday<span>生活慢慢来 ♡</span></h2></div><button type="button" onClick={() => setPage("mine")}>{state ? `口袋 ¥${money(state.wallet)}` : "酥酥的口袋 ↗"}</button></header>
        {notice && <div className="dd-notice" role="status"><span>{notice}</span><button type="button" aria-label="收起提示" onClick={() => setNotice("")}>×</button></div>}
        {!state ? <p className="dd-empty" role="status">{notice ? "暂时无法读取，请点击上方刷新重试。" : "正在打开小商城…"}</p> : <>
          {page === "shop" && <>
            <section className="dd-hero"><div><span className="dd-sticker">OPEN EVERY DAY</span><h3>好好吃饭，<br />也买一点喜欢。</h3><p>给酥酥的一日三餐，和日常的小心意。</p><button type="button" onClick={() => { setCategory("饮食"); setArea("购物区"); }}>去看看今天吃什么 →</button></div><span className="dd-hero-art" aria-hidden="true">🛍️<i>have a nice day!</i></span></section>
            <div className="dd-areas" aria-label="商城分区">{["购物区", "二手市场", "待上新"].map((name) => <button type="button" key={name} aria-pressed={area === name} onClick={() => setArea(name)}>{name}<span>{name === "购物区" ? "日常所需" : name === "二手市场" ? "旧物新生活" : "留个小心愿"}</span></button>)}</div>
            {area === "购物区" ? <>
              <label className="dd-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="找找酥酥想要的东西" aria-label="搜索商品" /></label>
              <div className="dd-categories" aria-label="商品分类">{["全部", ...state.categories].map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
              <div className="dd-heading"><h3>{category === "全部" ? "日常好物" : category}</h3><span>{visible.length} 件商品</span></div>
              {visible.length ? cards(visible) : <section className="dd-paper dd-empty"><h3>{products.length ? "暂时没有符合条件的商品" : "小货架等你来布置"}</h3><p>到「设置」上传商品、填写价格和日用品消耗时长。</p><button type="button" className="dd-primary" onClick={() => setPage("settings")}>去管理商品</button></section>}
            </> : area === "二手市场" ? <section className="dd-paper dd-empty"><span className="dd-empty-icon">♧</span><h3>让旧物遇见下一段生活</h3><p>二手交易稍后开放。</p></section> : <section className="dd-paper"><div className="dd-heading"><h3>心愿与待上新</h3><span>{wishes.length} 个喜欢</span></div><p className="dd-muted">当前心愿单保存在本机，自定义上新申请稍后接入。</p>{wishes.length ? cards(products.filter((p) => wishes.includes(p.id))) : <p className="dd-empty">打开商品详情，留下一点想要的东西。</p>}</section>}
          </>}
          {page === "cart" && <>
            <div className="dd-page-heading"><small>SHOPPING BAG</small><h3>先放着，再慢慢挑</h3><p>购物车 · {count} 件商品</p></div>
            {cartProducts.length ? <><div className="dd-paper">{cartProducts.map((item) => <div className="dd-cart-row" key={item.id}><button type="button" className="dd-cart-art" aria-label={`查看${item.name}`} onClick={() => setProduct(item)}>{art(item, "dd-bag-art")}</button><div className="dd-cart-info"><b>{item.name}</b><small>¥ {money(item.price)}{!item.active ? " · 已下架" : item.stock === 0 ? " · 暂时缺货" : ""}</small><div className="dd-quantity"><button type="button" aria-label={`减少${item.name}`} onClick={() => quantity(item.id, cart[item.id] - 1)}>−</button><span>{cart[item.id]}</span><button type="button" disabled={cart[item.id] >= 99} aria-label={`增加${item.name}`} onClick={() => quantity(item.id, cart[item.id] + 1)}>＋</button></div></div><button type="button" className="dd-link" onClick={() => quantity(item.id, 0)}>移除</button></div>)}</div><section className="dd-paper dd-total"><p>商品合计 <b>¥ {money(total)}</b></p><p>活动优惠 <span>本次未开放</span></p><hr /><p>合计 <strong>¥ {money(total)}</strong></p><button type="button" className="dd-primary" disabled={!state.enabled || busy || cartProducts.some((p) => !p.active || (p.stock !== null && p.stock < cart[p.id]))} onClick={() => { void checkout(); }}>{!state.enabled ? "dayday 关闭中" : busy ? "正在处理…" : "代酥酥下单"}</button><small>实际按后台价格结算。含饮食的订单整单不可退，建议分开购买。</small></section></> : <section className="dd-paper dd-empty"><span className="dd-empty-icon">🛒</span><h3>购物袋还空着</h3><button type="button" className="dd-primary" onClick={() => setPage("shop")}>去逛逛</button></section>}
          </>}
          {page === "bank" && <>
            <div className="dd-page-heading"><small>DAYDAY BANK</small><h3>一点一点，攒成喜欢</h3><p>存多少、取多少，酥酥自己决定。</p></div>
            <section className="dd-bank-card"><span>dayday bank ✧</span><p>活期存款</p><strong>¥ {money(state.bank)}</strong><small>与钱包分开保管 · 暂不计息</small><footer>酥酥的专属账户 <span>♡</span></footer></section>
            <div className="dd-two"><section className="dd-paper"><h3>日常钱包</h3><strong className="dd-number">¥{money(state.wallet)}</strong><p className="dd-muted">购物从钱包扣款</p></section><section className="dd-paper"><h3>月度额度</h3><strong className="dd-number">¥2000</strong><p className="dd-muted">每月15日 · 结余累加</p></section></div>
            <section className="dd-paper"><h3>存取记录</h3>{state.ledger.filter((e) => ["deposit", "withdraw"].includes(e.type)).slice(0, 20).map((e) => <div className="dd-setting" key={e.id}><span>{e.text}<small>{date(e.at)}</small></span><b>¥{money(Math.abs(e.bank))}</b></div>)}<p className="dd-muted">关闭期间不发钱、不补发。定期存款、利息和贷款稍后再做。</p></section>
          </>}
          {page === "mine" && <>
            <section className="dd-profile"><span aria-hidden="true">♡</span><div><small>MY LITTLE LIFE</small><h3>酥酥的生活口袋</h3><p>每天认真生活一点点。</p></div></section>
            <div className="dd-two"><section className="dd-paper"><p className="dd-muted">钱包余额</p><strong className="dd-number">¥{money(state.wallet)}</strong></section><section className="dd-paper"><p className="dd-muted">本月净支出</p><strong className="dd-number">¥{money(spent)}</strong></section></div>
            <section className="dd-paper"><div className="dd-heading"><h3>我的物品与日用品余量</h3><span>{state.inventory.length} 项</span></div>{state.inventory.length ? state.inventory.map((item) => <div className="dd-inventory" key={`${item.orderId}-${item.productId}`}><b>{item.name} ×{item.quantity}</b>{item.endsAt ? <><progress max="1" value={item.remaining} aria-label={`${item.name}剩余比例`} /><small>{item.remaining === 0 ? "已用完" : item.startsAt > state.serverTime ? `接着上一份，${date(item.startsAt)} 开始使用` : `预计还可用 ${item.remainingDays} 天`} · 到 {date(item.endsAt)}</small></> : <small>已入库 · 不自动消耗</small>}</div>) : <p className="dd-empty">买回来的物品与日用品余量会放在这里。</p>}</section>
            <section className="dd-paper"><div className="dd-heading"><h3>订单与整单退款</h3><span>最近 {state.orders.length} 单</span></div>{!state.orders.length && <p className="dd-empty">还没有订单。</p>}{state.orders.map((order) => <div className="dd-order" key={order.id}><div className="dd-heading"><b>¥{money(order.total)}</b><span>{order.status === "refunded" ? "已退款" : "已付款"} · {date(order.createdAt)}</span></div><p>{order.lines.map((p) => `${p.name} ×${p.quantity}`).join("、")}</p><small>订单 {order.id}</small>{order.reason && <p className="dd-muted">{order.reason}</p>}{order.status === "paid" && !order.lines.some((p) => p.category === "饮食") && state.serverTime - order.createdAt <= 600_000 && <button type="button" className="dd-link" disabled={busy} onClick={() => { if (window.confirm(`退回这整单 ¥${money(order.total)}？物品也会退回。`)) void mutate("refund", { orderId: order.id }, "整单已退款，余额与库存已恢复。"); }}>整单退款</button>}</div>)}</section>
            <section className="dd-paper"><h3>收支明细</h3>{state.ledger.slice(0, 40).map((e) => <div className="dd-setting" key={e.id}><span>{e.text}<small>{date(e.at)}</small></span><b>{e.wallet >= 0 ? "+" : "−"}¥{money(Math.abs(e.wallet))}</b></div>)}</section>
            <section className="dd-paper"><div className="dd-heading"><h3>心愿单</h3><span>本机保存</span></div>{wishes.length ? cards(products.filter((p) => wishes.includes(p.id))) : <p className="dd-empty">喜欢的东西，先记在这里。</p>}</section>
            <section className="dd-paper dd-life"><div><h3>酥酥的生活动态</h3><p>吃饭、逛街、购物与客服记录都在心跳日志的 dayday 板块。</p></div><button type="button" onClick={onOpenHeartbeat}>打开心跳日志 ↗</button></section>
          </>}
          {page === "settings" && <><div className="dd-page-heading"><small>SHOPKEEPER’S DESK</small><h3>{settings.userName || "宝宝"}的店长小桌</h3><p>商品管理关闭期间也可使用。</p></div><DaydayManager state={state} busy={busy} mutate={mutate} notice={notice} /></>}
        </>}
        <footer className="dd-footer">dayday · 陪酥酥过好每一天</footer>
      </div>
      <nav className="dd-nav" aria-label="dayday 导航">{PAGES.map((item) => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}><span aria-hidden="true">{item.icon}{item.id === "cart" && count > 0 && <i>{count}</i>}</span>{item.name}</button>)}</nav>
      {product && <XpDialog title="dayday · 商品详情" onClose={() => setProduct(null)} className="dd-dialog">{art(product, "dd-detail-art")}<p className="dd-muted">{product.category} · {product.stock === null ? "不限量" : `库存 ${product.stock}`}</p><h3>{product.name}</h3><strong className="dd-price">¥ {money(product.price)}</strong><p>{product.description}</p>{product.usage && <p className="dd-muted">每份可用 {product.usage.amount} {product.usage.unit === "month" ? "个月" : "天"}，买后自动计算余量，多份顺延使用。</p>}<div className="dd-detail-actions"><button type="button" onClick={() => wish(product)}>{wishes.includes(product.id) ? "移出心愿单" : "♡ 加入心愿单"}</button><button type="button" className="dd-primary" disabled={!product.active || product.stock === 0 || (cart[product.id] || 0) >= 99} onClick={() => { quantity(product.id, (cart[product.id] || 0) + 1); setProduct(null); }}>加入购物车</button></div></XpDialog>}
    </section>
  </div>;
}
