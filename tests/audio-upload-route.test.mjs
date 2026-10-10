import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "iooi-audio-upload-test-"));
const originalDirectory = process.cwd();
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/app/lib/audio-upload") {
    return { url: new URL("../app/lib/audio-upload.ts", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
process.chdir(root);
const { POST } = await import("../app/api/upload/route.ts");
process.chdir(originalDirectory);

function box(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length);
  header.write(type, 4);
  return Buffer.concat([header, payload]);
}
function media(brand, handlers) {
  return Buffer.concat([box("ftyp", Buffer.concat([Buffer.from(brand), Buffer.alloc(4)])), box("moov", Buffer.concat(handlers.map(type => box("trak", box("mdia", box("hdlr", Buffer.concat([Buffer.alloc(8), Buffer.from(type)])))))))]);
}
async function upload(bytes, name, type) {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return POST(new Request("http://localhost/api/upload", { method: "POST", body: form }));
}

test("upload rejects mislabeled video without writing and preserves valid audio and text", async () => {
  try {
    const invalid = await upload(media("qt  ", ["soun", "vide"]), "renamed.mp3", "audio/mpeg");
    assert.equal(invalid.status, 415);
    assert.match((await invalid.json()).error, /视频文件/);
    assert.deepEqual(readdirSync(join(root, "uploads")), []);

    const bytes = media("M4A ", ["soun"]);
    const valid = await upload(bytes, "audio.mp3", "audio/mpeg");
    assert.equal(valid.status, 200);
    const result = await valid.json();
    assert.match(result.url, /\.m4a$/);
    assert.equal(result.type, "audio/mp4");
    assert.deepEqual(readFileSync(join(root, result.url)), bytes);

    const text = await upload("reading text", "chapter.txt", "text/plain");
    assert.equal(text.status, 200);
    assert.match((await text.json()).url, /\.txt$/);

    const form = new FormData();
    form.append("file", "not a file");
    const malformed = await POST(new Request("http://localhost/api/upload", { method: "POST", body: form }));
    assert.equal(malformed.status, 400);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
