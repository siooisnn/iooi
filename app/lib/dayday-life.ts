import { readStore, withStore } from "./store";
import { runDayday } from "./dayday-store";
import { dayKey, type Product } from "./dayday-ledger";
import { addLifeEntry, noteLifeEntry, readLifeLog } from "./life-log";
import { describePushResult, sendPushToAll } from "./push";

export function daydayAutonomyOn() {
  return (readStore()?.settings as Record<string, unknown> | undefined)?.lifeDayday === true;
}

/** A real tool read leaves a trace; multiple image lookups in a sitting stay one line. */
export async function logDaydayVisit() {
  await withStore((store) => {
    if ((store.settings as Record<string, unknown> | undefined)?.lifeDayday !== true) return;
    const now = Date.now();
    const entries = readLifeLog(store);
    const visit = entries.find((e) => e.kind === "dayday" && e.source === "life" && e.ref === "shop-visit" && now - (e.lastAt ?? e.at) < 20 * 60_000);
    if (visit) { visit.lastAt = now; store.lifeLog = entries; return; }
    addLifeEntry(store, { kind: "dayday", source: "life", ref: "shop-visit", text: "逛了 dayday 商城，看看你想买的东西" });
  });
}

/** Only product opinions can be written from his own time; money never comes through here. */
export async function saveDaydayReviews(reviews: { id: string; text: string }[], since: number) {
  const saved: { at: number; name: string; text: string }[] = [];
  for (const review of reviews.slice(0, 2)) {
    try {
      const requestId = `life_dayday_${dayKey()}_${review.id}`;
      const result = await runDayday("product.say", { id: review.id, text: review.text }, {
        bySusu: true, requestId,
        guard: (book) => {
          if (!daydayAutonomyOn()) throw new Error("dayday 自主逛商城已关闭");
          if (!readLifeLog(readStore()).some((e) => e.kind === "dayday" && e.ref === "shop-visit" && (e.lastAt ?? e.at) >= since)) throw new Error("这次还没有实际看过商城");
          const product = book.products.find((p) => p.id === review.id);
          if (product?.susuSays) throw new Error("这件已经评价过，不重复评价或通知");
        },
      });
      if (result.repeated || !result.result) continue;
      const product = result.result as Product;
      const text = product.susuSays || "";
      const entry = await withStore((store) => addLifeEntry(store, {
        kind: "dayday", source: "life", ref: product.id, text: `给「${product.name}」留下了评价`, note: `酥酥说：${text}`,
      }));
      saved.push({ at: entry.at, name: product.name, text });
    } catch (error) {
      await withStore((store) => {
        const entries = readLifeLog(store);
        const visit = entries.find((e) => e.kind === "dayday" && e.ref === "shop-visit" && (e.lastAt ?? e.at) >= since);
        if (visit) noteLifeEntry(store, visit.at, "dayday", `这次评价未保存：${error instanceof Error ? error.message : "暂时失败"}`);
      });
    }
  }
  if (saved.length) {
    let summary = "dayday 已关闭，未发送通知";
    if (daydayAutonomyOn()) {
      try {
        const settings = (readStore()?.settings || {}) as Record<string, unknown>;
        const name = typeof settings.aiName === "string" ? settings.aiName : "酥酥";
        summary = describePushResult(await sendPushToAll({ title: `${name}在 dayday 留下了评价`, body: saved.map((r) => `${r.name}：${r.text}`).join("；").slice(0, 100) }));
      } catch { summary = "推送出错，评价已保存"; }
    }
    await withStore((store) => { for (const review of saved) noteLifeEntry(store, review.at, "dayday", summary); });
  }
  return saved;
}
