import { PixelSprite } from "./PixelSprite";

const MOON = [
  "......OOOOOO......",
  "....OOLLLLLLOO....",
  "...OLLLLLLLLLLO...",
  "..OLLLLHHLLLLLLO..",
  ".OLLLHHHCLLLLLLLO.",
  ".OLLLHHCCLLLLLLLO.",
  "OLLLLCCCLLLLLLLLSO",
  "OLLLLLLLLLLLHHLLSO",
  "OLLLLLLLLLLHHHCLSO",
  "OLLLLLLLLLLHHCCLSO",
  "OLLLHHLLLLLLCCLSSO",
  "OLLLHCCLLLLLLLSSSO",
  ".OLLLCCLLLLLLSSSO.",
  ".OLLLLLLLLLLSSSSO.",
  "..OLLLLLLLLSSSSO..",
  "...OLLLLLSSSSSO...",
  "....OOSSSSSSOO....",
  "......OOOOOO......",
];

const EARTH = [
  ".......OOOOOOOO.......",
  ".....OOBBBBBBBBOO.....",
  "....OBBLLBBBBBBBBO....",
  "...OBBLLLLBBBBBBBBO...",
  "..OBBLLLLLLBBBLLBBBO..",
  ".OBBBLLLLLBBBLLLLLBBO.",
  ".OBBLLLLLLBBBBLLLLLBO.",
  "OBBBLLLLLBBBBBLLLLLBBO",
  "OBBBBLLLLBBBBBBLLLLBSO",
  "OBBBBBLLBBBBBBBLLLBSSO",
  "OBBBBBBBBBBBBBBLLLBSSO",
  "OBBBBBBLLBBBBBBBBBSSSO",
  "OBBBBBLLLLBBBBBBBBSSSO",
  "OBBBBBLLLLLBBBBBBBSSSO",
  "OBBBBBBLLLLBBBBBBSSSSO",
  ".OBBBBBLLLLBBBBBSSSSO.",
  ".OBBBBBLLLBBBBBBSSSSO.",
  "..OBBBBLLBBBBBBSSSSO..",
  "...OBBBLBBBBBBSSSSO...",
  "....OBBBBBBBSSSSSO....",
  ".....OOBBSSSSSSOO.....",
  ".......OOOOOOOO.......",
];

const STARS = [[8, 10], [40, 8], [56, 20], [8, 43], [25, 56], [58, 55]];

/** An XP-only postcard, drawn in whole pixels like the desktop's clawd. */
export function MoonEarthPixel() {
  return (
    <svg className="xp-desk-moon-pixels" width="64" height="64" viewBox="0 0 64 64" shapeRendering="crispEdges" aria-hidden="true">
      <g fill="#b9b8e4">
        {STARS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)}
        <path d="M49 10h1v2h2v1h-2v2h-1v-2h-2v-1h2zM11 52h1v2h2v1h-2v2h-1v-2H9v-1h2z" />
      </g>
      <path d="M13 29v6h3v3h9v-2h5v-4h3v-8h-3v-2h-3v3h-2v5h3v5h3v5h4v3h6"
        fill="none" stroke="#c8acd5" strokeWidth="1" />
      <g transform="translate(9 10)">
        <PixelSprite rows={MOON} palette={{ O: "#7778a8", L: "#fff1d5", H: "#ddd4da", C: "#b9b5cc", S: "#d7c4ca" }} />
        <path d="M4 4h4v1H4zM3 5h1v3H3z" fill="#fffaf0" />
      </g>
      <g transform="translate(35 34)">
        <PixelSprite rows={EARTH} palette={{ O: "#8587b6", B: "#84bade", L: "#c0d6ad", S: "#5e83b0" }} />
        <path d="M5 4h4v1H5zM3 6h3v1H3zM10 15h4v1h-4zM16 8h2v1h-2z" fill="#e5f0ef" />
      </g>
      <path d="M31 42h2v1h1v-1h2v3h-1v1h-1v1h-1v-1h-1v-1h-1z" fill="#f3a4bd" />
    </svg>
  );
}
