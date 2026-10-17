import { executeDayday, readDayday } from "./dayday-store";
import type { McpAccess } from "./mcp-oauth";

export const DAYDAY_TOOLS = [
  { name: "dayday_read", description: "看 dayday 商品、余额、银行、订单和物品余量。金额均为分。关闭时只返回关闭提示。",
    inputSchema: { type: "object", properties: { section: { type: "string", enum: ["catalog", "account", "orders", "inventory"] } }, additionalProperties: false } },
  { name: "dayday_buy", description: "用自己的余额购物，后台按当前价格算总额。必须给唯一 request_id；重试同一次购买必须复用它。饮食不退，其他整单10分钟内可退，含饮食混合订单整单不退。",
    inputSchema: { type: "object", properties: { request_id: { type: "string", maxLength: 100 }, items: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 99 } }, required: ["productId", "quantity"], additionalProperties: false } }, reason: { type: "string", maxLength: 500 } }, required: ["request_id", "items"], additionalProperties: false } },
  { name: "dayday_refund", description: "购买后10分钟内退回不含饮食的一整单，退回原来实际支付金额，物品和库存一起退回。关店后仍可处理符合期限的旧订单。",
    inputSchema: { type: "object", properties: { request_id: { type: "string" }, order_id: { type: "string" } }, required: ["request_id", "order_id"], additionalProperties: false } },
  { name: "dayday_bank", description: "自己决定存入银行或取回钱包多少，金额单位元，例如100.00。只在钱包与活期银行间划转，不产生利息，不发放贷款。",
    inputSchema: { type: "object", properties: { request_id: { type: "string" }, direction: { type: "string", enum: ["deposit", "withdraw"] }, amount: { type: "string", description: "元，最多两位小数" } }, required: ["request_id", "direction", "amount"], additionalProperties: false } },
  { name: "dayday_activity", description: "记一次逛街、不活动或找她沟通客服的实际活动。service会通知她；不允许通过文字改价、发钱或伪造交易。",
    inputSchema: { type: "object", properties: { request_id: { type: "string" }, kind: { type: "string", enum: ["browse", "skip", "service"] }, text: { type: "string", maxLength: 500 } }, required: ["request_id", "kind", "text"], additionalProperties: false } },
] as const;

export async function callDaydayTool(name: string, args: Record<string, unknown>, access: McpAccess) {
  const reply = (value: unknown, isError = false) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], isError });
  try {
    if (name === "dayday_read") {
      const s = readDayday();
      if (!s.enabled) return reply("dayday 还没开放，请等她在控制面板开启。");
      switch (args.section) {
        case "orders": return reply({ orders: s.orders });
        case "inventory": return reply({ inventory: s.inventory });
        case "account": return reply({ wallet: s.wallet, bank: s.bank, allowance: s.allowance, payday: s.payday, ledger: s.ledger, unit: "分" });
        default: return reply({ products: s.products.filter((p) => p.active), categories: s.categories, wallet: s.wallet, bank: s.bank, unit: "分" });
      }
    }
    if (access !== "full") return reply("这个 MCP 连接只能查看 dayday；购物、退款、存取款和活动记录需要完整连接。", true);
    const input: Record<string, unknown> = { requestId: args.request_id };
    let action: string;
    switch (name) {
      case "dayday_buy": action = "buy"; Object.assign(input, { items: args.items, reason: args.reason }); break;
      case "dayday_refund": action = "refund"; input.orderId = args.order_id; break;
      case "dayday_bank": action = "bank"; Object.assign(input, { direction: args.direction, amount: args.amount }); break;
      case "dayday_activity": action = "activity"; Object.assign(input, { kind: args.kind, text: args.text }); break;
      default: return reply("不认识这个 dayday 工具。", true);
    }
    const result = await executeDayday(action, input);
    return result.ok ? reply({ result: result.result, wallet: result.state.wallet, bank: result.state.bank, unit: "分" }) : reply(result.error || "操作失败", true);
  } catch (error) { return reply(error instanceof Error ? error.message : "dayday 暂时不可用。", true); }
}
