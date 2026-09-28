import { createHash } from "node:crypto";
import { countTokens, setMergeCacheSize } from "gpt-tokenizer/encoding/o200k_base";

// Server-only BPE estimate. Claude's tokenizer differs, so these are input budgets,
// not provider-reported usage. Never import the tokenizer into a client component.
setMergeCacheSize(5_000);
export const GROUP_CONTEXT_BUDGET = 100_000;
export const WORK_CONTEXT_BUDGET = 150_000;
export type ContextMessage = { index: number; role: "user" | "assistant"; content: string; speaker?: string; media?: boolean };
export type ContextSnapshot = { summary: string; until: number; prefixHash: string };
const options = { disallowedSpecial: new Set<string>() };
export function estimateTokens(text: string) { return countTokens(text, options); }
export function contextText(message: ContextMessage) {
  return `【${message.speaker || (message.role === "user" ? "用户" : "助手")}】\n${message.content}`;
}
export function contextPrefixHash(messages: ContextMessage[], until: number) {
  return createHash("sha256").update(JSON.stringify(messages.filter((m) => m.index < until))).digest("hex");
}
export function validContextSnapshot(messages: ContextMessage[], snapshot?: ContextSnapshot): ContextSnapshot {
  if (snapshot?.summary && Number.isInteger(snapshot.until) && snapshot.until > 0
    && snapshot.until <= (messages.at(-1)?.index ?? -1)
    && snapshot.prefixHash === contextPrefixHash(messages, snapshot.until)) return snapshot;
  return { summary: "", until: 0, prefixHash: "" };
}
export function planContext(messages: ContextMessage[], snapshot: ContextSnapshot | undefined, budget: number, overhead = 3_000) {
  const current = validContextSnapshot(messages, snapshot);
  const active = messages.filter((m) => m.index >= current.until);
  const costs = active.map((m, i) => estimateTokens(contextText(m)) + 8 + (m.media && i >= active.length - 5 ? 1_500 : 0));
  const fixed = overhead + estimateTokens(current.summary);
  const tokens = fixed + costs.reduce((a, b) => a + b, 0);
  if (tokens <= budget) return { current, tokens, older: [], until: current.until };
  // Keep the latest message intact, and roughly half the budget of recent text.
  let keepFrom = active.length - 1;
  let tail = costs[keepFrom] || 0;
  if (overhead + tail > budget) throw new Error("最新一条消息超过上下文预算，请拆成几条发送；原记录已保留。");
  while (keepFrom > 0 && tail + costs[keepFrom - 1] <= budget / 2) tail += costs[--keepFrom];
  const older = active.slice(0, keepFrom);
  if (!older.length) throw new Error("上下文摘要过大，暂时无法继续压缩；原记录已保留。");
  return { current, tokens, older, until: active[keepFrom].index };
}
export function summaryChunks(messages: ContextMessage[], maxTokens = 40_000) {
  const chunks: string[] = [];
  let pending = "";
  for (const message of messages) {
    const points = Array.from(contextText(message));
    let start = 0;
    while (start < points.length) {
      let low = 1;
      let high = Math.min(points.length - start, maxTokens * 4);
      // Split on Unicode code points, never on a token's partial UTF-8 bytes.
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (estimateTokens(points.slice(start, start + middle).join("")) <= maxTokens) low = middle;
        else high = middle - 1;
      }
      const part = points.slice(start, start + low).join("");
      if (pending && estimateTokens(pending + "\n\n" + part) > maxTokens) { chunks.push(pending); pending = ""; }
      pending += `${pending ? "\n\n" : ""}${part}`;
      start += low;
    }
  }
  if (pending) chunks.push(pending);
  return chunks;
}

export async function summarizeContextPlan(plan: ReturnType<typeof planContext>, messages: ContextMessage[], budget: number,
  summarize: (chunk: string, previous: string) => Promise<string>): Promise<ContextSnapshot> {
  if (!plan.older.length) return plan.current;
  let summary = plan.current.summary;
  for (const chunk of summaryChunks(plan.older)) {
    summary = (await summarize(chunk, summary)).trim();
    if (!summary || estimateTokens(summary) > budget / 4) throw new Error("上下文压缩没有生成有效摘要；原记录已保留，请稍后重试。");
  }
  return { summary, until: plan.until, prefixHash: contextPrefixHash(messages, plan.until) };
}
