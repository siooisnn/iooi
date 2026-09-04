import { withStore } from "@/app/lib/store";
import { isClaudeCodeEnabled, normalizeClaudeCodeModel, runClaudeCodeChat } from "@/app/lib/claude-code";
import { existsSync, readFileSync } from "fs";
import { basename, extname, resolve, sep } from "path";

export const runtime = "nodejs";

// ── 服务端落地:回复生成后直接写库,不依赖前端存活 ──
// 就算她发完消息立刻锁屏,回复也稳稳躺在服务器上
function cstTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}
function cstToday() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}
type StoreMsg = { role: string; content: string; time?: string; date?: string; thinking?: string; image?: string; file?: string; source?: string; proposal?: SummerWrite };
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

function collectClaudeImages(messages: ChatRequestMessage[]) {
  const images = new Map<string, ImageBlock>();
  let totalSize = 0;
  for (const message of [...messages].reverse()) {
    const url = String(message.image || "");
    if (!url || images.has(url) || images.size >= CLAUDE_IMAGE_COUNT_LIMIT) continue;
    const image = loadClaudeImage(url);
    const size = Buffer.byteLength(image.source.data, "utf8");
    if (totalSize + size > CLAUDE_IMAGE_TOTAL_LIMIT) continue;
    images.set(url, image);
    totalSize += size;
  }
  return images;
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
  xiaoshu_tail?: SummerItem[];
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

function buildSummerBridgeStable(): string {
  return [
    "## summer bridge",
    "",
    "Memory writes from chat are proposal-only. If something should be remembered, append a hidden proposal tag after your normal reply: [summer_remember layer=xiazhi title=\"short title\" weight=5 tags=\"optional\"]content[/summer_remember]. Use mangzhong for titled chapters of the shared history, xiazhi for important lasting memories, xiaoshu for daily fragments, rain for unresolved future items, ferry for transition/渡口/threshold memories. Only sea is read-only. The system will show it to her for confirmation and will not write it silently.",
    "If she explicitly asks to write something into summer or ferry, do not refuse by saying you cannot write summer. Respond naturally, then add the hidden proposal tag with the requested layer. It is still only a proposal until she confirms it.",
    "Do not print visible diary sections like '王酥酥日记 | date' in chat. Put diary-style memory only inside the hidden proposal tag.",
    "",
    "下面是唯一长期记忆源中最稳定的部分。先认得关系与来时路，再回应当前消息；不要说自己读取了这些后台内容。",
    "",
    "你不能静默提交、编辑或删除 summer；但你可以通过 hidden proposal tag 发起待确认写入。她明确说“写入/记到/ferry/summer”时，应该生成对应 proposal，而不是拒绝。",
    "如果她问某天日记、旧事、记忆、summer 或 sea，后台可能会给出按需检索结果。能看到结果就自然回答；没看到相关结果时，说“我这里没检索到”，不要说自己绝对不能查。",
  ].join("\n").trim();
}

function shouldSearchSummer(query: string): boolean {
  const text = query.trim();
  if (!text) return false;
  const memoryTarget = /summer|记忆|日记|小暑|夏至|芒种|小满|立夏|rain|sea|碎片|之前|以前|那天|哪天|说过|写过|发生过/i;
  return /搜/.test(text) && memoryTarget.test(text);
}

function isSummerWriteOnlyIntent(query: string): boolean {
  const text = query.trim();
  if (!text) return false;
  const wantsWrite = /写进|写入|写到|记下|记住|存进|存到|加进|加到|放进|放到|收进|录入/.test(text);
  if (!wantsWrite) return false;
  const wantsSearch = /找|查|搜|翻|看.*日记|读.*日记|记不记得|还记得|想起来|之前|以前|那天|哪天|碎片\s*\d{1,3}|\d{1,2}[.-]\d{1,2}|\d{1,2}月\d{1,2}日?|20\d{2}-\d{1,2}-\d{1,2}/i.test(text);
  return !wantsSearch;
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

  const quoted = text.match(/[“"']([^“”"']{2,40})[”"']/);
  if (quoted?.[1]) return { query: quoted[1], label: quoted[1] };

  const compact = text
    .replace(/^(逗你了|好了|修好了|再试试|帮我|你|老公|宝宝|王酥酥|看看|搜下|搜索|查一下|查下|翻翻|记不记得|还记得)[，,\s]*/g, "")
    .replace(/[？?！!。~～]+/g, " ")
    .trim();
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
  const meta = [
    `summer · 提议写入${layerName[proposal.layer] || proposal.layer}`,
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
  if (!sessionId || !reply) return;
  try {
    const diaryRegex = /\[日记\]([\s\S]*?)\[\/日记\]/g;
    const cleanReply = reply.replace(diaryRegex, "").replace(/\[心情[:：].+?\]/g, "").trim();
    const parts = cleanReply.split(/\n{2,}/).filter((p) => p.trim());
    const now = cstTime();
    const today = cstToday();

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

      const tailKeys = new Set(msgs.slice(-16).filter((m) => m.role === "assistant").map(storeMessageKey));
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
          content: summerCallContent(call),
          time: now,
          date: today,
        });
      }
      parts.forEach((p, i) => {
        const c = p.trim();
        pushAssistant({
          role: "assistant", content: c, time: now, date: today,
          ...(i === 0 && thinkingContent ? { thinking: thinkingContent } : {}),
        });
      });
      for (const proposal of summerWriteProposals) {
        pushAssistant({
          role: "assistant",
          source: "summer_write_proposal",
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

export async function POST(request: Request) {
  const { messages, modelId, systemPrompt, dynamicPrompt, thinking, webSearch, reasoningEffort, sessionId, userMsg, groupUserText, skipPersist } = await request.json();
  const requestMessages: ChatRequestMessage[] = Array.isArray(messages) ? messages : [];
  if (!skipPersist) {
    await persistUserMessage(sessionId, userMsg);
  }

  if (requestMessages.some((message) => message.file)) {
    return Response.json({ reply: "酥酥的订阅文件还在接入中；这条消息没有转用 API。" }, { status: 422 });
  }
  if (!isClaudeCodeEnabled()) {
    return Response.json({ reply: "Claude 订阅通道暂时不可用；这条消息没有转用 API。" }, { status: 503 });
  }
  let imageBlocks = new Map<string, ImageBlock>();
  try {
    imageBlocks = collectClaudeImages(requestMessages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片读取失败";
    return Response.json({ reply: `${message}；这条消息没有转用 API。` }, { status: 422 });
  }

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
  const summerCalls: SummerCall[] = [];
  try {
    const query = String(groupUserText || latestUserText(requestMessages));
    const summerWake = await readSummerWake();
    const summerStable = [buildSummerBridgeStable(), String(summerWake.stable || "").trim()]
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
        const summerState = await readSummerState();
        summerExactDate = buildExactXiaoshuSearch(summerState, query);
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
        try {
          const toolName = shouldReadSummerRef(query) ? "read" : "search";
          const raw = await callSummerTool(toolName, toolName === "read" ? { ref: query, limit: 8 } : { query, limit: 5 });
          const result = toolName === "read"
            ? structuredFromRead(parseSummerJson<SummerReadResult>(raw))
            : parseSummerJson<SummerStructuredResult>(raw);
          summerSearch = renderStructuredSearch(result);
          const label = result.cleaned?.label || result.query || query.slice(0, 32);
          const count = (result.results || result.items || []).length;
          summerCalls.push({
            tool: toolName,
            label: `检索 summer：${label}`,
            status: count > 0 ? "hit" : "miss",
            count,
          });
        } catch {
          const cleanedSearch = cleanSummerSearchQuery(query);
          summerSearch = await callSummerTool("search", { query: normalizeSummerSearchQuery(cleanedSearch.query), limit: 5 });
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
    const message = error instanceof Error ? error.message : "unknown error";
    return Response.json({ reply: `summer 暂时无法读取：${message}` }, { status: 502 });
  }

  const combinedDynamicPrompt = [
    dynamicPrompt,
    summerExactDate,
    summerSearch,
  ].filter(Boolean).join("\n\n");

  // 图片只从 iooi 自己的 uploads 目录读取并交给 Claude 订阅；文件仍明确拒绝，不会切换到 API。
  const anthropicMessages: Array<{ role: string; content: string | Array<TextBlock | ImageBlock> }> = requestMessages.map((msg) => {
    const image = msg.image ? imageBlocks.get(msg.image) : undefined;
    if (!image) return { role: msg.role, content: String(msg.content || "") };
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

  try {
    const requestedModel = normalizeClaudeCodeModel(String(modelId || "claude-sonnet-5"));
    const data = await runClaudeCodeChat({
      systemPrompt: system.map((block) => block.text).join("\n\n"),
      messages: anthropicMessages,
      modelId: requestedModel,
      reasoningEffort: thinking ? reasoningEffort : "low",
      webSearch: Boolean(webSearch),
      signal: request.signal,
    });
    let reply = data.reply || "没有收到回复";
    const thinkingContent = "";

    // Chat-origin writes are proposals only. They are shown to the user but
    // never committed here, which prevents duplicate hidden writes.
    const summerWriteProposals = await createSummerProposals(collectSummerWriteProposals(reply));
    reply = stripVisibleSummerDiary(stripSummerWriteTags(reply));

    if (!skipPersist) {
      await persistRound(sessionId, userMsg, reply, thinkingContent, summerCalls, summerWriteProposals);
    }

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
    return Response.json({
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
        summer_writes: 0,
        summer_write_proposals: summerWriteProposals,
        summer_calls: summerCalls,
        web_search_used: Boolean(webSearch),
      },
    });
  } catch (error) {
    if (isAbortError(error)) {
      return Response.json({ reply: "已暂停等待；如果请求已经送达，回复稍后仍可能回来。", cache: { status: "unknown", reason: "请求已暂停", summer_used: true } }, { status: 504 });
    }
    return Response.json({ reply: claudeSubscriptionFailure(error, Boolean(webSearch)) }, { status: 502 });
  }
}
