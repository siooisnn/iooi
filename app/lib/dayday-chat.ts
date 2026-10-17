import type { DaydayTransfer } from "./dayday";
import { latestUserSession } from "./chat-timeline";

export type DaydayCard = { ok: boolean; text: string; id?: string };
type Session = { id: string; kind?: string; messages: Array<{ role: string; content: string; source?: string; date?: string; time?: string; roundId?: string; dayday?: DaydayCard }> };
export function daydayTransferCard(t: DaydayTransfer): DaydayCard {
  return { ok: true, id: t.id, text: `酥酥发来${t.kind === "redpacket" ? "一个红包" : "一笔转账"} · ${t.id}` };
}
export function daydayTargetSession(store: Record<string, unknown>, requested?: unknown) {
  const sessions = (Array.isArray(store.sessions) ? store.sessions : []) as Session[];
  const target = typeof requested === "string" ? sessions.find((s) => s.id === requested && !s.kind) : latestUserSession(sessions);
  if (!target) throw new Error("找不到酥酥的私聊窗口，请先打开私聊。");
  return target;
}
/** The card is saved with the hold, so disconnecting cannot lose a real payment. */
export function appendDaydayTransferCard(store: Record<string, unknown>, transfer: DaydayTransfer) {
  const session = daydayTargetSession(store, transfer.sessionId);
  if (session.messages.some((m) => m.dayday?.id === transfer.id)) return;
  const card = daydayTransferCard(transfer), at = new Date(transfer.createdAt);
  session.messages.push({ role: "assistant", content: card.text, source: "dayday_card", dayday: card,
    ...(transfer.roundId ? { roundId: transfer.roundId } : {}),
    date: at.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }),
    time: at.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) });
}
const MARKER = /\[dayday_money\b([^\]]*)\]([\s\S]*?)\[\/dayday_money\]/gi;
export function parseDaydayMarker(reply: string) {
  const match = [...reply.matchAll(MARKER)][0];
  if (!match) return null;
  const attrs: Record<string, string> = {};
  for (const value of match[1].matchAll(/(kind|amount)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) attrs[value[1].toLowerCase()] = value[2] ?? value[3];
  return { kind: attrs.kind, amount: attrs.amount, message: match[2].trim().slice(0, 200) };
}
export function stripDaydayMarkers(reply: string) {
  return reply.replace(MARKER, "").replace(/\[dayday_money\b[\s\S]*$/i, "").replace(/\n{3,}/g, "\n\n").trim();
}
export const DAYDAY_CHAT_BRIDGE = `## dayday 红包与转账
你可以用自己的 dayday 可用余额给她发红包或转账。在正常回复末尾最多附一个隐藏块：
[dayday_money kind="redpacket" amount="52.00"]给她的祝福[/dayday_money]
或 [dayday_money kind="transfer" amount="100.00"]转账备注[/dayday_money]
金额单位是元，最多两位小数，只能给她，不能给自己充值、收取或改价格。后台会验证开关和余额，成功时显示真实卡片，不能靠文字声称已支付。发出先冻结，等她选择收取才计入支出，退回或24小时未收则解冻。不必每轮都发，也不要为了发钱把存款全部取出。她收取或退回的状态以本轮dayday现状为准。`;
