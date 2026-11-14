// What he is doing while she waits: thinking, reading Summer, searching the
// web, opening a file. Built from Claude Code's stream-json events. Only the
// kind of action and a short target are kept, never tool output or code.
// Private Summer mutations also retain their submitted fields for her receipt.
// No relative imports, so the node test runner can load this file directly.

export type ReplyStepMode = "chat" | "work";

export type SummerWriteDetail = {
  action: "add" | "update" | "delete" | "daily_review";
  layer: string;
  title?: string;
  content?: string;
  oldContent?: string;
  itemId?: string;
  fields?: string[];
  truncated?: boolean;
};

export type ReplyStep = {
  kind: "think" | "tool";
  /** While running, e.g. "在看书架". */
  active: string;
  /** Once finished, e.g. "看了书架". */
  done: string;
  /** Summary bucket, e.g. "web" or "read". */
  group?: string;
  /** Start time, epoch ms. */
  t: number;
  /** Duration once finished. */
  ms?: number;
  /** Merged repeats of the same finished step. */
  n?: number;
  /** Summer mutations are successful only after a successful tool_result. */
  status?: "success" | "failed" | "unknown";
  summerWrite?: SummerWriteDetail;
};

type ToolInput = Record<string, unknown>;
type ToolLabel = { active: string; done: string; group: string };

const MIN_THINK_MS: Record<ReplyStepMode, number> = { chat: 1_000, work: 2_000 };
const MAX_STEPS = 300;
const MAX_WRITE_TEXT = 20_000;

function summerWriteDetail(name: string, value: unknown): SummerWriteDetail | undefined {
  if (name !== "mcp__summer__edit" && name !== "mcp__summer__daily_review") return;
  if (!value || typeof value !== "object") return;
  const input = value as ToolInput;
  const action = name === "mcp__summer__daily_review" ? "daily_review" : input.action;
  if (action !== "add" && action !== "update" && action !== "delete" && action !== "daily_review") return;
  const layer = action === "daily_review" ? "xiaoshu" : input.layer;
  if (typeof layer !== "string" || !SUMMER_LAYERS[layer]) return;
  const detail: SummerWriteDetail = { action, layer };
  for (const [key, target, limit] of [
    ["title", "title", 500], ["content", "content", MAX_WRITE_TEXT],
    ["old_content", "oldContent", MAX_WRITE_TEXT], ["item_id", "itemId", 500],
  ] as const) {
    if (typeof input[key] !== "string") continue;
    detail[target] = input[key].slice(0, limit);
    if (input[key].length > limit) detail.truncated = true;
  }
  const fields: string[] = [];
  for (const [key, label] of Object.entries({ date: "日期", weight: "权重", due: "到期", status: "状态", state: "阶段", ttl_hours: "有效小时", expires_at: "失效时间" })) {
    if (typeof input[key] === "string" || typeof input[key] === "number") fields.push(`${label}：${String(input[key]).slice(0, 500)}`);
  }
  if (Array.isArray(input.tags)) fields.push(`标签：${input.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20).map((tag) => tag.slice(0, 100)).join("、")}`);
  if (fields.length) detail.fields = fields;
  return detail;
}

export function summerWriteTitle(step: ReplyStep) {
  const detail = step.summerWrite;
  if (!detail) return "";
  const action = { add: "新增", update: "修改", delete: "删除", daily_review: "写入回顾" }[detail.action];
  const status = step.ms === undefined ? "正在提交" : step.status === "success" ? "已完成" : step.status === "failed" ? "失败" : "结果未确认";
  return `${status} · ${action} Summer ${SUMMER_LAYERS[detail.layer] || detail.layer}${detail.title ? ` · ${detail.title}` : ""}`;
}

