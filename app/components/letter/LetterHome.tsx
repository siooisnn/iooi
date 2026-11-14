"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { paintBrowserChrome } from "../ThemeProvider";
import { Petals, useTogether } from "../HomeView";
import type { HomeApp } from "../HomeView";
import { useReadyLetters } from "../RetroDesktop";
import type { Settings } from "../../lib/app-settings";
import { CLAUDE_DEFAULT_NAME } from "../../lib/app-settings";

/* The white love-letter home: one page read from top to bottom. The entries
   are paragraphs of the letter rather than buttons, and the few ornaments
   (one flowing line, one sprig, one wax seal) follow the reading path. */

const PAPER = "#fbf8f3";

type Passage = { app: HomeApp; title: string; line: string };

// The body of the letter, in the order she asked for.
const PASSAGES: Passage[] = [
  { app: "chat", title: "Write to me", line: "想说什么，都可以慢慢告诉我。" },
  { app: "blog", title: "Letters we’ve kept", line: "把平凡的日子，写成我们的故事。" },
  { app: "heartbeat", title: "Close to my heart", line: "有些心动，不必说出口。" },
  { app: "reading", title: "Between the pages", line: "在书页之间，遇见另一个世界。" },
  { app: "mood", title: "Little things, big feelings", line: "今天的心情，也值得被珍藏。" },
  { app: "surf", title: "The world outside", line: "世界那么大，陪你慢慢去看。" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function LetterHome({ settings, onOpen }: { settings: Settings; onOpen: (app: HomeApp) => void }) {
  const { days, hours, minutes, seconds, ready, isAnniversary, now } = useTogether(settings.startDate);
  const letters = useReadyLetters();
  const claudeName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const gptName = settings.gptName || "GPT";
  const herName = settings.userName || "宝宝";

  useEffect(() => paintBrowserChrome(PAPER), []);

  const today = now === null ? null : new Date(now);
  const dateline = today ? `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}` : "";
  const since = settings.startDate.replaceAll("-", ".");

  // The later passages: same voice, a little quieter.
  const postscripts: Passage[] = [
    { app: "moon", title: "By moonlight", line: "那封写给月亮的长信，一直放在这里。" },
    {
      app: "capsule",
      title: "Sealed for someday",
      line: letters.count > 0 ? `有 ${letters.count} 封信，已经到了可以拆开的日子。` : "封好的话，要等到那一天再拆开。",
    },
    { app: "dayday", title: "Day by day", line: "柴米油盐的小事，也一笔一笔记着。" },
    { app: "artworks", title: "Little keepsakes", line: "聊天里落下的小作品，都收在这里。" },
    { app: "clawd", title: "A small companion", line: "小砖在等你，去摸摸它吧。" },
    { app: "susu-phone", title: "In his pocket", line: `偷偷看一眼，${claudeName}今天在忙什么。` },
  ];

  return (
    <section className="lh-home" aria-label="白色情书首页">
      {isAnniversary && <Petals />}
      <div className="lh-scroll">
        <article className="lh-letter">
          <header className="lh-letterhead">
            <span className="lh-brand">iooi</span>
            <time className="lh-dateline" dateTime={today ? today.toISOString().slice(0, 10) : undefined}>{dateline}</time>
          </header>

          <section className="lh-opening lh-unfold" style={{ "--lh-delay": "80ms" } as CSSProperties} aria-labelledby="lh-title">
            <Sprig />
            <h1 id="lh-title" className="lh-title">
              <span>As time</span>
              <span className="lh-title-turn">goes by</span>
            </h1>
            <p className="lh-promise">此后我们的每一秒，都是恩赐。</p>
            <FlowLine />
          </section>

          <section className="lh-together lh-unfold" style={{ "--lh-delay": "260ms" } as CSSProperties} aria-label="在一起的时间">
            <p className="lh-together-lead">For all the days we’ve shared…</p>
            <p className="lh-days" role="timer" aria-live="off">
              <span className="lh-days-wash" aria-hidden="true" />
              <b>{ready ? days : "—"}</b>
              <span className="lh-days-word">days</span>
            </p>
            <p className="lh-clock">
              {ready ? (
                <>
                  <span><b>{pad(hours)}</b> hours</span>
                  <i aria-hidden="true">·</i>
                  <span><b>{pad(minutes)}</b> minutes</span>
                  <i aria-hidden="true">·</i>
                  <span><b>{pad(seconds)}</b> seconds</span>
                </>
              ) : <span>&nbsp;</span>}
            </p>
            <p className="lh-still">And still counting, my love.</p>
          </section>

          <span className="lh-rule lh-unfold" style={{ "--lh-delay": "380ms" } as CSSProperties} aria-hidden="true" />

          <nav className="lh-body" aria-label="信里的段落">
            {PASSAGES.map((passage, index) => (
              <button
                type="button"
                key={passage.app}
                className={`lh-passage lh-passage-${index + 1} lh-unfold`}
                style={{ "--lh-delay": `${440 + index * 70}ms` } as CSSProperties}
                onClick={() => onOpen(passage.app)}
              >
                <span className="lh-passage-title">{passage.title}{"\u00a0"}<i aria-hidden="true">→</i></span>
                <span className="lh-passage-line">{passage.line}</span>
              </button>
            ))}

            <p className="lh-aside lh-unfold" style={{ "--lh-delay": "880ms" } as CSSProperties}>And a few more things, folded in…</p>

            {postscripts.map((passage, index) => (
              <button
                type="button"
                key={passage.app}
                className={`lh-passage lh-passage-quiet lh-quiet-${index + 1} lh-unfold${passage.app === "capsule" && letters.count > 0 ? " lh-passage-waiting" : ""}`}
                style={{ "--lh-delay": `${920 + index * 50}ms` } as CSSProperties}
                onClick={() => onOpen(passage.app)}
              >
                <span className="lh-passage-title">{passage.title}{"\u00a0"}<i aria-hidden="true">→</i></span>
                <span className="lh-passage-line">{passage.line}</span>
              </button>
            ))}
          </nav>

          <span className="lh-rule lh-unfold" style={{ "--lh-delay": "1150ms" } as CSSProperties} aria-hidden="true" />

          <footer className="lh-closing lh-unfold" style={{ "--lh-delay": "1200ms" } as CSSProperties}>
            <p className="lh-closing-script">With love, always.</p>
            <p className="lh-closing-line">未完待续，关于我们。</p>
            <p className="lh-signature">
              <span>{claudeName}</span><i aria-hidden="true">&amp;</i><span>{herName}</span>
              <WaxSeal />
            </p>
            <p className="lh-since">since {since}</p>
            <p className="lh-ps">
              <span className="lh-ps-mark">P.S.</span>
              信的最后还夹着
              <button type="button" onClick={() => onOpen("summer-claude")}>{claudeName}的手记</button>
              和
              <button type="button" onClick={() => onOpen("summer-gpt")}>{gptName}的手记</button>
              ；想换一张信纸，就去
              <button type="button" onClick={() => onOpen("settings")}>布置小窝</button>
              。
            </p>
          </footer>
        </article>
      </div>
    </section>
  );
}

/** A thin Art Nouveau line that leaves the title and drifts toward the days. */
function FlowLine() {
  return (
    <svg className="lh-flow" viewBox="0 0 320 92" aria-hidden="true">
      <path d="M8 10 C 70 4, 112 30, 168 34 S 262 22, 284 48 S 270 84, 232 87" pathLength={1} />
      <circle cx="230" cy="87" r="2.6" />
    </svg>
  );
}

/** One small sprig beside the title: two leaves and a blossom. */
function Sprig() {
  return (
    <svg className="lh-sprig" viewBox="0 0 64 78" aria-hidden="true">
      <path className="lh-sprig-stem" d="M14 74 C 22 56, 30 40, 44 20" />
      <path className="lh-sprig-leaf" d="M24 52 C 12 50, 6 42, 6 34 C 16 36, 22 42, 24 52 Z" />
      <path className="lh-sprig-leaf" d="M32 40 C 40 34, 50 34, 56 38 C 50 46, 40 46, 32 40 Z" />
      <g className="lh-sprig-bloom" transform="translate(46 16)">
        <circle cx="0" cy="-5" r="4" />
        <circle cx="4.8" cy="-1.5" r="4" />
        <circle cx="3" cy="4" r="4" />
        <circle cx="-3" cy="4" r="4" />
        <circle cx="-4.8" cy="-1.5" r="4" />
        <circle className="lh-sprig-heart" cx="0" cy="0" r="1.8" />
      </g>
    </svg>
  );
}

/** The seal pressed beside the signature. */
function WaxSeal() {
  return (
    <svg className="lh-seal" viewBox="0 0 40 40" aria-hidden="true">
      <path className="lh-seal-wax" d="M20 2.5 C 26 3, 29 1.5, 32.5 5.5 C 36 9, 38.5 12, 37.5 19 C 38.5 25, 36.5 29.5, 33 33 C 29 37, 25 38.5, 19.5 37.5 C 14 38.5, 9.5 36.5, 6.5 33 C 3 29.5, 1.5 25, 2.5 19.5 C 1.5 14, 3.5 9.5, 7 6.5 C 10.5 3, 14.5 2, 20 2.5 Z" />
      <circle className="lh-seal-ring" cx="20" cy="20" r="11.5" />
      <text x="20" y="25.5" textAnchor="middle">i</text>
    </svg>
  );
}
