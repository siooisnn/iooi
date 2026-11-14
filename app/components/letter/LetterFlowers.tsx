/* The white love letter's flowers, drawn in one hairline hand: blue-grey
   stems and veined leaves, blush roses edged in rose, forget-me-nots and a
   few gold seeds. Shared by the home page, the chat list and the chat pages;
   the colours live in letter-chat.css (.letter-art-*). */

type Spot = { x: number; y: number; turn?: number; size?: number };

function place({ x, y, turn = 0, size = 1 }: Spot) {
  return `translate(${x} ${y}) rotate(${turn}) scale(${size})`;
}

/** A veined leaf; at turn 0 it grows to the right from (x, y). */
export function LetterLeaf(spot: Spot) {
  return (
    <g transform={place(spot)}>
      <path className="letter-art-leaf" d="M0 0 C 3 -4.6, 10 -5, 15 0 C 10 4.4, 3 4.2, 0 0 Z" />
      <path className="letter-art-vein" d="M1.2 0 C 5.5 -.5, 10 -.5, 13.6 0" />
    </g>
  );
}

/** A closed rosebud; at turn 0 it points straight up from (x, y). */
export function LetterBud(spot: Spot) {
  return (
    <g transform={place(spot)}>
      <path className="letter-art-petal" d="M0 0 C -4.8 -3, -4.6 -10.5, 0 -13.5 C 4.6 -10.5, 4.8 -3, 0 0 Z" />
      <path className="letter-art-petal letter-art-cup" d="M0 -1 C 2.6 -3.4, 3 -8, .6 -11.6 C 2.8 -8, 2 -3.6, 0 -1 Z" />
      <path className="letter-art-sepal" d="M0 0 C -3 -2, -4.2 -5, -4 -8 M0 0 C 3 -2, 4.2 -5, 4 -8 M0 0 C 0 -2, -.6 -4, -1.6 -5.4" />
    </g>
  );
}

/** An open rose seen from above, layered petals around a curled heart. */
export function LetterOpenRose(spot: Spot) {
  return (
    <g transform={place(spot)}>
      <path className="letter-art-petal" d="M0 -11 C 5 -12.4, 10.4 -8.4, 10.8 -3 C 13 1.4, 10 8.4, 5 9.8 C 1.6 12.4, -4.4 12, -6.4 9 C -11 8, -12.8 2, -10.2 -2 C -11 -8, -5.4 -12, 0 -11 Z" />
      <path className="letter-art-fold" d="M-10.2 -2 C -6.4 -1, -5.4 3.6, -6.4 9 M10.8 -3 C 7.4 -1.6, 6.4 2.4, 5 9.8 M0 -11 C -1.4 -8.6, -.6 -7.4, 1.6 -7" />
      <path className="letter-art-petal letter-art-cup" d="M-6.6 -1 C -7 -6, -2 -8.6, 2.6 -7.2 C 7.2 -6, 8.2 -1, 6.6 2.6 C 5 6.6, 0 7.6, -3 6.2 C -6 5, -7 2, -6.6 -1 Z" />
      <path className="letter-art-curl" d="M0 -.5 C 2 -2, 3.6 .5, 1.6 2 C -1 3.6, -3.6 1, -2.6 -1.8 C -1.6 -4.6, 2.6 -4.8, 4.2 -2.4" />
    </g>
  );
}

export function LetterForgetMeNot({ x, y, size = 1 }: Spot) {
  return (
    <g className="letter-art-forget" transform={`translate(${x} ${y}) scale(${size})`}>
      {[0, 72, 144, 216, 288].map((turn) => <circle key={turn} cx="0" cy="-2.1" r="1.7" transform={`rotate(${turn})`} />)}
      <circle className="letter-art-forget-eye" cx="0" cy="0" r=".9" />
    </g>
  );
}

/** A large, very faint rose pressed into the paper behind the words. It stays
    put while the letter scrolls. `className` places it on each page. */
export function LetterPaperBloom({ className = "" }: { className?: string }) {
  return (
    <svg className={`letter-bloom${className ? ` ${className}` : ""}`} viewBox="0 0 120 140" aria-hidden="true">
      <path className="letter-art-stem" d="M118 136 C 104 120, 92 104, 80 86 C 72 74, 66 64, 64 52" />
      <path className="letter-art-stem" d="M84 92 C 70 90, 52 84, 38 70 C 30 62, 26 50, 28 38" />
      <path className="letter-art-stem letter-art-fine" d="M98 112 C 106 104, 112 100, 118 100" />
      <LetterLeaf x={88} y={98} turn={-150} size={2.2} />
      <LetterLeaf x={98} y={112} turn={-30} size={1.9} />
      <LetterLeaf x={58} y={80} turn={-170} size={2} />
      <LetterLeaf x={74} y={74} turn={-70} size={1.8} />
      <LetterLeaf x={34} y={58} turn={-120} size={1.6} />
      <LetterOpenRose x={64} y={46} size={2.6} />
      <LetterBud x={28} y={38} turn={-24} size={2} />
      <LetterForgetMeNot x={92} y={70} size={2.2} />
      <LetterForgetMeNot x={102} y={82} size={1.6} />
      <LetterForgetMeNot x={44} y={96} size={1.8} />
    </svg>
  );
}