function text(value: unknown, max = 24) {
  const clean = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function label(verb: string, object: string, group: string, doneVerb = `${verb}了`): ToolLabel {
  return { active: `在${verb}${object}`, done: `${doneVerb}${object}`, group };
}

function withTarget(base: ToolLabel, target: string): ToolLabel {
  return target ? { ...base, active: `${base.active}：${target}`, done: `${base.done}：${target}` } : base;
}

function hostOf(url: unknown) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function baseName(path: unknown) {
  const value = typeof path === "string" ? path.trim() : "";
  return value.split("/").filter(Boolean).pop() || "";
}

const SUMMER_LAYERS: Record<string, string> = {
  lixia: "立夏", xiaoman: "小满", mangzhong: "芒种", xiazhi: "夏至",
  xiaoshu: "小暑", rain: "rain", ferry: "渡口", sea: "sea",
};

const CLAWD_ACTIONS: Record<string, ToolLabel> = {
  feed: label("喂", "小砖", "clawd"),
  pet: label("摸摸", "小砖", "clawd", "摸了摸"),
  play: { active: "在陪小砖玩", done: "陪小砖玩了一会", group: "clawd" },
  bath: label("给小砖洗", "澡", "clawd"),
  sleep: { active: "在哄小砖睡觉", done: "哄小砖睡了", group: "clawd" },
  wake: { active: "在叫小砖起床", done: "叫小砖起床了", group: "clawd" },
  wear: label("给小砖换", "衣服", "clawd"),
};

const IOOI_TOOLS: Record<string, ToolLabel> = {
  blog_read: label("看", "博客", "blog"),
  blog_read_post: label("看", "一篇日志", "blog"),
  reading_shelf: label("看", "书架", "reading"),
  reading_book: label("翻", "书的目录", "reading"),
  reading_read: label("读", "书", "reading"),
  reading_mark: { active: "在记读到哪", done: "记下了读到哪", group: "reading" },
  reading_note: label("写", "批注", "reading"),
  surf_board: label("看", "论坛", "surf"),
  surf_thread: label("看", "一个帖子", "surf"),
  surf_reply: label("回", "帖", "surf"),
  surf_post: label("发", "帖", "surf"),
  phone_read: label("看", "小手机", "phone"),
  phone_decorate: label("布置", "小手机", "phone"),
  clawd_read: label("看", "小砖", "clawd"),
  clawd_talk: { active: "在和小砖说话", done: "和小砖说了话", group: "clawd" },
  capsule_read: label("看", "时光胶囊", "capsule"),
  capsule_seal: label("封", "一封信", "capsule"),
  capsule_open: label("拆", "信", "capsule"),
  dayday_book: label("看", "账本", "dayday"),
  dayday_shop: label("逛", "商城", "dayday"),
  dayday_items: label("看", "已有的东西", "dayday"),
  sticker_read: label("翻", "表情包", "sticker"),
};

function chatToolLabel(name: string, input: ToolInput): ToolLabel {
  if (name === "WebSearch") return withTarget({ active: "在网上搜", done: "网上搜了", group: "web" }, text(input.query));
  if (name === "WebFetch") return withTarget(label("看", "网页", "fetch"), hostOf(input.url));
  if (name === "mcp__summer__search") return withTarget(label("翻", " Summer", "summer"), text(input.query, 16));
  if (name === "mcp__summer__read") {
    const layers = Array.isArray(input.layers) ? input.layers.map((layer) => SUMMER_LAYERS[String(layer)] || "").filter(Boolean) : [];
    const date = text(input.date || input.ref, 12);
    return label("翻", ` Summer${[...layers.slice(0, 2), date].filter(Boolean).map((part) => ` ${part}`).join("")}`, "summer");
  }
  if (name === "mcp__summer__wake") return label("读取", " Summer 唤醒", "summer");
  if (name === "mcp__summer__daily_review") return withTarget(label("写入", " Summer 小暑回顾", "summer_write", "已写入"), text(input.date, 12));
  if (name === "mcp__summer__edit") {
    const layer = SUMMER_LAYERS[String(input.layer)] || "记忆";
    const verbs: Record<string, [string, string]> = { add: ["写入", "已写入"], update: ["修改", "已修改"], delete: ["删除", "已删除"] };
    const [active, done] = verbs[String(input.action)] || ["操作", "已操作"];
    return withTarget(label(active, ` Summer ${layer}`, "summer_write", done), text(input.title, 24));
  }
  if (name.startsWith("mcp__iooi__")) {
    const tool = name.slice("mcp__iooi__".length);
    if (tool === "clawd_action") return CLAWD_ACTIONS[String(input.action)] || label("照顾", "小砖", "clawd");
    return IOOI_TOOLS[tool] || label("用", "小窝里的工具", "iooi");
  }
  if (name.startsWith("mcp__iooiblog__")) return label("逛", "广场", "plaza");
  if (name.startsWith("mcp__xiaohongshu__")) {
    return withTarget(label("逛", "小红书", "xhs"), text(input.keyword, 16));
  }
  return label("用", "工具", "other");
}

function commandLabel(input: ToolInput): ToolLabel {
  const command = typeof input.command === "string" ? input.command : "";
  if (/\bclaude-release|iooi-release/.test(command)) return label("准备", "发布", "bash");
  if (/\bnpm (run )?test\b|node --test/.test(command)) return label("跑", "测试", "bash");
  if (/\btsc\b/.test(command)) return label("做", "类型检查", "bash");
  if (/\beslint\b|npm run lint/.test(command)) return label("跑", " eslint", "bash");
  if (/\bgit (commit|push)\b/.test(command)) return label("提交", "代码", "bash");
  if (/\bgit (status|diff|log|show)\b/.test(command)) return label("看", " git 记录", "bash");
  return withTarget(label("跑", "命令", "bash"), text(input.description, 30));
}

function fileLabel(verb: string, fallback: string, path: unknown, group: string): ToolLabel {
  const file = baseName(path);
  return file ? label(verb, ` ${file}`, group) : label(verb, fallback, group);
}

function workToolLabel(name: string, input: ToolInput): ToolLabel {
  if (name === "Read") return fileLabel("看", "文件", input.file_path, "read");
  if (name === "Edit" || name === "MultiEdit") return fileLabel("改", "代码", input.file_path, "edit");
  if (name === "Write") return fileLabel("写", "文件", input.file_path, "edit");
  if (name === "Grep") return label("翻", "代码", "search");
  if (name === "Glob") return label("找", "文件", "search");
  if (name === "Bash") return commandLabel(input);
  if (name === "WebSearch") return withTarget({ active: "在上网查资料", done: "上网查了资料", group: "web" }, text(input.query));
  if (name === "WebFetch") return withTarget(label("看", "网页", "fetch"), hostOf(input.url));
  return chatToolLabel(name, input);
}

export function describeTool(name: string, input: unknown, mode: ReplyStepMode): ToolLabel {
  const value = input && typeof input === "object" ? input as ToolInput : {};
  return mode === "work" ? workToolLabel(name, value) : chatToolLabel(name, value);
}

export function formatStepMs(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

/** One line of the step list. Running steps end with "…". */
export function stepLabel(step: ReplyStep) {
  if (step.ms === undefined) return step.kind === "think" ? "在想…" : `${step.active}…`;
  if (step.kind === "think") return `想了 ${formatStepMs(step.ms)}`;
  if (step.status === "failed") return `${step.active.replace(/^在/, "")} · 失败`;
  if (step.status === "unknown") return `${step.active.replace(/^在/, "")} · 结果未确认`;
  return step.n && step.n > 1 ? `${step.done} ×${step.n}` : step.done;
}

const CHAT_GROUPS: Record<string, (count: number) => string> = {
  summer: () => "翻了 Summer",
  summer_write: () => "更新了 Summer",
  web: (count) => `搜了 ${count} 次`,
  fetch: (count) => `看了 ${count} 个网页`,
  blog: () => "看了博客",
  reading: () => "看了书",
  surf: () => "逛了论坛",
  phone: () => "看了小手机",
  clawd: () => "陪了小砖",
  capsule: () => "看了胶囊",
  dayday: () => "看了账本",
  sticker: () => "翻了表情包",
  plaza: () => "逛了广场",
  xhs: () => "逛了小红书",
};

const WORK_GROUPS: Record<string, (count: number, unique: number) => string> = {
  read: (_count, unique) => `看了 ${unique} 个文件`,
  edit: (_count, unique) => `改了 ${unique} 个文件`,
  search: (count) => `翻了 ${count} 次代码`,
  bash: (count) => `跑了 ${count} 次命令`,
  web: (count) => `查了 ${count} 次资料`,
  fetch: (count) => `看了 ${count} 个网页`,
  compact: () => "压缩了上下文",
};

/** English, for the letter's name line: "6s", "1m 13s", "2m". */
export function formatStepMsShort(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/**
 * Only the time a reply took, in English: "thought for 6s" in chat (the
 * thinking, or the whole span when he only used tools), "worked for 1m 13s"
 * in work mode (the whole span, the same as "忙了").
 */
export function replyTookLabel(steps: ReplyStep[], mode: ReplyStepMode) {
  if (!steps.length) return "";
  const start = Math.min(...steps.map((step) => step.t));
  const span = Math.max(...steps.map((step) => step.t + (step.ms || 0))) - start;
  if (mode === "work") return span > 0 ? `worked for ${formatStepMsShort(span)}` : "";
  const thinkMs = steps.reduce((sum, step) => sum + (step.kind === "think" ? step.ms || 0 : 0), 0);
  const ms = thinkMs || span;
  return ms > 0 ? `thought for ${formatStepMsShort(ms)}` : "";
}

/** The faint line above a finished reply, e.g. "想了 8 秒 · 翻了 Summer · 搜了 2 次". */
export function summarizeSteps(steps: ReplyStep[], mode: ReplyStepMode, withTime = true) {
  if (!steps.length) return "";
  const parts: string[] = [];
  if (!withTime) {
    // The letter shows the time on the name line; the rest opens below it.
  } else if (mode === "work") {
    const start = Math.min(...steps.map((step) => step.t));
    const end = Math.max(...steps.map((step) => step.t + (step.ms || 0)));
    if (end > start) parts.push(`忙了 ${formatStepMs(end - start)}`);
  } else {
    const thinkMs = steps.reduce((sum, step) => sum + (step.kind === "think" ? step.ms || 0 : 0), 0);
    if (thinkMs > 0) parts.push(`想了 ${formatStepMs(thinkMs)}`);
  }
  const groups = new Map<string, { count: number; labels: Set<string> }>();
  for (const step of steps) {
    if (step.kind !== "tool") continue;
    if (step.group === "summer_write" && step.status !== "success") {
      parts.push(stepLabel(step));
      continue;
    }
    const key = step.group || step.done;
    const group = groups.get(key) || { count: 0, labels: new Set<string>() };
    group.count += step.n || 1;
    group.labels.add(step.done);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const chat = CHAT_GROUPS[key];
    const work = WORK_GROUPS[key];
    if (mode === "work" && work) parts.push(work(group.count, group.labels.size));
    else if (mode === "chat" && chat) parts.push(chat(group.count));
    else parts.push([...group.labels][0].replace(/：.*$/, ""));
  }
  return [...new Set(parts)].join(" · ");
}

export function isReplyStep(value: unknown): value is ReplyStep {
  if (!value || typeof value !== "object") return false;
  const step = value as Partial<ReplyStep>;
  return (step.kind === "think" || step.kind === "tool")
    && typeof step.active === "string" && typeof step.done === "string" && typeof step.t === "number";
}

export function cleanReplySteps(value: unknown): ReplyStep[] {
  return Array.isArray(value) ? value.filter(isReplyStep).slice(-MAX_STEPS).map((step) => {
    if (!step.summerWrite) return step;
    const next = { ...step };
    delete next.summerWrite;
    const stored = step.summerWrite;
    if (step.group !== "summer_write" || typeof stored !== "object") return next;
    const detail = summerWriteDetail(stored.action === "daily_review" ? "mcp__summer__daily_review" : "mcp__summer__edit", {
      action: stored.action, layer: stored.layer, title: stored.title, content: stored.content,
      old_content: stored.oldContent, item_id: stored.itemId,
    });
    if (detail) {
      if (Array.isArray(stored.fields)) detail.fields = stored.fields.filter((field): field is string => typeof field === "string").slice(0, 10).map((field) => field.slice(0, 1000));
      if (stored.truncated) detail.truncated = true;
      next.summerWrite = detail;
    }
    return next;
  }) : [];
}

type StreamBlock = { type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; is_error?: boolean; content?: unknown };

function summerResultFailed(block: StreamBlock): boolean {
  if (block.is_error) return true;
  const value = Array.isArray(block.content)
    ? block.content.filter((part) => part?.type === "text").map((part) => part.text).join("\n")
    : block.content;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Boolean(parsed && typeof parsed === "object" && (parsed.isError || parsed.error || parsed.ok === false));
  } catch {
    return false;
  }
}
type StreamEvent = {
  type?: string;
  subtype?: string;
  status?: string | null;
  message?: { content?: unknown };
};

/**
 * Turns Claude Code's stream-json events into a step list. Time with nothing
 * else happening counts as thinking; a short pause between two tools is
 * dropped so the list stays readable.
 */
export function createReplySteps({ mode, onChange, now = Date.now }: {
  mode: ReplyStepMode;
  onChange?: (steps: ReplyStep[]) => void;
  now?: () => number;
}) {
  const steps: ReplyStep[] = [];
  const running = new Map<string, ReplyStep>();
  // A tool_use id is counted once even if a message is replayed.
  const seen = new Set<string>();
  let anonymous = 0;
  let compactId = "";
  let finished = false;

  const changed = () => {
    if (!onChange) return;
    try {
      onChange(steps.map((step) => ({ ...step })));
    } catch {
      // A closed viewer must never stop the job.
    }
  };
  const activeThink = () => {
    const last = steps[steps.length - 1];
    return last && last.kind === "think" && last.ms === undefined ? last : null;
  };
  const closeThink = () => {
    const think = activeThink();
    if (!think) return false;
    think.ms = Math.max(0, now() - think.t);
    if (think.ms < MIN_THINK_MS[mode]) steps.pop();
    return true;
  };
  const startThink = () => {
    if (finished || activeThink()) return;
    steps.push({ kind: "think", active: "在想", done: "想了", t: now() });
    if (steps.length > MAX_STEPS) steps.splice(0, steps.length - MAX_STEPS);
  };
  const startTool = (id: string, tool: ToolLabel, summerWrite?: SummerWriteDetail) => {
    if (seen.has(id)) return false;
    seen.add(id);
    closeThink();
    const step: ReplyStep = { kind: "tool", ...tool, t: now(), ...(summerWrite ? { summerWrite } : {}) };
    steps.push(step);
    if (steps.length > MAX_STEPS) steps.splice(0, steps.length - MAX_STEPS);
    running.set(id, step);
    return true;
  };
  const endTool = (id: string, result?: StreamBlock) => {
    const step = running.get(id);
    if (!step) return false;
    running.delete(id);
    if (step.group === "summer_write") step.status = !result ? "unknown" : summerResultFailed(result) ? "failed" : "success";
    step.ms = Math.max(0, now() - step.t);
    const index = steps.indexOf(step);
    const previous = index > 0 ? steps[index - 1] : null;
    if (index === steps.length - 1 && previous && previous.kind === "tool" && previous.ms !== undefined
      && !step.summerWrite && !previous.summerWrite
      && previous.done === step.done && previous.status === step.status) {
      previous.n = (previous.n || 1) + 1;
      previous.ms += step.ms;
      steps.pop();
    }
    if (!running.size) startThink();
    return true;
  };

  return {
    start() {
      startThink();
      changed();
    },
    event(value: unknown) {
      if (finished || !value || typeof value !== "object") return;
      const event = value as StreamEvent;
      let touched = false;
      if (event.type === "system" && event.subtype === "status" && event.status === "compacting") {
        if (!compactId) {
          compactId = `compact-${anonymous += 1}`;
          touched = startTool(compactId, { active: "在压缩上下文", done: "压缩了上下文", group: "compact" });
        }
      } else if (event.type === "system" && event.subtype === "compact_boundary") {
        touched = compactId ? endTool(compactId) : false;
        compactId = "";
      } else if (event.type === "assistant" || event.type === "user") {
        const content = Array.isArray(event.message?.content) ? event.message.content as StreamBlock[] : [];
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          if (event.type === "assistant" && block.type === "tool_use" && typeof block.name === "string") {
            touched = startTool(block.id || `tool-${anonymous += 1}`, describeTool(block.name, block.input, mode),
              mode === "chat" ? summerWriteDetail(block.name, block.input) : undefined) || touched;
          } else if (event.type === "user" && block.type === "tool_result" && typeof block.tool_use_id === "string") {
            touched = endTool(block.tool_use_id, block) || touched;
          }
        }
      }
      if (touched) changed();
    },
    /** The visible answer began: the thinking before it is over. */
    writing() {
      if (finished || running.size) return;
      if (closeThink()) changed();
    },
    finish() {
      if (finished) return steps.map((step) => ({ ...step }));
      closeThink();
      for (const id of [...running.keys()]) {
        const step = running.get(id)!;
        if (step.group === "summer_write") step.status = "unknown";
        step.ms = Math.max(0, now() - step.t);
        running.delete(id);
      }
      finished = true;
      changed();
      return steps.map((step) => ({ ...step }));
    },
    steps() {
      return steps.map((step) => ({ ...step }));
    },
  };
}
