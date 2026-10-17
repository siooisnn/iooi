import { readStore, withStore } from "./store";
import { addLifeEntry } from "./life-log";
import { describePushResult, sendPushToAll } from "./push";
import { daydayCommand, daydaySnapshot, daydayState, dueDaydaySlot, event, settleDayday, type DaydayState } from "./dayday";

export function readDayday() { return daydaySnapshot(daydayState(readStore()?.dayday)); }

/** Wallet, stock, orders, receipts and life log are committed in the same JSON rename. */
export async function executeDayday(action: string, input: Record<string, unknown> = {}, manager = false, expectedEpoch?: number) {
  const now = Date.now();
  const output = await withStore((store) => {
    let state = structuredClone(daydayState(store.dayday, now));
    const oldIds = new Set(state.events.map((e) => e.id));
    settleDayday(state, now);
    let result: unknown = null, error = "";
    if (action !== "tick") {
      // A command failing validation never leaves half an order behind.
      const next = structuredClone(state);
      try {
        if (expectedEpoch !== undefined && (!next.enabled || next.epoch !== expectedEpoch)) throw new Error("dayday 开关已变更，本次生活活动取消。");
        result = daydayCommand(next, action, input, now, manager);
        state = next;
      } catch (err) {
        error = err instanceof Error ? err.message : "dayday 操作失败。";
        if (error.startsWith("余额不足")) {
          // Repeated retries do not send the same insufficient-funds alert all day.
          const last = state.events.find((e) => e.text === "购物时余额不足，未创建订单、未扣款。");
          if (!last || now - last.at > 3600_000) event(state, "购物时余额不足，未创建订单、未扣款。", now, true);
        }
      }
    }
    const added = state.events.filter((e) => !oldIds.has(e.id));
    for (const e of [...added].reverse()) addLifeEntry(store, { kind: "dayday", text: e.text, note: e.note, ref: e.ref || e.id }, new Date(e.at));
    store.dayday = state;
    return { result, error, state: daydaySnapshot(state, now), notifications: added.filter((e) => e.notify) };
  });
  // Push failures cannot roll back a paid order. Save their outcome with the event.
  for (const e of output.notifications) {
    let summary: string;
    try { summary = describePushResult(await sendPushToAll({ title: "酥酥的 dayday", body: e.text.slice(0, 120) })); }
    catch { summary = "推送失败，活动已保留在 dayday 日志。"; }
    await withStore((store) => {
      const state = daydayState(store.dayday);
      const entry = state.events.find((item) => item.id === e.id);
      if (entry) entry.push = summary;
      const life = (store.lifeLog || []) as { kind: string; at: number; text: string; note?: string }[];
      const log = life.find((item) => item.kind === "dayday" && item.at === e.at && item.text === e.text);
      if (log) log.note = [log.note, summary].filter(Boolean).join(" · ");
    });
  }
  return { ok: !output.error, ...(output.error ? { error: output.error } : {}), result: output.result, state: output.state };
}

/** Reserve before calling the model. Closing/reopening invalidates in-flight work. */
export async function reserveDaydayBeat(now: number) {
  return withStore((store) => {
    const s = daydayState(store.dayday, now);
    const slot = dueDaydaySlot(s, now);
    if (!slot) return null;
    s.beatSlots = [...s.beatSlots.slice(-100), slot.key];
    store.dayday = s;
    return { ...slot, epoch: s.epoch, state: daydaySnapshot(s, now) };
  });
}

export type { DaydayState };
