import { withGptStore } from "@/app/lib/store";

type StoreMessage = {
  role: string;
  content: string;
  time?: string;
  date?: string;
  source?: string;
  proposal?: SummerWrite;
};

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
  ferry?: SummerItem[];
  xiaoshu_recent?: SummerItem[];
  xiaoshu_tail?: SummerItem[];
};

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
const REASONING_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"]);

function cstTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}

function cstToday() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function gptSummerBaseUrl() {
  return (process.env.GPT_SUMMER_BASE_URL || "").trim().replace(/\/+$/, "");
}

function gptSummerHeaders(): Record<string, string> {
  const token = process.env.GPT_SUMMER_TOKEN || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readGptSummerState(): Promise<SummerState | null> {
  const baseUrl = gptSummerBaseUrl();
  if (!baseUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${baseUrl}/api/state`, {
      headers: gptSummerHeaders(),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GPT summer returned ${res.status}`);
    return await res.json() as SummerState;
  } finally {
    clearTimeout(timeout);
  }
}

function renderSummerState(state: SummerState) {
  const layers = state.layers || {};
  const parts = [
    "## GPT summer",
    "这是只属于你和用户的独立长期记忆。自然使用，不要声称看见了后台资料，也不要提另一个模型的记忆。",
    "",
    "### 立夏：关系",
    String(layers.lixia || "").trim(),
    "",
    "### 小满：彼此",
    String(layers.xiaoman || "").trim(),
    "",
    "### 芒种：来时路",
    String(layers.mangzhong || "").trim(),
    "",
    "### 夏至：稳定记忆",
  ];
  for (const item of state.xiazhi || []) {
    if (Number(item.weight || 5) < 6) continue;
    parts.push(`- ${item.date || ""}｜${item.title || ""}：${item.content || ""}`);
  }
  parts.push("", "### rain：未了结");
  for (const item of state.rain || []) {
    if (item.status === "closed") continue;
    parts.push(`- ${item.title || ""}${item.due ? `｜due ${item.due}` : ""}：${item.content || ""}`);
  }
  parts.push("", "### ferry：过渡");
  for (const item of state.ferry || []) {
    parts.push(`- ${item.date || ""}｜${item.title || ""}：${item.content || ""}`);
  }
  parts.push("", "### 小暑：近期");
  const recent = [...(state.xiaoshu_recent || []), ...(state.xiaoshu_tail || [])].slice(-7);
  for (const item of recent) {
    parts.push(`- ${item.date || ""}｜${item.title || ""}：${item.content || ""}`);
  }
  return parts.join("\n").trim();
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
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
    writes.push({
      id: `gpt-proposal-${Date.now()}-${writes.length}`,
      status: "pending",
      layer: layer as SummerWrite["layer"],
      title: String(attrs.title || "").trim().slice(0, 80),
      content: content.slice(0, 2400),
      weight: Math.max(1, Math.min(10, Number(attrs.weight || 5) || 5)),
      due: String(attrs.due || "").trim().slice(0, 40),
      tags: String(attrs.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
    });
    if (writes.length >= 3) break;
  }
  return writes;
}

