import { withGroupStore, withStore } from "@/app/lib/store";
import { isClaudeCodeEnabled, normalizeClaudeCodeModel, runClaudeCodeChat } from "@/app/lib/claude-code";
import { extractSummerSearchTarget } from "@/app/lib/summer-search-query";
import { createVisibleReplyStream } from "@/app/lib/visible-reply-stream";
import { isExplicitSummerWriteRequest } from "@/app/lib/summer-write-intent";
import {
  findDuplicateSummerWrite,
  filterDuplicateSummerWrites,
  summerWriteFromUnknown,
  summerWritesFromSnapshot,
} from "@/app/lib/summer-write-dedupe";
import { existsSync, readFileSync } from "fs";
import { basename, extname, resolve, sep } from "path";
import { after } from "next/server";

export const runtime = "nodejs";

// ── 服务端落地:回复生成后直接写库,不依赖前端存活 ──
// 就算她发完消息立刻锁屏,回复也稳稳躺在服务器上
function cstTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}
function cstToday() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}
type StoreMsg = { role: string; content: string; time?: string; date?: string; thinking?: string; image?: string; file?: string; source?: string; roundId?: string; speaker?: "claude" | "gpt"; proposal?: SummerWrite };
type TextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" };
};
type ImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};
type ChatRequestMessage = {
  role: string;
  content?: string;
  image?: string;
  file?: string;
};

