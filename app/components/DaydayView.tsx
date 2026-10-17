"use client";

import { useEffect, useRef, useState } from "react";
import { DaydayGlyph } from "./RetroDesktop";
import { XpDialog } from "./XpDialog";
import type { Settings } from "../lib/app-settings";
import { DAYDAY_CATEGORIES, DAYDAY_PREVIEW_KEY, DAYDAY_PRODUCTS, emptyDaydayDraft, readDaydayDraft,
  type DaydayCategory, type DaydayDraft, type DaydayProduct } from "../lib/dayday-preview";

const PAGES = [
  { id: "shop", name: "商城", icon: "⌂" }, { id: "cart", name: "购物车", icon: "🛒" },
  { id: "bank", name: "银行", icon: "▤" }, { id: "mine", name: "我的", icon: "♡" },
  { id: "settings", name: "设置", icon: "⚙" },
] as const;
type Page = typeof PAGES[number]["id"];
const money = (value: number) => value.toFixed(2);

export function DaydayView({ settings, onBack, onOpenHeartbeat }: {
  settings: Settings; onBack: () => void; onOpenHeartbeat: () => void;
}) {
  const [page, setPage] = useState<Page>("shop");
  const [category, setCategory] = useState<DaydayCategory>("全部");
  const [area, setArea] = useState("购物区");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<DaydayDraft>(emptyDaydayDraft);
  const [ready, setReady] = useState(false);
  const [product, setProduct] = useState<DaydayProduct | null>(null);
  const [notice, setNotice] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [page]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { setDraft(readDaydayDraft()); setReady(true); });
    return () => cancelAnimationFrame(frame);
  }, []);
  function save(next: DaydayDraft, message?: string) {
    setDraft(next);
    try { localStorage.setItem(DAYDAY_PREVIEW_KEY, JSON.stringify(next)); setNotice(message || "预览草稿已保存在本机。"); }
    catch { setNotice("本机存储不可用，本次改动仅在当前页面保留。"); }
  }
  function quantity(id: string, amount: number) {
    const cart = { ...draft.cart };
    if (amount <= 0) delete cart[id]; else cart[id] = Math.min(99, amount);
    save({ ...draft, cart }, amount > 0 ? "已更新预览购物车，还没有下单。" : "已从购物车移除。");
  }
  function wish(item: DaydayProduct) {
    const exists = draft.wishes.includes(item.id);
    save({ ...draft, wishes: exists ? draft.wishes.filter((id) => id !== item.id) : [...draft.wishes, item.id] }, exists ? "已移出心愿单。" : "已放进心愿单，慢慢攒着喜欢。");
  }
  const cartProducts = DAYDAY_PRODUCTS.filter((p) => draft.cart[p.id]);
  const count = cartProducts.reduce((sum, p) => sum + draft.cart[p.id], 0);
  const total = cartProducts.reduce((sum, p) => sum + draft.cart[p.id] * p.price, 0);
  const visible = DAYDAY_PRODUCTS.filter((p) => (category === "全部" || p.category === category) && p.name.includes(query.trim()));
  const routine = (next: Partial<DaydayDraft["routine"]>) => save({ ...draft, routine: { ...draft.routine, ...next } }, "生活安排草稿已保存；尚未启用心跳或通知。");

  function cards(items: DaydayProduct[]) {
    return <div className="dd-products">{items.map((item) => <button type="button" className="dd-product" key={item.id} onClick={() => setProduct(item)}>
      <span className={`dd-art dd-${item.color}`} aria-hidden="true">{item.icon}<small>{item.tag}</small></span>
      <span className="dd-product-name">{item.name}</span><span className="dd-product-meta">{item.category}<b>¥ {money(item.price)}</b></span>
    </button>)}</div>;
  }
  return <div className="xp-summer-screen rd-screen dd-screen">
    <section className="xp-summer-window" aria-label="dayday 商城">
      <header className="xp-summer-titlebar"><span className="dd-title-icon"><DaydayGlyph /></span><h1>dayday · 酥酥的生活小商城</h1>
        <div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭 dayday" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div>
      </header>
      <div className="dd-preview">界面预览 <span>商品与价格为示例 · 尚未连接真实账本</span></div>
      <div className="dd-body" ref={bodyRef}>
        <header className="dd-brand"><div><small>EVERY LITTLE DAY</small><h2>dayday<span>生活慢慢来 ♡</span></h2></div><button type="button" onClick={() => setPage("mine")}>酥酥的口袋 ↗</button></header>
        {notice && <div className="dd-notice" role="status"><span>{notice}</span><button type="button" aria-label="收起提示" onClick={() => setNotice("")}>×</button></div>}
        {!ready ? <p className="dd-empty" role="status">正在打开小商城…</p> : <>
          {page === "shop" && <>
            <section className="dd-hero"><div><span className="dd-sticker">OPEN EVERY DAY</span><h3>好好吃饭，<br />也买一点喜欢。</h3><p>给酥酥的一日三餐，和日常的小心意。</p><button type="button" onClick={() => { setCategory("饮食"); setArea("购物区"); }}>去看看今天吃什么 →</button></div><span className="dd-hero-art" aria-hidden="true">🛍️<i>have a nice day!</i></span></section>
            <div className="dd-areas" aria-label="商城分区">{["购物区", "二手市场", "待上新"].map((name) => <button type="button" key={name} aria-pressed={area === name} onClick={() => setArea(name)}>{name}<span>{name === "购物区" ? "日常所需" : name === "二手市场" ? "旧物新生活" : "留个小心愿"}</span></button>)}</div>
            {area === "购物区" ? <>
              <label className="dd-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="找找酥酥想要的东西" aria-label="搜索商品" /></label>
              <div className="dd-categories" aria-label="商品分类">{DAYDAY_CATEGORIES.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
              <div className="dd-heading"><h3>{category === "全部" ? "日常好物" : category}</h3><span>示例货架 · {visible.length} 件</span></div>
              {visible.length ? cards(visible) : <p className="dd-empty">还没找到，换个词试试吧。</p>}
              <p className="dd-footnote">电子产品、汽车与房屋，留给以后的大计划。</p>
            </> : area === "二手市场" ? <section className="dd-paper dd-empty"><span className="dd-empty-icon">♧</span><h3>让旧物遇见下一段生活</h3><p>这里以后可以出售自己的物品、淘二手好物。<br />交易功能尚未开放。</p></section> : <section className="dd-paper"><div className="dd-heading"><h3>心愿与待上新</h3><span>{draft.wishes.length} 个喜欢</span></div><p className="dd-muted">先收藏喜欢的示例商品。自定义上新申请以后接入。</p>{draft.wishes.length ? cards(DAYDAY_PRODUCTS.filter((p) => draft.wishes.includes(p.id))) : <p className="dd-empty">打开商品详情，留下一点想要的东西。</p>}</section>}
          </>}
          {page === "cart" && <>
            <div className="dd-page-heading"><small>SHOPPING BAG</small><h3>先放着，再慢慢挑</h3><p>预览购物车 · {count} 件商品</p></div>
            {cartProducts.length ? <><div className="dd-paper">{cartProducts.map((item) => <div className="dd-cart-row" key={item.id}><button type="button" className={`dd-cart-art dd-${item.color}`} aria-label={`查看${item.name}`} onClick={() => setProduct(item)}>{item.icon}</button><div className="dd-cart-info"><b>{item.name}</b><small>示例价 ¥ {money(item.price)}</small><div className="dd-quantity"><button type="button" aria-label={`减少${item.name}`} onClick={() => quantity(item.id, draft.cart[item.id] - 1)}>−</button><span>{draft.cart[item.id]}</span><button type="button" disabled={draft.cart[item.id] >= 99} aria-label={`增加${item.name}`} onClick={() => quantity(item.id, draft.cart[item.id] + 1)}>＋</button></div></div><button type="button" className="dd-link" onClick={() => quantity(item.id, 0)}>移除</button></div>)}</div><section className="dd-paper dd-total"><p>商品合计 <b>¥ {money(total)}</b></p><p>活动优惠 <span>尚未配置</span></p><hr /><p>预览合计 <strong>¥ {money(total)}</strong></p><button type="button" className="dd-primary" disabled>结算尚未开放</button><small>订单、扣款和退款将在后续接入。</small></section></> : <section className="dd-paper dd-empty"><span className="dd-empty-icon">🛒</span><h3>购物袋还空着</h3><p>挑一点今天需要的，也可以先看看。</p><button type="button" className="dd-primary" onClick={() => setPage("shop")}>去逛逛</button></section>}
          </>}
          {page === "bank" && <>
            <div className="dd-page-heading"><small>DAYDAY BANK</small><h3>一点一点，攒成喜欢</h3><p>酥酥的小金库</p></div>
            <section className="dd-bank-card"><span>dayday bank ✧</span><p>可用余额</p><strong>¥ —</strong><small>账本尚未接入</small><footer>酥酥的专属账户 <span>♡</span></footer></section>
            <div className="dd-two"><section className="dd-paper"><h3>活期口袋</h3><strong className="dd-number">—</strong><p className="dd-muted">随时取用的日常零花钱</p><button type="button" disabled>存入／取出 · 待开放</button></section><section className="dd-paper"><h3>定期存钱罐</h3><strong className="dd-number">—</strong><p className="dd-muted">存一笔钱，等一个小目标</p><button type="button" disabled>存款与利率 · 待开放</button></section></div>
            <section className="dd-paper"><div className="dd-heading"><h3>攒钱计划</h3><span>等酥酥写下第一个目标</span></div><p className="dd-empty">想买的大件、想送的礼物，都可以慢慢攒。</p></section><p className="dd-footnote">额度、奖励、利息与贷款分期将在后续逐步开放。</p>
          </>}
          {page === "mine" && <>
            <section className="dd-profile"><span aria-hidden="true">♡</span><div><small>MY LITTLE LIFE</small><h3>酥酥的生活口袋</h3><p>每天认真生活一点点。</p></div></section>
            <div className="dd-two"><section className="dd-paper"><p className="dd-muted">本月可用额度</p><strong className="dd-number">—</strong><small>等待配置</small></section><section className="dd-paper"><p className="dd-muted">本月实际支出</p><strong className="dd-number">—</strong><small>等待接入账本</small></section></div>
            <section className="dd-paper"><div className="dd-heading"><h3>我的物品</h3><span>日用品 · 衣物 · 书籍</span></div><p className="dd-empty">还没有 dayday 入库记录。<br />以后买回来的物品和日用品余量会放在这里。</p></section>
            <section className="dd-paper"><div className="dd-heading"><h3>心愿单</h3><span>{draft.wishes.length} 件 · 本机预览</span></div>{draft.wishes.length ? cards(DAYDAY_PRODUCTS.filter((p) => draft.wishes.includes(p.id))) : <p className="dd-empty">喜欢的东西，先记在这里。</p>}</section>
            <section className="dd-paper dd-life"><div><h3>酥酥的生活动态</h3><p>吃饭、逛街与补货记录以后汇入心跳日志。</p><small>生活活动模块与通知尚未接入</small></div><button type="button" onClick={onOpenHeartbeat}>打开心跳日志 ↗</button></section>
          </>}
          {page === "settings" && <>
            <div className="dd-page-heading"><small>SHOPKEEPER’S DESK</small><h3>{settings.userName || "宝宝"}的店长小桌</h3><p>把小商城慢慢布置成喜欢的样子。</p></div>
            <section className="dd-paper"><div className="dd-heading"><h3>酥酥的生活安排</h3><span>仅保存本机草稿</span></div><p className="dd-muted">醒来给他一个选择的机会，吃不吃、逛不逛由他决定。</p>
              <label className="dd-setting"><span><b>早、中、晚吃饭</b><small>结合食物库存与上一餐考虑</small></span><input type="checkbox" checked={draft.routine.meals} onChange={(e) => routine({ meals: e.target.checked })} /></label>
              <label className="dd-setting"><span><b>上午、下午逛一逛</b><small>可以买东西，也可以只看看</small></span><input type="checkbox" checked={draft.routine.walks} onChange={(e) => routine({ walks: e.target.checked })} /></label>
              <label className="dd-setting"><span><b>每天生活唤醒机会</b><small>预留 3～12 次；具体时段以后设置</small></span><select aria-label="每天生活唤醒机会" value={draft.routine.times} onChange={(e) => routine({ times: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n} 次</option>)}</select></label>
              <label className="dd-setting"><span><b>有活动时通知我</b><small>生活日志与通知待接入</small></span><input type="checkbox" checked={draft.routine.notify} onChange={(e) => routine({ notify: e.target.checked })} /></label>
              <p className="dd-footnote">这里的调整不会唤醒酥酥，也不会改变现有心跳。</p>
            </section>
            <section className="dd-paper"><h3>商城管理</h3>{["商品上新与价格", "限时降价与满减", "每月额度与奖励", "客服议价与专属优惠"].map((name) => <div className="dd-setting" key={name}><b>{name}</b><span className="dd-muted">待接入</span></div>)}</section>
            <section className="dd-paper"><h3>预览草稿</h3><p className="dd-muted">购物车、心愿单和生活安排只保存在当前浏览器。</p><button type="button" className="dd-link" onClick={() => { if (window.confirm("清空 dayday 的本机预览购物车、心愿单和安排草稿？")) save(emptyDaydayDraft(), "dayday 预览草稿已重置。"); }}>重置本机预览</button></section>
          </>}
        </>}
        <footer className="dd-footer">dayday · 陪酥酥过好每一天</footer>
      </div>
      <nav className="dd-nav" aria-label="dayday 导航">{PAGES.map((item) => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => { setPage(item.id); setNotice(""); }}><span aria-hidden="true">{item.icon}{item.id === "cart" && count > 0 && <i>{count}</i>}</span>{item.name}</button>)}</nav>
      {product && <XpDialog title="dayday · 商品详情" onClose={() => setProduct(null)} className="dd-dialog"><div className={`dd-detail-art dd-${product.color}`} aria-hidden="true">{product.icon}</div><p className="dd-muted">{product.category} · 示例商品</p><h3>{product.name}</h3><strong className="dd-price">¥ {money(product.price)}</strong><p>{product.note}</p><p className="dd-muted">价格仅供界面预览；加入购物车不会扣款。</p><div className="dd-detail-actions"><button type="button" onClick={() => wish(product)}>{draft.wishes.includes(product.id) ? "移出心愿单" : "♡ 加入心愿单"}</button><button type="button" className="dd-primary" disabled={(draft.cart[product.id] || 0) >= 99} onClick={() => { quantity(product.id, (draft.cart[product.id] || 0) + 1); setProduct(null); }}>加入购物车</button></div></XpDialog>}
    </section>
  </div>;
}
