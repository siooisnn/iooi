import { DaydayError } from "@/app/lib/dayday-ledger";
import { readBook, runDayday } from "@/app/lib/dayday-store";
import { withStore } from "@/app/lib/store";
import { yuan, type MoneyGift } from "@/app/lib/dayday-ledger";
import { getTime, getTodayStr } from "@/app/lib/app-time";
import type { ChatSession } from "@/app/lib/app-types";

const noStore = { "Cache-Control": "no-store" };

/** Her whole book: settings, entries of the open cycles, shop, items, notebook and summaries. */
export async function GET() {
  try {
    return Response.json({ ok: true, book: await readBook() }, { headers: noStore });
  } catch {
    return Response.json({ ok: false, error: "dayday 账本暂时打不开，数据没有动，请稍后再试。" }, { status: 500, headers: noStore });
  }
}

/** One action from her page: { action, requestId, ...fields }. Her page never writes as 酥酥. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return Response.json({ ok: false, error: "请求不完整。" }, { status: 400, headers: noStore });
  const { action, requestId, sessionId, ...input } = body;
  try {
    const { book, result } = await runDayday(action, input, { requestId });
    if (action === "money.send" && typeof sessionId === "string" && result) {
      const g = result as MoneyGift;
      await withStore((store) => {
        const sessions = (store.sessions || []) as ChatSession[];
        let session = sessions.find((s) => s.id === sessionId);
        if (!session) { session = { id: sessionId, name: "新对话", createdAt: new Date().toISOString(), messages: [] }; sessions.unshift(session); store.sessions = sessions; }
        const id = `gift_${g.id}`;
        if (!session.messages.some((m) => m.ledger?.id === id)) {
          const text = `你发给酥酥的${g.kind === "redpacket" ? "红包" : "转账"} · ${yuan(g.amount)}${g.note ? ` · ${g.note}` : ""}`;
          session.messages.push({ role: "user", source: "ledger_card", content: text, time: getTime(), date: getTodayStr(), ledger: { id, kind: "money", ok: true, targetId: g.id, text } });
        }
      });
    }
    return Response.json({ ok: true, book, result }, { headers: noStore });
  } catch (error) {
    if (error instanceof DaydayError) return Response.json({ ok: false, error: error.message }, { status: 400, headers: noStore });
    return Response.json({ ok: false, error: "dayday 没存上，刷新确认一下再试。" }, { status: 500, headers: noStore });
  }
}
