import { readClawdStore, withClawdStore } from "./store";
import { advanceClawd, actClawd, clawdRefusal, parseClawd, CLAWD_STATS, type ClawdPet } from "./clawd-pet";
import { CLAWD_ACTIONS, CLAWD_WARDROBE, type ClawdActor, type ClawdSnapshot, type ClawdTalk, type ClawdVisit, type ClawdOutfitState } from "./clawd-shared";

type Saved = { pet: ClawdPet; visits: ClawdVisit[]; outfit: ClawdOutfitState; talks: ClawdTalk[]; receipts: string[] };
export function clawdModelReady() { return Boolean(process.env.CLAWD_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY); }
function validPet(value: unknown): value is ClawdPet {
  if (!value || typeof value !== "object") return false;
  const p = value as ClawdPet;
  return Number.isFinite(p.bornAt) && Number.isFinite(p.updatedAt) && !!p.stats
    && CLAWD_STATS.every(({ key }) => Number.isFinite(p.stats[key]));
}
function saved(raw: Record<string, unknown> | null, now = Date.now()): Saved | null {
  if (!raw || !Object.keys(raw).length) return null;
  if (!validPet(raw.pet) || !Array.isArray(raw.visits) || !Array.isArray(raw.talks) || !Array.isArray(raw.receipts)
    || !raw.outfit || typeof raw.outfit !== "object" || Array.isArray(raw.outfit)) throw new Error("小砖存档格式异常，已停止写入以保留原记录。");
  return { pet: advanceClawd(parseClawd(raw.pet, now), now), visits: (raw.visits || []) as ClawdVisit[],
    outfit: (raw.outfit || {}) as ClawdOutfitState, talks: (raw.talks || []) as ClawdTalk[], receipts: (raw.receipts || []) as string[] };
}
function snapshot(state: Saved | null): ClawdSnapshot {
  return { pet: state?.pet || null, visits: state?.visits || [], outfit: state?.outfit || {}, talks: state?.talks || [], modelReady: clawdModelReady() };
}
export function readClawd(): ClawdSnapshot { return snapshot(saved(readClawdStore())); }
export function clawdRequestId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) throw new Error("请提供有效的 requestId，重试时复用同一个。");
  return value;
}
export async function initializeClawd(pet: unknown, visits: unknown) {
  return withClawdStore((raw) => {
    const existing = saved(raw);
    if (existing) return snapshot(existing);
    if (pet !== null && pet !== undefined && !validPet(pet)) throw new Error("本机的小砖记录格式异常，请先保留原记录，不会覆盖它。");
    const now = Date.now();
    const imported = Array.isArray(visits) ? visits.filter((v) => v && typeof v.at === "number" && Number.isFinite(v.at) && v.at <= now
      && CLAWD_ACTIONS.includes(v.action) && Number.isInteger(v.count) && v.count > 0).slice(-100).map((v) => ({ at: v.at, action: v.action, count: Math.min(v.count, 1000), by: "her" as const })) : [];
    const state: Saved = { pet: advanceClawd(parseClawd(pet, now), now), visits: imported, outfit: {}, talks: [], receipts: [] };
    Object.assign(raw, state);
    return snapshot(state);
  });
}
export async function changeClawd(action: unknown, input: Record<string, unknown>, by: ClawdActor, requestId: unknown, guard?: () => void) {
  const id = clawdRequestId(requestId);
  return withClawdStore((raw) => {
    guard?.();
    const state = saved(raw);
    if (!state) throw new Error("请先在小砖页面打开一次，把原来的养成记录带过来。");
    if (state.receipts.includes(id)) return { ...snapshot(state), repeated: true };
    const now = Date.now();
    let refusal: string | null = null;
    if (action === "wear") {
      const slot = input.slot;
      if (slot !== "head" && slot !== "body" && slot !== "hand") throw new Error("请选择头饰、衣服或手持槽位。");
      if (input.id !== null && (typeof input.id !== "string" || !CLAWD_WARDROBE[slot].includes(input.id))) throw new Error("这件饰品不在对应的衣柜里。");
      if (input.id === null) delete state.outfit[slot]; else state.outfit[slot] = input.id as string;
    } else {
      if (!CLAWD_ACTIONS.includes(action as never)) throw new Error("不认识这个小砖操作。");
      const kind = action as typeof CLAWD_ACTIONS[number];
      refusal = clawdRefusal(state.pet, kind);
      if (!refusal) {
        state.pet = actClawd(state.pet, kind, now);
        const last = state.visits.at(-1);
        if (kind === "pet" && last?.action === kind && last.by === by && now - last.at < 600_000) {
          last.at = now; last.count++;
        } else state.visits.push({ at: now, action: kind, count: 1, by });
        state.visits = state.visits.slice(-100);
      }
    }
    // Refusals have no side effects and can be tried again after his state changes.
    if (!refusal) state.receipts = [...state.receipts, id].slice(-200);
    Object.assign(raw, state);
    return { ...snapshot(state), refusal, repeated: false };
  });
}
export async function appendClawdTalk(talk: ClawdTalk) {
  return withClawdStore((raw) => {
    const state = saved(raw);
    if (!state) throw new Error("小砖还没搬过来。");
    const existing = state.talks.find((t) => t.id === talk.id);
    if (!existing) state.talks = [...state.talks, talk].slice(-60);
    Object.assign(raw, state);
    return { ...snapshot(state), reply: existing?.his || talk.his };
  });
}
