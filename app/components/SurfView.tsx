"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IeGlyph } from "./RetroDesktop";
import { XpDialog } from "./XpDialog";
import { CLAUDE_DEFAULT_NAME, type Settings } from "../lib/app-settings";
import { apiFetch, loadLocalRaw, saveLocal } from "../lib/client-api";
import { SURF_LIMITS, boardLinks, safeSurfUrl, surfHost, type SurfLink, type SurfThread, type SurfWho } from "../lib/surf-board";

// The surf app: an Internet Explorer window with our little forum in it,
// a 2007 贴吧 for two. His finds online come in as threads, she replies floor
// by floor and posts her own; 收藏夹 lists every page either of us kept.

type Reply = { ok: boolean; error?: string; threads?: SurfThread[]; thread?: SurfThread };
type Page = { kind: "home" } | { kind: "thread"; id: string } | { kind: "favorites" };

const SEEN_KEY = "iooi-surf-seen";
const HOST = "http://iooi.bbs";

async function surfApi(init: RequestInit = {}): Promise<Reply> {
  let response: Response;
  try {
    response = await apiFetch("/api/surf", init);
  } catch {
    throw new Error("无法显示网页：连不上论坛，看看网络再试。");
  }
  const data = await response.json().catch(() => null) as Reply | null;
  if (!response.ok || !data?.ok) throw new Error(data?.error || "论坛出了点问题，请稍后再试。");
  return data;
}

function postSurf(body: Record<string, unknown>) {
  return surfApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** "14:30" today, "10-09 14:30" this year, "2025-12-31" before. */
function when(ms: number, now = Date.now()) {
  const fmt = (options: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, ...options });
  const day = (value: number) => new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  const clock = fmt({ hour: "2-digit", minute: "2-digit" });
  if (day(ms) === day(now)) return clock;
  const [year, month, date] = day(ms).split("/");
  if (year === day(now).split("/")[0]) return `${month.padStart(2, "0")}-${date.padStart(2, "0")} ${clock}`;
  return `${year}-${month.padStart(2, "0")}-${date.padStart(2, "0")}`;
}

function Avatar({ src, who }: { src: string; who: SurfWho }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={`sf-avatar sf-avatar-${who}`}>{src ? <img src={src} alt="" /> : <span aria-hidden="true">{who === "her" ? "♥" : "☆"}</span>}</span>;
}

/** Plain http(s) links only, opened outside, no referrer. */
function LinkBox({ links }: { links: SurfLink[] }) {
  const safe = links.filter((link) => safeSurfUrl(link.url));
  if (!safe.length) return null;
  return <ul className="sf-links" aria-label="帖子里的链接">
    {safe.map((link) => <li key={link.url}>
      <a href={link.url} target="_blank" rel="noopener noreferrer nofollow">{link.title}</a>
      <small>{surfHost(link.url)}</small>
      {link.why && <p>{link.why}</p>}
    </li>)}
  </ul>;
}

function PostDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (form: { title: string; content: string; url: string; linkTitle: string }) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", content: "", url: "", linkTitle: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  return <XpDialog title="发表新帖" onClose={onClose}>
    <form className="rd-form sf-form" onSubmit={async (event) => {
      event.preventDefault();
      if (busy) return;
      if (form.url.trim() && !safeSurfUrl(form.url.trim())) { setError("链接要以 http:// 或 https:// 开头。"); return; }
      setBusy(true); setError("");
      try { await onSubmit(form); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "没发出去，请再试一次。"); setBusy(false); }
    }}>
      <label><span>标题</span><input value={form.title} maxLength={SURF_LIMITS.title} required onChange={(event) => set({ title: event.target.value })} /></label>
      <label><span>正文</span><textarea value={form.content} maxLength={SURF_LIMITS.content} rows={6} onChange={(event) => set({ content: event.target.value })} /></label>
      <label><span>链接</span><input value={form.url} maxLength={SURF_LIMITS.url} inputMode="url" placeholder="可以不填，https://…" onChange={(event) => set({ url: event.target.value })} /></label>
      {form.url.trim() && <label><span>链接名</span><input value={form.linkTitle} maxLength={SURF_LIMITS.linkTitle} placeholder="可以不填" onChange={(event) => set({ linkTitle: event.target.value })} /></label>}
      {error && <p className="rd-error" role="alert">{error}</p>}
      <div className="rd-dialog-buttons">
        <button type="submit" className="rd-button rd-button-default" disabled={busy || !form.title.trim() || (!form.content.trim() && !form.url.trim())}>{busy ? "发表中…" : "发表"}</button>
        <button type="button" className="rd-button" onClick={onClose}>取消</button>
      </div>
    </form>
  </XpDialog>;
}

