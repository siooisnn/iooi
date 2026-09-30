import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeIncomingMessage, stripObjectPlaceholders } from "../app/lib/message-images.ts";

test("iOS object placeholders are removed from typed text", () => {
  assert.equal(stripObjectPlaceholders("￼今天好累￼"), "今天好累");
  assert.equal(stripObjectPlaceholders("￼").trim(), "");
});

test("incoming history loses placeholders but keeps real uploads", () => {
  const message = sanitizeIncomingMessage({
    role: "user",
    content: "看这个￼",
    images: ["/uploads/a.jpg", "https://example.com/b.jpg"],
  });
  assert.equal(message.content, "看这个");
  assert.equal(message.image, "/uploads/a.jpg");
  assert.equal(message.images, undefined);
});
