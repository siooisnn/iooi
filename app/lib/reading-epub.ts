// EPUB import for our bookshelf. An EPUB is a zip of XHTML pages plus a table
// of contents, so chapters come from the book's own TOC instead of guessing
// from "第X章" lines the way a TXT has to. Server only (uses node:zlib).
import { inflateRawSync } from "node:zlib";
import { MAX_READING_BYTES, boundChapters, isChapterHeading, type ReadingChapter } from "./reading-books";

export type ParsedEpub = { chapters: ReadingChapter[]; title: string; author: string };

/** Unpacked text we are willing to inflate from one upload (guards zip bombs). */
const MAX_UNPACKED_BYTES = 80 * 1024 * 1024;
const BROKEN = "这个 EPUB 文件不完整，没能打开。重新下载一次再试试。";

/** Zip files start with "PK\x03\x04". */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// ── zip ────────────────────────────────────────────────────────────────────

type ZipEntry = { method: number; flags: number; compressedSize: number; localOffset: number };

function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error(BROKEN);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error(BROKEN);
    const nameLength = view.getUint16(at + 28, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      localOffset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  let budget = MAX_UNPACKED_BYTES;
  function read(name: string): Uint8Array | null {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.flags & 1) throw new Error("这个 EPUB 加了密，没法导入。");
    const local = entry.localOffset;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error(BROKEN);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (data.length < entry.compressedSize) throw new Error(BROKEN);
    let out: Uint8Array;
    if (entry.method === 0) out = data;
    else if (entry.method === 8) {
      try { out = inflateRawSync(data, { maxOutputLength: Math.max(1, budget) }); }
      catch (error) { throw new Error(error instanceof RangeError ? "这个 EPUB 解开以后太大了。" : BROKEN); }
    } else throw new Error("这个 EPUB 用了不认识的压缩方式，没法导入。");
    budget -= out.length;
    if (budget < 0) throw new Error("这个 EPUB 解开以后太大了。");
    return out;
  }
  return { names: [...entries.keys()], read };
}

// ── xml / xhtml helpers ──────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", bull: "•", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™", times: "×", divide: "÷", deg: "°", shy: "",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? "");
  }
  return result;
}

function decodeXml(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const label = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1] || "utf-8";
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(label); } catch { decoder = new TextDecoder(); }
  return decoder.decode(bytes).replace(/^﻿/, "");
}

function flat(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** Drops comments and the parts of a page that are never body text. */
function stripNoise(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, text: string) => text.replace(/</g, "&lt;"))
    .replace(/<(head|script|style|svg|math|rt|rp)\b[^>]*\/>/gi, "")
    .replace(/<(head|script|style|svg|math|rt|rp)\b[\s\S]*?<\/\1\s*>/gi, "");
}

/** A path inside the zip, resolved against the folder of the file that points to it. */
function resolvePath(base: string, href: string): string {
  let target = href.split("#")[0];
  try { target = decodeURIComponent(target); } catch { /* keep as written */ }
  const parts = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  return parts.join("/");
}

function fragmentOf(href: string): string | null {
  const index = href.indexOf("#");
  if (index < 0) return null;
  try { return decodeURIComponent(href.slice(index + 1)) || null; } catch { return href.slice(index + 1) || null; }
}

// ── one page of the book ─────────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "dl", "dt", "dd", "blockquote", "section",
  "article", "header", "footer", "aside", "nav", "main", "table", "tr", "td", "th", "caption", "pre", "figure",
  "figcaption", "hr", "br", "body", "address", "center", "hgroup",
]);

type Page = {
  blocks: string[];
  /** Block index where each id first appears. */
  anchors: Map<string, number>;
  /** Block indexes that came from h1/h2. */
  headings: Set<number>;
};

