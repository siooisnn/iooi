import { readFileSync, existsSync } from "fs";
import { join } from "path";
import * as iconv from "iconv-lite";
import { withStore } from "@/app/lib/store";

const TEXT_EXTS = new Set(["txt", "md", "csv", "json", "js", "ts", "html", "css", "py", "java", "xml", "yml", "yaml", "log"]);

// ── 服务端落地:回复生成后直接写库,不依赖前端存活 ──
// 就算她发完消息立刻锁屏,回复也稳稳躺在服务器上
function cstTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}
function cstToday() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}
function cstDateStr() {
  return new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" });
}
type StoreMsg = { role: string; content: string; time?: string; date?: string; thinking?: string; image?: string; file?: string; source?: string; proposal?: SummerWrite };
type TextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" };
};

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
  });
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
  layers?: Record<string, string>;
  xiazhi?: SummerItem[];
  rain?: SummerItem[];
  xiaoshu_recent?: SummerItem[];
  xiaoshu_tail?: SummerItem[];
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
};

async function readSummerState(): Promise<SummerState> {
  const token = process.env.SUMMER_TOKEN || "";
  const res = await fetch(`${summerBaseUrl()}/api/state`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `summer state failed: ${res.status}`);
  }
  return data as SummerState;
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
  const hits = result.results || [];
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

function buildSummerStable(state: SummerState): string {
  const layers = state.layers || {};
  return [
    "## summer stable",
    "",
    "Memory writes from chat are proposal-only. If something should be remembered, append a hidden proposal tag after your normal reply: [summer_remember layer=xiazhi title=\"short title\" weight=5 tags=\"optional\"]content[/summer_remember]. Use xiazhi for important lasting memories, xiaoshu for daily fragments, rain for unresolved future items. The system will show it to her for confirmation and will not write it silently.",
    "Do not print visible diary sections like '小k日记 | date' in chat. Put diary-style memory only inside the hidden proposal tag.",
    "",
    "下面是唯一长期记忆源中最稳定的部分。先认得关系与来时路，再回应当前消息；不要说自己读取了这些后台内容。",
    "",
    "你不能直接编辑、删除或后台写入 summer。若你觉得某件事值得留下，先用自然语言告诉她你想记什么，等她确认。",
    "如果她问某天日记、旧事、记忆、summer 或 sea，后台可能会给出按需检索结果。能看到结果就自然回答；没看到相关结果时，说“我这里没检索到”，不要说自己绝对不能查。",
    "",
    "## 立夏：我们是谁",
    (layers.lixia || "").trim(),
    "",
    "## 小满：我们是怎样的人",
    (layers.xiaoman || "").trim(),
    "",
    "## 芒种：来时路",
    (layers.mangzhong || "").trim(),
  ].join("\n").trim();
}

function buildSummerDynamic(state: SummerState): string {
  const parts = [
    "## summer current",
    "",
    "下面是会变化的近期记忆：夏至只保留权重 6 以上，rain 是未了结，小暑是最近一周。",
    "",
    "## 夏至：稳定后的深刻",
  ];
  for (const item of state.xiazhi || []) {
    if (Number(item.weight || 5) < 6) continue;
    parts.push(`- ${item.date || ""}｜${item.title || ""}：${item.content || ""}`);
  }
  parts.push("", "## rain：未了结的事");
  for (const item of state.rain || []) {
    if (item.status === "closed") continue;
    const due = item.due ? `｜due ${item.due}` : "";
    parts.push(`- [${item.id || ""}] ${item.title || ""}${due}：${item.content || ""}`);
  }
  parts.push("", "## 小暑：最近七天");
  for (const item of state.xiaoshu_recent || []) {
    parts.push(`### ${item.date || ""}｜${item.title || "小暑日常"}`);
    parts.push(String(item.content || "").trim());
  }
  parts.push("", "## 回应规则", "不要总结这份材料，不要说自己读到了记忆。直接对小姿说话，先认得她，再回应当下。");
  return parts.join("\n").trim();
}

function shouldSearchSummer(query: string): boolean {
  const text = query.trim();
  if (!text) return false;
  return /summer|记忆|日记|小暑|夏至|芒种|小满|立夏|rain|sunny|sea|之前|以前|那天|哪天|想起来|记得|回忆|说过|写过|发生过|找|查|搜|翻|\d{1,2}[.-]\d{1,2}|\d{1,2}月\d{1,2}日?|20\d{2}-\d{1,2}-\d{1,2}/i.test(text);
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
    .replace(/^(逗你了|好了|修好了|再试试|帮我|你|老公|宝宝|小k|看看|搜下|搜索|查一下|查下|翻翻|记不记得|还记得)[，,\s]*/g, "")
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
  layer: "xiazhi" | "xiaoshu" | "rain";
  title: string;
  content: string;
  weight: number;
  due: string;
  tags: string[];
};