function ThreadList({ threads, names, seen, onOpen }: {
  threads: SurfThread[]; names: Record<SurfWho, string>; seen: Record<string, number>; onOpen: (id: string) => void;
}) {
  if (!threads.length) return <div className="rd-empty sf-empty"><IeGlyph />
    <p>论坛还空着。</p>
    <small>{names.him}出去冲浪看到好东西，会发在这里；你也可以先发一帖。</small>
  </div>;
  return <ul className="sf-threads">
    {threads.map((thread) => {
      const last = thread.replies[thread.replies.length - 1];
      const fresh = (last?.who ?? thread.who) === "him" && thread.lastAt > (seen[thread.id] || 0);
      return <li key={thread.id}>
        <button type="button" className="sf-thread-row" onClick={() => onOpen(thread.id)}>
          <span className="sf-count" aria-label={`${thread.replies.length} 条回复`}>{thread.replies.length}</span>
          <span className="sf-thread-main">
            <strong>{thread.title}{fresh && <i className="sf-new">new</i>}</strong>
            {thread.content && <span className="sf-thread-snippet">{thread.content.replace(/\s+/g, " ").slice(0, 60)}</span>}
            <span className="sf-thread-meta">
              <span className={`sf-name sf-name-${thread.who}`}>{names[thread.who]}</span>
              {thread.links.length > 0 && <span className="sf-thread-host">{surfHost(thread.links[0].url)}</span>}
              <span className="sf-thread-last">{last ? `${names[last.who]} 回复于 ${when(last.at)}` : when(thread.at)}</span>
            </span>
          </span>
        </button>
      </li>;
    })}
  </ul>;
}

