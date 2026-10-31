import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./helpers/resolve-typescript.mjs";
const { extractChatFile, chatFileNotes, MAX_CHAT_FILE_CHARS } = await import("../app/lib/chat-files.ts");
import { buildChatContext } from "../app/lib/chat-context.ts";
import { sanitizeIncomingMessage } from "../app/lib/message-images.ts";
import iconv from "iconv-lite";

function pdf(text) {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(source.length); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(source);
}

test("read actual PDF and DOCX text; reject unreadable documents", async () => {
  assert.match(await extractChatFile(pdf("PDF answer is 42"), "pdf"), /第 1 页.*PDF answer is 42/s);
  const word = await readFile(new URL("./fixtures/chat-files/sample.docx", import.meta.url));
  const text = await extractChatFile(word, "docx");
  assert.match(text, /周五交稿/);
  assert.match(text, /表格内容 42/);
  await assert.rejects(extractChatFile(pdf(""), "pdf"), /扫描版/);
  await assert.rejects(extractChatFile(Buffer.from("fake"), "pdf"), /格式无效/);
  await assert.rejects(extractChatFile(Buffer.from("fake"), "docx"));
  await assert.rejects(extractChatFile(Buffer.from([0, 1, 2]), "txt"), /不是可读取的文本/);
});

test("decode Chinese text and explicitly mark truncated content", async () => {
  assert.equal(await extractChatFile(iconv.encode("中文附件", "gbk"), "txt"), "中文附件");
  assert.equal(await extractChatFile(Buffer.from("\ufeff中文附件", "utf16le"), "txt"), "中文附件");
  const text = await extractChatFile(Buffer.from("字".repeat(MAX_CHAT_FILE_CHARS + 5)), "txt");
  assert.match(text, /其余内容未读取/);
});

test("historical attachments survive context preparation and missing files do not block later replies", async () => {
  const original = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "iooi-chat-files-"));
  try {
    await mkdir(join(root, "uploads"));
    await writeFile(join(root, "uploads", "sample.pdf"), pdf("Deadline is Friday"));
    process.chdir(root);
    const messages = [
      { role: "user", content: "看附件", file: "/uploads/sample.pdf", fileName: "资料.pdf", image: "/uploads/old.png" },
      { role: "assistant", content: "读过了" },
      { role: "user", content: "截止日期呢？" },
    ];
    const context = buildChatContext(messages, { mode: "full-window", maxUserTurns: 30, mediaTail: 1 });
    assert.equal(context.messages[0].file, "/uploads/sample.pdf");
    assert.equal(context.messages[0].fileName, "资料.pdf");
    assert.equal(context.messages[0].image, undefined);
    const notes = await chatFileNotes([...context.messages, { file: "/uploads/missing.txt" }, { file: "/uploads/../secret.txt" }]);
    assert.match(notes.get("/uploads/sample.pdf"), /Deadline is Friday/);
    assert.match(notes.get("/uploads/missing.txt"), /请勿声称已读/);
    assert.match(notes.get("/uploads/../secret.txt"), /未能读取/);
    assert.equal(messages[0].content, "看附件");
  } finally {
    process.chdir(original);
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitize file URLs and preserve a bounded display name", () => {
  assert.equal(sanitizeIncomingMessage({ content: "hi", file: "https://evil.test/a.pdf", fileName: "a" }).file, undefined);
  assert.equal(sanitizeIncomingMessage({ content: "hi", file: "/uploads/a.pdf", fileName: "a\n.pdf" }).fileName, "a.pdf");
});

test("upload validates DOCX/PDF and GPT receives readable attachment text without changing the saved caption", async () => {
  const original = process.cwd();
  const originalFetch = globalThis.fetch;
  const root = await mkdtemp(join(tmpdir(), "iooi-chat-upload-"));
  try {
    process.chdir(root);
    const { POST: upload } = await import("../app/api/upload/route.ts");
    async function send(bytes, name, type = "") {
      const form = new FormData();
      form.append("file", new File([bytes], name, { type }));
      return upload(new Request("http://localhost/api/upload", { method: "POST", body: form }));
    }
    const valid = await send(pdf("Check the answer 42"), "notes.pdf", "application/octet-stream");
    assert.equal(valid.status, 200);
    const file = (await valid.json()).url;
    assert.equal((await send(pdf(""), "scan.pdf", "application/pdf")).status, 422);
    assert.equal((await send(Buffer.from("broken"), "broken.docx")).status, 422);
    const word = await readFile(new URL("./fixtures/chat-files/sample.docx", import.meta.url));
    assert.equal((await send(word, "文档.docx")).status, 200);
    const { POST: chat } = await import("../app/api/gpt/chat/route.ts");
    let sent;
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ choices: [{ message: { content: "42" } }] });
    };
    const userMsg = { role: "user", content: "答案是什么？", file, fileName: "notes.pdf" };
    const response = await chat(new Request("http://localhost/api/gpt/chat", {
      method: "POST", body: JSON.stringify({ messages: [userMsg], userMsg, skipPersist: true }),
    }));
    assert.equal(response.status, 200);
    assert.match(sent.messages.at(-1).content, /Check the answer 42/);
    assert.match(sent.messages.at(-1).content, /仅含提取的文字/);
    assert.equal(userMsg.content, "答案是什么？");
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(original);
    await rm(root, { recursive: true, force: true });
  }
});
