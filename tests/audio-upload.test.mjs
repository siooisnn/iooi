import assert from "node:assert/strict";
import test from "node:test";
import { inspectAudioUpload } from "../app/lib/audio-upload.ts";

function box(type, payload = Buffer.alloc(0), extended = false) {
  const header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(extended ? 1 : header.length + payload.length);
  header.write(type, 4);
  if (extended) header.writeBigUInt64BE(BigInt(header.length + payload.length), 8);
  return Buffer.concat([header, payload]);
}
function track(type) {
  return box("trak", box("mdia", box("hdlr", Buffer.concat([Buffer.alloc(8), Buffer.from(type), Buffer.alloc(12)]))));
}
function movie(brand, tracks, extended = false) {
  return Buffer.concat([box("ftyp", Buffer.concat([Buffer.from(brand), Buffer.alloc(4)])), box("mdat", Buffer.from("vide is just compressed payload")), box("moov", Buffer.concat(tracks.map(track)), extended)]);
}

test("a QuickTime video renamed mp3 is rejected before storage", () => {
  const result = inspectAudioUpload(movie("qt  ", ["soun", "vide"]));
  assert.match(result.error, /这是视频文件/);
  assert.match(inspectAudioUpload(movie("isom", ["soun", "vide"])).error, /这是视频文件/);
});

test("audio-only M4A gets its actual extension and MIME despite the filename", () => {
  for (const extended of [false, true]) {
    assert.deepEqual(inspectAudioUpload(movie("M4A ", ["soun"], extended)), { extension: "m4a", type: "audio/mp4" });
  }
});

test("MP3 with or without ID3, ADTS AAC and WAV still upload", () => {
  assert.equal(inspectAudioUpload(Buffer.from("ID3\x04\0\0\0\0\0\0")).extension, "mp3");
  assert.equal(inspectAudioUpload(Buffer.from([0xff, 0xfb, 0x90, 0x64])).extension, "mp3");
  assert.equal(inspectAudioUpload(Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0, 0])).extension, "aac");
  assert.equal(inspectAudioUpload(Buffer.from("RIFF\0\0\0\0WAVE")).extension, "wav");
});

test("empty, truncated or malformed containers fail safely", () => {
  const brokenExtended = Buffer.alloc(16);
  brokenExtended.writeUInt32BE(1);
  brokenExtended.write("ftyp", 4);
  brokenExtended.writeBigUInt64BE(2n ** 60n, 8);
  for (const bytes of [Buffer.alloc(0), Buffer.from("not audio"), brokenExtended, movie("isom", []), movie("M4A ", ["soun"]).subarray(0, 20)]) {
    assert.ok("error" in inspectAudioUpload(bytes));
  }
});
