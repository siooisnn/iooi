"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { paintBrowserChrome } from "../ThemeProvider";
import { Petals, useTogether } from "../HomeView";
import type { HomeApp } from "../HomeView";
import { useReadyLetters } from "../RetroDesktop";
import type { Settings } from "../../lib/app-settings";
import { CLAUDE_DEFAULT_NAME } from "../../lib/app-settings";
import { LetterBud, LetterForgetMeNot, LetterLeaf, LetterPaperBloom, LetterPosy, LetterRuleSprig, LetterSealSprig, LetterTitleSpray } from "./LetterFlowers";

/* The white love-letter home: one page read from top to bottom. The entries
   are paragraphs of the letter rather than buttons, and the ornaments (a
   rose spray, one flowing line ending in a posy, sprigged rules, a ribbon, a
   sliver of moon, a wax seal over dried flowers, one faint rose pressed into
   the paper) grow out of the words and the white space around them. */

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
      <LetterPaperBloom className="letter-bloom-home" />
      <div className="lh-scroll">
        <article className="lh-letter">
          <header className="lh-letterhead">
            <span className="lh-brand">iooi<LetterPosy className="lh-brand-posy" /></span>
            <time className="lh-dateline" dateTime={today ? today.toISOString().slice(0, 10) : undefined}>{dateline}</time>
          </header>

          <section className="lh-opening lh-unfold" style={{ "--lh-delay": "80ms" } as CSSProperties} aria-labelledby="lh-title">
            <LetterTitleSpray className="lh-sprig" />
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

          <span className="lh-rule lh-unfold" style={{ "--lh-delay": "380ms" } as CSSProperties} aria-hidden="true"><LetterRuleSprig /></span>

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

          <span className="lh-rule lh-rule-closing lh-unfold" style={{ "--lh-delay": "1360ms" } as CSSProperties} aria-hidden="true"><LetterRuleSprig /></span>

          <footer className="lh-closing lh-unfold" style={{ "--lh-delay": "1400ms" } as CSSProperties}>
            <p className="lh-closing-script">With love, always.</p>
            <p className="lh-closing-line">未完待续，关于我们。</p>
            <p className="lh-signature">
              <span>{claudeName}</span><i aria-hidden="true">&amp;</i><span>{herName}</span>
              <span className="lh-seal-wrap"><LetterSealSprig className="lh-seal-sprig" /><WaxSeal /></span>
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
    then slips down the left margin and comes to rest beside the days in a
    small posy. The path runs past the bottom of its box on purpose
    (overflow is visible). */
function FlowLine() {
  return (
    <svg className="lh-flow" viewBox="0 0 320 92" aria-hidden="true">
      <path
        d="M6 12 C 44 3, 82 22, 128 19 C 176 16, 214 -2, 252 12 C 276 22, 270 50, 236 58 C 196 67, 126 54, 78 70 C 34 85, 10 116, 16 144 C 21 164, 38 176, 56 177"
        className="lh-flow-line"
        pathLength={1}
      />
      <g className="lh-flow-posy">
        <path className="letter-art-stem letter-art-fine" d="M56 177 C 62 177.4, 68 176, 73 171.5" />
        <LetterLeaf x={61} y={177.2} turn={-128} size={0.66} />
        <LetterLeaf x={64} y={176.8} turn={36} size={0.62} />
        <LetterBud x={73} y={171.5} turn={58} size={0.8} />
        <LetterForgetMeNot x={59} y={183} size={1} />
        <LetterForgetMeNot x={66} y={186} size={0.72} />
        <circle className="letter-art-seed" cx="80" cy="181" r=".9" />
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