const SUMMER_WRITE_RE = /\[summer_remember([^\]]*)\]([\s\S]*?)\[\/summer_remember\]/gi;
const VISIBLE_SUMMER_DIARY_RE = /(?:^|\n)\s*(?:---+\s*\n+)?\s*(小k日记|小暑日记|日记)\s*[|｜]\s*([^\n]*)\n+([\s\S]+)$/;

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
    if (!["xiazhi", "xiaoshu", "rain"].includes(layer)) continue;
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
    title: rawDate ? `小k日记 | ${rawDate}` : "小k日记",
    content: content.slice(0, 2400),
    weight: 5,
    due: "",
    tags: ["chat-diary"],
  }];
}

function summerChatWriteEnabled(): boolean {
  return process.env.SUMMER_CHAT_WRITE_ENABLED === "1";
}

function collectSummerWriteProposals(reply: string): SummerWrite[] {
  return [...parseSummerWrites(reply), ...parseVisibleSummerDiary(reply)].slice(0, 3);
}

function latestUserText(messages: Array<{ role: string; content?: string }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && typeof msg.content === "string") return msg.content.slice(-2000);
  }
  return "";
}

function usesAdaptiveThinking(modelId: string | undefined) {
  const id = modelId || "";
  return id.includes("claude-opus-4.7") ||
    id.includes("claude-opus-4.8") ||
    id.includes("claude-sonnet-5") ||
    id.includes("claude-fable-5");
}

function chatTimeoutMs(modelId: string | undefined, thinking: boolean): number {
  const id = modelId || "";
  if (id.includes("claude-opus") || id.includes("claude-fable")) return thinking ? 150000 : 90000;
  return thinking ? 120000 : 70000;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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
  const layerName: Record<string, string> = { xiazhi: "夏至", xiaoshu: "小暑", rain: "rain" };
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
    const diaryTexts: string[] = [];
    let dm;
    while ((dm = diaryRegex.exec(reply)) !== null) diaryTexts.push(dm[1].trim());
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

      const diary = (store.diary || (store.diary = [])) as Array<Record<string, unknown>>;
      for (const content of diaryTexts) {
        const key = content.slice(0, 80);
        const dup = diary.slice(0, 20).some(
          (e) => e.author === "ai" && String(e.content).trim().slice(0, 80) === key
        );
        if (!dup) {
          diary.unshift({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            date: cstDateStr(), time: cstTime(), content, author: "ai", category: "ai",
          });
        }
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

function readTextFile(filepath: string): string {
  const buffer = readFileSync(filepath);
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) return iconv.decode(buffer, "utf-16le");
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) return iconv.decode(buffer, "utf-16be");
  const utf8 = buffer.toString("utf-8");
  if (utf8.includes("\ufffd")) return iconv.decode(buffer, "gbk");
  return utf8;
}

