import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTwilightAiBubble, resolveTwilightBubbleColor, resolveTwilightTone, TWILIGHT_BUBBLE_COLORS,
} from "../app/lib/twilight-bubbles.ts";

test("Twilight exposes clear and pale user bubble colors", () => {
  assert.deepEqual(
    TWILIGHT_BUBBLE_COLORS.map((option) => option.value),
    ["bright-blue", "berry", "grape", "leaf", "sakura", "sky", "butter"],
  );
});

test("retired muted colors map onto their closest clear color", () => {
  assert.equal(resolveTwilightBubbleColor("rose"), "berry");
  assert.equal(resolveTwilightBubbleColor("blue"), "bright-blue");
  assert.equal(resolveTwilightBubbleColor("sage"), "leaf");
  assert.equal(resolveTwilightBubbleColor("lilac"), "grape");
  assert.equal(resolveTwilightBubbleColor("caramel"), "sakura");
});

test("new room-specific colors inherit the legacy color on first upgrade", () => {
  const legacy = resolveTwilightBubbleColor("sage");
  assert.equal(resolveTwilightBubbleColor(undefined, legacy), "leaf");
  assert.equal(resolveTwilightBubbleColor("bright-blue", legacy), "bright-blue");
});

test("invalid stored colors fall back safely", () => {
  assert.equal(resolveTwilightBubbleColor("not-a-color"), "berry");
});

test("tone and AI bubble default to the existing dark look and cream", () => {
  assert.equal(resolveTwilightTone(undefined), "dark");
  assert.equal(resolveTwilightTone("light"), "light");
  assert.equal(resolveTwilightTone("sepia"), "dark");
  assert.equal(resolveTwilightAiBubble(undefined), "cream");
  assert.equal(resolveTwilightAiBubble("white"), "white");
});

test("glass strength defaults to the original blur and stays in range", async () => {
  const { DEFAULT_TWILIGHT_GLASS, resolveTwilightGlass, twilightGlassScale } = await import("../app/lib/twilight-bubbles.ts");
  assert.equal(resolveTwilightGlass(undefined), DEFAULT_TWILIGHT_GLASS);
  assert.equal(resolveTwilightGlass("80"), DEFAULT_TWILIGHT_GLASS);
  assert.equal(resolveTwilightGlass(-10), 0);
  assert.equal(resolveTwilightGlass(140), 100);
  assert.equal(twilightGlassScale(DEFAULT_TWILIGHT_GLASS), "1");
  assert.equal(twilightGlassScale(0), "0");
  assert.equal(twilightGlassScale(100), "2");
});
