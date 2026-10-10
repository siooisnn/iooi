import { PixelSprite } from "./PixelSprite";

// While he is writing back: a little pixel cat lying behind a keyboard,
// paws tapping in turn, tail swaying, blinking now and then.

const PALETTE = {
  O: "#5b4646", // outline
  W: "#fffaf6", // fur
  P: "#ffb0c4", // inner ears, nose
  B: "#ffc9d6", // blush
  E: "#3b2b2b", // eyes
  G: "#8d8ea0", // keyboard frame
  k: "#f7f7fb", // keys
};

const BODY = [
  ".O..........O.................",
  ".OO........OO.................",
  ".OPO......OPO.................",
  ".OPPOOOOOOPPO.................",
  "OWWWWWWWWWWWWO................",
  "OWWWWWWWWWWWWOOOOOOOOO........",
  "OWWWWWWWWWWWWWWWWWWWWWO.......",
  "OBBWWWPPWWWBBWWWWWWWWWWO......",
  "OWWWWOWWOWWWWWWWWWWWWWWO......",
  "OWWWWWWWWWWWWWWWWWWWWWWO......",
  ".OWWWWWWWWWWOWWWWWWWWWWO......",
  "..OOOOOOOOOOWWWWWWWWWWWO......",
  "............OOOOOOOOOOOO......",
];

const EYES = ["", "", "", "", "", "...E......E", "...E......E"];

const TAIL = [
  "",
  "",
  "........................OO",
  "........................OWO",
  ".........................OWO",
  ".........................OWO",
  "........................OWO",
  "........................OO",
];

const KEYBOARD = [
  ...Array(12).fill(""),
  "GGGGGGGGGGGGGGGGGGGGGG",
  "GkkGkkGkkGkkGkkGkkGkkG",
  "GkGkkkkkkkkkkkkkkkkGkG",
  "GGGGGGGGGGGGGGGGGGGGGG",
];

const PAW_ROWS = (x: number) => [
  ...Array(10).fill(""),
  `${".".repeat(x)}OWWO`,
  `${".".repeat(x)}OWWO`,
  `${".".repeat(x)}OOOO`,
];

export function TypingKitty() {
  return (
    <span className="typing-kitty" aria-hidden="true">
      <svg viewBox="0 0 30 16" width="45" height="24" shapeRendering="crispEdges">
        <PixelSprite rows={TAIL} palette={PALETTE} className="kitty-tail" />
        <PixelSprite rows={BODY} palette={PALETTE} />
        <PixelSprite rows={EYES} palette={PALETTE} className="kitty-eyes" />
        <PixelSprite rows={KEYBOARD} palette={PALETTE} />
        <PixelSprite rows={PAW_ROWS(2)} palette={PALETTE} className="kitty-paw kitty-paw-l" />
        <PixelSprite rows={PAW_ROWS(8)} palette={PALETTE} className="kitty-paw kitty-paw-r" />
        <text x="16" y="4.5" fontSize="5" fill="#ff7fa8" className="kitty-heart">♥</text>
      </svg>
    </span>
  );
}
