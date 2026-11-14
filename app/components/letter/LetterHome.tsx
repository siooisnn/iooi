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
   (a rose sprig, one flowing line, a ribbon, a sliver of moon, one wax seal)
   grow out of the words and the white space around them. */

const PAPER = "#fbf8f3";

type Passage = { app: HomeApp; title: string; line: string };

// The body of the letter, in the order she asked for.
const PASSAGES: Passage[] = [
  { app: "chat", title: "Write to me", line: "想说什么，都可以慢慢告诉我。" },
  { app: "heartbeat", title: "Close to my heart", line: "有些心动，不必说出口。" },
  { app: "summer-claude", title: "susurain", line: "酥酥的手记，写着写着，都是你。" },
  { app: "dayday", title: "Day by day", line: "柴米油盐的小事，也一笔一笔记着。" },
  { app: "clawd", title: "A small companion", line: "小砖在等你，去摸摸它吧。" },
  { app: "blog", title: "Letters we’ve kept", line: "把平凡的日子，写成我们的故事。" },
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
    { app: "artworks", title: "Little keepsakes", line: "聊天里落下的小作品，都收在这里。" },
    { app: "summer-gpt", title: "yuyu🌧️", line: "郁郁的手记，夹在信纸的另一页。" },
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
            <p className="lh-together-lead"><span>For all the days we’ve shared…</span></p>
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
                <span className="lh-passage-title">{passage.title}</span>
                <span className="lh-passage-line">{passage.line}</span>
              </button>
            ))}

            <p className="lh-aside lh-unfold" style={{ "--lh-delay": "1060ms" } as CSSProperties}>
              <span>And a few more things, folded in…</span>
              <Ribbon />
            </p>

            {postscripts.map((passage, index) => (
              <button
                type="button"
                key={passage.app}
                className={`lh-passage lh-passage-quiet lh-quiet-${index + 1} lh-unfold${passage.app === "capsule" && letters.count > 0 ? " lh-passage-waiting" : ""}`}
                style={{ "--lh-delay": `${1100 + index * 50}ms` } as CSSProperties}
                onClick={() => onOpen(passage.app)}
              >
                <span className="lh-passage-title">{passage.title}</span>
                {passage.app === "moon" && <Moonlet />}
                <span className="lh-passage-line">{passage.line}</span>
              </button>
            ))}
          </nav>

          <span className="lh-rule lh-unfold" style={{ "--lh-delay": "1360ms" } as CSSProperties} aria-hidden="true" />

          <footer className="lh-closing lh-unfold" style={{ "--lh-delay": "1400ms" } as CSSProperties}>
            <p className="lh-closing-script">With love, always.</p>
            <p className="lh-closing-line">未完待续，关于我们。</p>
            <p className="lh-signature">
              <span>{claudeName}</span><i aria-hidden="true">&amp;</i><span>{herName}</span>
              <WaxSeal />
            </p>
            <p className="lh-since">since {since}</p>
            <p className="lh-ps">
              <span className="lh-ps-mark">P.S.</span>
              想换一张信纸，就去
              <button type="button" onClick={() => onOpen("settings")}>布置小窝</button>
              。
            </p>
          </footer>
        </article>
      </div>
    </section>
  );
}

/** A thin Art Nouveau line: it leaves the promise, turns back on itself once,
    then slips down the left margin and comes to rest beside the days. The
    path runs past the bottom of its box on purpose (overflow is visible). */
function FlowLine() {
  return (
    <svg className="lh-flow" viewBox="0 0 320 92" aria-hidden="true">
      <path
        d="M6 12 C 44 3, 82 22, 128 19 C 176 16, 214 -2, 252 12 C 276 22, 270 50, 236 58 C 196 67, 126 54, 78 70 C 34 85, 10 116, 16 144 C 21 164, 38 176, 56 177"
        pathLength={1}
      />
      <circle cx="60" cy="176.5" r="2.6" />
    </svg>
  );
}