/* ── 首页 ─────────────────────────────────────────────── */

/** Beside the home title: a long leaning stem with an open rose at the top,
    two buds on side shoots, veined leaves all the way down and a little
    knot of forget-me-nots at its foot. */
export function LetterTitleSpray({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 76 140" aria-hidden="true">
      <path className="letter-art-stem" d="M26 138 C 34 120, 20 104, 26 86 C 31 70, 48 62, 46 40" />
      <path className="letter-art-stem" d="M27 84 C 16 78, 11 68, 14 58" />
      <path className="letter-art-stem letter-art-fine" d="M34 70 C 44 68, 54 62, 61 53" />
      <path className="letter-art-stem letter-art-fine" d="M25 110 C 17 112, 11 118, 9 125" />
      <path className="letter-art-stem letter-art-fine" d="M30 122 C 38 124, 43 120, 41 116 C 39.5 113.5, 36.5 115, 38 117" />
      <LetterLeaf x={29} y={113} turn={-28} size={1.3} />
      <LetterLeaf x={25} y={98} turn={-158} size={1.25} />
      <LetterLeaf x={19} y={75} turn={-135} size={0.95} />
      <LetterLeaf x={39} y={68} turn={14} size={1} />
      <LetterLeaf x={44} y={54} turn={-168} size={1} />
      <LetterLeaf x={52} y={63} turn={-62} size={0.78} />
      <LetterBud x={14} y={58} turn={-16} size={1.05} />
      <LetterBud x={61} y={53} turn={36} size={0.8} />
      <LetterOpenRose x={46} y={28} size={1.32} />
      <LetterForgetMeNot x={9} y={125} size={1.1} />
      <LetterForgetMeNot x={15} y={130.5} size={0.8} />
      <LetterForgetMeNot x={4} y={118.5} size={0.75} />
      <circle className="letter-art-seed" cx="66" cy="38" r="1" />
      <circle className="letter-art-seed" cx="11" cy="92" r=".9" />
      <circle className="letter-art-seed" cx="30" cy="11" r=".8" />
      <circle className="letter-art-seed" cx="49" cy="80" r=".7" />
    </svg>
  );
}

/** A tiny posy (two forget-me-nots, a bud and a leaf) for small corners:
    the end of the home page's flowing line, beside headings. */
export function LetterPosy({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 24" aria-hidden="true">
      <path className="letter-art-stem letter-art-fine" d="M3 20 C 10 19, 16 17, 22 13 C 26 10.5, 29 8, 31 5" />
      <path className="letter-art-stem letter-art-fine" d="M15 17.5 C 17 20, 21 21.5, 25 21" />
      <LetterLeaf x={8} y={19.5} turn={-150} size={0.62} />
      <LetterLeaf x={14} y={17.6} turn={-60} size={0.62} />
      <LetterLeaf x={22} y={13} turn={10} size={0.55} />
      <LetterBud x={31} y={5.5} turn={44} size={0.62} />
      <LetterForgetMeNot x={25.5} y={20.5} size={0.8} />
      <LetterForgetMeNot x={31} y={17} size={0.62} />
      <circle className="letter-art-seed" cx="36" cy="11" r=".7" />
    </svg>
  );
}

/** A short gold rule that ends in a pair of leaves, a rosebud and one
    forget-me-not: the pauses in the home letter. */
export function LetterRuleSprig({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 76 22" aria-hidden="true">
      <path className="letter-art-gold" d="M1 11.6 C 14 11, 30 11.8, 50 11" />
      <path className="letter-art-stem letter-art-fine" d="M44 11.2 C 48 9.6, 52 9, 57 9.6" />
      <LetterLeaf x={44} y={11.2} turn={-148} size={0.66} />
      <LetterLeaf x={43} y={11.6} turn={150} size={0.6} />
      <LetterBud x={57} y={9.6} turn={84} size={0.72} />
      <LetterForgetMeNot x={68} y={15.5} size={0.72} />
      <LetterForgetMeNot x={72.5} y={10.5} size={0.52} />
      <circle className="letter-art-seed" cx="27" cy="8.4" r=".75" />
      <circle className="letter-art-seed" cx="64" cy="5" r=".6" />
    </svg>
  );
}

