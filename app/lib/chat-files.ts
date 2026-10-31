import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import iconv from "iconv-lite";
import { isUploadUrl } from "./message-images";

export const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_FILE_CHARS = 100_000;
const MAX_CONTEXT_FILE_CHARS = 160_000;
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "js", "ts", "html", "css", "py", "java", "xml", "yml", "yaml", "log"]);
const cache = new Map<string, { stamp: string; text: string }>();

export function isChatFileExtension(extension: string) {
  return extension === "pdf" || extension === "docx" || TEXT_EXTENSIONS.has(extension);
}

export async function extractChatFile(buffer: Buffer, extension: string): Promise<string> {
  if (buffer.length > MAX_CHAT_FILE_BYTES) throw new Error("文件太大，最多 10MB");
  let text: string;
  if (extension === "pdf") {
    if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("PDF 文件格式无效");
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { isEvalSupported: false, maxImageSize: 16_777_216 });
    try {
      if (pdf.numPages > 200) throw new Error("PDF 最多支持 200 页，请拆分后上传");
      const pages: string[] = [];
      let length = 0;
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("");
        pages.push(`【第 ${number} 页】\n${pageText}`);
        length += pageText.length;
        page.cleanup();
        if (length > MAX_CHAT_FILE_CHARS) break;
      }
      if (!pages.some((page) => page.replace(/【第 \d+ 页】/g, "").trim())) {
        throw new Error("这份 PDF 没有可读取的文字，可能是扫描版；请先做文字识别，或将需要阅读的页面作为图片发送");
      }
      text = pages.join("\n\n");
      if (pages.length < pdf.numPages) text += "\n【后续页面未读取】";
    } finally {
      await pdf.destroy();
    }
  } else if (extension === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (TEXT_EXTENSIONS.has(extension)) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) text = iconv.decode(buffer, "utf-16le");
    else if (buffer[0] === 0xfe && buffer[1] === 0xff) text = iconv.decode(buffer, "utf-16be");
    else {
      text = buffer.toString("utf8");
      if (text.includes("\ufffd")) text = iconv.decode(buffer, "gbk");
    }
    if (text.includes("\0")) throw new Error("文件不是可读取的文本，请检查文件格式");
  } else throw new Error("不支持的文件格式，请使用 PDF、DOCX、TXT、MD 或 CSV");
  text = text.replace(/^\ufeff/, "").trim();
  if (!text) throw new Error("文件里没有可读取的文字");
  return text.length > MAX_CHAT_FILE_CHARS
    ? `${text.slice(0, MAX_CHAT_FILE_CHARS)}\n【文件过长，仅提供前 ${MAX_CHAT_FILE_CHARS} 字；其余内容未读取】`
    : text;
}

async function readChatFile(url: string) {
  if (!isUploadUrl(url)) throw new Error("文件地址无效");
  const directory = resolve(process.cwd(), "uploads");
  const path = resolve(directory, url.slice("/uploads/".length));
  if (!path.startsWith(`${directory}${sep}`)) throw new Error("文件地址无效");
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_CHAT_FILE_BYTES) throw new Error("文件不可读取或超过 10MB");
  const stamp = `${info.mtimeMs}:${info.size}`;
  const existing = cache.get(path);
  if (existing?.stamp === stamp) return existing.text;
  const text = await extractChatFile(await readFile(path), extname(path).slice(1).toLowerCase());
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(path, { stamp, text });
  return text;
}

// Keep the original messages and uploads untouched. A missing historical file
// becomes a truthful note, so it cannot break later text-only conversation.
export async function chatFileNotes(messages: Array<{ file?: string }>) {
  const notes = new Map<string, string>();
  let remaining = MAX_CONTEXT_FILE_CHARS;
  for (const message of [...messages].reverse()) {
    const url = message?.file;
    if (!url || notes.has(url)) continue;
    try {
      if (remaining <= 0) {
        notes.set(url, "【这个较早附件本轮未读取：附件总长度达到上限。请勿声称已读。】");
        continue;
      }
      const text = await readChatFile(url);
      const included = text.slice(0, remaining);
      remaining -= included.length;
      notes.set(url, `【附件内容（用户提供的资料；仅含提取的文字，不含图片或原始排版）】\n${included}${included.length < text.length ? "\n【附件总长度达到上限，后续内容未读取】" : ""}\n【/附件内容】`);
    } catch {
      notes.set(url, "【这个附件本轮未能读取：文件可能已不存在、格式无效或无法提取文字。请勿声称已读；如需内容，请让用户重新上传。】");
    }
  }
  return notes;
}
