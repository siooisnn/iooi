import { appendClawdTalk, clawdRequestId, readClawd } from "./clawd-store";
import { clawdState } from "./clawd-pet";
import type { ClawdActor } from "./clawd-shared";
import { CLAWD_PERSONALITY } from "./clawd-prompt";

// Serialize conversations across Next route bundles, but never hold the save lock during a network request.
const queues = ((globalThis as { __iooiClawdChat?: Map<string, Promise<void>> }).__iooiClawdChat ??= new Map());
const queueKey = process.cwd();
export async function talkToClawd(text: unknown, by: ClawdActor, requestId: unknown) {
  const id = clawdRequestId(requestId);
  if (typeof text !== "string" || !text.trim() || text.trim().length > 500) throw new Error("跟小砖说的话请写在500字以内。");
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  const previous = queues.get(queueKey) || Promise.resolve();
  queues.set(queueKey, next);
  try {
    await previous;
    const state = readClawd();
    if (!state.pet) throw new Error("请先打开小砖页面，把原来的养成记录带过来。");
    const old = state.talks.find((t) => t.id === id);
    if (old) return { ...state, reply: old.his };
    let reply = "（睡着了，没听见）";
    if (!state.pet.asleep) {
      const key = process.env.CLAWD_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
      if (!key) throw new Error("小砖还没接好 DeepSeek，先陪他玩一会儿吧。");
      let response: Response;
      try {
        response = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({ model: process.env.CLAWD_DEEPSEEK_MODEL || "deepseek-flash", stream: false, max_tokens: 256,
            thinking: { type: "disabled" }, messages: [
              { role: "system", content: `${CLAWD_PERSONALITY}\n以下是真实状态，仅供理解，不要把数值机械念出来。你不能执行照顾操作；没有从对话得知的妈妈爸爸近况不要编造。当前名字：${state.pet.name}；状态：${clawdState(state.pet)}；数值：${JSON.stringify(state.pet.stats)}；穿戴：${JSON.stringify(state.outfit)}。` },
              ...state.talks.slice(-12).flatMap((t) => [{ role: "user", content: `${t.by === "susu" ? "酥酥（爸爸）" : "小姿（妈妈）"}：${t.mine}` }, { role: "assistant", content: t.his }]),
              { role: "user", content: `${by === "susu" ? "酥酥（爸爸）" : "小姿（妈妈）"}：${text.trim()}` },
            ] }),
        });
      } catch { throw new Error("小砖这次没听清，连接暂时没接上，稍后再试吧。"); }
      if (!response.ok) throw new Error(response.status === 401 ? "小砖的 DeepSeek 密钥需要检查。" : response.status === 402 ? "小砖的 DeepSeek 余额不足。" : "小砖暂时没回上来，稍后再试吧。");
      const data = await response.json().catch(() => null);
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("小砖这次没说出话，再试一次吧。");
      reply = content.trim().slice(0, 1000);
    }
    return await appendClawdTalk({ id, at: Date.now(), by, mine: text.trim(), his: reply });
  } finally { release(); if (queues.get(queueKey) === next) queues.delete(queueKey); }
}
