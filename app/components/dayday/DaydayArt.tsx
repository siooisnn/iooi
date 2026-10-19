// dayday's little pixel drawings: tab icons, shelf placeholders and the piggy bank.

type Palette = Record<string, string>;

/** Draw a pixel picture from rows of letters; "." is transparent. */
function Pixels({ rows, palette, className }: { rows: string[]; palette: Palette; className?: string }) {
  const width = Math.max(...rows.map((row) => row.length));
  return <svg className={className} viewBox={`0 0 ${width} ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
    {rows.flatMap((row, y) => [...row].map((cell, x) => cell === "." || !palette[cell] ? null
      : <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={palette[cell]} />))}
  </svg>;
}

const COIN = ["...ddddd...", ".ddyyyyydd.", ".dyyyyyyyd.", "dyykyyykyyd", "dyyykykyyyd", "dyykkkkkyyd", "dyyyykyyyyd", "dyykkkkkyyd", ".dyyykyyyd.", ".ddyyyyydd.", "...ddddd..."];
const TEE = ["..ddd..ddd..", ".dfffddfffd.", "dffffffffffd", "dfwffffffffd", "dddffffffddd", "..dffppffd..", "..dfffpffd..", "..dffffffd..", "..dffffffd..", "..dddddddd.."];
const PANTS = ["dddddddddd", "dwwwwwwwwd", "dffffffffd", "dfffddfffd", "dfffddfffd", "dffd..dffd", "dffd..dffd", "dffd..dffd", "dffd..dffd", "dffd..dffd", "dddd..dddd"];
const SOCK = ["ddddd......", "dwwwd......", "ddddd......", "dfffd......", "dpppd......", "dfffd......", "dffffddddd.", "dfffffffffd", "dffffffpffd", ".ddddddddd."];
const BOW = ["dd.......dd", "dfdd...ddfd", "dfffdkdfffd", "dffwfkffffd", "dfffdkdfffd", "dfdd.d.ddfd", "dd..d.d..dd"];
const MEMO = ["..d..d..d.", "dddddddddd", "dwwwwwwwwd", "dwllllllwd", "dwwwwwwwwd", "dwllllllwd", "dwwwwwwwwd", "dwlllwwwwd", "dwwwwwpwpd", "dwwwwwwpwd", "dddddddddd"];
const SHOP = ["...........", ".ddddddddd.", "dpwpwpwpwpd", "dpwpwpwpwpd", "ddddddddddd", ".dwwwwwwwd.", ".dwbbwdddd.", ".dwbbwdyyd.", ".dwwwwdyyd.", ".ddddddddd."];
const HEART = [".dd.dd.", "dppdppd", "dpwpppd", "dpppppd", ".dpppd.", "..dpd..", "...d..."];

const INK = "#5a3d63";
export function TabIcon({ name }: { name: "ledger" | "shop" | "items" | "notes" }) {
  if (name === "ledger") return <Pixels className="dd-pixel" rows={COIN} palette={{ d: "#9a6a12", y: "#ffd86b", k: "#9a6a12" }} />;
  if (name === "shop") return <Pixels className="dd-pixel" rows={SHOP} palette={{ d: INK, p: "#ff8fc0", w: "#fff", b: "#9fd3ff", y: "#ffd86b" }} />;
  if (name === "items") return <Pixels className="dd-pixel" rows={TEE} palette={{ d: "#3a5d93", f: "#a9d4ff", w: "#fff", p: "#ff8fc0" }} />;
  return <Pixels className="dd-pixel" rows={MEMO} palette={{ d: INK, w: "#fffdf3", l: "#9fc6ee", p: "#ff6fae" }} />;
}

const SHELF_ART: Record<string, { rows: string[]; palette: Palette }> = {
  top: { rows: TEE, palette: { d: "#6b8fc4", f: "#dcecff", w: "#fff", p: "#ffb6d5" } },
  bottom: { rows: PANTS, palette: { d: "#b28a5c", f: "#f6e3c8", w: "#fff8ec" } },
  shoes: { rows: SOCK, palette: { d: "#c47a9c", f: "#ffe6f1", w: "#fff", p: "#ff9cc7" } },
  misc: { rows: BOW, palette: { d: "#9a6fc4", f: "#eadcff", w: "#fff", k: "#c9a2f0" } },
};
/** A soft placeholder drawing when a product or item has no photo yet. */
export function ShelfArt({ shelf }: { shelf: string }) {
  const art = SHELF_ART[shelf] || SHELF_ART.misc;
  return <Pixels className="dd-shelf-art" rows={art.rows} palette={art.palette} />;
}

export function PixelHeart({ className = "dd-heart" }: { className?: string }) {
  return <Pixels className={className} rows={HEART} palette={{ d: "#c2185b", p: "#ff6fae", w: "#ffd3e8" }} />;
}

/** The piggy bank on the 存钱罐 card. */
export function Piggy() {
  return <svg className="dd-piggy" viewBox="0 0 64 52" aria-hidden="true">
    <ellipse cx="32" cy="48" rx="20" ry="2.6" fill="#e9a8c4" opacity=".45" />
    <path d="M17 12 15 3l9 6z" fill="#ff9cc7" stroke="#b5527f" strokeWidth="1.6" strokeLinejoin="round" />
    <rect x="18" y="38" width="7" height="9" rx="2.5" fill="#ffb3d3" stroke="#b5527f" strokeWidth="1.6" />
    <rect x="38" y="38" width="7" height="9" rx="2.5" fill="#ffb3d3" stroke="#b5527f" strokeWidth="1.6" />
    <ellipse cx="31" cy="27" rx="22" ry="16" fill="#ffc4dc" stroke="#b5527f" strokeWidth="1.8" />
    <path d="M53 25c4-1 5 3 2 4" fill="none" stroke="#b5527f" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="25" y="11.5" width="11" height="2.6" rx="1.3" fill="#b5527f" />
    <ellipse cx="11" cy="29" rx="5.5" ry="4.6" fill="#ff9cc7" stroke="#b5527f" strokeWidth="1.6" />
    <circle cx="9.4" cy="29" r="1" fill="#b5527f" /><circle cx="12.6" cy="29" r="1" fill="#b5527f" />
    <circle cx="19" cy="22" r="1.7" fill="#5a3d63" />
    <ellipse cx="19" cy="27.5" rx="2.6" ry="1.4" fill="#ff8fb8" opacity=".7" />
    <ellipse cx="35" cy="20" rx="8" ry="3.2" fill="#fff" opacity=".45" />
    <circle cx="30.5" cy="5" r="4.2" fill="#ffd86b" stroke="#9a6a12" strokeWidth="1.4" />
    <path d="M30.5 3v4" stroke="#9a6a12" strokeWidth="1.2" strokeLinecap="round" />
  </svg>;
}
