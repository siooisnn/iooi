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
