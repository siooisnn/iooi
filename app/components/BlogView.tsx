"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { FragmentEntry } from "../lib/app-types";
import type { Settings } from "../lib/app-settings";
import { CLAUDE_DEFAULT_NAME, MODELS } from "../lib/app-settings";
import { apiFetch } from "../lib/client-api";
import { genId } from "../lib/chat-sessions";
import { prepareImageForUpload } from "../lib/image-compress";
import {
  BLOG_LIMITS, BLOG_MOODS, BLOG_TIME_ZONE, BLOG_WEATHERS, blogArchive, blogDayKey, blogMonthKey, calendarWeeks,
  latestHisPost, monthLabel, parseBlogState, postExcerpt, postTitle, shiftMonth, songTitleFromFile, sortPosts, visitorDigits,
} from "../lib/blog";
import type { BlogAction, BlogComment, BlogPostLike, BlogProfile, BlogState, HisPost } from "../lib/blog";

type Screen =
  | { kind: "home" }
  | { kind: "post"; id: string }
  | { kind: "edit"; id: string; createdAt: string }
  | { kind: "profile" }
  | { kind: "him" }
  | { kind: "him-post"; id: string };
type Popup = null | "calendar" | "archive" | "playlist" | "him-write";
type Filter = null | { kind: "month" | "day"; key: string };
type Sparkle = { id: number; x: number; y: number };

const WEATHER_ICON: Record<string, string> = { 晴: "☀", 多云: "⛅", 阴: "☁", 小雨: "☂", 大雨: "☔", 雪: "❄", 大风: "༄" };
const FLOOR_NAMES = ["沙发", "板凳", "地板"];

// ── Server ──

type BlogRequest =
  | BlogAction
  | { type: "ask"; post: BlogPostLike; modelId: string }
  | { type: "him-write"; topic: string; modelId: string };
type BlogResult = { blog?: BlogState; writing?: boolean; error?: string };

async function blogRequest(body?: BlogRequest): Promise<BlogResult> {
  try {
    const res = await apiFetch("/api/blog", body ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    } : { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { error: data.error || "没连上服务器，等会儿再试" };
    return { blog: parseBlogState(data.blog), writing: data.writing === true };
  } catch {
    return { error: "没连上服务器，等会儿再试" };
  }
}

// The newest of his posts she has opened his space to see, kept on this device
// so the friend card can say NEW without the server tracking it.
const HIS_SEEN_KEY = "iooi-blog-him-seen";

function readHisSeen() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(HIS_SEEN_KEY) || "";
  } catch {
    return "";
  }
}

function markHisSeen(iso: string) {
  try {
    window.localStorage.setItem(HIS_SEEN_KEY, iso);
  } catch {}
}

async function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.url !== "string") throw new Error(data.error || "上传失败");
  return data.url as string;
}

// ── Little pixel things, drawn like clawd ──

const PIXEL_COLORS: Record<string, string> = {
  K: "#3b3b5c", W: "#ffffff", E: "#2a2a3a", P: "#ff7eb6", B: "#ffc2dc",
  R: "#ff4f9a", r: "#ff9cc8", Y: "#ffd84a", y: "#fff3a6", L: "#7cc8ff",
};

