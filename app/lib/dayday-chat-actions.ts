import { executeDayday } from "./dayday-store";
import { daydayOrderCard, daydayTransferCard, parseDaydayBuy, parseDaydayMarker, parseDaydayReceive, type DaydayCard } from "./dayday-chat";
import { daydayExpectedTotal, type DaydayOrder, type DaydayProduct, type DaydayTransfer } from "./dayday";
import { createHash } from "node:crypto";

/**
 * `products` is the catalog this round's model saw; the order only goes through
 * at those prices, so a price edited mid-reply never charges a surprise amount.
 */
export async function runDaydayChatMarker(reply: string, sessionId: string, roundId: string, epoch: number, products: DaydayProduct[] = []): Promise<DaydayCard[]> {
  const marker = parseDaydayMarker(reply);
  const receive = parseDaydayReceive(reply);
  const buy = parseDaydayBuy(reply);
  if (!marker && !receive && !buy) return [];
  const key = createHash("sha256").update(`${sessionId}:${roundId}`).digest("hex");
  const cards: DaydayCard[] = [];
  let step = "红包／转账";
  try {
    if (receive) {
      step = "收取／退回";
      const received = await executeDayday("receive_transfer", { ...receive, requestId: `chat-receive:${key}` }, false, epoch);
      if (!received.ok) return [{ ok: false, text: `收取／退回未完成：${received.error}` }];
    }
    if (buy) {
      step = "购物";
      if ("error" in buy) cards.push({ ok: false, text: `购物未完成：${buy.error}` });
      else {
        const expectedTotal = daydayExpectedTotal(products, buy.items);
        const bought = await executeDayday("buy", { requestId: `chat-buy:${key}`, items: buy.items, reason: buy.reason, ...(expectedTotal === undefined ? {} : { expectedTotal }) }, false, epoch);
        cards.push(bought.ok ? daydayOrderCard(bought.result as DaydayOrder) : { ok: false, text: `购物未完成，没有扣款：${bought.error}` });
      }
    }
    if (!marker) return cards;
    step = "红包／转账";
    const result = await executeDayday("send_transfer", { ...marker, sessionId, roundId: roundId.slice(0, 100), requestId: `chat-money:${key}` }, false, epoch);
    return [...cards, result.ok ? daydayTransferCard(result.result as DaydayTransfer) : { ok: false, text: `红包／转账未发出：${result.error}` }];
  } catch {
    // A persistence/network error can be ambiguous; never claim a payment failed
    // after the hold may already have committed, or lose the ordinary chat reply.
    return [...cards, { ok: false, text: `${step}结果暂未确认，请到 dayday 查看真实记录后再决定是否重试。` }];
  }
}