/** Dried flowers pressed under the wax seal: leaves, two buds and some
    forget-me-nots fanning out from beneath it. */
export function LetterSealSprig({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true">
      <path className="letter-art-stem" d="M32 24 C 24 20, 16 13, 10 5" />
      <path className="letter-art-stem letter-art-fine" d="M32 24 C 30 16, 30 10, 33 4" />
      <path className="letter-art-stem letter-art-fine" d="M32 24 C 40 30, 47 35, 55 40" />
      <LetterLeaf x={20} y={15} turn={-165} size={0.85} />
      <LetterLeaf x={16} y={10} turn={-85} size={0.75} />
      <LetterLeaf x={45} y={33} turn={65} size={0.8} />
      <LetterLeaf x={49} y={36} turn={-15} size={0.7} />
      <LetterBud x={10} y={5} turn={-42} size={0.74} />
      <LetterBud x={55} y={40} turn={122} size={0.62} />
      <LetterForgetMeNot x={33} y={3} size={0.8} />
      <LetterForgetMeNot x={38.5} y={6.5} size={0.6} />
      <circle className="letter-art-seed" cx="22" cy="28" r=".7" />
    </svg>
  );
}

/* ── 列表 ─────────────────────────────────────────────── */

/** A climbing rose that reaches into the list page from the right edge and
    curls back under the title: an open rose at the curl, buds at the tips,
    leaves and forget-me-nots along the way. */
export function LetterListVine({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 150 132" aria-hidden="true">
      <path className="letter-art-stem" d="M152 6 C 128 10, 116 26, 112 44 C 108 64, 92 74, 72 72 C 52 70, 44 84, 50 98 C 56 110, 72 112, 80 102" />
      <path className="letter-art-stem" d="M113 40 C 100 34, 90 22, 92 10" />
      <path className="letter-art-stem letter-art-fine" d="M116 32 C 126 36, 134 42, 138 50" />
      <path className="letter-art-stem letter-art-fine" d="M86 72 C 90 80, 94 86, 100 88" />
      <path className="letter-art-stem letter-art-fine" d="M80 102 C 86 94, 80 88, 75 92 C 71 95, 74 100, 77 99" />
      <LetterLeaf x={126} y={22} turn={-18} size={1.35} />
      <LetterLeaf x={136} y={10} turn={-170} size={0.9} />
      <LetterLeaf x={106} y={60} turn={-50} size={1.25} />
      <LetterLeaf x={100} y={28} turn={-150} size={0.9} />
      <LetterLeaf x={62} y={72} turn={178} size={1.45} />
      <LetterLeaf x={80} y={72.5} turn={-110} size={0.85} />
      <LetterLeaf x={92} y={82} turn={30} size={0.8} />
      <LetterLeaf x={48} y={88} turn={170} size={0.8} />
      <LetterBud x={92} y={10} turn={-14} size={1.08} />
      <LetterBud x={138} y={50} turn={150} size={0.8} />
      <LetterOpenRose x={54} y={101} turn={10} size={1.05} />
      <LetterForgetMeNot x={100} y={88} size={1} />
      <LetterForgetMeNot x={106} y={93.5} size={0.72} />
      <LetterForgetMeNot x={95} y={94} size={0.6} />
      <circle className="letter-art-seed" cx="84" cy="24" r="1" />
      <circle className="letter-art-seed" cx="38" cy="96" r=".85" />
      <circle className="letter-art-seed" cx="124" cy="58" r=".8" />
      <circle className="letter-art-seed" cx="70" cy="118" r=".7" />
    </svg>
  );
}

/** A centred gold rule with a rosebud in the middle and leaves either side:
    where the rest of the letters are folded away. */
export function LetterFoldSprig({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 22" aria-hidden="true">
      <path className="letter-art-gold" d="M4 12 C 18 11.4, 30 12.2, 40 11.6 M56 11.6 C 66 12.2, 78 11.4, 92 12" />
      <LetterLeaf x={47} y={13} turn={-168} size={0.7} />
      <LetterLeaf x={49} y={13} turn={-12} size={0.7} />
      <LetterBud x={48} y={13.5} size={0.8} />
      <LetterForgetMeNot x={35} y={16} size={0.55} />
      <LetterForgetMeNot x={61} y={16} size={0.55} />
      <circle className="letter-art-seed" cx="22" cy="9" r=".7" />
      <circle className="letter-art-seed" cx="74" cy="9" r=".7" />
    </svg>
  );
}