function readPage(xml: string, targets: Set<string>): Page {
  const blocks: string[] = [];
  const anchors = new Map<string, number>();
  const headings = new Set<number>();
  let buffer = "";
  let inHeading = false;
  let headingDepth = 0;
  const flush = () => {
    const text = decodeEntities(buffer)
      // Hard-wrapped Chinese: a line break between two characters is not a space.
      .replace(/([\u2e80-\u9fff\uff00-\uffef])[^\S\n]*\n\s*(?=[\u2e80-\u9fff\uff00-\uffef])/g, "$1")
      .replace(/\s+/g, " ").trim();
    buffer = "";
    if (!text) return;
    if (inHeading) headings.add(blocks.length);
    blocks.push(text);
  };
  const body = /<body\b[\s\S]*$/i.exec(xml)?.[0] ?? xml;
  for (const match of stripNoise(body).matchAll(/<(\/?)([a-zA-Z][\w:.-]*)([^>]*)>|([^<]+)/g)) {
    if (match[4] !== undefined) { buffer += match[4]; continue; }
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase().replace(/^.*:/, "");
    if (!closing) {
      const attrs = attributes(match[3]);
      const id = attrs.id || (tag === "a" ? attrs.name : "");
      if (id && !anchors.has(id)) {
        // A TOC target starts a new chapter even when it sits inside a paragraph.
        if (targets.has(id)) flush();
        anchors.set(id, blocks.length + (buffer.trim() ? 1 : 0));
      }
    }
    if (!BLOCK_TAGS.has(tag)) continue;
    const selfClosing = match[3].trim().endsWith("/");
    // "CHAPTER I.<br/>Down the Rabbit-Hole" is one heading.
    if (tag === "br" && headingDepth > 0) { buffer += " "; continue; }
    flush();
    if (/^h[1-6]$/.test(tag) && !selfClosing) headingDepth = Math.max(0, headingDepth + (closing ? -1 : 1));
    if (tag === "h1" || tag === "h2") inHeading = !closing && !selfClosing;
  }
  flush();
  return { blocks, anchors, headings };
}

// ── table of contents ────────────────────────────────────────────────────────

type TocEntry = { path: string; fragment: string | null; title: string };

