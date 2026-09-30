import assert from "node:assert/strict";
import test from "node:test";

import { resolveTwilightBubbleColor, TWILIGHT_BUBBLE_COLORS } from "../app/lib/twilight-bubbles.ts";

test("Twilight exposes the six supported user bubble colors", () => {
  assert.deepEqual(
    TWILIGHT_BUBBLE_COLORS.map((option) => option.value),
    ["rose", "blue", "sage", "lilac", "caramel", "bright-blue"],
  );
});

test("new room-specific colors inherit the legacy color on first upgrade", () => {
  const legacy = resolveTwilightBubbleColor("sage");
  assert.equal(resolveTwilightBubbleColor(undefined, legacy), "sage");
  assert.equal(resolveTwilightBubbleColor("bright-blue", legacy), "bright-blue");
});

test("invalid stored colors fall back safely", () => {
  assert.equal(resolveTwilightBubbleColor("not-a-color"), "rose");
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
