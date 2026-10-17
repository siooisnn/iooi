import { executeDayday } from "./dayday-store";
import { daydayTransferCard, parseDaydayMarker, parseDaydayReceive, type DaydayCard } from "./dayday-chat";
import type { DaydayTransfer } from "./dayday";
import { createHash } from "node:crypto";

export async function runDaydayChatMarker(reply: string, sessionId: string, roundId: string, epoch: number): Promise<DaydayCard[]> {
  const marker = parseDaydayMarker(reply);
  const receive = parseDaydayReceive(reply);
  if (!marker && !receive) return [];
  const key = createHash("sha256").update(`${sessionId}:${roundId}`).digest("hex");
  try {
    if (receive) {
      const received = await executeDayday("receive_transfer", { ...receive, requestId: `chat-receive:${key}` }, false, epoch);
      if (!received.ok) return [{ ok: false, text: `收取／退回未完成：${received.error}` }];
    }
    if (!marker) return [];
    const result = await executeDayday("send_transfer", { ...marker, sessionId, roundId: roundId.slice(0, 100), requestId: `chat-money:${key}` }, false, epoch);
    return result.ok ? [daydayTransferCard(result.result as DaydayTransfer)] : [{ ok: false, text: `红包／转账未发出：${result.error}` }];
  } catch {
    // A persistence/network error can be ambiguous; never claim a payment failed
    // after the hold may already have committed, or lose the ordinary chat reply.
    return [{ ok: false, text: "红包／转账结果暂未确认，请刷新聊天查看真实卡片后再决定是否重试。" }];
  }
}
