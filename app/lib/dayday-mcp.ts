import { daydayAutonomyOn, logDaydayVisit } from "./dayday-life";
import { DAYDAY_AI_ACTIONS, runDaydayAI } from "./dayday-tools";
import { readBook } from "./dayday-store";
import { EXPENSE_CATS, INCOME_CATS, ledgerView } from "./dayday-ledger";
import { loadUploadImages } from "./upload-images";

export const DAYDAY_TOOLS = [
  { name: "dayday_book", description: "看dayday概况、本周期明细、必支出、待补项及红包转账状态。金额为整数分。", inputSchema: { type: "object", properties: {} } },
  { name: "dayday_shop", description: "看商城、货架和商品原图；可用id只看一件。可以写酥酥说。", inputSchema: { type: "object", properties: { id: { type: "string" } } } },
  { name: "dayday_items", description: "看她已有物品，用来对比是否已有类似的东西；可用id看一件及原图。", inputSchema: { type: "object", properties: { id: { type: "string" } } } },
  { name: "dayday_action", description: "酥酥操作dayday：记账/改账/撤销、增改删必支出、待补项、商品的酥酥说、红包转账。金额整数分；entry.update需kind/cat/amount/note。fixed.update需name/amount/day。不能改设置，不能扣或跳过必支出。红包转账共用余额，发出暂扣，领取或退回释放，不计收支。requestId必填，同一操作重试复用。", inputSchema: {
    type: "object", additionalProperties: false,
    properties: { action: { type: "string", enum: DAYDAY_AI_ACTIONS }, input: { type: "object", description: "操作字段。先读真实id；entry: kind/cat/amount/note/at；fixed: id/name/amount/day；refill: id/name/amount(null表示不记账)；product.say: id/text；money.send: kind(redpacket/transfer)/amount/note；money.receive或return: id。" }, requestId: { type: "string", minLength: 8, maxLength: 100, pattern: "^[A-Za-z0-9_-]+$" } }, required: ["action", "input", "requestId"],
  } },
];

export async function callDaydayTool(name: string, args: Record<string, unknown>, access: string) {
  if (name === "dayday_action") {
    if (access !== "full") throw new Error("聊天记账通过回复末尾的dayday标记执行；自主活动不能改账。");
    if (typeof args.action !== "string" || !args.input || typeof args.input !== "object" || Array.isArray(args.input)
      || typeof args.requestId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(args.requestId)) throw new Error("操作字段或requestId不完整。");
    const result = await runDaydayAI(args.action, args.input as Record<string, unknown>, args.requestId);
    return { content: [{ type: "text" as const, text: JSON.stringify({ result: result.result, repeated: result.repeated, view: ledgerView(result.book) }) }], isError: false };
  }
  if (access === "life" && !daydayAutonomyOn()) throw new Error("dayday 自主逛商城已关闭。");
  const book = await readBook();
  let value: unknown;
  let urls: string[] = [];
  if (name === "dayday_book") value = { configured: book.configured, view: ledgerView(book), fixed: book.fixed, refills: book.refills, gifts: book.gifts, categories: { expense: EXPENSE_CATS, income: INCOME_CATS } };
  else if (name === "dayday_shop" || name === "dayday_items") {
    const rows = (name === "dayday_shop" ? book.products : book.items).filter((p) => !args.id || p.id === args.id);
    value = { shelves: book.shelves, rows, images: "图片按rows顺序附上，每次最多3张；需要看其他原图请用商品或物品id单独读取。" };
    urls = rows.flatMap((p) => p.image ? [p.image] : []).slice(0, 3);
  } else throw new Error("不认识这个dayday工具。");
  if (access === "life" && name === "dayday_shop") await logDaydayVisit();
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }, ...loadUploadImages(urls).map((block) => ({ type: "image" as const, data: block.source.data, mimeType: block.source.media_type }))], isError: false };
}