function navToc(xml: string, base: string): TocEntry[] {
  const navs = [...xml.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav\s*>/gi)];
  const nav = navs.find((item) => /type\s*=\s*["'][^"']*\btoc\b/i.test(item[1])) || navs[0];
  if (!nav) return [];
  const entries: TocEntry[] = [];
  for (const link of nav[2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = attributes(link[1]).href;
    const title = flat(link[2]);
    if (href && title) entries.push({ path: resolvePath(base, href), fragment: fragmentOf(href), title });
  }
  return entries;
}

function ncxToc(xml: string, base: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let label = "";
  for (const match of xml.matchAll(/<(?:[\w-]+:)?text\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?text\s*>|<(?:[\w-]+:)?content\b([^>]*)>/gi)) {
    if (match[1] !== undefined) { label = flat(match[1]); continue; }
    const src = attributes(match[2]).src;
    if (src && label) entries.push({ path: resolvePath(base, src), fragment: fragmentOf(src), title: label });
    label = "";
  }
  return entries;
}

// ── the whole book ───────────────────────────────────────────────────────────

/** `auto` titles were made up by us, so the first line is not a repeat of them. */
type Section = { title: string; paragraphs: string[]; auto?: boolean };

/** The heading usually repeats as the chapter's first line; the reader already shows the title. */
function dropRepeatedHeading(section: Section) {
  if (section.auto) return;
  const squash = (text: string) => text.replace(/[\s·]+/g, "");
  const whole = squash(section.title);
  const parts = section.title.split(" · ").map(squash);
  for (let dropped = 0; section.paragraphs.length && dropped < parts.length; dropped++) {
    const first = squash(section.paragraphs[0]);
    if (first !== whole && !parts.includes(first)) break;
    section.paragraphs.shift();
    if (first === whole) break;
  }
}

/** Collects pages into chapters, starting a new one at each break. */
function chapterWriter() {
  const sections: Section[] = [];
  let current: Section | null = null;
  let carry = "";
  function close() {
    if (!current) return;
    dropRepeatedHeading(current);
    // A part page with nothing but its own name ("第一部") goes in front of the next chapter's title.
    if (current.paragraphs.length) sections.push(current);
    else if (!current.auto) carry = current.title;
    current = null;
  }
  function start(title: string, auto = false) {
    close();
    const named = carry && !auto ? `${carry} · ${title}` : title;
    current = { title: named.replace(/\s+/g, " ").trim().slice(0, 120) || "正文", paragraphs: [], ...(auto ? { auto } : {}) };
    if (!auto) carry = "";
  }
  return {
    start,
    push(paragraph: string) {
      if (!current) start("开头", true);
      current!.paragraphs.push(paragraph);
    },
    finish() { close(); return sections; },
  };
}

export function parseEpub(bytes: Uint8Array): ParsedEpub {
  if (bytes.byteLength > MAX_READING_BYTES) throw new Error("这本书太大了，EPUB 暂时最多支持 10MB。");
  if (!looksLikeZip(bytes)) throw new Error("这个文件不像 EPUB，请检查后重新导入。");
  const zip = readZip(bytes);
  const text = (name: string) => { const data = zip.read(name); return data ? decodeXml(data) : null; };

  const container = text("META-INF/container.xml");
  const rootfile = container ? /<(?:[\w-]+:)?rootfile\b([^>]*)>/i.exec(container) : null;
  const opfPath = (rootfile && attributes(rootfile[1])["full-path"]) || zip.names.find((name) => name.toLowerCase().endsWith(".opf"));
  const opf = opfPath ? text(opfPath) : null;
  if (!opfPath || !opf) throw new Error("这个 EPUB 里找不到书的目录文件，没能打开。");

  const meta = (tag: string, max: number) => {
    const match = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}\\s*>`, "i").exec(opf);
    return match ? flat(match[1]).slice(0, max) : "";
  };

  const manifest = new Map<string, { path: string; type: string; properties: string }>();
  for (const match of opf.matchAll(/<(?:[\w-]+:)?item\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs.id && attrs.href) {
      manifest.set(attrs.id, { path: resolvePath(opfPath, attrs.href), type: attrs["media-type"] || "", properties: attrs.properties || "" });
    }
  }
  const spineTag = /<(?:[\w-]+:)?spine\b([^>]*)>/i.exec(opf);
  const spine: string[] = [];
  for (const match of opf.matchAll(/<(?:[\w-]+:)?itemref\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    const item = attrs.idref ? manifest.get(attrs.idref) : undefined;
    if (item && attrs.linear !== "no" && !spine.includes(item.path)) spine.push(item.path);
  }
  if (!spine.length) throw new Error("这个 EPUB 里没有正文页，没能打开。");

  // The book's own table of contents: EPUB 3 nav first, then the older NCX.
  let toc: TocEntry[] = [];
  const nav = [...manifest.values()].find((item) => /\bnav\b/.test(item.properties));
  const navXml = nav ? text(nav.path) : null;
  if (nav && navXml) toc = navToc(navXml, nav.path);
  if (toc.length < 2) {
    const ncxId = spineTag ? attributes(spineTag[1]).toc : "";
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((item) => item.type === "application/x-dtbncx+xml");
    const ncxXml = ncx ? text(ncx.path) : null;
    if (ncx && ncxXml) {
      const fromNcx = ncxToc(ncxXml, ncx.path);
      if (fromNcx.length > toc.length) toc = fromNcx;
    }
  }
  const spineSet = new Set(spine);
  toc = toc.filter((entry) => spineSet.has(entry.path));
  const useToc = toc.length >= 2;

  const pages = spine.map((path) => {
    // The nav page is just the TOC again; the reader already lists chapters.
    const xml = path === nav?.path && useToc ? null : text(path);
    const entries = useToc ? toc.filter((entry) => entry.path === path) : [];
    const targets = new Set(entries.flatMap((entry) => entry.fragment ? [entry.fragment] : []));
    return { entries, page: xml ? readPage(xml, targets) : null };
  });
  const hasHeadings = !useToc && pages.some(({ page }) =>
    page?.blocks.some((block, index) => page.headings.has(index) || isChapterHeading(block)));

  const writer = chapterWriter();
  let tocStarted = false;
  let partNumber = 0;
  for (const { entries, page } of pages) {
    if (!page) continue;
    // Where in this page a new chapter starts, and what it is called.
    const breaks = new Map<number, { titles: string[]; auto: boolean }>();
    const addBreak = (index: number, title: string, auto = false) => {
      const found = breaks.get(index);
      if (!found) breaks.set(index, { titles: [title], auto });
      else if (!found.titles.includes(title)) found.titles.push(title);
    };
    if (useToc) {
      for (const entry of entries) {
        const index = entry.fragment ? page.anchors.get(entry.fragment) ?? 0 : 0;
        addBreak(Math.min(index, page.blocks.length), entry.title);
      }
      if (entries.length) tocStarted = true;
      // Pages before the first TOC entry (title page, copyright…) each stand alone.
      else if (!tocStarted && page.blocks.length) addBreak(0, page.blocks[0].slice(0, 40), true);
    } else if (hasHeadings) {
      page.blocks.forEach((block, index) => {
        if (page.headings.has(index) || isChapterHeading(block)) addBreak(index, block);
      });
    } else if (page.blocks.length) {
      addBreak(0, `第 ${++partNumber} 部分`, true);
    }
    page.blocks.forEach((block, index) => {
      const found = breaks.get(index);
      if (found) writer.start(found.titles.join(" · "), found.auto);
      writer.push(block);
    });
    // A TOC entry pointing past the last block (an empty page) still names what follows.
    const tail = breaks.get(page.blocks.length);
    if (tail) writer.start(tail.titles.join(" · "), tail.auto);
  }
  const sections = writer.finish();
  const chapters = boundChapters(sections);
  if (!chapters.length) throw new Error("这个 EPUB 里没有读得出来的文字，可能是图片版或者加了密。");
  return { chapters, title: meta("title", 120), author: meta("creator", 80) };
}