function stripSummerWriteTags(text: string) {
  return text.replace(SUMMER_WRITE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function proposalCardContent(proposal: SummerWrite) {
  const layerName: Record<string, string> = {
    mangzhong: "芒种",
    xiazhi: "夏至",
    xiaoshu: "小暑",
    rain: "rain",
    ferry: "渡口",
  };
  return [
    `summer · 提议写入${layerName[proposal.layer] || proposal.layer} · ${proposal.title || "未命名"} · 权重 ${proposal.weight}`,
    proposal.content,
  ].join("\n");
}

function sameUserMessage(a: StoreMessage, b: StoreMessage) {
  return a.role === "user" && a.content === b.content && a.time === b.time && a.date === b.date;
}

function hasLaterUserMessage(messages: StoreMessage[], userMessage?: StoreMessage) {
  if (!userMessage?.content) return false;
  const index = messages.findIndex((message) => sameUserMessage(message, userMessage));
  return index >= 0 && messages.slice(index + 1).some((message) => message.role === "user");
}

function storeMessageKey(message: StoreMessage) {
  return [message.role, message.source || "", message.content.trim().replace(/\s+/g, " ")].join("\u0001");
}

async function persistRound(
  sessionId: string | undefined,
  userMessage: StoreMessage | undefined,
  reply: string,
  proposals: SummerWrite[]
) {
  if (!sessionId || !reply) return;
  await withGptStore((store) => {
    const sessions = (store.sessions || []) as Array<{ id: string; name: string; messages: StoreMessage[] }>;
    let session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      session = { id: sessionId, name: "GPT 对话", messages: [] };
      sessions.unshift(session);
      store.sessions = sessions;
    }
    const messages = session.messages || (session.messages = []);
    if (userMessage?.content && !messages.slice(-8).some((message) => sameUserMessage(message, userMessage))) {
      messages.push(userMessage);
    }
    if (hasLaterUserMessage(messages, userMessage)) return;
    const tailKeys = new Set(messages.slice(-16).filter((message) => message.role === "assistant").map(storeMessageKey));
    const now = cstTime();
    const today = cstToday();
    for (const content of reply.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
      const message = { role: "assistant", content, time: now, date: today };
      const key = storeMessageKey(message);
      if (!tailKeys.has(key)) {
        messages.push(message);
        tailKeys.add(key);
      }
    }
    for (const proposal of proposals) {
      messages.push({
        role: "assistant",
        source: "summer_write_proposal",
        content: proposalCardContent(proposal),
        proposal,
        time: now,
        date: today,
      });
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((message: StoreMessage) => message?.role === "user" || message?.role === "assistant")
      .map((message: StoreMessage) => ({ role: message.role, content: String(message.content || "") }));
    const userMessage = body.userMsg as StoreMessage | undefined;
    const summerState = await readGptSummerState().catch(() => null);
    const summerConfigured = Boolean(gptSummerBaseUrl());
    const systemParts = [
      String(body.systemPrompt || "").trim(),
      summerState ? renderSummerState(summerState) : "",
      summerConfigured
        ? "如果确实值得写入长期记忆，在正常回复末尾附加隐藏标签：[summer_remember layer=xiaoshu title=\"简短标题\" weight=5 tags=\"可选\"]内容[/summer_remember]。这只是待用户确认的提议，不会自动写入。"
        : "",
      String(body.dynamicPrompt || "").trim(),
    ].filter(Boolean);
    const model = process.env.GPT_MODEL_ID || "openai/gpt-5.6-sol";
    const reasoningEffort = REASONING_EFFORTS.has(String(body.reasoningEffort || ""))
      ? String(body.reasoningEffort)
      : "medium";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
        "HTTP-Referer": "https://sioois.cc",
        "X-Title": "iooi GPT",
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemParts.length ? [{ role: "system", content: systemParts.join("\n\n") }] : []),
          ...messages,
        ],
        max_tokens: 2048,
        reasoning_effort: reasoningEffort,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const data = await res.json();
    if (!res.ok || data.error) {
      return Response.json({ reply: `GPT 接口出错了：${data.error?.message || res.status}` }, { status: 502 });
    }
    const rawReply = String(data.choices?.[0]?.message?.content || "").trim() || "没有收到回复";
    const proposals = summerConfigured ? parseSummerWrites(rawReply) : [];
    const reply = stripSummerWriteTags(rawReply);
    if (!body.skipPersist) {
      await persistRound(body.sessionId, userMessage, reply, proposals);
    }
    const usage = data.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const cacheRead = usage.prompt_tokens_details?.cached_tokens || 0;
    return Response.json({
      reply,
      cache: {
        model: data.model || model,
        prompt_tokens: promptTokens,
        total_input_tokens: promptTokens,
        cache_read: cacheRead,
        cache_write: 0,
        status: cacheRead > 0 ? "hit" : promptTokens > 0 ? "miss" : "unknown",
        reason: summerConfigured ? "GPT 使用独立 summer" : "GPT summer 尚未配置；本轮仅使用独立会话",
        reasoning_effort: reasoningEffort,
        summer_used: Boolean(summerState),
        summer_configured: summerConfigured,
        summer_write_proposals: proposals,
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json(
      { reply: timedOut ? "GPT 这次等待超时了，可以再试一次。" : "GPT 这次没有连上。" },
      { status: timedOut ? 504 : 500 }
    );
  }
}
