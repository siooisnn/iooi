"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client-api";
import type { PhoneApp, PhoneItem, PhoneSnapshot, PhoneTarget } from "../lib/susu-phone";
import { PhoneGlyph } from "./RetroDesktop";
import { IconLineBlog, IconLineBook, IconLineChat, IconLineGlobe } from "./NavIcons";

const APP_LABELS: Record<PhoneApp, string> = { reading: "书架", surf: "论坛", blog: "博客", chat: "MSN" };
const ICONS = { reading: IconLineBook, surf: IconLineGlobe, blog: IconLineBlog, chat: IconLineChat };

function SleepingCat() {
  return <svg className="sp-cat" viewBox="0 0 96 45" fill="none" aria-hidden="true">
    <path d="M23 35c-10 1-14-3-12-8 2-4 6-4 9-1 3 3 0 6-3 5" stroke="#bacce5" strokeWidth="3" strokeLinecap="round" />
    <path d="M26 35c-6-5-7-15 1-21 8-6 29-4 37 3 8 7 4 17-5 18Z" fill="#dce7f8" stroke="#b4c6e2" strokeWidth="1.5" />
    <path d="m52 21 1-14 9 7 11-5 3 14c2 8-3 13-12 13-9 0-14-6-12-15Z" fill="#e8edf9" stroke="#b4c6e2" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="m56 12 3 3m10-1 3-2M56 23q3 3 6 0m6-1q3 3 5-1m-10 7 2 2 2-2M31 29q7-8 16-4" stroke="#7488ad" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="56" cy="27" rx="3" ry="1.6" fill="#e9b9cf" /><ellipse cx="73" cy="26" rx="3" ry="1.6" fill="#e9b9cf" />
    <path d="M44 35h13q5 0 4-3-1-3-6-2" stroke="#b4c6e2" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m82 13 4-1-3 5 4-1m-4-11 5-1-4 6 5-1" stroke="#c4d5f2" strokeWidth="1" strokeLinecap="round" />
  </svg>;
}

function Collection({ app, items, onOpen }: { app: "reading" | "surf" | "blog"; items: PhoneItem[]; onOpen: (target: PhoneTarget) => void }) {
  const Icon = ICONS[app];
  return <section className="sp-collection-group" aria-label={APP_LABELS[app]}>
    <h3><Icon size={15} /><span>{app === "reading" ? "正在读" : app === "surf" ? "最近的帖子" : "最近的日志"}</span></h3>
    {items.length ? items.map((item) => <button type="button" className="sp-item" key={item.id} onClick={() => onOpen(item.target)}>
      <span><b>{item.title}</b><small>{item.detail}</small>
        {typeof item.percent === "number" && <span className="sp-progress" role="progressbar" aria-label={`${item.title}的阅读进度`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percent}><i style={{ width: `${item.percent}%` }} /></span>}</span>
      <span className="sp-chevron" aria-hidden="true">›</span>
    </button>) : <p className="sp-empty">{app === "reading" ? "还没有在读的书" : app === "surf" ? "还没发过帖子" : "还没写过日志"}</p>}
  </section>;
}

