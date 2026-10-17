/** Shared dayday domain. All amounts are integer cents; no client supplied totals. */
export const DAYDAY_CATEGORIES = ["饮食", "衣物", "日用", "书籍", "小砖专属"] as const;
export const DAYDAY_ALLOWANCE = 200_000;
export const DAYDAY_REFUND_MS = 10 * 60_000;
export const DAYDAY_TRANSFER_MS = 24 * 3600_000;
export type DaydayTransfer = {
  direction?: "susu_to_human" | "human_to_susu";
  id: string; kind: "redpacket" | "transfer"; amount: number; message: string;
  sessionId: string; roundId?: string; createdAt: number; expiresAt: number;
  status: "pending" | "accepted" | "returned" | "expired"; settledAt?: number;
};
export type DaydayUsage = { amount: number; unit: "day" | "month" };
export type DaydayDiscount = { quantity: number; percent: number };
export type DaydayProduct = {
  id: string; name: string; category: string; description: string; photo: string;
  price: number; stock: number | null; active: boolean; usage: DaydayUsage | null;
  createdAt: number; updatedAt: number;
  discountTiers?: DaydayDiscount[];
};
export type DaydayLine = {
  productId: string; name: string; category: string; photo: string; price: number;
  quantity: number; usage: DaydayUsage | null;
  total?: number; discountPercent?: number;
};
export type DaydayOrder = {
  payer?: "susu" | "human";
  id: string; createdAt: number; lines: DaydayLine[]; total: number; reason: string;
  status: "paid" | "refunded"; refundedAt?: number;
};
export type DaydayEntry = { id: string; at: number; type: string; wallet: number; bank: number; text: string; ref?: string };
export type DaydayHuman = { wallet: number; createdAt: number; ledger: { id: string; at: number; type: string; delta: number; text: string; ref?: string }[] };
export type DaydayEvent = { id: string; at: number; text: string; note?: string; ref?: string; notify: boolean; push?: string };
export type DaydayState = {
  version: 1; enabled: boolean; epoch: number; salaryCheckedAt: number; salaryMonths: string[];
  wallet: number; bank: number; products: DaydayProduct[]; orders: DaydayOrder[];
  ledger: DaydayEntry[]; events: DaydayEvent[];
  transfers: DaydayTransfer[]; initialGrant: { amount: number; at: number } | null;
  human: DaydayHuman;
  routine: { meals: boolean; walks: boolean; times: number; notify: boolean };
  beatSlots: string[];
  receipts: { id: string; fingerprint: string; result: unknown }[];
};
export function newDayday(now = Date.now()): DaydayState {
  return { version: 1, enabled: false, epoch: 0, salaryCheckedAt: now, salaryMonths: [], wallet: 0, bank: 0,
    products: [], orders: [], ledger: [], events: [], beatSlots: [], receipts: [], transfers: [], initialGrant: null, human: newHuman([], now),
    routine: { meals: true, walks: true, times: 7, notify: true } };
}
export function daydayState(raw: unknown, now = Date.now()): DaydayState {
  if (raw === undefined || raw === null) return newDayday(now);
  const s = raw as DaydayState;
  if (s.version !== 1 || !Number.isSafeInteger(s.wallet) || s.wallet < 0 || !Number.isSafeInteger(s.bank) || s.bank < 0
    || !Array.isArray(s.products) || !Array.isArray(s.orders) || !Array.isArray(s.receipts)) throw new Error("dayday 数据异常，已停止操作以保护账本。");
  // Additive migration for accounts created before chat payments.
  s.transfers ??= []; s.initialGrant ??= null;
  s.human ??= newHuman(s.transfers, now);
  if (!Number.isSafeInteger(s.human.wallet) || s.human.wallet < 0 || !Array.isArray(s.human.ledger)) throw new Error("你的虚拟账户数据异常，已停止操作。");
  return s;
}
export function isHumanTransfer(t: DaydayTransfer) { return t.direction === "human_to_susu"; }
function newHuman(transfers: DaydayTransfer[], now: number): DaydayHuman {
  const human: DaydayHuman = { wallet: 50_000, createdAt: now, ledger: [{ id: crypto.randomUUID(), at: now, type: "initial", delta: 50_000, text: "你的初始虚拟额度" }] };
  for (const t of transfers) if (!isHumanTransfer(t) && t.status === "accepted") {
    human.wallet += t.amount;
    human.ledger.push({ id: crypto.randomUUID(), at: t.settledAt || t.createdAt, type: "received", delta: t.amount, text: `收取酥酥的${t.kind === "redpacket" ? "红包" : "转账"}`, ref: t.id });
  }
  human.ledger.sort((a, b) => b.at - a.at);
  return human;
}
function humanLedger(s: DaydayState, type: string, delta: number, text: string, now: number, ref?: string) {
  if (!Number.isSafeInteger(s.human.wallet + delta) || s.human.wallet + delta < 0) throw new Error("你的虚拟余额不足或金额超出范围。");
  s.human.wallet += delta;
  s.human.ledger.unshift({ id: crypto.randomUUID(), at: now, type, delta, text, ...(ref ? { ref } : {}) });
}
export function humanHeldDayday(s: DaydayState, now: number) { return s.transfers.filter((t) => isHumanTransfer(t) && t.status === "pending" && t.expiresAt > now).reduce((sum, t) => sum + t.amount, 0); }
export function humanAvailableDayday(s: DaydayState, now: number) { return s.human.wallet - humanHeldDayday(s, now); }
export function heldDayday(s: DaydayState, now: number) {
  return s.transfers.filter((t) => !isHumanTransfer(t) && t.status === "pending" && t.expiresAt > now).reduce((sum, t) => sum + t.amount, 0);
}
export function availableDayday(s: DaydayState, now: number) { return s.wallet - heldDayday(s, now); }
export function cstParts(now: number) {
  const d = new Date(now + 8 * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}
export function money(cents: number) { return (cents / 100).toFixed(2); }
/** Same-product quantity tiers apply to every item; round the line once to cents. */
export function daydayPrice(product: Pick<DaydayProduct, "price" | "discountTiers">, quantity: number) {
  const percent = Math.min(100, ...(product.discountTiers || []).filter((t) => quantity >= t.quantity).map((t) => t.percent));
  return { percent, total: Math.round(product.price * quantity * percent / 100) };
}
/**
 * Total the model saw when it decided, using the same per-product quantity
 * merge as buyDayday. Undefined when any id is unknown, so the order fails with
 * "不存在" rather than a misleading "价格已变化".
 */
export function daydayExpectedTotal(products: Pick<DaydayProduct, "id" | "price" | "discountTiers" | "active">[], items: unknown) {
  if (!Array.isArray(items)) return undefined;
  const quantities = new Map<string, number>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return undefined;
    const { productId, quantity } = raw as { productId?: unknown; quantity?: unknown };
    if (typeof productId !== "string" || typeof quantity !== "number" || !Number.isSafeInteger(quantity)) return undefined;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  let total = 0;
  for (const [id, quantity] of quantities) {
    const product = products.find((p) => p.id === id && p.active);
    if (!product) return undefined;
    total += daydayPrice(product, quantity).total;
  }
  return total;
}
export function daydayDiscountText(product: Pick<DaydayProduct, "discountTiers">) {
  return (product.discountTiers || []).map((t) => `满${t.quantity}件${t.percent / 10}折`).join("，");
}
export function toCents(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("金额不正确。");
  const text = String(value).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) throw new Error("金额需为非负数，最多两位小数。");
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
function integer(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}需为 ${min}～${max} 的整数。`);
  return value;
}
function short(value: unknown, max: number, label: string, required = false) {
  if (value !== undefined && typeof value !== "string") throw new Error(`${label}格式不正确。`);
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > max) throw new Error(`${label}${required ? "不能为空，" : ""}最多 ${max} 字。`);
  return result;
}
export function event(s: DaydayState, text: string, now: number, notify = false, ref?: string, note?: string) {
  const e: DaydayEvent = { id: crypto.randomUUID(), at: now, text, notify: notify && s.routine.notify, ...(ref ? { ref } : {}), ...(note ? { note } : {}) };
  s.events.unshift(e);
  return e;
}
function ledger(s: DaydayState, type: string, wallet: number, bank: number, text: string, now: number, ref?: string) {
  if (!Number.isSafeInteger(s.wallet + wallet) || !Number.isSafeInteger(s.bank + bank) || s.wallet + wallet < 0 || s.bank + bank < 0) throw new Error("账户余额不足或金额超出范围。");
  s.wallet += wallet; s.bank += bank;
  s.ledger.unshift({ id: crypto.randomUUID(), at: now, type, wallet, bank, text, ...(ref ? { ref } : {}) });
}
function pay(s: DaydayState, year: number, month: number, now: number) {
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  if (s.salaryMonths.includes(key)) return;
  ledger(s, "allowance", DAYDAY_ALLOWANCE, 0, `${key} 月度额度`, now);
  s.salaryMonths.push(key);
  event(s, `收到 ${key} 月度额度 ¥2000.00，结余继续保留。`, now);
}
/** Settled at toggle boundaries as well as heartbeats. Disabled intervals never accrue. */
export function settleDayday(s: DaydayState, now: number) {
  for (const transfer of s.transfers) {
    if (transfer.status === "pending" && transfer.expiresAt <= now) settleDaydayTransfer(s, transfer.id, "expired", now);
  }
  if (now < s.salaryCheckedAt) return;
  if (s.enabled) {
    const from = cstParts(s.salaryCheckedAt), until = cstParts(now);
    for (let index = from.year * 12 + from.month; index <= until.year * 12 + until.month; index++) {
      const year = Math.floor(index / 12), month = index % 12;
      const due = Date.UTC(year, month, 15, -8);
      if (due > s.salaryCheckedAt && due <= now) pay(s, year, month, due);
    }
  }
  s.salaryCheckedAt = now;
}
export function configureDayday(s: DaydayState, input: Record<string, unknown>, now: number) {
  settleDayday(s, now);
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") throw new Error("开关格式不正确。");
    if (s.enabled !== input.enabled) {
      s.enabled = input.enabled; s.epoch++;
      // Opening on payday is eligible once; reopening after payday is not back pay.
      const date = cstParts(now);
      if (s.enabled && date.day === 15) pay(s, date.year, date.month, now);
    }
  }
  if (input.routine !== undefined) {
    if (!input.routine || typeof input.routine !== "object") throw new Error("生活安排格式不正确。");
    const r = input.routine as Record<string, unknown>;
    for (const key of ["meals", "walks", "notify"] as const) {
      if (r[key] !== undefined) {
        if (typeof r[key] !== "boolean") throw new Error("生活安排开关不正确。");
        s.routine[key] = r[key];
      }
    }
    if (r.times !== undefined) s.routine.times = integer(r.times, 3, 12, "每天唤醒机会");
  }
  return { enabled: s.enabled, routine: s.routine };
}
export function saveDaydayProduct(s: DaydayState, input: Record<string, unknown>, now: number) {
  const previous = input.id === undefined ? undefined : s.products.find((p) => p.id === input.id);
  if (input.id !== undefined && !previous) throw new Error("商品不存在。");
  if (previous && input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== previous.updatedAt) throw new Error("商品或库存刚刚有变化，请关闭编辑窗口、刷新后再修改。");
  const name = short(input.name, 80, "商品名称", true);
  const category = short(input.category, 30, "分类", true);
  const photo = short(input.photo, 180, "商品图片");
  if (photo && (!/^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.(jpg|jpeg|png|gif|webp)$/i.test(photo) || photo.includes(".."))) throw new Error("请上传商品图片，不支持外部图片地址。");
  const stock = input.stock === null || input.stock === undefined ? null : integer(input.stock, 0, 1_000_000, "库存");
  const price = toCents(input.price);
  const discountTiers: DaydayDiscount[] = [];
  const rawTiers = input.discountTiers === undefined ? previous?.discountTiers || [] : input.discountTiers;
  if (!Array.isArray(rawTiers) || rawTiers.length > 8) throw new Error("多件折扣最多设置8档。");
  for (const raw of rawTiers) {
    if (!raw || typeof raw !== "object") throw new Error("多件折扣格式不正确。");
    const quantity = integer(raw.quantity, 2, 99, "折扣件数"), percent = integer(raw.percent, 1, 99, "折扣百分比");
    if (discountTiers.some((t) => t.quantity === quantity)) throw new Error("同一件数不能重复设置折扣。");
    discountTiers.push({ quantity, percent });
  }
  discountTiers.sort((a, b) => a.quantity - b.quantity);
  let usage: DaydayUsage | null = null;
  if (input.usage !== null && input.usage !== undefined) {
    const u = input.usage as Record<string, unknown>;
    if (category !== "日用" || !u || !["day", "month"].includes(String(u.unit))) throw new Error("日用品消耗需选择天或月。");
    usage = { amount: integer(u.amount, 1, u.unit === "month" ? 120 : 3650, "每份可用时长"), unit: u.unit as "day" | "month" };
  }
  if (input.active !== undefined && typeof input.active !== "boolean") throw new Error("上架状态不正确。");
  const product: DaydayProduct = { id: previous?.id || crypto.randomUUID(), name, category, photo, price, stock, usage, discountTiers,
    description: short(input.description, 2000, "商品说明"), active: input.active !== false, createdAt: previous?.createdAt || now, updatedAt: Math.max(now, (previous?.updatedAt || 0) + 1) };
  if (previous) s.products[s.products.indexOf(previous)] = product; else s.products.push(product);
  return product;
}
export function requireDayday(s: DaydayState) {
  if (!s.enabled) throw new Error("dayday 已关闭，不能购物、存取款或开展活动。请等她在控制面板开启。");
}
export function buyDayday(s: DaydayState, input: Record<string, unknown>, now: number, human = false) {
  requireDayday(s);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) throw new Error("订单需包含 1～50 项商品。");
  const quantities = new Map<string, number>();
  for (const raw of input.items) {
    if (!raw || typeof raw !== "object" || typeof raw.productId !== "string") throw new Error("商品编号不正确。");
    const quantity = integer(raw.quantity, 1, 99, "购买数量");
    quantities.set(raw.productId, (quantities.get(raw.productId) || 0) + quantity);
  }
  const lines: DaydayLine[] = [];
  for (const [id, quantity] of quantities) {
    const p = s.products.find((p) => p.id === id && p.active);
    if (!p) throw new Error("有商品已下架或不存在，请刷新购物车。");
    if (quantity > 99) throw new Error("同一商品每单最多 99 份。");
    if (p.stock !== null && p.stock < quantity) throw new Error(`「${p.name}」库存不足。`);
    const quote = daydayPrice(p, quantity);
    lines.push({ productId: p.id, name: p.name, category: p.category, photo: p.photo, price: p.price, quantity, total: quote.total, discountPercent: quote.percent, usage: p.usage ? { ...p.usage } : null });
  }
  const total = lines.reduce((sum, p) => sum + (p.total ?? p.price * p.quantity), 0);
  if (input.expectedTotal !== undefined && input.expectedTotal !== total) throw new Error("商品价格已变化，请刷新购物车后重新确认。");
  if (!Number.isSafeInteger(total) || total > (human ? humanAvailableDayday(s, now) : availableDayday(s, now))) throw new Error(human ? "你的可用虚拟余额不足，请减少商品。" : "余额不足（含待收红包／转账的冻结金额），请减少商品或从银行取款。");
  const reason = short(input.reason, 500, "购物理由");
  const order: DaydayOrder = { id: crypto.randomUUID(), createdAt: now, lines, total, reason, status: "paid", ...(human ? { payer: "human" } : {}) };
  const description = `${human ? "买来送酥酥" : "购买"} ${lines.map((p) => `${p.name}×${p.quantity}`).join("、")}`;
  if (human) humanLedger(s, "gift_purchase", -total, description, now, order.id);
  else ledger(s, "purchase", -total, 0, description, now, order.id);
  for (const line of lines) { const p = s.products.find((p) => p.id === line.productId)!; if (p.stock !== null) { p.stock -= line.quantity; p.updatedAt = Math.max(now, p.updatedAt + 1); } }
  s.orders.unshift(order);
  event(s, `${human ? "她买来送给酥酥" : "买了"}${lines.map((p) => `「${p.name}」×${p.quantity}`).join("、")}，花费 ¥${money(total)}。`, now, !human, order.id, reason);
  return order;
}
/** Mirrors refundDayday's checks so the UI and chat context never offer a refund that would fail. */
export function daydayRefundable(order: Pick<DaydayOrder, "status" | "payer" | "lines" | "createdAt">, now: number, manager = false) {
  return order.status === "paid" && (manager || order.payer !== "human") && !order.lines.some((p) => p.category === "饮食")
    && now >= order.createdAt && now - order.createdAt <= DAYDAY_REFUND_MS;
}
export function refundDayday(s: DaydayState, id: unknown, now: number, manager = false) {
  const order = s.orders.find((o) => o.id === id);
  if (!order) throw new Error("订单不存在。");
  if (order.payer === "human" && !manager) throw new Error("这是她买来送你的礼物，退款需由她操作。");
  if (order.status === "refunded") return order;
  if (order.lines.some((p) => p.category === "饮食")) throw new Error("含饮食的订单不支持整单退款，请将饮食和其他商品分开下单。");
  if (now < order.createdAt || now - order.createdAt > DAYDAY_REFUND_MS) throw new Error("已超过购买后 10 分钟的退款期限。");
  if (order.payer === "human") humanLedger(s, "gift_refund", order.total, "赠礼订单整单退款", now, order.id);
  else ledger(s, "refund", order.total, 0, "整单退款", now, order.id);
  order.status = "refunded"; order.refundedAt = now;
  for (const line of order.lines) { const p = s.products.find((p) => p.id === line.productId); if (p && p.stock !== null) { p.stock += line.quantity; p.updatedAt = Math.max(now, p.updatedAt + 1); } }
  event(s, `整单退款 ¥${money(order.total)}，物品已退回。`, now, true, order.id);
  return order;
}
export function bankDayday(s: DaydayState, input: Record<string, unknown>, now: number) {
  requireDayday(s);
  const amount = toCents(input.amount);
  if (amount <= 0) throw new Error("存取金额需大于零。");
  if (input.direction !== "deposit" && input.direction !== "withdraw") throw new Error("请选择存入或取出。");
  const deposit = input.direction === "deposit";
  if (deposit && amount > availableDayday(s, now)) throw new Error("可用余额不足，待收红包或转账的冻结金额不能存入银行。");
  ledger(s, deposit ? "deposit" : "withdraw", deposit ? -amount : amount, deposit ? amount : -amount, deposit ? "存入银行" : "从银行取出", now);
  event(s, `${deposit ? "存入银行" : "从银行取出"} ¥${money(amount)}。`, now);
  return { wallet: s.wallet, bank: s.bank };
}
export function initialDaydayGrant(s: DaydayState, now: number) {
  if (s.initialGrant) return s.initialGrant;
  ledger(s, "initial_grant", DAYDAY_ALLOWANCE, 0, "首次额度（一次性，独立于月度额度）", now);
  s.initialGrant = { amount: DAYDAY_ALLOWANCE, at: now };
  event(s, "她发放了首次额度 ¥2000.00，今后仍按每月15日发放月度额度。", now);
  return s.initialGrant;
}
export function sendDaydayTransfer(s: DaydayState, input: Record<string, unknown>, now: number, sessionId?: string, human = false) {
  requireDayday(s);
  if (input.kind !== "redpacket" && input.kind !== "transfer") throw new Error("请选择红包或转账。");
  const amount = toCents(input.amount);
  if (amount <= 0) throw new Error("金额需大于零。");
  if (amount > (human ? humanAvailableDayday(s, now) : availableDayday(s, now))) throw new Error(human ? "你的可用虚拟余额不足。" : "余额不足，不能发出这个红包或转账。");
  const transfer: DaydayTransfer = { id: crypto.randomUUID(), kind: input.kind, amount,
    message: short(input.message, 200, "祝福或转账备注") || (input.kind === "redpacket" ? "给你一点小心意" : "给你的转账"),
    sessionId: short(sessionId || input.sessionId, 100, "聊天窗口", true),
    ...(typeof input.roundId === "string" ? { roundId: short(input.roundId, 100, "聊天轮次") } : {}),
    createdAt: now, expiresAt: now + DAYDAY_TRANSFER_MS, status: "pending", ...(human ? { direction: "human_to_susu" } : {}) };
  s.transfers.unshift(transfer);
  const text = `${input.kind === "redpacket" ? "红包" : "转账"}待收取，冻结 ¥${money(amount)}`;
  if (human) humanLedger(s, "transfer_hold", 0, text, now, transfer.id);
  else ledger(s, "transfer_hold", 0, 0, text, now, transfer.id);
  event(s, `${human ? "她给酥酥发来" : "发来"}${input.kind === "redpacket" ? "一个红包" : "一笔转账"}，等待${human ? "酥酥" : "你"}收取或退回。`, now, !human, transfer.id, transfer.message);
  return transfer;
}
export function settleDaydayTransfer(s: DaydayState, id: unknown, status: "accepted" | "returned" | "expired", now: number) {
  const transfer = s.transfers.find((t) => t.id === id);
  if (!transfer) throw new Error("红包或转账不存在。");
  if (transfer.status !== "pending") return transfer;
  if (transfer.expiresAt <= now) status = "expired";
  if (status === "expired" && transfer.expiresAt > now) throw new Error("这笔金额尚未到期。");
  const kind = transfer.kind === "redpacket" ? "红包" : "转账";
  if (isHumanTransfer(transfer)) {
    if (status === "accepted") {
      humanLedger(s, "transfer_paid", -transfer.amount, `酥酥收取了你的${kind}`, now, transfer.id);
      ledger(s, "transfer_received", transfer.amount, 0, `收取她的${kind}`, now, transfer.id);
    } else humanLedger(s, "transfer_release", 0, status === "returned" ? `酥酥退回了你的${kind}，已解冻` : `${kind}到期未领取，已解冻`, now, transfer.id);
    transfer.status = status; transfer.settledAt = now;
    event(s, status === "accepted" ? `酥酥收取了你的${kind} ¥${money(transfer.amount)}，已从你的虚拟账户转入他的日常钱包。` : `给酥酥的${kind}${status === "returned" ? "已退回" : "到期未领取"}，没有扣款。`, now, false, transfer.id);
    return transfer;
  }
  if (status === "accepted") humanLedger(s, "received", transfer.amount, `收取酥酥的${kind}`, now, transfer.id);
  ledger(s, status === "accepted" ? "transfer_paid" : "transfer_release", status === "accepted" ? -transfer.amount : 0, 0,
    status === "accepted" ? `她收取了${kind} ¥${money(transfer.amount)}` : status === "returned" ? `她退回了${kind}，解冻 ¥${money(transfer.amount)}` : `${kind}24小时未领取，解冻 ¥${money(transfer.amount)}`, now, transfer.id);
  transfer.status = status; transfer.settledAt = now;
  event(s, status === "accepted" ? `你收取了${kind} ¥${money(transfer.amount)}，已计入酥酥的支出。` : status === "returned" ? `你退回了${kind}，没有扣款。` : `${kind}到期未领取，已自动退回，没有扣款。`, now, false, transfer.id);
  return transfer;
}
function addUsage(start: number, usage: DaydayUsage, quantity: number) {
  if (usage.unit === "day") return start + usage.amount * quantity * 86_400_000;
  const d = new Date(start + 8 * 3600_000), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + usage.amount * quantity);
  const endDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, endDay));
  return d.getTime() - 8 * 3600_000;
}
export function daydayInventory(s: DaydayState, now: number) {
  const endByProduct = new Map<string, number>();
  return [...s.orders].reverse().filter((o) => o.status === "paid").flatMap((order) => order.lines.map((line) => {
    const startsAt = line.usage ? Math.max(order.createdAt, endByProduct.get(line.productId) || 0) : order.createdAt;
    const endsAt = line.usage ? addUsage(startsAt, line.usage, line.quantity) : null;
    if (endsAt) endByProduct.set(line.productId, endsAt);
    const remaining = endsAt ? Math.max(0, Math.min(1, (endsAt - now) / (endsAt - startsAt))) : 1;
    return { ...line, orderId: order.id, giftedByHuman: order.payer === "human", startsAt, endsAt, remaining, remainingDays: endsAt ? Math.max(0, Math.ceil((endsAt - Math.max(now, startsAt)) / 86_400_000)) : null };
  }));
}
export function daydaySnapshot(s: DaydayState, now = Date.now()) {
  const current = cstParts(now);
  const monthly = s.ledger.filter((e) => { const d = cstParts(e.at); return d.year === current.year && d.month === current.month; });
  const monthlySpent = monthly.filter((e) => ["purchase", "refund", "transfer_paid"].includes(e.type)).reduce((sum, e) => sum - e.wallet, 0);
  const monthlyIncome = monthly.filter((e) => ["allowance", "initial_grant", "transfer_received"].includes(e.type)).reduce((sum, e) => sum + e.wallet, 0);
  const todaySpent = monthly.filter((e) => cstParts(e.at).day === current.day && ["purchase", "refund", "transfer_paid"].includes(e.type)).reduce((sum, e) => sum - e.wallet, 0);
  return { enabled: s.enabled, epoch: s.epoch, wallet: s.wallet, bank: s.bank, allowance: DAYDAY_ALLOWANCE, payday: 15,
    monthlySpent, monthlyIncome, todaySpent, available: availableDayday(s, now), held: heldDayday(s, now), initialGrant: s.initialGrant,
    human: { wallet: s.human.wallet, available: humanAvailableDayday(s, now), held: humanHeldDayday(s, now), initialAmount: 50_000, ledger: s.human.ledger.slice(0, 300) },
    transfers: s.transfers.slice(0, 100).map((t) => t.status === "pending" && t.expiresAt <= now ? { ...t, status: "expired" as const } : t),
    categories: [...new Set([...DAYDAY_CATEGORIES, ...s.products.map((p) => p.category)])],
    routine: s.routine, products: s.products, orders: s.orders.slice(0, 200), ledger: s.ledger.slice(0, 300),
    inventory: daydayInventory(s, now), events: s.events.slice(0, 100), serverTime: now };
}
export type DaydaySnapshot = ReturnType<typeof daydaySnapshot>;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function daydayCommand(s: DaydayState, action: string, input: Record<string, unknown>, now: number, manager = false, sessionId?: string) {
  const admin = ["configure", "save_product", "initial_grant", "settle_transfer", "human_send", "human_buy_gift", "human_initialize"].includes(action);
  if (admin && !manager) throw new Error("商品、价格、库存和开关只能由店长管理。");
  const requestId = short(input.requestId, 100, "请求编号", true);
  const fingerprint = canonical({ action, ...input });
  const previous = s.receipts.find((r) => r.id === requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new Error("请求编号已用于其他操作，请使用新的编号。");
    return previous.result;
  }
  let result: unknown;
  switch (action) {
    case "configure": result = configureDayday(s, input, now); break;
    case "save_product": result = saveDaydayProduct(s, input, now); break;
    case "buy": result = buyDayday(s, input, now); break;
    // Refunds remain available while closed, so the switch cannot trap an existing order.
    case "refund": result = refundDayday(s, input.orderId, now, manager); break;
    case "bank": result = bankDayday(s, input, now); break;
    case "initial_grant": result = initialDaydayGrant(s, now); break;
    case "send_transfer": result = sendDaydayTransfer(s, input, now, sessionId); break;
    case "human_send": result = sendDaydayTransfer(s, input, now, sessionId, true); break;
    case "human_initialize": result = { wallet: s.human.wallet, createdAt: s.human.createdAt }; break;
    case "human_buy_gift": result = buyDayday(s, input, now, true); break;
    case "settle_transfer": {
      if (input.decision !== "accepted" && input.decision !== "returned") throw new Error("请选择收取或退回。");
      if (s.transfers.some((t) => t.id === input.transferId && isHumanTransfer(t))) throw new Error("给酥酥的红包或转账由他自己决定收取或退回。");
      result = settleDaydayTransfer(s, input.transferId, input.decision, now); break;
    }
    case "receive_transfer": {
      requireDayday(s);
      if (manager) throw new Error("收取给酥酥的红包或转账需由酥酥自己操作。");
      const transfer = s.transfers.find((t) => t.id === input.transferId);
      if (!transfer || !isHumanTransfer(transfer)) throw new Error("你只能处理她发给你的红包或转账。");
      if (input.decision !== "accepted" && input.decision !== "returned") throw new Error("请选择收取或退回。");
      result = settleDaydayTransfer(s, input.transferId, input.decision, now); break;
    }
    case "activity": {
      requireDayday(s);
      const text = short(input.text, 500, "活动记录", true);
      const kind = input.kind;
      if (!["browse", "skip", "service"].includes(String(kind))) throw new Error("活动类型不正确。");
      result = event(s, text, now, kind === "service"); break;
    }
    default: throw new Error("不支持这个 dayday 操作。");
  }
  s.receipts.push({ id: requestId, fingerprint, result: structuredClone(result) });
  return result;
}
/** Seven default opportunities: breakfast, morning, lunch, afternoon, dinner, evening, late evening. */
export function daydaySlots(s: DaydayState) {
  const mealHours = s.routine.meals ? [8, 12, 18] : [];
  const walkHours = s.routine.walks ? [10, 15, 20, 22, 9, 11, 14, 16, 17] : [];
  return [...mealHours, ...walkHours.slice(0, Math.max(0, s.routine.times - mealHours.length))].sort((a, b) => a - b);
}
export function dueDaydaySlot(s: DaydayState, now: number) {
  if (!s.enabled) return null;
  const date = cstParts(now);
  const hour = daydaySlots(s).find((h) => h === date.hour);
  if (hour === undefined) return null;
  const key = `${date.year}-${date.month + 1}-${date.day}:${hour}`;
  if (s.beatSlots.includes(key)) return null;
  return { key, name: s.routine.meals && [8, 12, 18].includes(hour) ? ({ 8: "早餐", 12: "午饭", 18: "晚饭" } as Record<number, string>)[hour] : "逛一逛" };
}
