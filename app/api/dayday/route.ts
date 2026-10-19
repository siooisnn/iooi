import { DaydayError } from "@/app/lib/dayday-ledger";
import { readBook, runDayday } from "@/app/lib/dayday-store";

const noStore = { "Cache-Control": "no-store" };

/** Her whole book: settings, entries of the open cycles, shop, items, notebook and summaries. */
export async function GET() {
  try {
    return Response.json({ ok: true, book: await readBook() }, { headers: noStore });
  } catch {
    return Response.json({ ok: false, error: "dayday 账本暂时打不开，数据没有动，请稍后再试。" }, { status: 500, headers: noStore });
  }
}

/** One action from her page: { action, requestId, ...fields }. Her page never writes as 小砖. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return Response.json({ ok: false, error: "请求不完整。" }, { status: 400, headers: noStore });
  const { action, requestId, ...input } = body;
  try {
    const { book, result } = await runDayday(action, input, { requestId });
    return Response.json({ ok: true, book, result }, { headers: noStore });
  } catch (error) {
    if (error instanceof DaydayError) return Response.json({ ok: false, error: error.message }, { status: 400, headers: noStore });
    return Response.json({ ok: false, error: "dayday 没存上，刷新确认一下再试。" }, { status: 500, headers: noStore });
  }
}