export function SusuPhoneView({ onBack, onOpen }: { onBack: () => void; onOpen: (target: PhoneTarget) => void }) {
  const [phone, setPhone] = useState<PhoneSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    let loading = false;
    const controller = new AbortController();
    async function load() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const response = await apiFetch("/api/phone", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { ok?: boolean; phone?: PhoneSnapshot; error?: string };
        if (!response.ok || !data.ok || !data.phone) throw new Error(data.error || "手机暂时连不上，稍后再试。");
        if (alive) { setPhone(data.phone); setError(""); }
      } catch (failure) {
        if (alive) setError(failure instanceof Error ? failure.message : "手机暂时连不上，稍后再试。");
      } finally { loading = false; }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 30_000);
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { alive = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);

  return <div className="xp-summer-screen sp-screen">
    <section className="xp-summer-window" aria-label="susu’s phone">
      <header className="xp-summer-titlebar">
        <span className="rd-title-icon"><PhoneGlyph /></span><h1>susu’s phone</h1>
        <div className="xp-summer-controls">
          <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
          <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
          <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭手机，回到桌面" onClick={onBack}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
        </div>
      </header>
      <div className="sp-stage">
        <div className="sp-device"><div className="sp-display" data-wallpaper={phone?.settings.wallpaper || "night-blue"}>
          {phone?.settings.ornaments.clouds !== false && <div className="sp-clouds" aria-hidden="true"><i /><i /><i /></div>}
          {phone?.settings.ornaments.moon !== false && <span className="sp-moon" aria-hidden="true" />}
          <div className="sp-statusbar"><time>{phone?.clock || "—:—"}</time><span className="sp-island" aria-hidden="true" />
            <span className="sp-status-icons" aria-hidden="true"><svg viewBox="0 0 34 14"><path d="M1 12V9m4 3V6m4 6V3m4 9V1" /><rect x="21" y="3" width="10" height="8" rx="2" /><path d="M33 5v4M24 5h4v4h-4z" /></svg></span></div>
          <div className="sp-heading"><small>SUSU’S LITTLE WORLD</small><h2>今晚也在这里</h2><span>{phone?.day || "酥酥的小手机"}</span>
            <button type="button" onClick={() => setRefresh((n) => n + 1)} aria-label="刷新手机" title="刷新手机">↻</button></div>
          <div className="sp-scroll">
            {error && <p className="sp-error" role="alert">{error}<button type="button" onClick={() => setRefresh((n) => n + 1)}>重试</button></p>}
            {!phone && !error && <p className="sp-loading" role="status">正在打开酥酥的手机…</p>}
            {phone?.settings.widgets.today && <section className="sp-card sp-today" aria-label="酥酥今天">
              {phone.settings.ornaments.cat && <SleepingCat />}
              <header><h2>酥酥今天</h2><span>{phone.today.length ? `${phone.today.length} 件小事` : "慢慢过一天"}</span></header>
              {phone.today.length ? <ol className="sp-timeline">{phone.today.map((entry) => <li key={`${entry.at}-${entry.text}`}>
                <time>{entry.clock}</time><div>{entry.target ? <button type="button" className="sp-activity" onClick={() => onOpen(entry.target!)}>{entry.text}<span aria-hidden="true"> ›</span></button> : <p>{entry.text}</p>}
                  {entry.links.length > 0 && <div className="sp-links">{entry.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer nofollow">{link.title} ↗</a>)}</div>}</div>
              </li>)}</ol> : <p className="sp-empty">今天还没有留下记录。<br />读书、逛网页的小事，会慢慢出现在这里。</p>}
            </section>}
            {phone?.settings.widgets.collection && <section className="sp-card sp-collection" aria-label="酥酥的小世界">
              <header><h2>我的小世界</h2><span>接着上次的地方</span></header>
              <Collection app="reading" items={phone.collection.reading} onOpen={onOpen} />
              <Collection app="surf" items={phone.collection.surf} onOpen={onOpen} />
              <Collection app="blog" items={phone.collection.blog} onOpen={onOpen} />
            </section>}
            {phone?.settings.widgets.signature && <section className="sp-card sp-signature" aria-label="酥酥的签名">
              <small>留一句话在这里</small><p>{phone.signature || "还没有写下签名。"}</p><span aria-hidden="true">☾</span>
            </section>}
            <p className="sp-owner">酥酥自己的桌面 · 你可以来看看</p>
          </div>
          <nav className="sp-dock" aria-label="手机应用">{(phone?.settings.iconOrder || ["reading", "surf", "blog", "chat"] as PhoneApp[]).map((app) => {
            const Icon = ICONS[app];
            return <button type="button" key={app} onClick={() => onOpen({ app })}><span><Icon size={24} /></span><small>{APP_LABELS[app]}</small></button>;
          })}</nav><span className="sp-home-indicator" aria-hidden="true" />
        </div></div>
      </div>
      <footer className="xp-summer-statusbar"><span>酥酥的小手机</span><span>只读</span></footer>
    </section>
  </div>;
}
