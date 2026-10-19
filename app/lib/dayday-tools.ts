import { createHash } from "crypto";
import { readBook, runDayday } from "./dayday-store";
import { categoryOf, ledgerView, yuan, type Entry, type MoneyGift } from "./dayday-ledger";
import type { LedgerCard, LedgerMarker } from "./dayday-markers";

export const DAYDAY_AI_ACTIONS = ["entry.add", "entry.update", "entry.remove", "fixed.add", "fixed.update", "fixed.remove", "refill.add", "refill.update", "refill.done", "product.say", "money.send", "money.receive", "money.return"];
export function daydayRequestId(key: string) { return `dd_${createHash("sha256").update(key).digest("hex").slice(0, 64)}`; }

/** Background care gets budget context, never a refill list to turn into a push. */
export async function daydayCareOverview() {
  const book = await readBook();
  if (!book.configured) return "";
  const v = ledgerView(book);
  return `【dayday生活背景，只读】剩余${yuan(v.remaining)}；今日支出${yuan(v.todaySpent)}；运输中${yuan(v.transit)}；红包转账暂扣${yuan(v.giftHeld)}；到期未确认的必支出${v.due.length}项。\n这些数只帮助理解她的生活，不要仅因余额或账务提醒而主动发消息；待补项不发推送。你不能记账、扣款、发或领红包转账、改设置；必支出等她在dayday账本首页点确认。`;
}

export async function daydayOverview() {
  const book = await readBook();
  const v = ledgerView(book);
  return `【dayday概况】${book.configured ? "" : "尚未设置起始余额；"}剩余${yuan(v.remaining)}；今天花${yuan(v.todaySpent)}；运输中${yuan(v.transit)}；红包转账暂扣${yuan(v.giftHeld)}\n待补：${book.refills.map((r) => r.name).join("、") || "无"}\n到期未扣：${v.due.map((f) => `${f.name} ${yuan(f.amount)}`).join("、") || "无"}\n${book.gifts.filter((g) => g.status === "pending" && g.from === "her").map((g) => `她发给你的${g.kind === "redpacket" ? "红包" : "转账"} id=${g.id} ${yuan(g.amount)} ${g.note}`).join("\n")}`;
}

export async function runDaydayAI(action: string, input: Record<string, unknown>, requestId?: string) {
  if (!DAYDAY_AI_ACTIONS.includes(action)) throw new Error("酥酥不能执行这个操作，必支出请她在账本确认，设置由她自己改。");
  return runDayday(action, input, { bySusu: true, requestId });
}

export async function runDaydayMarkers(markers: LedgerMarker[], key: string): Promise<LedgerCard[]> {
  const cards: LedgerCard[] = [];
  for (const [i, marker] of markers.entries()) {
    const id = daydayRequestId(`${key}:${i}`);
    try {
      const { result } = await runDaydayAI(marker.action, marker.input, id);
      if (!result) throw new Error("这次操作已处理，请查看账本确认。");
      if (marker.action.startsWith("entry.")) {
        const e = result as Entry;
        cards.push({ id, kind: marker.action === "entry.remove" ? "notice" : "entry", ok: true, targetId: e.id,
          text: `${marker.action === "entry.remove" ? "已撤销" : marker.action === "entry.update" ? "已修改" : "已记"} · ${e.note || categoryOf(e.cat).label} ${yuan(e.amount)} · ${categoryOf(e.cat).label}` });
      } else if (marker.action.startsWith("money.")) {
        const g = result as MoneyGift;
        cards.push({ id, kind: "money", ok: true, targetId: g.id, text: `${g.from === "susu" ? "酥酥" : "你"}的${g.kind === "redpacket" ? "红包" : "转账"} · ${yuan(g.amount)}${g.note ? ` · ${g.note}` : ""}` });
      } else cards.push({ id, kind: "notice", ok: true, text: "dayday · 已更新" });
    } catch (error) {
      cards.push({ id, kind: "notice", ok: false, text: `dayday · ${error instanceof Error ? error.message : "没存上，请稍后再试"}` });
    }
  }
  return cards;
}