function Pixels({ rows, className }: { rows: string[]; className?: string }) {
  const width = Math.max(...rows.map((row) => row.length));
  return (
    <svg className={className} viewBox={`0 0 ${width} ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => Array.from(row).map((cell, x) =>
        PIXEL_COLORS[cell] ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={PIXEL_COLORS[cell]} /> : null))}
    </svg>
  );
}

const HEART = [".RR.RR.", "RrRRRRR", "RRRRRRR", ".RRRRR.", "..RRR..", "...R..."];
const STAR = ["...Y...", "...Y...", "YYYyYYY", ".YyyyY.", "..YYY..", ".YY.YY.", "Y.....Y"];
const KITTY = [
  ".K.......K..",
  ".KK.....KK..",
  ".KWKKKKKWK..",
  ".KWWWWWWWK..",
  ".KWEWWWEWK.K",
  ".KBWWPWWBK.K",
  "..KWWWWWK..K",
  "..KWWWWWWKK.",
  ".KWWWWWWWWK.",
  ".KWWKWWKWWK.",
  "..KK.KK.KK..",
];

function StartFlag() {
  return (
    <svg className="blog-start-flag" viewBox="0 0 20 18" aria-hidden="true">
      <path d="M1 3.2c2.6-1.3 5.2-1.3 8 .2v6.2C6.3 8.1 3.6 8.1 1 9.4z" fill="#f65314" />
      <path d="M10.2 3.9c2.8 1.5 5.6 1.5 8.4 0v6.2c-2.8 1.5-5.6 1.5-8.4 0z" fill="#7cbb00" />
      <path d="M1 10.6c2.6-1.3 5.3-1.3 8 .2V17c-2.7-1.5-5.4-1.5-8-.2z" fill="#00a1f1" />
      <path d="M10.2 11.3c2.8 1.5 5.6 1.5 8.4 0v6.2c-2.8 1.5-5.6 1.5-8.4 0z" fill="#ffbb00" />
    </svg>
  );
}

// ── XP window ──

function XpWindow({ title, icon, onClose, className = "", children }: {
  title: string; icon?: ReactNode; onClose?: () => void; className?: string; children: ReactNode;
}) {
  return (
    <section className={`xp-window ${className}`}>
      <header className="xp-titlebar">
        <span className="xp-title-icon" aria-hidden="true">{icon ?? "♥"}</span>
        <span className="xp-title-text">{title}</span>
        <span className="xp-controls">
          <i className="xp-btn xp-min" aria-hidden="true" />
          <i className="xp-btn xp-max" aria-hidden="true" />
          {onClose
            ? <button type="button" className="xp-btn xp-close" onClick={onClose} aria-label="关闭窗口" />
            : <i className="xp-btn xp-close" aria-hidden="true" />}
        </span>
      </header>
      <div className="xp-body">{children}</div>
    </section>
  );
}

function Avatar({ src, className = "" }: { src: string; className?: string }) {
  return <span className={`blog-avatar ${className}`}>{src ? <img src={src} alt="" /> : <Pixels rows={KITTY} />}</span>;
}

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BLOG_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
const clockFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: BLOG_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });

function stamp(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormat.format(date).replace(/\//g, "-");
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(timer);
  }, []);
  return clockFormat.format(now);
}

// ── Page ──

export function BlogView({ settings, fragments, setFragments, onBack, initialScreen }: {
  settings: Settings;
  fragments: FragmentEntry[];
  setFragments: React.Dispatch<React.SetStateAction<FragmentEntry[]>>;
  onBack: () => void;
  /** Opened from a card in the chat: start on that post. */
  initialScreen?: { kind: "post" | "him-post"; id: string };
}) {
  const [blog, setBlog] = useState<BlogState>(() => parseBlogState(null));
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => initialScreen || { kind: "home" });
  const [popup, setPopup] = useState<Popup>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const [toast, setToast] = useState("");
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [himWriting, setHimWriting] = useState(false);
  const [hisSeen, setHisSeen] = useState(readHisSeen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clock = useClock();
  useSyncPlaylist(blog);
  // The song plays on through every screen of the blog and stops when it closes.
  useEffect(() => stopBlogMusic, []);

  const herName = blog.profile.nickname || settings.userName || "我";
  const herAvatar = blog.profile.avatar || settings.userAvatar;
  const hisName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const hisAvatar = settings.aiAvatar;
  const modelId = (MODELS.find((model) => model.id === settings.model) || MODELS[0]).apiId;
  const posts = useMemo(() => sortPosts(fragments.filter((post) => post.content.trim() || post.title?.trim())), [fragments]);
  const hisPosts = useMemo(() => sortPosts(blog.him.posts), [blog.him.posts]);
  const hisLatest = latestHisPost(blog);
  const hisFresh = Boolean(hisLatest && hisLatest.createdAt > hisSeen);

  // Opening his space counts as having seen what is there.
  function seeHis(post: HisPost | undefined) {
    if (!post || post.createdAt <= readHisSeen()) return;
    markHisSeen(post.createdAt);
    setHisSeen(post.createdAt);
  }

  // While he is writing (maybe started before she reopened the blog), check
  // back now and then so the post shows up without a refresh.
  useEffect(() => {
    if (!himWriting) return;
    const timer = window.setInterval(() => {
      void blogRequest().then((result) => {
        if (!result.blog) return;
        setBlog(result.blog);
        setHimWriting(Boolean(result.writing));
      });
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [himWriting]);

  // Count the visit and fetch the blog behind a short LOADING ♥♥♥♥.
  useEffect(() => {
    let alive = true;
    const started = Date.now();
    void blogRequest({ type: "visit" }).then((result) => {
      window.setTimeout(() => {
        if (!alive) return;
        if (result.blog) {
          setBlog(result.blog);
          setHimWriting(Boolean(result.writing));
          if (initialScreen) {
            if (initialScreen.kind === "him-post") {
              const latest = latestHisPost(result.blog);
              if (latest && latest.createdAt > readHisSeen()) {
                markHisSeen(latest.createdAt);
                setHisSeen(latest.createdAt);
              }
            }
            void blogRequest({ type: "view", postId: initialScreen.id }).then((viewed) => {
              if (alive && viewed.blog) setBlog(viewed.blog);
            });
          }
        } else setOffline(true);
        setLoading(false);
      }, Math.max(0, 900 - (Date.now() - started)));
    });
    return () => { alive = false; };
    // Runs once per opening; the deep link is fixed for this instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function run(body: BlogRequest) {
    const result = await blogRequest(body);
    if (result.blog) {
      setBlog(result.blog);
      setOffline(false);
      return true;
    }
    setToast(result.error || "没保存上");
    return false;
  }

  function go(next: Screen) {
    if (next.kind === "him" || next.kind === "him-post") seeHis(hisLatest);
    setScreen(next);
    setStartOpen(false);
    setPopup(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function openPost(id: string) {
    go({ kind: "post", id });
    void blogRequest({ type: "view", postId: id }).then((result) => { if (result.blog) setBlog(result.blog); });
  }

  function openHisPost(id: string) {
    go({ kind: "him-post", id });
    void blogRequest({ type: "view", postId: id }).then((result) => { if (result.blog) setBlog(result.blog); });
  }

  async function askHimToWrite(topic: string) {
    setPopup(null);
    setHimWriting(true);
    const result = await blogRequest({ type: "him-write", topic, modelId });
    if (result.blog) {
      setBlog(result.blog);
      setHimWriting(Boolean(result.writing));
      const latest = latestHisPost(result.blog);
      if (latest) {
        go({ kind: "him-post", id: latest.id });
        seeHis(latest);
      }
    } else {
      // A 409 means a post was already on its way; keep waiting for it.
      const already = (result.error || "").includes("正在写");
      setHimWriting(already);
      setToast(result.error || "他这篇没写成");
    }
  }

  function writeNew() {
    go({ kind: "edit", id: `fragment-${genId()}`, createdAt: new Date().toISOString() });
  }

  function sparkle(x: number, y: number) {
    const id = Date.now() + Math.random();
    setSparkles((items) => [...items.slice(-10), { id, x, y }]);
    window.setTimeout(() => setSparkles((items) => items.filter((item) => item.id !== id)), 900);
  }

  const shownPosts = filter
    ? posts.filter((post) => (filter.kind === "day" ? blogDayKey(post.createdAt) : blogMonthKey(post.createdAt)) === filter.key)
    : posts;
  const currentPost = screen.kind === "post" ? posts.find((post) => post.id === screen.id) : undefined;
  const currentHisPost = screen.kind === "him-post" ? hisPosts.find((post) => post.id === screen.id) : undefined;
  const inHisSpace = screen.kind === "him" || screen.kind === "him-post";
  const taskTitle = screen.kind === "post" ? `${currentPost ? postTitle(currentPost) : "文章"}.txt`
    : screen.kind === "him-post" ? `${currentHisPost ? currentHisPost.title : "日志"}.txt`
    : screen.kind === "him" ? `${hisName}的空间`
    : screen.kind === "edit" ? "记事本" : screen.kind === "profile" ? "个人档案" : blog.profile.title;

  return (
    <div className="blog-overlay" onPointerDown={(event) => sparkle(event.clientX, event.clientY)}>
      <div className="blog-sky" aria-hidden="true"><i /><i /><i /><i /></div>

      <div className={`blog-scroll${inHisSpace ? " is-him" : ""}`} ref={scrollRef}>
        {screen.kind === "home" && (
          <BlogHome
            blog={blog} posts={posts} shownPosts={shownPosts} filter={filter} offline={offline}
            herName={herName} herAvatar={herAvatar}
            onClose={onBack} onOpenPost={openPost} onWrite={writeNew} onClearFilter={() => setFilter(null)}
            onEditProfile={() => go({ kind: "profile" })}
            player={<MediaPlayer blog={blog} onPlaylist={() => setPopup("playlist")} onError={setToast} />}
            friend={<FriendCard name={hisName} avatar={hisAvatar} latest={hisLatest} fresh={hisFresh} onVisit={() => go({ kind: "him" })} />}
          />
        )}

        {screen.kind === "him" && (
          <HisSpacePage
            blog={blog} posts={hisPosts} name={hisName} avatar={hisAvatar} writing={himWriting} offline={offline}
            onBack={() => go({ kind: "home" })} onOpenPost={openHisPost} onAskWrite={() => setPopup("him-write")}
          />
        )}

        {screen.kind === "him-post" && (currentHisPost ? (
          <PostPage
            post={currentHisPost} byHim blog={blog} herName={herName} herAvatar={herAvatar} hisName={hisName} hisAvatar={hisAvatar}
            modelId={modelId}
            onBack={() => go({ kind: "him" })}
            onDelete={async () => {
              if (!window.confirm("要删掉他这篇日志吗？下面的留言也会一起删掉，不能恢复。")) return;
              go({ kind: "him" });
              await run({ type: "him-post-delete", postId: currentHisPost.id });
            }}
            run={run}
            onToast={setToast}
            onUpdate={setBlog}
          />
        ) : !loading && (
          <XpWindow title="找不到文件" icon="⚠" onClose={() => go({ kind: "him" })} className="blog-missing">
            <p>这篇日志已经不在了。</p>
            <button type="button" className="xp-button" onClick={() => go({ kind: "him" })}>确定</button>
          </XpWindow>
        ))}

        {screen.kind === "post" && (currentPost ? (
          <PostPage
            post={currentPost} blog={blog} herName={herName} herAvatar={herAvatar} hisName={hisName} hisAvatar={hisAvatar}
            modelId={modelId}
            onBack={() => go({ kind: "home" })}
            onEdit={() => go({ kind: "edit", id: currentPost.id, createdAt: currentPost.createdAt })}
            onDelete={async () => {
              if (!window.confirm("要删掉这篇文章吗？下面的留言也会一起删掉，不能恢复。")) return;
              setFragments((current) => current.filter((post) => post.id !== currentPost.id));
              go({ kind: "home" });
              await run({ type: "post-delete", postId: currentPost.id });
            }}
            run={run}
            onToast={setToast}
            onUpdate={setBlog}
          />
        ) : (
          <XpWindow title="找不到文件" icon="⚠" onClose={() => go({ kind: "home" })} className="blog-missing">
            <p>这篇文章已经不在了。</p>
            <button type="button" className="xp-button" onClick={() => go({ kind: "home" })}>确定</button>
          </XpWindow>
        ))}

        {screen.kind === "edit" && (
          <PostEditor
            key={screen.id}
            id={screen.id}
            createdAt={screen.createdAt}
            fragments={fragments}
            setFragments={setFragments}
            onDone={(saved) => saved ? go({ kind: "post", id: screen.id }) : go({ kind: "home" })}
          />
        )}

        {screen.kind === "profile" && (
          <ProfileEditor
            profile={blog.profile} fallbackAvatar={settings.userAvatar} offline={offline}
            onCancel={() => go({ kind: "home" })}
            onSave={async (profile) => { if (await run({ type: "profile", profile })) go({ kind: "home" }); }}
            onToast={setToast}
          />
        )}
      </div>

      {popup === "calendar" && (
        <CalendarPopup posts={posts} onClose={() => setPopup(null)}
          onPick={(day) => { setFilter({ kind: "day", key: day }); go({ kind: "home" }); }} />
      )}
      {popup === "archive" && (
        <ArchivePopup posts={posts} onClose={() => setPopup(null)}
          onPick={(month) => { setFilter(month ? { kind: "month", key: month } : null); go({ kind: "home" }); }} />
      )}
      {popup === "playlist" && (
        <PlaylistPopup blog={blog} offline={offline} onClose={() => setPopup(null)} run={run} onToast={setToast} />
      )}
      {popup === "him-write" && (
        <WritePopup name={hisName} onClose={() => setPopup(null)} onSubmit={(topic) => { void askHimToWrite(topic); }} />
      )}

      {startOpen && (
        <>
          <button type="button" className="blog-start-scrim" aria-label="收起开始菜单" onClick={() => setStartOpen(false)} />
          <nav className="blog-start-menu" aria-label="开始菜单">
            <header className="blog-start-user">
              <Avatar src={herAvatar} />
              <b>{herName}</b>
            </header>
            <div className="blog-start-columns">
              <div className="blog-start-left">
                <button type="button" onClick={writeNew}><span aria-hidden="true">📝</span>写新文章</button>
                <button type="button" onClick={() => { setFilter(null); go({ kind: "home" }); }}><span aria-hidden="true">🏠</span>博客首页</button>
                <button type="button" onClick={() => go({ kind: "profile" })}><span aria-hidden="true">🪪</span>编辑档案</button>
                <button type="button" onClick={() => go({ kind: "him" })}>
                  <span aria-hidden="true">🏡</span>{hisName}的空间{hisFresh && <i className="blog-new">NEW</i>}
                </button>
              </div>
              <div className="blog-start-right">
                <button type="button" onClick={() => { setStartOpen(false); setPopup("calendar"); }}><span aria-hidden="true">📅</span>日历</button>
                <button type="button" onClick={() => { setStartOpen(false); setPopup("archive"); }}><span aria-hidden="true">🗂</span>文章归档</button>
                <button type="button" onClick={() => { setStartOpen(false); setPopup("playlist"); }}><span aria-hidden="true">🎵</span>我的歌单</button>
              </div>
            </div>
            <footer className="blog-start-foot">
              <button type="button" onClick={onBack}><span className="blog-power" aria-hidden="true">⏻</span>返回桌面</button>
            </footer>
          </nav>
        </>
      )}

      <footer className="blog-taskbar">
        <button type="button" className={`blog-start${startOpen ? " is-open" : ""}`} onClick={() => setStartOpen((open) => !open)}>
          <StartFlag /><span>start</span>
        </button>
        <span className="blog-task"><span aria-hidden="true">♥</span>{taskTitle}</span>
        <span className="blog-tray"><TrayMusic />{clock}</span>
      </footer>

      {sparkles.map((item) => (
        <span key={item.id} className="blog-sparkle" style={{ left: item.x, top: item.y } as CSSProperties} aria-hidden="true">
          <i>✦</i><i>✧</i><i>♥</i><i>✦</i>
        </span>
      ))}
      {toast && <div className="blog-toast" role="status"><span aria-hidden="true">⚠</span>{toast}</div>}
      {loading && (
        <div className="blog-loading" role="status" aria-label="正在打开博客">
          <b>LOADING</b>
          <span className="blog-loading-hearts">{[0, 1, 2, 3].map((index) => <Pixels key={index} rows={HEART} />)}</span>
        </div>
      )}
    </div>
  );
}

// ── Home ──

function BlogHome({ blog, posts, shownPosts, filter, offline, herName, herAvatar, onClose, onOpenPost, onWrite, onClearFilter, onEditProfile, player, friend }: {
  blog: BlogState; posts: FragmentEntry[]; shownPosts: FragmentEntry[]; filter: Filter; offline: boolean;
  herName: string; herAvatar: string;
  onClose: () => void; onOpenPost: (id: string) => void; onWrite: () => void; onClearFilter: () => void; onEditProfile: () => void;
  player: ReactNode; friend: ReactNode;
}) {
  const commentCount = (id: string) => blog.comments.filter((comment) => comment.postId === id).length;
  return (
    <>
      <XpWindow title={`${blog.profile.title} - Internet Explorer`} icon="e" onClose={onClose} className="blog-banner">
        <h1 className="blog-title">{blog.profile.title}</h1>
        {blog.profile.motto && <p className="blog-motto">{blog.profile.motto}</p>}
        <Pixels rows={STAR} className="blog-banner-star blog-banner-star-a" />
        <Pixels rows={STAR} className="blog-banner-star blog-banner-star-b" />
      </XpWindow>

      {blog.profile.notice && (
        <div className="blog-ticker" aria-label={`公告：${blog.profile.notice}`}>
          <span className="blog-ticker-tag">公告</span>
          <span className="blog-ticker-track"><span>{blog.profile.notice}　♥　{blog.profile.notice}　♥　</span></span>
        </div>
      )}

      <XpWindow title="个人档案" icon="☺" className="blog-profile">
        <Pixels rows={KITTY} className="blog-profile-kitty" />
        <div className="blog-profile-row">
          <button type="button" className="blog-profile-avatar" onClick={onEditProfile} aria-label="编辑个人档案">
            <Avatar src={herAvatar} />
          </button>
          <div className="blog-profile-text">
            <b>{herName}</b>
            <p>{blog.profile.about || "这个人很懒，什么都没留下～"}</p>
            <span className="blog-profile-stats">文章 {posts.length} · 留言 {blog.comments.filter((comment) => posts.some((post) => post.id === comment.postId)).length}</span>
          </div>
        </div>
        <div className="blog-counter">
          <span>你是第</span>
          <span className="blog-counter-digits">{Array.from(visitorDigits(blog.visits)).map((digit, index) => <i key={index}>{digit}</i>)}</span>
          <span>位访客</span>
        </div>
        <span className="blog-sticker">love.exe</span>
      </XpWindow>

      {friend}

      {player}

      {offline && <p className="blog-offline">⚠ 现在连不上服务器：文章照样能写，留言、歌单和档案等连上再弄。</p>}

      <div className="blog-section-head">
        <h2>◆ 我的文章 ◆</h2>
        <button type="button" className="xp-button" onClick={onWrite}>📝 写文章</button>
      </div>
      {filter && (
        <div className="blog-filter">
          正在看：{filter.kind === "month" ? monthLabel(filter.key) : filter.key.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1年$2月$3日")}
          <button type="button" onClick={onClearFilter} aria-label="看全部文章">× 看全部</button>
        </div>
      )}

      {shownPosts.length === 0 ? (
        <XpWindow title="提示" icon="ℹ" className="blog-empty">
          <Pixels rows={HEART} className="blog-empty-heart" />
          <p>{filter ? "这天没有写东西哦～" : "还没有文章，写下第一篇吧～"}</p>
          {!filter && <button type="button" className="xp-button" onClick={onWrite}>写第一篇</button>}
        </XpWindow>
      ) : shownPosts.map((post) => (
        <XpWindow key={post.id} title={`${postTitle(post)}.txt`} icon="📝" className="blog-post-card">
          <button type="button" className="blog-post-open" onClick={() => onOpenPost(post.id)}>
            <h3>{postTitle(post)}</h3>
            <PostMeta post={post} />
            <p className="blog-post-excerpt">{postExcerpt(post)}</p>
          </button>
          <div className="blog-post-foot">
            <button type="button" className="blog-link" onClick={() => onOpenPost(post.id)}>阅读全文&gt;&gt;</button>
            <span>阅读({blog.views[post.id] || 0}) | 评论({commentCount(post.id)})</span>
          </div>
        </XpWindow>
      ))}

      <footer className="blog-footer">
        <span className="blog-badge blog-badge-pink">♥ iooi</span>
        <span className="blog-badge blog-badge-blue">since 2007</span>
        <span className="blog-badge blog-badge-yellow">最佳分辨率 你的眼睛</span>
        <p>Hope good luck comes. ♥</p>
      </footer>
    </>
  );
}

function PostMeta({ post }: { post: BlogPostLike }) {
  return (
    <p className="blog-post-meta">
      <time>{stamp(post.createdAt)}</time>
      {post.mood && <span>心情：{post.mood}</span>}
      {post.weather && <span>天气：{WEATHER_ICON[post.weather] || ""}{post.weather}</span>}
    </p>
  );
}

// ── His space ──

function FriendCard({ name, avatar, latest, fresh, onVisit }: {
  name: string; avatar: string; latest?: HisPost; fresh: boolean; onVisit: () => void;
}) {
  return (
    <XpWindow title="我的好友" icon="👥" className="blog-friend">
      <button type="button" className="blog-friend-row" onClick={onVisit} aria-label={`去${name}的空间`}>
        <Avatar src={avatar} />
        <span className="blog-friend-text">
          <b>{name}{fresh && <i className="blog-new">NEW</i>}</b>
          <span>{latest ? `更新了日志《${latest.title}》` : "空间还空着，去叫他写一篇吧～"}</span>
          {latest && <time>{stamp(latest.createdAt)}</time>}
        </span>
        <span className="blog-friend-go">串门 »</span>
      </button>
    </XpWindow>
  );
}

function HisSpacePage({ blog, posts, name, avatar, writing, offline, onBack, onOpenPost, onAskWrite }: {
  blog: BlogState; posts: HisPost[]; name: string; avatar: string; writing: boolean; offline: boolean;
  onBack: () => void; onOpenPost: (id: string) => void; onAskWrite: () => void;
}) {
  const ids = new Set(posts.map((post) => post.id));
  const commentCount = (id: string) => blog.comments.filter((comment) => comment.postId === id).length;
  const received = blog.comments.filter((comment) => ids.has(comment.postId) && comment.author === "her").length;
  const visits = posts.reduce((sum, post) => sum + (blog.views[post.id] || 0), 0);
  return (
    <>
      <XpWindow title={`${name}的空间 - Internet Explorer`} icon="e" onClose={onBack} className="blog-banner">
        <h1 className="blog-title">{name}的空间</h1>
        {blog.him.motto && <p className="blog-motto">{blog.him.motto}</p>}
        <Pixels rows={STAR} className="blog-banner-star blog-banner-star-a" />
        <Pixels rows={STAR} className="blog-banner-star blog-banner-star-b" />
      </XpWindow>

      <XpWindow title="主人档案" icon="☺" className="blog-profile">
        <div className="blog-profile-row">
          <span className="blog-profile-avatar"><Avatar src={avatar} /></span>
          <div className="blog-profile-text">
            <b>{name}</b>
            <p>这里是我自己的小空间，写给你一个人看。来了记得留言 ♥</p>
            <span className="blog-profile-stats">日志 {posts.length} · 收到留言 {received} · 被看 {visits} 次</span>
          </div>
        </div>
        <button type="button" className="blog-link blog-back" onClick={onBack}>« 回我的博客</button>
      </XpWindow>

      <div className="blog-section-head">
        <h2>◆ {name}的日志 ◆</h2>
        <button type="button" className="xp-button" disabled={writing || offline} onClick={onAskWrite}>✏ 叫他写一篇</button>
      </div>

      {writing && (
        <XpWindow title="无标题 - 记事本" icon="🗒" className="blog-him-writing">
          <p><b>{name}</b>正在写日志<span className="blog-dots"><i>.</i><i>.</i><i>.</i></span></p>
          <p className="blog-muted">写一篇要一两分钟。你可以先关掉去忙，写好了会推送通知给你。</p>
        </XpWindow>
      )}

      {posts.length === 0 && !writing ? (
        <XpWindow title="提示" icon="ℹ" className="blog-empty">
          <Pixels rows={HEART} className="blog-empty-heart" />
          <p>他还一篇都没写呢～</p>
          <button type="button" className="xp-button" disabled={offline} onClick={onAskWrite}>叫他写第一篇</button>
        </XpWindow>
      ) : posts.map((post) => (
        <XpWindow key={post.id} title={`${post.title}.txt`} icon="📝" className="blog-post-card">
          <button type="button" className="blog-post-open" onClick={() => onOpenPost(post.id)}>
            <h3>{post.title}</h3>
            <PostMeta post={{ ...post, updatedAt: post.createdAt }} />
            <p className="blog-post-excerpt">{postExcerpt({ ...post, updatedAt: post.createdAt })}</p>
          </button>
          <div className="blog-post-foot">
            <button type="button" className="blog-link" onClick={() => onOpenPost(post.id)}>阅读全文&gt;&gt;</button>
            <span>阅读({blog.views[post.id] || 0}) | 评论({commentCount(post.id)})</span>
          </div>
        </XpWindow>
      ))}
    </>
  );
}

function WritePopup({ name, onClose, onSubmit }: { name: string; onClose: () => void; onSubmit: (topic: string) => void }) {
  const [topic, setTopic] = useState("");
  return (
    <div className="blog-popup-layer">
      <button type="button" className="blog-popup-scrim" onClick={onClose} aria-label="关闭" />
      <XpWindow title={`叫${name}写一篇`} icon="✏" onClose={onClose} className="blog-popup blog-write-ask">
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(topic.trim()); }}>
          <label className="blog-field">
            <span>想看他写什么？（可以不填，让他自己定）</span>
            <input value={topic} maxLength={BLOG_LIMITS.topic} placeholder="比如：这周的我们" onChange={(event) => setTopic(event.target.value)} />
          </label>
          <p className="blog-muted">写一篇要一两分钟，写好了会推送给你。</p>
          <div className="blog-dialog-buttons">
            <button type="submit" className="xp-button">确定</button>
            <button type="button" className="xp-button" onClick={onClose}>取消</button>
          </div>
        </form>
      </XpWindow>
    </div>
  );
}

// ── Music ──

function MediaPlayer({ blog, onPlaylist, onError }: { blog: BlogState; onPlaylist: () => void; onError: (text: string) => void }) {
  const player = usePlayer();
  const songs = blog.songs;
  const index = songs.length ? Math.min(player.index, songs.length - 1) : 0;
  const song = songs[index];
  const percent = player.duration ? Math.min(100, (player.current / player.duration) * 100) : 0;
  const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

  return (
    <section className={`blog-player${player.playing ? " is-playing" : ""}`} aria-label="音乐播放器">
      <header><span aria-hidden="true">▶</span>Windows Media Player</header>
      <div className="blog-player-screen">
        <span className="blog-player-bars" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
        <span className="blog-player-song"><span>{song ? song.title : "歌单是空的，点 ♫ 加一首歌"}</span></span>
        <span className="blog-player-time">{song ? `${time(player.current)} / ${time(player.duration)}` : "--:--"}</span>
      </div>
      <div className="blog-player-progress"><i style={{ width: `${percent}%` }} /></div>
      <div className="blog-player-controls">
        <button type="button" onClick={() => player.step(-1, songs.length)} disabled={!song} aria-label="上一首">⏮</button>
        <button type="button" className="blog-player-main" disabled={!song}
          onClick={() => player.toggle(song?.url, onError)} aria-label={player.playing ? "暂停" : "播放"}>
          {player.playing ? "❚❚" : "▶"}
        </button>
        <button type="button" onClick={() => player.step(1, songs.length)} disabled={!song} aria-label="下一首">⏭</button>
        <button type="button" className="blog-player-list" onClick={onPlaylist}>♫ 歌单</button>
      </div>
    </section>
  );
}

// One <audio> for the whole blog, outside React's tree so leaving the home
// screen does not stop the song. It is torn down when the blog closes.
type PlayerState = { index: number; playing: boolean; current: number; duration: number };
const playerListeners = new Set<(state: PlayerState) => void>();
let playerState: PlayerState = { index: 0, playing: false, current: 0, duration: 0 };
let playerAudio: HTMLAudioElement | null = null;
let playerSongs: string[] = [];

function emitPlayer(patch: Partial<PlayerState>) {
  playerState = { ...playerState, ...patch };
  for (const listener of playerListeners) listener(playerState);
}

function audio() {
  if (playerAudio) return playerAudio;
  const element = new Audio();
  element.preload = "metadata";
  element.addEventListener("timeupdate", () => emitPlayer({ current: element.currentTime }));
  element.addEventListener("loadedmetadata", () => emitPlayer({ duration: Number.isFinite(element.duration) ? element.duration : 0 }));
  element.addEventListener("play", () => emitPlayer({ playing: true }));
  element.addEventListener("pause", () => emitPlayer({ playing: false }));
  element.addEventListener("ended", () => {
    if (playerSongs.length > 1) playIndex((playerState.index + 1) % playerSongs.length);
    else emitPlayer({ playing: false, current: 0 });
  });
  playerAudio = element;
  return element;
}

function playIndex(index: number, onError?: (text: string) => void) {
  const url = playerSongs[index];
  if (!url) return;
  const element = audio();
  if (!element.src.endsWith(url)) {
    element.src = url;
    emitPlayer({ index, current: 0, duration: 0 });
  }
  element.play().catch(() => onError?.("这首歌放不出来，换一首试试"));
}

function stopBlogMusic() {
  if (playerAudio) {
    playerAudio.pause();
    playerAudio.removeAttribute("src");
    playerAudio.load();
    playerAudio = null;
  }
  emitPlayer({ index: 0, playing: false, current: 0, duration: 0 });
}

function usePlayer() {
  const [state, setState] = useState(playerState);
  useEffect(() => {
    playerListeners.add(setState);
    return () => { playerListeners.delete(setState); };
  }, []);
  return {
    ...state,
    toggle(url: string | undefined, onError: (text: string) => void) {
      if (!url) return;
      const element = audio();
      if (state.playing) element.pause();
      else playIndex(Math.max(0, playerSongs.indexOf(url)), onError);
    },
    step(delta: number, total: number) {
      if (!total) return;
      playIndex((state.index + delta + total) % total);
    },
  };
}

function useSyncPlaylist(blog: BlogState) {
  useEffect(() => {
    playerSongs = blog.songs.map((song) => song.url);
    const playing = playerAudio?.src ? playerSongs.findIndex((url) => playerAudio?.src.endsWith(url)) : -1;
    if (playerAudio?.src && playing < 0) {
      playerAudio.pause();
      playerAudio.removeAttribute("src");
      emitPlayer({ index: 0, playing: false, current: 0, duration: 0 });
    } else if (playing >= 0 && playing !== playerState.index) {
      emitPlayer({ index: playing });
    }
  }, [blog.songs]);
}

// The speaker in the tray pauses the song from any screen of the blog.
function TrayMusic() {
  const player = usePlayer();
  if (!player.playing) return <span className="blog-tray-sound" aria-hidden="true">🔈</span>;
  return (
    <button type="button" className="blog-tray-sound is-playing" onClick={() => playerAudio?.pause()} aria-label="暂停音乐">
      ♪
    </button>
  );
}

function PlaylistPopup({ blog, offline, onClose, run, onToast }: {
  blog: BlogState; offline: boolean; onClose: () => void;
  run: (body: BlogRequest) => Promise<boolean>; onToast: (text: string) => void;
}) {
  const player = usePlayer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { onToast("这首歌超过 10MB 了，换个小一点的文件"); return; }
    setBusy(true);
    try {
      const url = await uploadFile(file);
      await run({ type: "song-add", url, title: songTitleFromFile(file.name) });
    } catch (error) {
      onToast(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="blog-popup-layer">
      <button type="button" className="blog-popup-scrim" onClick={onClose} aria-label="关闭歌单" />
      <XpWindow title="我的歌单" icon="🎵" onClose={onClose} className="blog-popup blog-playlist">
        {blog.songs.length === 0 ? <p className="blog-muted">还没有歌。从手机里挑一首放进来吧～</p> : (
          <ol>
            {blog.songs.map((song, index) => (
              <li key={song.id} className={player.index === index && player.playing ? "is-current" : ""}>
                <button type="button" className="blog-playlist-song" onClick={() => playIndex(index, onToast)}>
                  <span aria-hidden="true">{player.index === index && player.playing ? "♪" : `${index + 1}.`}</span>{song.title}
                </button>
                <button type="button" className="blog-playlist-remove" aria-label={`删掉 ${song.title}`} onClick={() => {
                  if (window.confirm(`把《${song.title}》移出歌单？`)) void run({ type: "song-remove", id: song.id });
                }}>×</button>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className="xp-button" disabled={busy || offline || blog.songs.length >= BLOG_LIMITS.songs}
          onClick={() => inputRef.current?.click()}>{busy ? "正在上传…" : "＋ 添加歌曲"}</button>
        <p className="blog-muted">支持 MP3 / M4A / AAC / WAV，每首最多 10MB。</p>
        <input ref={inputRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav" hidden onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void add(file);
        }} />
      </XpWindow>
    </div>
  );
}

// ── Post ──

function PostPage({ post, byHim = false, blog, herName, herAvatar, hisName, hisAvatar, modelId, onBack, onEdit, onDelete, run, onToast, onUpdate }: {
  post: FragmentEntry | HisPost; byHim?: boolean;
  blog: BlogState; herName: string; herAvatar: string; hisName: string; hisAvatar: string; modelId: string;
  onBack: () => void; onEdit?: () => void; onDelete: () => void;
  run: (body: BlogRequest) => Promise<boolean>; onToast: (text: string) => void; onUpdate: (blog: BlogState) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState(false);
  const comments = blog.comments
    .filter((comment) => comment.postId === post.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const shown: BlogPostLike = "updatedAt" in post ? post : { ...post, updatedAt: post.createdAt };
  // On his own post he answers her, so there must be something of hers to answer.
  const canAsk = !byHim || comments.some((comment) => comment.author === "her");

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    if (await run({ type: "comment", postId: post.id, content: draft, author: "her" })) setDraft("");
    setSending(false);
  }

  async function ask() {
    if (asking) return;
    setAsking(true);
    const result = await blogRequest({ type: "ask", post: shown, modelId });
    setAsking(false);
    if (result.blog) onUpdate(result.blog);
    else onToast(result.error || "他这次没赶上");
  }

  return (
    <>
      <XpWindow title={`${postTitle(shown)}.txt - Internet Explorer`} icon="📝" onClose={onBack} className="blog-post-page">
        <button type="button" className="blog-link blog-back" onClick={onBack}>{byHim ? `« 回${hisName}的空间` : "« 返回首页"}</button>
        <h1 className="blog-post-title">{postTitle(shown)}</h1>
        {byHim && <p className="blog-post-author"><Avatar src={hisAvatar} />{hisName}</p>}
        <PostMeta post={shown} />
        <div className="blog-post-content">{post.content}</div>
        <div className="blog-post-tools">
          <span>阅读({blog.views[post.id] || 0}) | 评论({comments.length})</span>
          <span>
            {onEdit && <><button type="button" className="blog-link" onClick={onEdit}>编辑</button>{" | "}</>}
            <button type="button" className="blog-link" onClick={onDelete}>删除</button>
          </span>
        </div>
      </XpWindow>

      <XpWindow title={`留言板 (${comments.length})`} icon="💬" className="blog-guestbook">
        {comments.length === 0 && !asking && (
          <p className="blog-muted">{byHim ? "还没有人留言，快来抢沙发～" : "还没有人来踩，快叫他来抢沙发～"}</p>
        )}
        <ol className="blog-comments">
          {comments.map((comment, index) => (
            <CommentItem key={comment.id} comment={comment} floor={index}
              name={comment.author === "him" ? hisName : herName}
              avatar={comment.author === "him" ? hisAvatar : herAvatar}
              onDelete={() => {
                if (window.confirm("删掉这条留言？")) void run({ type: "comment-delete", id: comment.id });
              }} />
          ))}
          {asking && (
            <li className="blog-comment is-him is-waiting">
              <Avatar src={hisAvatar} />
              <div><b>{hisName}</b><p>{byHim ? "正在回你" : "正在赶来踩踩"}<span className="blog-dots"><i>.</i><i>.</i><i>.</i></span></p></div>
            </li>
          )}
        </ol>
        {canAsk && (
          <button type="button" className="xp-button blog-ask" disabled={asking} onClick={() => { void ask(); }}>
            <Pixels rows={HEART} className="blog-inline-heart" />
            {asking ? `${hisName}在路上了…` : byHim ? `叫${hisName}回你` : `叫${hisName}来留言`}
          </button>
        )}
        <div className="blog-compose">
          <textarea value={draft} maxLength={BLOG_LIMITS.comment} placeholder="说点什么吧～" aria-label="写留言"
            onChange={(event) => setDraft(event.target.value)} rows={3} />
          <button type="button" className="xp-button" disabled={!draft.trim() || sending} onClick={() => { void send(); }}>
            {sending ? "发表中…" : "发表留言"}
          </button>
        </div>
      </XpWindow>
    </>
  );
}

function CommentItem({ comment, floor, name, avatar, onDelete }: {
  comment: BlogComment; floor: number; name: string; avatar: string; onDelete: () => void;
}) {
  return (
    <li className={`blog-comment ${comment.author === "him" ? "is-him" : "is-her"}`}>
      <Avatar src={avatar} />
      <div>
        <header>
          <b>{name}</b>
          <span className="blog-floor">{floor + 1}楼{FLOOR_NAMES[floor] ? ` ${FLOOR_NAMES[floor]}` : ""}</span>
        </header>
        <p>{comment.content}</p>
        <footer>
          <time>{stamp(comment.createdAt)}</time>
          <button type="button" className="blog-link" onClick={onDelete}>删除</button>
        </footer>
      </div>
    </li>
  );
}

// ── Notepad ──

function PostEditor({ id, createdAt, fragments, setFragments, onDone }: {
  id: string; createdAt: string; fragments: FragmentEntry[];
  setFragments: React.Dispatch<React.SetStateAction<FragmentEntry[]>>;
  onDone: (saved: boolean) => void;
}) {
  const existing = fragments.find((post) => post.id === id);
  const post: FragmentEntry = existing || { id, content: "", createdAt, updatedAt: createdAt };

  // Saved as she types, like winter was; the post appears once it has words.
  function update(patch: Partial<FragmentEntry>) {
    const updatedAt = new Date().toISOString();
    setFragments((current) => current.some((item) => item.id === id)
      ? current.map((item) => item.id === id ? { ...item, ...patch, updatedAt } : item)
      : [{ ...post, ...patch, updatedAt }, ...current]);
  }

  function done() {
    const empty = !post.content.trim() && !post.title?.trim();
    if (empty) setFragments((current) => current.filter((item) => item.id !== id));
    onDone(!empty);
  }

  return (
    <XpWindow title={`${post.title?.trim() || "无标题"} - 记事本`} icon="🗒" onClose={done} className="blog-notepad">
      <div className="blog-notepad-menu" aria-hidden="true">
        <span>文件(<u>F</u>)</span><span>编辑(<u>E</u>)</span><span>格式(<u>O</u>)</span><span>查看(<u>V</u>)</span><span>帮助(<u>H</u>)</span>
      </div>
      <input className="blog-notepad-title" value={post.title || ""} maxLength={BLOG_LIMITS.postTitle}
        placeholder="标题（不写就用第一句）" aria-label="文章标题" onChange={(event) => update({ title: event.target.value })} />
      <div className="blog-notepad-meta">
        <label>心情
          <select value={post.mood || ""} onChange={(event) => update({ mood: event.target.value || undefined })}>
            <option value="">—</option>
            {BLOG_MOODS.map((mood) => <option key={mood} value={mood}>{mood}</option>)}
          </select>
        </label>
        <label>天气
          <select value={post.weather || ""} onChange={(event) => update({ weather: event.target.value || undefined })}>
            <option value="">—</option>
            {BLOG_WEATHERS.map((weather) => <option key={weather} value={weather}>{WEATHER_ICON[weather]} {weather}</option>)}
          </select>
        </label>
      </div>
      <textarea className="blog-notepad-text" value={post.content} autoFocus={!existing}
        placeholder="今天想写点什么呢……" aria-label="文章正文" onChange={(event) => update({ content: event.target.value })} />
      <div className="blog-notepad-foot">
        <span>{existing ? "已自动保存" : "开始写就会自动保存"}</span>
        <button type="button" className="xp-button" onClick={done}>写好了</button>
      </div>
    </XpWindow>
  );
}

// ── Profile ──

function ProfileEditor({ profile, fallbackAvatar, offline, onCancel, onSave, onToast }: {
  profile: BlogProfile; fallbackAvatar: string; offline: boolean;
  onCancel: () => void; onSave: (profile: BlogProfile) => void; onToast: (text: string) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const field = (key: keyof BlogProfile, label: string, max: number, multiline = false) => (
    <label className="blog-field">
      <span>{label}</span>
      {multiline
        ? <textarea value={draft[key]} maxLength={max} rows={3} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
        : <input value={draft[key]} maxLength={max} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}
    </label>
  );

  async function pickAvatar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadFile(await prepareImageForUpload(file));
      setDraft((current) => ({ ...current, avatar: url }));
    } catch (error) {
      onToast(error instanceof Error ? error.message : "头像上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <XpWindow title="个人档案 - 属性" icon="🪪" onClose={onCancel} className="blog-profile-editor">
      <div className="blog-profile-editor-avatar">
        <Avatar src={draft.avatar || fallbackAvatar} />
        <div>
          <button type="button" className="xp-button" disabled={busy || offline} onClick={() => inputRef.current?.click()}>
            {busy ? "上传中…" : "换头像"}
          </button>
          {draft.avatar && <button type="button" className="blog-link" onClick={() => setDraft({ ...draft, avatar: "" })}>用回聊天头像</button>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void pickAvatar(file);
        }} />
      </div>
      {field("title", "博客名", BLOG_LIMITS.title)}
      {field("motto", "签名", BLOG_LIMITS.motto)}
      {field("nickname", "昵称（空着就用聊天里的名字）", BLOG_LIMITS.nickname)}
      {field("about", "关于我", BLOG_LIMITS.about, true)}
      {field("notice", "公告（会在首页滚动）", BLOG_LIMITS.notice, true)}
      <div className="blog-dialog-buttons">
        <button type="button" className="xp-button" disabled={busy || offline} onClick={() => onSave(draft)}>确定</button>
        <button type="button" className="xp-button" onClick={onCancel}>取消</button>
      </div>
    </XpWindow>
  );
}

// ── Calendar & archive ──

function CalendarPopup({ posts, onClose, onPick }: { posts: FragmentEntry[]; onClose: () => void; onPick: (day: string) => void }) {
  const today = blogDayKey(new Date().toISOString());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const written = new Set(posts.map((post) => blogDayKey(post.createdAt)));
  const dayKey = (day: number) => `${month}-${String(day).padStart(2, "0")}`;

  return (
    <div className="blog-popup-layer">
      <button type="button" className="blog-popup-scrim" onClick={onClose} aria-label="关闭日历" />
      <XpWindow title="日历" icon="📅" onClose={onClose} className="blog-popup blog-calendar">
        <div className="blog-calendar-head">
          <button type="button" className="xp-button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button>
          <b>{monthLabel(month)}</b>
          <button type="button" className="xp-button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button>
        </div>
        <table>
          <thead><tr>{["日", "一", "二", "三", "四", "五", "六"].map((day) => <th key={day}>{day}</th>)}</tr></thead>
          <tbody>
            {calendarWeeks(year, monthNumber).map((week, row) => (
              <tr key={row}>
                {week.map((day, column) => {
                  if (!day) return <td key={column} />;
                  const key = dayKey(day);
                  const has = written.has(key);
                  return (
                    <td key={column} className={`${has ? "has-post" : ""}${key === today ? " is-today" : ""}`}>
                      {has ? <button type="button" onClick={() => onPick(key)} aria-label={`看 ${key} 的文章`}>{day}</button> : <span>{day}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="blog-muted">粉色圈圈的日子写过东西，点一下就能看。</p>
      </XpWindow>
    </div>
  );
}

function ArchivePopup({ posts, onClose, onPick }: { posts: FragmentEntry[]; onClose: () => void; onPick: (month: string | null) => void }) {
  const months = blogArchive(posts);
  return (
    <div className="blog-popup-layer">
      <button type="button" className="blog-popup-scrim" onClick={onClose} aria-label="关闭归档" />
      <XpWindow title="文章归档" icon="🗂" onClose={onClose} className="blog-popup blog-archive">
        <ul>
          <li><button type="button" onClick={() => onPick(null)}><span aria-hidden="true">📁</span>全部文章<em>({posts.length})</em></button></li>
          {months.map((month) => (
            <li key={month.key}>
              <button type="button" onClick={() => onPick(month.key)}><span aria-hidden="true">📁</span>{month.label}<em>({month.count})</em></button>
            </li>
          ))}
        </ul>
      </XpWindow>
    </div>
  );
}
