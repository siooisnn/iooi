export type LedgerMarker = { action: string; input: Record<string, unknown> };
export type LedgerCard = {
  id: string; kind: "entry" | "fixed" | "money" | "notice" | "product-comment"; ok: boolean; text: string;
  targetId?: string; cycle?: string;
  productName?: string; comment?: string;
};

/** Older generic notices can recover their comment from the saved operation receipt. */
export function daydayCommentForCard(card: LedgerCard, receipt?: unknown): { name: string; text: string } | null {
  if (!card.ok) return null;
  if (card.kind === "product-comment") return { name: card.productName || "商品评论", text: card.comment || "" };
  if (card.kind !== "notice" || card.text !== "dayday · 已更新" || !receipt || typeof receipt !== "object") return null;
  const p = receipt as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.name !== "string" || typeof p.price !== "number" || typeof p.shelf !== "string"
    || typeof p.faved !== "boolean" || typeof p.carted !== "boolean" || (p.susuSays !== undefined && typeof p.susuSays !== "string")) return null;
  return { name: p.name, text: typeof p.susuSays === "string" ? p.susuSays : "" };
}

const BLOCK = /\[dayday\]([\s\S]*?)\[\/dayday\]/gi;
export function parseDaydayMarkers(reply: string): LedgerMarker[] {
  const results: LedgerMarker[] = [];
  for (const match of reply.matchAll(BLOCK)) {
    if (results.length >= 8) break;
    try {
      const value = JSON.parse(match[1]);
      if (typeof value.action === "string" && value.input && typeof value.input === "object" && !Array.isArray(value.input)) results.push(value);
    } catch { results.push({ action: "invalid", input: {} }); }
  }
  return results;
}
export function stripDaydayMarkers(reply: string) {
  return reply.replace(BLOCK, "").replace(/\[dayday\][\s\S]*$/gi, "").trim();
}

export const DAYDAY_CHAT_BRIDGE = `## dayday 记账
你是酥酥，可以帮她记账。她说明确已经发生的收支（如「午饭18」），直接记，不用先问；计划、假设、历史引用不要记。正常回复末尾附隐藏块，系统执行后出卡片，失败会显示失败，不要编造成功。
[dayday]{"action":"entry.add","input":{"kind":"expense","cat":"food","amount":1800,"note":"午饭"}}[/dayday]
金额一律整数分，18元=1800；时间可省略（默认现在），补账用带+08:00的ISO时间。
支出分类：food饮食、daily日用、clothes服饰、misc乱七八糟、transport交通、phone话费订阅、fun娱乐、medical医疗、study学习、gift人情礼物、other其他。收入：allowance生活费、parttime兼职、redpacket红包、refund退款、other-in其他。
允许 entry.add；entry.update（id及完整kind/cat/amount/note，时间不改可省略）；entry.remove（id）。不知道id先用dayday_book工具查，不能猜。
看商品用dayday_shop（带原图），看她已有的东西用dayday_items。写「酥酥说」也用同格式隐藏块：action为product.say，input={id:"商品真实id",text:"你的看法"}。
她让你管理必支出时，可用fixed.add（name/amount/day）、fixed.update（id/name/amount/day）、fixed.remove（id）；管理待补可用refill.add（name）、refill.update（id/name）、refill.done（id/amount；只移出清单、不记账时amount传null）。仍使用同一dayday隐藏块格式。
你可以发红包或转账：money.send，input={kind:"redpacket"或"transfer",amount:分,note:"留言"}；收她发来的用money.receive，退回用money.return，input={id:"真实id"}。
你们共用dayday余额：发出时暂扣，领取或退回即释放，不计消费收入，不另建钱包。她发来的待领取会提供id，你自己决定领取或退回；你发给她的等她点卡片领取，不能替她领。
必支出只在dayday账本首页由她确认扣款或跳过，不在聊天里弹提醒卡，禁止用标记或工具自动扣。不能改设置。
【dayday概况】每轮都有，只放概况；待补项偶尔自然提一句，最近8轮已经提过就别再提，不发推送。没有实际需要，不要逐项汇报余额。`;