function ThreadPage({ thread, names, avatars, busy, onReply, onDelete }: {
  thread: SurfThread; names: Record<SurfWho, string>; avatars: Record<SurfWho, string>; busy: boolean;
  onReply: (content: string) => Promise<boolean>; onDelete: (replyId?: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const floors = [{ id: "", at: thread.at, who: thread.who, content: thread.content }, ...thread.replies];
  return <article className="sf-thread">
    <h2 className="sf-thread-title">{thread.title}</h2>
    <p className="sf-thread-sub">楼主 <span className={`sf-name sf-name-${thread.who}`}>{names[thread.who]}</span> · 回复 {thread.replies.length}
      {thread.source === "life" && <> · {names.him}自己出去逛的时候发的</>}</p>
    <ol className="sf-floors">
      {floors.map((floor, index) => <li key={floor.id || "op"} className={`sf-floor sf-floor-${floor.who}`}>
        <header className="sf-floor-head">
          <Avatar src={avatars[floor.who]} who={floor.who} />
          <span className={`sf-name sf-name-${floor.who}`}>{names[floor.who]}</span>
          {floor.who === thread.who && <span className="sf-op">楼主</span>}
          <span className="sf-floor-no">{index === 0 ? "1楼" : `${index + 1}楼`}</span>
        </header>
        <div className="sf-floor-body">
          {floor.content ? <p>{floor.content}</p> : index === 0 ? <p className="rd-muted">（只贴了链接）</p> : null}
          {index === 0 && <LinkBox links={thread.links} />}
        </div>
        <footer className="sf-floor-foot">
          <span>{when(floor.at)}</span>
          <button type="button" className="sf-link-button" disabled={busy} onClick={() => onDelete(floor.id || undefined)}>删除</button>
        </footer>
      </li>)}
    </ol>
    <form className="sf-reply" onSubmit={async (event) => {
      event.preventDefault();
      if (!draft.trim() || busy) return;
      if (await onReply(draft)) setDraft("");
    }}>
      <h3>发表回复</h3>
      <textarea value={draft} maxLength={SURF_LIMITS.reply} rows={4} aria-label="回复内容" placeholder="说点什么…"
        onChange={(event) => setDraft(event.target.value)} />
      <div><button type="submit" className="rd-button rd-button-default" disabled={busy || !draft.trim()}>{busy ? "发表中…" : "发 表"}</button>
        <small>{draft.length}/{SURF_LIMITS.reply}</small></div>
    </form>
  </article>;
}

function Favorites({ threads, names, onOpen }: { threads: SurfThread[]; names: Record<SurfWho, string>; onOpen: (id: string) => void }) {
  const links = useMemo(() => boardLinks(threads), [threads]);
  const byId = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  if (!links.length) return <div className="rd-empty sf-empty"><IeGlyph /><p>收藏夹是空的。</p><small>帖子里贴过的网页都会收进来。</small></div>;
  return <section className="sf-favorites" aria-label="收藏夹">
    <h2>收藏夹 <small>{links.length} 个网页</small></h2>
    <ul>
      {links.map((link) => {
        const thread = byId.get(link.threadId);
        return <li key={`${link.threadId}-${link.url}`}>
          <span className="sf-fav-icon" aria-hidden="true"><IeGlyph /></span>
          <span className="sf-fav-main">
            <a href={link.url} target="_blank" rel="noopener noreferrer nofollow">{link.title}</a>
            <small>{surfHost(link.url)} · {thread ? names[thread.who] : ""}存的 · {when(link.at)}</small>
            {link.why && <p>{link.why}</p>}
            {thread && <button type="button" className="sf-link-button" onClick={() => onOpen(thread.id)}>看帖子《{thread.title}》</button>}
          </span>
        </li>;
      })}
    </ul>
  </section>;
}

export function SurfView({ settings, initialThread, onBack }: { settings: Settings; initialThread?: string | null; onBack: () => void }) {
  const names: Record<SurfWho, string> = { him: settings.aiName || CLAUDE_DEFAULT_NAME, her: settings.userName || "宝宝" };
  const avatars: Record<SurfWho, string> = { him: settings.aiAvatar || "", her: settings.userAvatar || "" };
  const [threads, setThreads] = useState<SurfThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Page[]>(() => [{ kind: "home" }, ...(initialThread ? [{ kind: "thread" as const, id: initialThread }] : [])]);
  const [posting, setPosting] = useState(false);
  const [seen, setSeen] = useState<Record<string, number>>(() => loadLocalRaw<Record<string, number>>(SEEN_KEY, {}));
  const page = history[history.length - 1];

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const data = await surfApi(); setThreads(data.threads || []); setNotice(""); }
    catch (error) { setNotice((error as Error).message); }
    finally { setLoading(false); }
  }, []);

  // First load: state only changes once the board arrives.
  useEffect(() => {
    let alive = true;
    surfApi()
      .then((data) => { if (alive) setThreads(data.threads || []); })
      .catch((error: Error) => { if (alive) setNotice(error.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const thread = page.kind === "thread" ? threads.find((item) => item.id === page.id) || null : null;

  /** Opening or leaving a thread marks its floors read, for the little "new". */
  function markSeen(id: string) {
    const target = threads.find((item) => item.id === id);
    if (!target || (seen[id] || 0) >= target.lastAt) return;
    const live = new Set(threads.map((item) => item.id));
    const next = Object.fromEntries(Object.entries({ ...seen, [id]: target.lastAt }).filter(([key]) => live.has(key)));
    setSeen(next);
    saveLocal(SEEN_KEY, next);
  }

  function go(next: Page) {
    setNotice("");
    if (page.kind === "thread") markSeen(page.id);
    if (next.kind === "thread") markSeen(next.id);
    setHistory((current) => [...current, next]);
  }

  function back() {
    setNotice("");
    if (page.kind === "thread") markSeen(page.id);
    setHistory((current) => current.length > 1 ? current.slice(0, -1) : current);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try { await task(); setNotice(""); return true; }
    catch (error) { setNotice((error as Error).message); return false; }
    finally { setBusy(false); }
  }

  const title = page.kind === "thread" ? thread?.title || "找不到网页" : page.kind === "favorites" ? "收藏夹" : "iooi 小站";
  const address = page.kind === "thread" ? `${HOST}/thread/${page.id.slice(0, 8)}` : page.kind === "favorites" ? `${HOST}/favorites` : `${HOST}/`;
  const floors = threads.reduce((sum, item) => sum + item.replies.length + 1, 0);

  return <div className="xp-summer-screen rd-screen sf-screen">
    <section className="xp-summer-window" aria-label="internet">
      <header className="xp-summer-titlebar">
        <span className="rd-title-icon"><IeGlyph /></span><h1>{title} - Internet Explorer</h1>
        <div className="xp-summer-controls">
          <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
          <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
          <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口" onClick={() => { if (page.kind === "thread") markSeen(page.id); onBack(); }}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
        </div>
      </header>

      <div className="rd-toolbar sf-toolbar">
        <button type="button" className="rd-tool sf-back" disabled={history.length < 2} onClick={back}><i aria-hidden="true">◀</i>后退</button>
        <button type="button" className="rd-tool" onClick={() => go({ kind: "home" })} aria-label="主页"><i aria-hidden="true">⌂</i>主页</button>
        <button type="button" className="rd-tool" disabled={loading} onClick={() => { void refresh(); }} aria-label="刷新"><i aria-hidden="true">↻</i></button>
        <button type="button" className="rd-tool" aria-pressed={page.kind === "favorites"} onClick={() => go({ kind: "favorites" })}><i className="sf-star" aria-hidden="true">★</i>收藏夹</button>
        <button type="button" className="rd-tool" disabled={loading} onClick={() => setPosting(true)}><i aria-hidden="true">✎</i>发帖</button>
      </div>
      <div className="xp-summer-address"><span>地址</span>
        <span className="xp-summer-address-field"><span className="xp-control-title-icon"><IeGlyph /></span><b className="sf-url">{address}</b></span>
      </div>

      {notice && <div className="rd-notice" role="alert"><span>{notice}</span>
        <button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}

      <div className="sf-page">
        {page.kind === "home" && <>
          <header className="sf-banner">
            <strong>iooi 小站</strong>
            <span>只有我们俩的论坛 · 主题 {threads.length} · 帖子 {floors}</span>
          </header>
          {loading && !threads.length ? <p className="rd-muted rd-loading" role="status">正在打开网页…</p>
            : <ThreadList threads={threads} names={names} seen={seen} onOpen={(id) => go({ kind: "thread", id })} />}
        </>}
        {page.kind === "thread" && (thread
          ? <ThreadPage key={thread.id} thread={thread} names={names} avatars={avatars} busy={busy}
            onReply={(content) => run(async () => {
              const reply = await postSurf({ action: "reply", thread: thread.id, content });
              if (reply.threads) setThreads(reply.threads);
            })}
            onDelete={(replyId) => {
              if (!window.confirm(replyId ? "删掉这一楼？" : `删掉整个帖子《${thread.title}》？下面的回复会一起删掉。`)) return;
              void run(async () => {
                const reply = await postSurf({ action: "delete", thread: thread.id, ...(replyId ? { reply: replyId } : {}) });
                if (reply.threads) setThreads(reply.threads);
                if (!replyId) back();
              });
            }} />
          : loading ? <p className="rd-muted rd-loading" role="status">正在打开网页…</p>
            : <div className="rd-empty sf-empty"><IeGlyph /><p>该页无法显示</p><small>这个帖子可能已经删掉了。</small>
              <button type="button" className="rd-button" onClick={() => go({ kind: "home" })}>回到首页</button></div>)}
        {page.kind === "favorites" && <Favorites threads={threads} names={names} onOpen={(id) => go({ kind: "thread", id })} />}
      </div>

      <footer className="xp-summer-statusbar">
        <span className="sf-status-done"><span className="rd-title-icon" aria-hidden="true"><IeGlyph /></span>{loading || busy ? "正在打开网页…" : "完毕"}</span>
        <span>Internet</span>
      </footer>
    </section>
    {posting && <PostDialog onClose={() => setPosting(false)} onSubmit={async (form) => {
      const url = form.url.trim();
      const reply = await postSurf({
        action: "post", title: form.title, content: form.content,
        links: url ? [{ url, title: form.linkTitle.trim() || undefined }] : [],
      });
      if (reply.threads) setThreads(reply.threads);
      setPosting(false);
      if (reply.thread) go({ kind: "thread", id: reply.thread.id });
    }} />}
  </div>;
}