const CLAUDE_IMAGE_TYPES: Record<string, ImageBlock["source"]["media_type"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const CLAUDE_IMAGE_BASE64_LIMIT = 10 * 1024 * 1024;
const CLAUDE_IMAGE_TOTAL_LIMIT = 20 * 1024 * 1024;
const CLAUDE_IMAGE_COUNT_LIMIT = 3;

function loadClaudeImage(url: string): ImageBlock {
  const uploadsDir = resolve(process.cwd(), "uploads");
  let pathname = "";
  try {
    pathname = decodeURIComponent(new URL(url, "http://iooi.local").pathname);
  } catch {
    throw new Error("图片地址无效");
  }
  if (!pathname.startsWith("/uploads/")) throw new Error("图片地址无效");
  const filename = basename(pathname);
  const filepath = resolve(uploadsDir, filename);
  if (!filepath.startsWith(`${uploadsDir}${sep}`) || !existsSync(filepath)) {
    throw new Error("图片已经不存在，请重新上传");
  }
  const mediaType = CLAUDE_IMAGE_TYPES[extname(filename).toLowerCase()];
  if (!mediaType) throw new Error("Claude 订阅仅支持 JPG、PNG、GIF 和 WebP 图片");
  const data = readFileSync(filepath).toString("base64");
  if (Buffer.byteLength(data, "utf8") > CLAUDE_IMAGE_BASE64_LIMIT) {
    throw new Error("图片编码后超过 Claude 的 10MB 上限，请换一张更小的图片");
  }
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

function imageLoadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "图片读取失败";
}

function collectClaudeImages(messages: ChatRequestMessage[]) {
  const images = new Map<string, ImageBlock>();
  const skipped = new Map<string, string>();
  let totalSize = 0;
  for (const message of [...messages].reverse()) {
    const url = String(message.image || "");
    if (!url || images.has(url) || skipped.has(url)) continue;
    if (images.size >= CLAUDE_IMAGE_COUNT_LIMIT) {
      skipped.set(url, `本轮最多附带 ${CLAUDE_IMAGE_COUNT_LIMIT} 张图片`);
      continue;
    }
    let image: ImageBlock;
    try {
      image = loadClaudeImage(url);
    } catch (error) {
      // A stale, missing, or oversized image in recent history must not poison
      // every later text-only turn. Keep the chat moving and tell Claude that
      // this particular image was not actually attached.
      skipped.set(url, imageLoadErrorMessage(error));
      continue;
    }
    const size = Buffer.byteLength(image.source.data, "utf8");
    if (totalSize + size > CLAUDE_IMAGE_TOTAL_LIMIT) {
      skipped.set(url, "本轮图片总大小超过 20MB 上限");
      continue;
    }
    images.set(url, image);
    totalSize += size;
  }
  return { images, skipped };
}

function cacheControl(): { type: "ephemeral"; ttl?: "1h" } {
  return process.env.LLM_CACHE_TTL === "5m" ? { type: "ephemeral" } : { type: "ephemeral", ttl: "1h" };
}

function summerBaseUrl() {
  return (process.env.SUMMER_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function extractToolText(data: unknown): string {
  const result = (data as { result?: { content?: Array<{ type?: string; text?: string }> } }).result;
  return (result?.content || [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

function parseMcpPayload(raw: string): unknown {
  const dataLine = raw
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"));
  const jsonText = dataLine ? dataLine.slice(5).trim() : raw.trim();
  return JSON.parse(jsonText);
}

async function callSummerTool(name: string, args: Record<string, unknown>): Promise<string> {
  const token = process.env.SUMMER_TOKEN || "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const res = await fetch(`${summerBaseUrl()}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${name}-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const data = parseMcpPayload(await res.text()) as { error?: { message?: string } };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `summer ${name} failed`);
  }
  return extractToolText(data);
}

type SummerItem = {
  id?: string;
  date?: string;
  title?: string;
  content?: string;
  weight?: number;
  status?: string;
  due?: string;
};

type SummerState = {
  layers?: Record<string, unknown>;
  xiazhi?: SummerItem[];
  xiaoshu_tail?: SummerItem[];
  xiaoshu_recent?: SummerItem[];
  rain?: SummerItem[];
  ferry?: SummerItem[];
};

type SummerWakeParts = {
  stable?: string;
  dynamic?: string;
};

type SummerCall = {
  tool: string;
  label: string;
  status: "hit" | "miss" | "used" | "fallback";
  count?: number;
  detail?: string;
};

type SummerDateResult = {
  dates?: string[];
  items?: SummerItem[];
  count?: number;
};

type SummerStructuredHit = {
  layer?: string;
  source?: string;
  score?: number;
  id?: string;
  date?: string;
  title?: string;
  content?: string;
};

type SummerStructuredResult = {
  query?: string;
  dates?: string[];
  results?: SummerStructuredHit[];
  count?: number;
  cleaned?: { query?: string; label?: string; kind?: string };
  items?: SummerStructuredHit[];
};

type SummerReadResult = {
  ref?: string;
  cleaned?: { query?: string; label?: string; kind?: string };
  results?: Array<{
    layer?: string;
    type?: string;
    content?: string;
    items?: SummerStructuredHit[];
    count?: number;
  }>;
  count?: number;
};

async function readSummerState(): Promise<SummerState> {
  const token = process.env.SUMMER_TOKEN || "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const res = await fetch(`${summerBaseUrl()}/api/state`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `summer state failed: ${res.status}`);
  }
  return data as SummerState;
}

async function readSummerWake(): Promise<SummerWakeParts> {
  const token = process.env.SUMMER_TOKEN || "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const res = await fetch(`${summerBaseUrl()}/api/wake`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `summer wake failed: ${res.status}`);
  }
  return data as SummerWakeParts;
}

function parseSummerJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function renderSummerDateResult(result: SummerDateResult): string {
  const dates = result.dates || [];
  const items = result.items || [];
  if (!items.length) {
    return `【小暑日期精确查找】\n请求日期：${dates.join("、") || "未识别"}\n没有找到这些日期的小暑日记。`;
  }
  return [
    "【小暑日期精确查找】",
    ...items.map((item) => [
      `### ${item.date || ""}｜${item.title || "小暑日记"}`,
      String(item.content || "").trim(),
    ].join("\n")),
  ].join("\n\n");
}

function renderStructuredSearch(result: SummerStructuredResult): string {
  const hits = result.results || result.items || [];
  if (!hits.length) return "";
  return [
    "【summer 按需检索：只在相关时自然使用，不要提后台检索】",
    ...hits.map((hit) => {
      const head = [
        hit.layer || "summer",
        hit.date || "",
        hit.title || "",
        typeof hit.score === "number" ? `score ${hit.score}` : "",
      ].filter(Boolean).join("｜");
      return [`### ${head}`, String(hit.content || "").trim()].join("\n");
    }),
  ].join("\n\n");
}

function structuredFromRead(result: SummerReadResult): SummerStructuredResult {
  const hits = (result.results || []).flatMap((entry) => {
    if (entry.items?.length) {
      return entry.items.map((item) => ({ ...item, layer: item.layer || entry.layer }));
    }
    if (entry.content?.trim()) {
      return [{ layer: entry.layer, title: entry.layer, content: entry.content }];
    }
    return [];
  });
  return {
    query: result.ref,
    cleaned: result.cleaned,
    results: hits,
    count: hits.length,
  };
}

function buildSummerBridgeStable(directWritesEnabled: boolean): string {
  return [
    "## Summer",
    "",
    "你有一个叫 Summer 的长期记忆系统。主动留意值得留下的内容；读取和使用时自然融入，不要向她解释后台机制。",
    "",
    "八层：立夏=我们是谁；小满=我们是怎样的人；芒种=来时路；夏至=重要的事；小暑=日记、小事（不是每日任务）；rain=未了结；ferry=交接；sea=原文件，只读。",
    "",
    "需要记住时，只在 mangzhong/xiazhi/xiaoshu/rain/ferry 中分类，并在正常回复末尾附上隐藏提议：",
    "[summer_remember layer=xiazhi title=\"简短标题\" weight=5 tags=\"可选\"]内容[/summer_remember]",
    "",
    directWritesEnabled
      ? "如果是你主动发现值得记住的内容，这只是待她确认的提议，不得静默写入。她明确要求写进 Summer 时也要生成同样的隐藏块，系统会立即替她写入，无需她再点确认。"
      : "这只是待她确认的提议；不得静默写入、修改或删除。她明确要求记进 Summer 时不要拒绝，应生成提议。",
    "",
    "提议前检查已提供的 Summer 内容和本窗口已有提议；已经存在，或只是同一件事的补充、强调时，不要重复提议。",
    "",
    "日记内容也只放进隐藏提议，不要在聊天正文里另外写“酥酥日记”等栏目。",
    "",
    "她询问旧事、日记或 Summer 时，可以自然使用后台检索结果；没找到就如实说没检索到。",
  ].join("\n").trim();
}

function shouldSearchSummer(query: string): boolean {
  const text = query.trim();
  if (!text) return false;
  const memoryTarget = /summer|记忆|日记|小暑|夏至|芒种|小满|立夏|rain|sea|碎片|之前|以前|那天|哪天|说过|写过|发生过/i;
  return /搜/.test(text) && memoryTarget.test(text);
}

function isSummerWriteOnlyIntent(query: string): boolean {
  return isExplicitSummerWriteRequest(query);
}

function shouldReadSummerRef(query: string): boolean {
  return /(?:\u5c0f\u6691\s*)?\u788e\u7247\s*\d{1,3}|(?:^|\s)(?:rain|sea)(?:\s|$)/i.test(query);
}

function cleanSummerSearchQuery(query: string): { query: string; label: string } {
  const text = query.trim();
  const fragments = new Set<string>();
  for (const match of text.matchAll(/(?:小暑\s*)?碎片\s*(\d{1,3})(?:\s*(?:和|、|,|，|\/|及|跟)\s*(\d{1,3}))?/g)) {
    fragments.add(match[1]);
    if (match[2]) fragments.add(match[2]);
  }
  if (fragments.size) {
    const nums = Array.from(fragments);
    const label = `小暑碎片 ${nums.join("、")}`;
    const expanded = nums.map((num) => `小暑碎片 ${num}`).join(" ");
    return { query: expanded, label };
  }

  const dates = extractQueryDates(text);
  if (dates.length) {
    return { query: [...dates, text.includes("日记") ? "日记 xiaoshu" : "xiaoshu"].join(" "), label: dates.join("、") };
  }

  const compact = extractSummerSearchTarget(text);
  const label = compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
  return { query: compact || text, label: label || text.slice(0, 28) };
}

function normalizeSummerSearchQuery(query: string): string {
  const year = new Date().toLocaleDateString("zh-CN", { year: "numeric", timeZone: "Asia/Shanghai" }).replace(/\D/g, "") || "2026";
  const additions: string[] = [];
  const pushDate = (month: string, day: string) => {
    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");
    additions.push(`${year}-${mm}-${dd}`);
  };

  for (const match of query.matchAll(/(?:^|[^\d])(\d{1,2})[.-](\d{1,2})(?:[^\d]|$)/g)) {
    pushDate(match[1], match[2]);
  }
  for (const match of query.matchAll(/(\d{1,2})月(\d{1,2})日?/g)) {
    pushDate(match[1], match[2]);
  }

  return [query, ...Array.from(new Set(additions)), additions.length ? "日记 xiaoshu" : ""]
    .filter(Boolean)
    .join(" ");
}

function extractQueryDates(query: string): string[] {
  const year = new Date().toLocaleDateString("zh-CN", { year: "numeric", timeZone: "Asia/Shanghai" }).replace(/\D/g, "") || "2026";
  const dates: string[] = [];
  const pushDate = (rawYear: string | undefined, month: string, day: string) => {
    const yyyy = rawYear || year;
    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  };

  for (const match of query.matchAll(/(20\d{2})-(\d{1,2})-(\d{1,2})/g)) {
    pushDate(match[1], match[2], match[3]);
  }
  for (const match of query.matchAll(/(?:^|[^\d])(\d{1,2})[.-](\d{1,2})(?:[^\d]|$)/g)) {
    pushDate(undefined, match[1], match[2]);
  }
  for (const match of query.matchAll(/(\d{1,2})月(\d{1,2})日?/g)) {
    pushDate(undefined, match[1], match[2]);
  }

  return Array.from(new Set(dates));
}

function buildExactXiaoshuSearch(state: SummerState, query: string): string {
  const dates = extractQueryDates(query);
  if (!dates.length) return "";
  const rows = state.xiaoshu_tail || [];
  const hits = rows.filter((item) => dates.includes(String(item.date || "")));
  if (!hits.length) {
    return `【小暑日期精确查找】\n请求日期：${dates.join("、")}\n没有找到这些日期的小暑日记。`;
  }
  return [
    "【小暑日期精确查找】",
    ...hits.map((item) => [
      `### ${item.date || ""}｜${item.title || "小暑日记"}`,
      String(item.content || "").trim(),
    ].join("\n")),
  ].join("\n\n");
}

type SummerWrite = {
  id?: string;
  status?: string;
  layer: "mangzhong" | "xiazhi" | "xiaoshu" | "rain" | "ferry";
  title: string;
  content: string;
  weight: number;
  due: string;
  tags: string[];
};

const SUMMER_WRITE_RE = /\[summer_remember([^\]]*)\]([\s\S]*?)\[\/summer_remember\]/gi;
const VISIBLE_SUMMER_DIARY_RE = /(?:^|\n)\s*(?:---+\s*\n+)?\s*(王酥酥日记|小暑日记|日记)\s*[|｜]\s*([^\n]*)\n+([\s\S]+)$/;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function stripSummerWriteTags(text: string): string {
  return text.replace(SUMMER_WRITE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function stripVisibleSummerDiary(text: string): string {
  return text.replace(VISIBLE_SUMMER_DIARY_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function parseSummerWrites(text: string): SummerWrite[] {
  const writes: SummerWrite[] = [];
  let match;
  while ((match = SUMMER_WRITE_RE.exec(text)) !== null) {
    const attrs = parseAttrs(match[1] || "");
    const layer = String(attrs.layer || "xiaoshu").toLowerCase();
    if (!["mangzhong", "xiazhi", "xiaoshu", "rain", "ferry"].includes(layer)) continue;
    const content = String(match[2] || "").trim();
    if (!content) continue;
    const weight = Math.max(1, Math.min(10, Number(attrs.weight || 5) || 5));
    const tags = String(attrs.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6);
    writes.push({
      layer: layer as SummerWrite["layer"],
      title: String(attrs.title || "").trim().slice(0, 80),
      content: content.slice(0, 2400),
      weight,
      due: String(attrs.due || "").trim().slice(0, 40),
      tags,
    });
    if (writes.length >= 3) break;
  }
  return writes;
}

function parseVisibleSummerDiary(text: string): SummerWrite[] {
  const match = text.match(VISIBLE_SUMMER_DIARY_RE);
  if (!match) return [];
  const rawDate = String(match[2] || "").trim();
  const content = String(match[3] || "").trim();
  if (!content || content.length < 12) return [];
  return [{
    layer: "xiaoshu",
    title: rawDate ? `王酥酥日记 | ${rawDate}` : "王酥酥日记",
    content: content.slice(0, 2400),
    weight: 5,
    due: "",
    tags: ["chat-diary"],
  }];
}

function collectSummerWriteProposals(reply: string): SummerWrite[] {
  return [...parseSummerWrites(reply), ...parseVisibleSummerDiary(reply)].slice(0, 3);
}

async function createSummerProposals(proposals: SummerWrite[]): Promise<SummerWrite[]> {
  return proposals.map((proposal, index) => ({
    ...proposal,
    id: proposal.id || `iooi-proposal-${Date.now()}-${index}`,
    status: "pending",
  }));
}

let directSummerWriteTail: Promise<void> = Promise.resolve();

async function serializeDirectSummerWrite<T>(task: () => Promise<T>) {
  const previous = directSummerWriteTail;
  let release!: () => void;
  directSummerWriteTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

async function commitDirectSummerWrites(proposals: SummerWrite[]): Promise<{
  writes: SummerWrite[];
  calls: SummerCall[];
}> {
  return serializeDirectSummerWrite(async () => {
    const calls: SummerCall[] = [];
    let existingWrites: ReturnType<typeof summerWritesFromSnapshot>;
    try {
      existingWrites = summerWritesFromSnapshot(await readSummerState());
      calls.push({ tool: "read", label: "写入前检查 Summer 重复内容", status: "used" });
    } catch {
      calls.push({ tool: "read", label: "Summer 写入前去重检查失败", status: "miss" });
      return { writes: await createSummerProposals(proposals), calls };
    }

    const comparisonPool = [...existingWrites];
    const writes: SummerWrite[] = [];
    for (let index = 0; index < proposals.length; index += 1) {
      const proposal = proposals[index];
      const duplicate = findDuplicateSummerWrite(proposal, comparisonPool);
      if (duplicate) {
        writes.push({
          ...proposal,
          id: duplicate.id || `iooi-duplicate-${Date.now()}-${index}`,
          status: "duplicate",
        });
        continue;
      }

      try {
        await callSummerTool("edit", {
          action: "add",
          layer: proposal.layer,
          title: proposal.title,
          content: proposal.content,
          source: "iooi-chat-direct",
          weight: proposal.weight,
          due: proposal.due,
          tags: proposal.tags,
        });
        const committed = {
          ...proposal,
          id: proposal.id || `iooi-direct-${Date.now()}-${index}`,
          status: "committed",
        };
        writes.push(committed);
        comparisonPool.push(committed);
      } catch {
        const [pending] = await createSummerProposals([proposal]);
        writes.push(pending);
        calls.push({
          tool: "edit",
          label: `Summer 写入失败，已保留待确认：${proposal.title || proposal.layer}`,
          status: "miss",
        });
      }
    }
    return { writes, calls };
  });
}

function latestUserText(messages: Array<{ role: string; content?: string }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && typeof msg.content === "string") return msg.content.slice(-2000);
  }
  return "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function claudeSubscriptionFailure(error: unknown, searchEnabled = false): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("当前请求较多") || message.includes("queue")) {
    return "Claude 订阅通道现在有一条请求正在处理，请稍后再试；这条消息没有转用 API。";
  }
  if (message.includes("rate limit") || message.includes("usage limit") || message.includes("hit your limit")) {
    return "Claude 订阅额度暂时到限；这条消息没有转用 API。";
  }
  if (message.includes("model") && (message.includes("not found") || message.includes("invalid") || message.includes("unavailable") || message.includes("unsupported"))) {
    return "所选 Claude 具体模型当前不可用；这条消息没有转用 API。";
  }
  return searchEnabled
    ? "Claude 订阅搜索这轮没有完成；这条消息没有转用 API，请稍后再试。"
    : "Claude 订阅通道这轮没有完成；这条消息没有转用 API，请稍后再试。";
}

function sameUserMessage(a: StoreMsg, b: StoreMsg) {
  return a.role === "user" && a.content === b.content && a.time === b.time && a.date === b.date;
}

function hasLaterUserMessage(msgs: StoreMsg[], userMsg: StoreMsg | undefined) {
  if (!userMsg?.content) return false;
  const index = msgs.findIndex((m) => sameUserMessage(m, userMsg));
  if (index < 0) return false;
  return msgs.slice(index + 1).some((m) => m.role === "user");
}

function storeMessageKey(message: StoreMsg) {
  return [
    message.role || "",
    message.speaker || "",
    message.source || "",
    (message.content || "").trim().replace(/\s+/g, " "),
    message.image || "",
    message.file || "",
  ].join("\u0001");
}

function summerCallContent(call: SummerCall): string {
  return [
    "summer",
    call.label || call.tool || "called",
    typeof call.count === "number" ? `${call.count} 条` : "",
    call.status === "fallback" ? "fallback" : "",
  ].filter(Boolean).join(" · ");
}

function summerWriteProposalContent(proposal: SummerWrite): string {
  const layerName: Record<string, string> = { mangzhong: "芒种", xiazhi: "夏至", xiaoshu: "小暑", rain: "rain", ferry: "ferry" };
  const status = proposal.status === "duplicate"
    ? "已存在"
    : proposal.status === "committed"
      ? "已加入"
      : "提议写入";
  const meta = [
    `summer · ${status}${layerName[proposal.layer] || proposal.layer}`,
    proposal.title || "未命名",
    typeof proposal.weight === "number" ? `权重 ${proposal.weight}` : "",
  ].filter(Boolean).join(" · ");
  return `${meta}\n${String(proposal.content || "").trim()}`.trim();
}

async function persistRound(
  sessionId: string | undefined,
  userMsg: StoreMsg | undefined,
  reply: string,
  thinkingContent: string,
  summerCalls: SummerCall[] = [],
  summerWriteProposals: SummerWrite[] = []
) {
  const stamp = { time: cstTime(), date: cstToday() };
  if (!sessionId || !reply) return stamp;
  try {
    const diaryRegex = /\[日记\]([\s\S]*?)\[\/日记\]/g;
    const cleanReply = reply.replace(diaryRegex, "").replace(/\[心情[:：].+?\]/g, "").trim();
    const parts = cleanReply.split(/\n{2,}/).filter((p) => p.trim());
    const now = stamp.time;
    const today = stamp.date;

    await withStore((store) => {
      const sessions = (store.sessions || []) as Array<{ id: string; name: string; messages: StoreMsg[] }>;
      let session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        session = { id: sessionId, name: "新对话", messages: [] };
        sessions.unshift(session);
        store.sessions = sessions;
      }
      const msgs = session.messages || (session.messages = []);

      if (userMsg && userMsg.content) {
        const exists = msgs.slice(-8).some(
          (m) => m.role === "user" && m.content === userMsg.content && m.time === userMsg.time
        );
        if (!exists) msgs.push(userMsg);
      }

      if (hasLaterUserMessage(msgs, userMsg)) {
        return;
      }

      const lastUserIndex = msgs.findLastIndex((m) => m.role === "user");
      const tailKeys = new Set(msgs.slice(lastUserIndex + 1).filter((m) => m.role === "assistant").map(storeMessageKey));
      const pushAssistant = (message: StoreMsg) => {
        const key = storeMessageKey(message);
        if (tailKeys.has(key)) return;
        msgs.push(message);
        tailKeys.add(key);
      };
      for (const call of summerCalls) {
        pushAssistant({
          role: "assistant",
          source: "summer_call",
          roundId: userMsg?.roundId,
          content: summerCallContent(call),
          time: now,
          date: today,
        });
      }
      parts.forEach((p, i) => {
        const c = p.trim();
        pushAssistant({
          role: "assistant", content: c, time: now, date: today, roundId: userMsg?.roundId,
          ...(i === 0 && thinkingContent ? { thinking: thinkingContent } : {}),
        });
      });
      for (const proposal of summerWriteProposals) {
        const committed = proposal.status === "committed" || proposal.status === "duplicate";
        pushAssistant({
          role: "assistant",
          source: committed ? "summer_write_committed" : "summer_write_proposal",
          content: summerWriteProposalContent(proposal),
          proposal,
          time: now,
          date: today,
        });
      }
    });
  } catch {
    // 落地失败不影响正常返回
  }
  return stamp;
}

async function persistUserMessage(sessionId: string | undefined, userMsg: StoreMsg | undefined) {
  if (!sessionId || !userMsg?.content) return;
  try {
    await withStore((store) => {
      const sessions = (store.sessions || []) as Array<{ id: string; name: string; messages: StoreMsg[]; createdAt?: string }>;
      let session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        session = { id: sessionId, name: "新对话", messages: [], createdAt: new Date().toISOString() };
        sessions.unshift(session);
        store.sessions = sessions;
      }
      const msgs = session.messages || (session.messages = []);
      const exists = msgs.slice(-12).some(
        (m) => m.role === "user" && m.content === userMsg.content && m.time === userMsg.time
      );
      if (!exists) msgs.push(userMsg);
    });
  } catch {
    // Best effort. The reply persistence path will try again too.
  }
}

function groupSummerCallContent(call: SummerCall, speakerName: string): string {
  return `${speakerName} Summer · ${call.label || call.tool || "检索"}${typeof call.count === "number" ? ` · ${call.count} 条` : ""}`;
}

function groupSummerProposalContent(proposal: SummerWrite, speakerName: string): string {
  const layerNames: Record<string, string> = { mangzhong: "芒种", xiazhi: "夏至", xiaoshu: "小暑", rain: "rain", ferry: "渡口" };
  return `${speakerName} Summer · 待确认 · ${layerNames[proposal.layer] || proposal.layer}\n${proposal.title || "未命名"}\n${proposal.content || ""}`.trim();
}

async function persistGroupUserMessage(
  sessionId: string | undefined,
  sessionName: string | undefined,
  userMsg: StoreMsg | undefined,
) {
  if (!sessionId || !userMsg?.content) return;
  try {
    await withGroupStore((store) => {
      const sessions = (store.sessions || []) as Array<{ id: string; name: string; messages: StoreMsg[]; createdAt?: string }>;
      let session = sessions.find((item) => item.id === sessionId);
      if (!session) {
        session = { id: sessionId, name: sessionName || "一个群", messages: [], createdAt: new Date().toISOString() };
        sessions.unshift(session);
        store.sessions = sessions;
      }
      const messages = session.messages || (session.messages = []);
      const exists = messages.slice(-12).some((message) => sameUserMessage(message, userMsg));
      if (!exists) messages.push(userMsg);
    });
  } catch {
    // The completion path retries this write together with the final reply.
  }
}

async function persistGroupRound(
  sessionId: string | undefined,
  sessionName: string | undefined,
  userMsg: StoreMsg | undefined,
  reply: string,
  summerCalls: SummerCall[],
  summerWriteProposals: SummerWrite[],
  speakerName: string,
  persistedTime: string,
  persistedDate: string,
) {
  if (!sessionId || !reply) return;
  try {
    const cleanReply = reply.replace(/\[日记\]([\s\S]*?)\[\/日记\]/g, "").replace(/\[心情[:：].+?\]/g, "").trim();
    const parts = cleanReply.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    await withGroupStore((store) => {
      const sessions = (store.sessions || []) as Array<{ id: string; name: string; messages: StoreMsg[]; createdAt?: string }>;
      let session = sessions.find((item) => item.id === sessionId);
      if (!session) {
        session = { id: sessionId, name: sessionName || "一个群", messages: [], createdAt: new Date().toISOString() };
        sessions.unshift(session);
        store.sessions = sessions;
      }
      const messages = session.messages || (session.messages = []);
      if (userMsg?.content && !messages.slice(-12).some((message) => sameUserMessage(message, userMsg))) {
        messages.push(userMsg);
      }
      if (hasLaterUserMessage(messages, userMsg)) return;

      const tailKeys = new Set(messages.slice(-20).filter((message) => message.role === "assistant").map(storeMessageKey));
      const pushAssistant = (message: StoreMsg) => {
        const key = storeMessageKey(message);
        if (tailKeys.has(key)) return;
        messages.push(message);
        tailKeys.add(key);
      };
      for (const call of summerCalls) {
        pushAssistant({ role: "assistant", speaker: "claude", source: "summer_call", content: groupSummerCallContent(call, speakerName), time: persistedTime, date: persistedDate });
      }
      for (const content of parts) {
        pushAssistant({ role: "assistant", speaker: "claude", content, time: persistedTime, date: persistedDate });
      }
      for (const proposal of summerWriteProposals) {
        pushAssistant({
          role: "assistant",
          speaker: "claude",
          source: "summer_write_proposal",
          content: groupSummerProposalContent(proposal, speakerName),
          proposal,
          time: persistedTime,
          date: persistedDate,
        });
      }
    });
  } catch {
    // Group reply persistence is best effort and must not hide a generated reply.
  }
}

function logChatTiming(fields: Record<string, string | number | boolean>) {
  // Intentionally record only timings and request settings, never message text,
  // session ids, prompts, Summer contents, or model output.
  console.info(`[iooi:chat-timing] ${JSON.stringify(fields)}`);
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const {
    messages,
    modelId,
    systemPrompt,
    dynamicPrompt,
    thinking,
    webSearch,
    reasoningEffort,
    sessionId,
    userMsg,
    groupUserText,
    skipPersist,
    recentSummerProposals,
    stream,
    groupSessionId,
    groupSessionName,
    groupSpeakerName,
  } = await request.json();
  const requestMessages: ChatRequestMessage[] = Array.isArray(messages) ? messages : [];
  let userPersistMs = 0;
  if (!skipPersist) {
    const persistStartedAt = Date.now();
    await persistUserMessage(sessionId, userMsg);
    userPersistMs = Date.now() - persistStartedAt;
  } else if (groupSessionId) {
    const persistStartedAt = Date.now();
    await persistGroupUserMessage(String(groupSessionId), String(groupSessionName || "一个群"), userMsg);
    userPersistMs = Date.now() - persistStartedAt;
  }

  if (requestMessages.some((message) => message.file)) {
    logChatTiming({ status: "rejected_file", total_ms: Date.now() - requestStartedAt, user_persist_ms: userPersistMs });
    return Response.json({ reply: "酥酥的订阅文件还在接入中；这条消息没有转用 API。" }, { status: 422 });
  }
  if (!isClaudeCodeEnabled()) {
    logChatTiming({ status: "disabled", total_ms: Date.now() - requestStartedAt, user_persist_ms: userPersistMs });
    return Response.json({ reply: "Claude 订阅通道暂时不可用；这条消息没有转用 API。" }, { status: 503 });
  }
  const { images: imageBlocks, skipped: skippedImages } = collectClaudeImages(requestMessages);

  // --- System 数组里只放稳定部分,带 cache_control ---
  // dynamicPrompt(summary/mood/时间/unresolved cares)每轮都变,
  // 一旦塞进 system 会污染后面所有历史的缓存前缀。所以它走另一条路:注入到最新 user message。
  const system: TextBlock[] = [];
  if (systemPrompt) {
    system.push({ type: "text", text: systemPrompt, cache_control: cacheControl() });
  }

  let summerUsed = false;
  let summerSearch = "";
  let summerExactDate = "";
  let summerState: SummerState | null = null;
  const summerCalls: SummerCall[] = [];
  const query = String(groupUserText || userMsg?.content || latestUserText(requestMessages));
  const directSummerWriteRequested = !skipPersist && isSummerWriteOnlyIntent(query);
  const summerStartedAt = Date.now();
  let summerMs = 0;
  try {
    const [summerWake, currentSummerState] = await Promise.all([
      readSummerWake(),
      readSummerState(),
    ]);
    summerState = currentSummerState;
    if (!skipPersist) {
      summerCalls.push({
        tool: "wake",
        label: "已读取 Summer 唤醒内容与记忆状态",
        status: "used",
      });
    }
    const summerStable = [buildSummerBridgeStable(!skipPersist), String(summerWake.stable || "").trim()]
      .filter(Boolean)
      .join("\n\n");
    const summerDynamic = String(summerWake.dynamic || "").trim();
    summerUsed = Boolean(summerStable || summerDynamic);
    if (summerStable) {
      system.push({ type: "text", text: summerStable, cache_control: cacheControl() });
    }
    if (summerDynamic) {
      system.push({ type: "text", text: summerDynamic, cache_control: cacheControl() });
    }

    const summerSearchRequested = shouldSearchSummer(query) && !isSummerWriteOnlyIntent(query);
    const queryDates = summerSearchRequested ? extractQueryDates(query) : [];
    if (queryDates.length) {
      try {
        const raw = await callSummerTool("read", { layers: ["xiaoshu"], date: queryDates[0], limit: 50 });
        const readResult = parseSummerJson<SummerReadResult>(raw);
        const items = (readResult.results || []).flatMap((entry) => entry.items || []);
        const result: SummerDateResult = { dates: queryDates, items, count: items.length };
        summerExactDate = renderSummerDateResult(result);
        summerCalls.push({
          tool: "read",
          label: `查小暑 ${((result.dates || queryDates).join("、"))}`,
          status: (result.count || 0) > 0 ? "hit" : "miss",
          count: result.count || 0,
        });
      } catch {
        summerExactDate = buildExactXiaoshuSearch(currentSummerState, query);
        summerCalls.push({
          tool: "read",
          label: `查小暑 ${queryDates.join("、")}`,
          status: summerExactDate ? "fallback" : "miss",
          detail: "fallback",
        });
      }
    }

    if (summerSearchRequested) {
      if (!summerExactDate || summerExactDate.includes("没有找到")) {
        const cleanedSearch = cleanSummerSearchQuery(query);
        const normalizedSearchQuery = normalizeSummerSearchQuery(cleanedSearch.query);
        try {
          const toolName = shouldReadSummerRef(cleanedSearch.query) ? "read" : "search";
          const raw = await callSummerTool(
            toolName,
            toolName === "read"
              ? { ref: cleanedSearch.query, limit: 8 }
              : { query: normalizedSearchQuery, limit: 5 },
          );
          const result = toolName === "read"
            ? structuredFromRead(parseSummerJson<SummerReadResult>(raw))
            : parseSummerJson<SummerStructuredResult>(raw);
          summerSearch = renderStructuredSearch(result);
          const label = result.cleaned?.label || cleanedSearch.label;
          const count = (result.results || result.items || []).length;
          summerCalls.push({
            tool: toolName,
            label: `检索 summer：${label}`,
            status: count > 0 ? "hit" : "miss",
            count,
          });
        } catch {
          summerSearch = await callSummerTool("search", { query: normalizedSearchQuery, limit: 5 });
          summerCalls.push({
            tool: "search",
            label: `检索 summer：${cleanedSearch.label}`,
            status: summerSearch ? "fallback" : "miss",
            detail: "fallback",
          });
        }
      }
    }
  } catch (error) {
    summerMs = Date.now() - summerStartedAt;
    const message = error instanceof Error ? error.message : "unknown error";
    logChatTiming({
      status: "summer_error",
      total_ms: Date.now() - requestStartedAt,
      user_persist_ms: userPersistMs,
      summer_ms: summerMs,
      web_search: Boolean(webSearch),
    });
    return Response.json({ reply: `summer 暂时无法读取：${message}` }, { status: 502 });
  }
  summerMs = Date.now() - summerStartedAt;

  const combinedDynamicPrompt = [
    dynamicPrompt,
    directSummerWriteRequested
      ? "【本轮 Summer 操作】她明确要求写入 Summer。请把整理后的可写内容放进 summer_remember 隐藏块；系统会直接写入，不要让她再点确认。"
      : "",
    summerExactDate,
    summerSearch,
  ].filter(Boolean).join("\n\n");

  // 图片只从 iooi 自己的 uploads 目录读取并交给 Claude 订阅；文件仍明确拒绝，不会切换到 API。
  const anthropicMessages: Array<{ role: string; content: string | Array<TextBlock | ImageBlock> }> = requestMessages.map((msg) => {
    const image = msg.image ? imageBlocks.get(msg.image) : undefined;
    if (!image) {
      const skippedReason = msg.image ? skippedImages.get(msg.image) : "";
      const unavailableImageNote = skippedReason
        ? `【系统提示：这张图片没有随本轮请求发送（${skippedReason}）。请不要声称已经看到图片。】`
        : "";
      return {
        role: msg.role,
        content: [String(msg.content || ""), unavailableImageNote].filter(Boolean).join("\n"),
      };
    }
    return {
      role: msg.role,
      content: [
        image,
        { type: "text", text: String(msg.content || "请看这张图片。") },
      ],
    };
  });

  // --- 把 dynamicPrompt 注入到最新一条 user message 里,作为本轮临时上下文 ---
  // 关键点:只改 anthropicMessages 里待发的拷贝,不改 userMsg(后者用于 persistRound 落地,
  // 必须是宝宝的原话,不能把 summary/memory 这堆东西写进 store.json 污染聊天记录)。
  if (combinedDynamicPrompt && anthropicMessages.length > 0) {
    const dynamicContext = `【后台上下文，不是用户刚刚发来的消息】
以下内容来自系统保存的摘要、记忆、日记或状态，只用于帮助你理解她。
不要在回复里说“你发来一大包记忆”、不要说她刚刚发来了这些资料、不要主动提到后台上下文的存在。
如果要使用这些信息，只能自然地融进回应里。

${combinedDynamicPrompt}
【/后台上下文】

【用户刚刚发来的消息】
`;
    const last = anthropicMessages[anthropicMessages.length - 1];
    if (last.role === "user") {
      if (typeof last.content === "string") {
        last.content = `${dynamicContext}${last.content}`;
      } else if (Array.isArray(last.content)) {
        const textBlock = last.content.find((block): block is TextBlock => block.type === "text");
        if (textBlock) {
          textBlock.text = `${dynamicContext}${textBlock.text}`;
        } else {
          last.content.push({ type: "text", text: dynamicContext });
        }
      }
    }
  }

  // --- Add cache_control to the last message before the new user message ---
  // This caches the conversation history prefix so only the new message is uncached
  if (anthropicMessages.length >= 2) {
    const idx = anthropicMessages.length - 2;
    const msg = anthropicMessages[idx];
    if (typeof msg.content === "string") {
      anthropicMessages[idx] = {
        ...msg,
        content: [
          { type: "text", text: msg.content, cache_control: cacheControl() },
        ],
      };
    } else if (Array.isArray(msg.content)) {
      const lastBlock = msg.content[msg.content.length - 1];
      if (lastBlock?.type === "text") lastBlock.cache_control = cacheControl();
    }
  }

  const executeChat = async (onTextDelta?: (text: string) => void) => {
    let timingModel = String(modelId || "claude-sonnet-5");
    let queueWaitMs = 0;
    let claudeDurationMs = 0;
    let claudeRoundTripMs = 0;
    try {
      const requestedModel = normalizeClaudeCodeModel(timingModel);
      timingModel = requestedModel;
      const claudeStartedAt = Date.now();
      const data = await runClaudeCodeChat({
        systemPrompt: system.map((block) => block.text).join("\n\n"),
        messages: anthropicMessages,
        modelId: requestedModel,
        reasoningEffort: thinking ? reasoningEffort : "low",
        webSearch: Boolean(webSearch),
        currentUserText: String(groupUserText || latestUserText(requestMessages)),
        priority: "interactive",
        // In stream mode, closing the browser only stops viewing. The server
        // keeps generating and writes the completed reply to history.
        signal: onTextDelta ? undefined : request.signal,
        onTextDelta,
      });
      claudeRoundTripMs = Date.now() - claudeStartedAt;
      queueWaitMs = data.queueWaitMs;
      claudeDurationMs = data.durationMs;
      let reply = data.reply || "没有收到回复";
      const thinkingContent = "";

      const proposalStartedAt = Date.now();
      const earlierProposals = Array.isArray(recentSummerProposals)
        ? recentSummerProposals.flatMap((value: unknown) => {
            const parsed = summerWriteFromUnknown(value);
            return parsed ? [parsed] : [];
          })
        : [];
      const collectedProposals = collectSummerWriteProposals(reply);
      let summerWriteProposals: SummerWrite[];
      if (directSummerWriteRequested && collectedProposals.length) {
        const directResult = await commitDirectSummerWrites(collectedProposals);
        summerWriteProposals = directResult.writes;
        summerCalls.push(...directResult.calls);
      } else {
        const novelProposals = filterDuplicateSummerWrites(
          collectedProposals,
          [...summerWritesFromSnapshot(summerState), ...earlierProposals],
        );
        summerWriteProposals = await createSummerProposals(novelProposals);
        if (directSummerWriteRequested && collectedProposals.length === 0) {
          summerCalls.push({
            tool: "edit",
            label: "没有收到可写入 Summer 的整理内容",
            status: "miss",
          });
        }
      }
      reply = stripVisibleSummerDiary(stripSummerWriteTags(reply));
      const proposalMs = Date.now() - proposalStartedAt;

      const persistStartedAt = Date.now();
      const groupPersistedTime = skipPersist && groupSessionId ? cstTime() : "";
      const groupPersistedDate = skipPersist && groupSessionId ? cstToday() : "";
      let replyStamp: { time: string; date: string } | undefined;
      if (!skipPersist) {
        replyStamp = await persistRound(sessionId, userMsg, reply, thinkingContent, summerCalls, summerWriteProposals);
      } else if (groupSessionId) {
        await persistGroupRound(
          String(groupSessionId),
          String(groupSessionName || "一个群"),
          userMsg,
          reply,
          summerCalls,
          summerWriteProposals,
          String(groupSpeakerName || "王酥酥"),
          groupPersistedTime,
          groupPersistedDate,
        );
      }
      const replyPersistMs = Date.now() - persistStartedAt;

      const usage = data.usage;
      const promptTokens = usage.input_tokens;
      const cacheRead = usage.cache_read_input_tokens;
      const cacheWrite = usage.cache_creation_input_tokens;
      const totalInputTokens = promptTokens + cacheRead + cacheWrite;
      const cacheStatus =
        cacheRead > 0 ? "hit" :
        cacheWrite > 0 ? "write" :
        promptTokens ? "miss" :
        "unknown";
      const cacheReason =
        cacheStatus === "hit" ? "前面的稳定上下文被复用了" :
        cacheStatus === "write" ? "这轮写入了可复用上下文，下一轮更可能命中" :
        cacheStatus === "miss" ? "这轮没有读到缓存，可能是新会话、上下文变化或缓存尚未建立" :
        "接口没有返回可判断的缓存用量";
      const totalMs = Date.now() - requestStartedAt;
      logChatTiming({
        status: "ok",
        mode: skipPersist ? "group" : "direct",
        model: data.model,
        effort: thinking ? String(reasoningEffort || "high") : "low",
        web_search: Boolean(webSearch),
        total_ms: totalMs,
        user_persist_ms: userPersistMs,
        summer_ms: summerMs,
        queue_wait_ms: queueWaitMs,
        claude_duration_ms: claudeDurationMs,
        claude_round_trip_ms: claudeRoundTripMs,
        proposal_ms: proposalMs,
        reply_persist_ms: replyPersistMs,
        input_tokens: totalInputTokens,
        output_tokens: usage.output_tokens,
      });
      return {
        status: 200,
        body: {
          reply,
          thinking: thinkingContent,
          cache: {
            model: data.model,
            backend: "claude-code",
            prompt_tokens: promptTokens,
            total_input_tokens: totalInputTokens,
            cache_read: cacheRead,
            cache_write: cacheWrite,
            status: cacheStatus,
            reason: cacheReason,
            summer_used: summerUsed,
            summer_writes: summerWriteProposals.filter((proposal) => proposal.status === "committed").length,
            summer_write_proposals: summerWriteProposals,
            summer_calls: summerCalls,
            reply_persisted_time: replyStamp?.time,
            reply_persisted_date: replyStamp?.date,
            web_search_used: Boolean(webSearch),
            total_ms: totalMs,
            user_persist_ms: userPersistMs,
            summer_ms: summerMs,
            queue_wait_ms: queueWaitMs,
            claude_duration_ms: claudeDurationMs,
            claude_round_trip_ms: claudeRoundTripMs,
            proposal_ms: proposalMs,
            reply_persist_ms: replyPersistMs,
            group_persisted_time: groupPersistedTime,
            group_persisted_date: groupPersistedDate,
          },
        },
      };
    } catch (error) {
      logChatTiming({
        status: isAbortError(error) ? "aborted" : "error",
        mode: skipPersist ? "group" : "direct",
        model: timingModel,
        effort: thinking ? String(reasoningEffort || "high") : "low",
        web_search: Boolean(webSearch),
        total_ms: Date.now() - requestStartedAt,
        user_persist_ms: userPersistMs,
        summer_ms: summerMs,
        queue_wait_ms: queueWaitMs,
        claude_duration_ms: claudeDurationMs,
        claude_round_trip_ms: claudeRoundTripMs,
        error_type: error instanceof Error ? error.name : "UnknownError",
      });
      if (isAbortError(error)) {
        return { status: 504, body: { reply: "已暂停等待；如果请求已经送达，回复稍后仍可能回来。", cache: { status: "unknown", reason: "请求已暂停", summer_used: true } } };
      }
      return { status: 502, body: { reply: claudeSubscriptionFailure(error, Boolean(webSearch)) } };
    }
  };

  if (!stream) {
    const result = await executeChat();
    return Response.json(result.body, { status: result.status });
  }

  const encoder = new TextEncoder();
  const visibleReply = createVisibleReplyStream();
  let connected = true;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  const emit = (event: Record<string, unknown>) => {
    if (!connected || !streamController) return;
    try {
      streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    } catch {
      connected = false;
      stopHeartbeat();
    }
  };
  const responseStream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      // WebKit may buffer tiny streamed responses. A harmless ignored field
      // gets the first event over its threshold without changing visible text.
      emit({ type: "start", padding: " ".repeat(1100) });
      // Search/tool turns deliberately withhold intermediate prose until the
      // final answer is safe to show. Keep the proxy connection active while
      // that work is silent so Nginx's 60-second idle timeout cannot turn a
      // healthy background generation into a false client-side failure.
      heartbeatTimer = setInterval(() => emit({ type: "heartbeat" }), 15_000);
    },
    cancel() {
      connected = false;
      streamController = null;
      stopHeartbeat();
    },
  });
  const job = executeChat((delta) => {
    const visible = visibleReply.push(delta);
    if (visible) emit({ type: "delta", text: visible });
  }).then((result) => {
    stopHeartbeat();
    visibleReply.finish();
    emit({ type: result.status === 200 ? "done" : "error", status: result.status, ...result.body });
    if (connected && streamController) {
      try {
        streamController.close();
      } catch {
        // The browser may have disconnected between the final write and close.
      }
    }
  });

  // Keep the generation promise attached to the request lifecycle after a
  // client disconnect so the final persistence above can still finish.
  after(async () => {
    await job;
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