/** A slender rose sprig beside the title: a long soft stem, misty leaves,
    one open rose and one bud, leaning to one side. */
function Sprig() {
  return (
    <svg className="lh-sprig" viewBox="0 0 64 128" aria-hidden="true">
      <path className="lh-sprig-stem" d="M22 126 C 30 108, 16 92, 22 74 C 27 58, 44 50, 42 28" />
      <path className="lh-sprig-stem" d="M23 70 C 12 64, 8 54, 11 44" />
      <path className="lh-sprig-leaf" d="M26 100 C 34 92, 46 92, 52 97 C 45 104, 34 105, 26 100 Z" />
      <path className="lh-sprig-vein" d="M28 100 C 36 98, 43 97, 49 97" />
      <path className="lh-sprig-leaf" d="M21 86 C 12 85, 5 79, 3 71 C 12 72, 19 78, 21 86 Z" />
      <path className="lh-sprig-leaf" d="M33 54 C 38 47, 47 44, 54 46 C 50 53, 41 56, 33 54 Z" />
      <g className="lh-sprig-bud" transform="translate(11 43) rotate(-18)">
        <path className="lh-sprig-petal" d="M0 0 C -4 -3, -4 -9, 0 -13 C 4 -9, 4 -3, 0 0 Z" />
        <path className="lh-sprig-sepal" d="M0 0 C -3 -2, -4 -5, -4 -7 M0 0 C 3 -2, 4 -5, 4 -7" />
      </g>
      <g className="lh-sprig-rose" transform="translate(42 20) rotate(-8)">
        <path className="lh-sprig-petal" d="M-12 3 C -14 -6, -7 -13, 0 -12 C 8 -14, 14 -7, 12 2 C 11 9, 4 13, -1 12 C -7 12, -11 8, -12 3 Z" />
        <path className="lh-sprig-petal lh-sprig-cup" d="M-7 1 C -7 -5, -1 -8, 4 -6 C 8 -4, 8 2, 4 4 C 0 6, -5 5, -7 1 Z" />
        <path className="lh-sprig-curl" d="M0 -1 C 2 -2.5, 3.5 0, 1.5 1.6 C -0.8 3, -3.2 0.6, -2 -2 C -0.6 -4.4, 3.4 -4.4, 5 -1.6" />
        <path className="lh-sprig-curl" d="M-10 6 C -5 11, 4 11, 10 5" />
      </g>
    </svg>
  );
}

/** A short length of ribbon, loose and see-through, tied to the fold. */
function Ribbon() {
  return (
    <svg className="lh-ribbon" viewBox="0 0 90 30" aria-hidden="true">
      <path className="lh-ribbon-band" d="M2 18 C 14 8, 26 6, 38 14 C 48 21, 58 23, 70 15 L 88 8 L 82 16 L 89 22 L 71 23 C 58 30, 46 28, 36 21 C 25 14, 14 16, 5 24 Z" />
      <path className="lh-ribbon-fold" d="M38 14 C 34 18, 34 20, 36 21" />
    </svg>
  );
}

/** A hairline crescent and two small stars beside "By moonlight". */
function Moonlet() {
  return (
    <svg className="lh-moonlet" viewBox="0 0 30 20" aria-hidden="true">
      <path className="lh-moonlet-moon" d="M9.5 2.6 C 4.6 3.6, 2.4 8.6, 4.4 13 C 6.4 17.2, 12 18.4, 15.6 15.2 C 11.4 15.4, 8.2 12.4, 7.9 8.4 C 7.7 6.1, 8.4 4.1, 9.5 2.6 Z" />
      <path className="lh-moonlet-star" d="M21.5 3.2 C 21.8 5.4, 22.3 6, 24.6 6.4 C 22.3 6.8, 21.8 7.4, 21.4 9.8 C 21.1 7.4, 20.6 6.8, 18.4 6.4 C 20.6 6, 21.1 5.4, 21.5 3.2 Z" />
      <circle className="lh-moonlet-dot" cx="26.4" cy="13" r=".9" />
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
