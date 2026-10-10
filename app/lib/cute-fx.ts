// Small bits of joy that run everywhere in iooi: sparkles under her finger,
// buttons that squish and spring back, and hearts that float off the send
// button. Everything is plain DOM so no page has to wire anything up.

const SPARKLE_GLYPHS = ["✦", "✧", "♥", "✦"];
const HEART_GLYPHS = ["♥", "♡", "♥"];
const MAX_BURSTS = 12;
const BOING_MS = 420;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function spawn(kind: "sparkle" | "heart", x: number, y: number) {
  if (reducedMotion()) return;
  const existing = document.querySelectorAll(".cute-burst");
  if (existing.length >= MAX_BURSTS) existing[0]?.remove();
  const burst = document.createElement("span");
  burst.className = `cute-burst cute-burst-${kind}`;
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  for (const glyph of kind === "heart" ? HEART_GLYPHS : SPARKLE_GLYPHS) {
    const piece = document.createElement("i");
    piece.textContent = glyph;
    burst.appendChild(piece);
  }
  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), kind === "heart" ? 1300 : 900);
}

/** Hearts float up from whichever send button is on screen. */
export function sendHearts() {
  if (typeof document === "undefined") return;
  const buttons = document.querySelectorAll<HTMLElement>(".send-btn, .xp-chat-send");
  const button = Array.from(buttons).find((item) => item.offsetParent !== null);
  if (!button) return;
  const rect = button.getBoundingClientRect();
  spawn("heart", rect.left + rect.width / 2, rect.top);
}

const TEXT_FIELD = "input, textarea, select, [contenteditable='true']";
// The blog paints its own sparkles; send buttons get hearts instead.
const NO_SPARKLE = `.blog-overlay, ${TEXT_FIELD}, .send-btn, .xp-chat-send`;
const SQUISHY = "button, [role='button'], .cute-squish";

/** Installs the global listeners once; returns the cleanup. */
export function installCuteFx() {
  let pressed: HTMLElement | null = null;

  const release = () => {
    const el = pressed;
    pressed = null;
    if (!el) return;
    const soft = el.getAttribute("data-cute-squish") === "soft";
    el.removeAttribute("data-cute-squish");
    // An element that already animates keeps its own animation untouched.
    if (reducedMotion() || getComputedStyle(el).animationName !== "none") return;
    el.setAttribute("data-cute-boing", soft ? "soft" : "");
    window.setTimeout(() => el.removeAttribute("data-cute-boing"), BOING_MS);
  };

  const onDown = (event: PointerEvent) => {
    if (event.button > 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (!target.closest(NO_SPARKLE)) spawn("sparkle", event.clientX, event.clientY);
    const squishy = target.closest<HTMLElement>(SQUISHY);
    if (squishy && !squishy.matches(":disabled, [aria-disabled='true']") && !reducedMotion()) {
      release();
      squishy.removeAttribute("data-cute-boing");
      // Wide rows and cards only give a little; small buttons really squish.
      const soft = squishy.getBoundingClientRect().width > 160;
      squishy.setAttribute("data-cute-squish", soft ? "soft" : "");
      pressed = squishy;
    }
  };

  document.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerup", release, { passive: true });
  document.addEventListener("pointercancel", release, { passive: true });
  return () => {
    document.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerup", release);
    document.removeEventListener("pointercancel", release);
  };
}