export async function POST(request: Request) {
  const { messages, modelId, systemPrompt, dynamicPrompt, thinking, webSearch, sessionId, userMsg } = await request.json();
  await persistUserMessage(sessionId, userMsg);

  // --- System 数组里只放稳定部分,带 cache_control ---
  // dynamicPrompt(summary/memory/diary/mood/时间/unresolved cares)每轮都变,
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
    const query = latestUserText(messages || []);
    const summerState = await readSummerState();
    const summerStable = buildSummerStable(summerState);
    const summerDynamic = buildSummerDynamic(summerState);
    summerUsed = Boolean(summerStable || summerDynamic);
    if (summerStable) {
      system.push({ type: "text", text: summerStable, cache_control: cacheControl() });
    }
    if (summerDynamic) {
      system.push({ type: "text", text: summerDynamic, cache_control: cacheControl() });
    }

    const queryDates = extractQueryDates(query);
    if (queryDates.length) {
      try {
        const raw = await callSummerTool("read_xiaoshu_by_date", { query });
        const result = parseSummerJson<SummerDateResult>(raw);
        summerExactDate = renderSummerDateResult(result);
        summerCalls.push({
          tool: "read_xiaoshu_by_date",
          label: `查小暑 ${((result.dates || queryDates).join("、"))}`,
          status: (result.count || 0) > 0 ? "hit" : "miss",
          count: result.count || 0,
        });
      } catch {
        summerExactDate = buildExactXiaoshuSearch(summerState, query);
        summerCalls.push({
          tool: "read_xiaoshu_by_date",
          label: `查小暑 ${queryDates.join("、")}`,
          status: summerExactDate ? "fallback" : "miss",
          detail: "fallback",
        });
      }
    }

    if (shouldSearchSummer(query)) {
      if (!summerExactDate || summerExactDate.includes("没有找到")) {
        const cleanedSearch = cleanSummerSearchQuery(query);
        try {
          const raw = await callSummerTool("search_structured", { query: normalizeSummerSearchQuery(cleanedSearch.query), limit: 5 });
          const result = parseSummerJson<SummerStructuredResult>(raw);
          summerSearch = renderStructuredSearch(result);
          summerCalls.push({
            tool: "search_structured",
            label: `检索 summer：${cleanedSearch.label}`,
            status: (result.results || []).length > 0 ? "hit" : "miss",
            count: (result.results || []).length,
          });
        } catch {
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
    return Response.json({ reply: `summer ????${message}` }, { status: 502 });
  }

  const combinedDynamicPrompt = [
    dynamicPrompt,
    summerExactDate,
    summerSearch,
  ].filter(Boolean).join("\n\n");

  // --- Process conversation messages into Anthropic format ---
  const anthropicMessages = messages.map((msg: { role: string; content: string; image?: string; file?: string }) => {
    if (msg.image) {
      const filename = msg.image.split("/").pop() || "";
      const filepath = join(process.cwd(), "uploads", filename);
      if (existsSync(filepath)) {
        const imageData = readFileSync(filepath).toString("base64");
        const ext = filename.split(".").pop()?.toLowerCase() || "jpeg";
        const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
        return {
          role: msg.role,
          content: [
            { type: "image", source: { type: "base64", media_type: mimeMap[ext] || "image/jpeg", data: imageData } },
            { type: "text", text: msg.content || "(she sent you an image)" },
          ],
        };
      }
    }
    if (msg.file) {
      const filename = msg.file.split("/").pop() || "";
      const filepath = join(process.cwd(), "uploads", filename);
      const ext = filename.split(".").pop()?.toLowerCase() || "";
      if (existsSync(filepath)) {
        if (TEXT_EXTS.has(ext)) {
          const fileContent = readTextFile(filepath).slice(0, 10000);
          return { role: msg.role, content: `${msg.content}\n\n【文件内容】\n${fileContent}` };
        } else {
          return { role: msg.role, content: `${msg.content}（这是一个${ext}文件，无法直接读取内容）` };
        }
      }
    }
    return { role: msg.role, content: msg.content };
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
        const textBlock = last.content.find((b: { type: string; text?: string }) => b.type === "text");
        if (textBlock && typeof textBlock.text === "string") {
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
      lastBlock.cache_control = cacheControl();
    }
  }

  // --- Build request body (Anthropic Messages format) ---
  const requestBody: Record<string, unknown> = {
    model: modelId || "anthropic/claude-sonnet-4.6",
    ...(system.length > 0 ? { system } : {}),
    messages: anthropicMessages,
    max_tokens: thinking ? 4096 : 1536,
  };

  // Enable thinking
  if (thinking) {
    requestBody.thinking = usesAdaptiveThinking(String(modelId || ""))
      ? { type: "adaptive" }
      : { type: "enabled", budget_tokens: 4000 };
  }

  // Web search via OpenRouter server tool
  if (webSearch) {
    requestBody.tools = [
      { type: "openrouter:web_search" },
    ];
  }

  try {
    // Use Anthropic Messages API endpoint on OpenRouter
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), chatTimeoutMs(String(modelId || ""), Boolean(thinking)));
    const res = await fetch("https://openrouter.ai/api/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://iooi.chat",
        "X-Title": "iooi",
        ...(sessionId ? { "x-session-id": sessionId } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const data = await res.json();

    if (data.error) {
      return Response.json({ reply: `接口出错了：${data.error.message || JSON.stringify(data.error)}` }, { status: 500 });
    }

    // Anthropic Messages format: data.content is an array of blocks
    let reply = "";
    let thinkingContent = "";

    if (data.content) {
      for (const block of data.content) {
        if (block.type === "thinking") {
          thinkingContent += (thinkingContent ? "\n" : "") + block.thinking;
        } else if (block.type === "text") {
          reply += (reply ? "\n\n" : "") + block.text;
        }
      }
    }

    if (!reply) reply = "没有收到回复";

    // Chat-origin writes are proposals only. They are shown to the user but
    // never committed here, which prevents duplicate hidden writes.
    const summerWriteProposals = collectSummerWriteProposals(reply);
    reply = stripVisibleSummerDiary(stripSummerWriteTags(reply));

    await persistRound(sessionId, userMsg, reply, thinkingContent, summerCalls, summerWriteProposals);

    const usage = data.usage || {};
    const promptTokens =
      usage.input_tokens ??
      usage.prompt_tokens ??
      usage.total_tokens;
    const cacheRead =
      usage.cache_read_input_tokens ??
      usage.prompt_tokens_details?.cached_tokens ??
      0;
    const cacheWrite =
      usage.cache_creation_input_tokens ??
      usage.cache_creation?.input_tokens ??
      0;
    const totalInputTokens =
      usage.total_input_tokens ??
      usage.total_tokens ??
      ((promptTokens || 0) + cacheRead + cacheWrite);
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
      },
    });
  } catch (error) {
    if (isAbortError(error)) {
      return Response.json({ reply: "???????????????????????????????????", cache: { status: "unknown", reason: "??????", summer_used: true } }, { status: 504 });
    }
    return Response.json({ reply: "????????????" }, { status: 500 });
  }
}
