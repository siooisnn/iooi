import { compactContext } from "@/app/lib/compact-context";
import { estimateTokens, GROUP_CONTEXT_BUDGET, type ContextMessage } from "@/app/lib/context-budget";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  if (process.env.IOOI_TOKEN && request.headers.get("x-iooi-token") !== process.env.IOOI_TOKEN) {
    return Response.json({ reply: "Unauthorized", status: 401 }, { status: 401 });
  }
  const body = await request.json();
  if (typeof body.sessionId !== "string" || !body.sessionId || body.sessionId.length > 200 || !Array.isArray(body.messages)) {
    return Response.json({ reply: "群聊上下文无效", status: 400 }, { status: 400 });
  }
  const messages: ContextMessage[] = body.messages;
  if (messages.some((m, i) => !Number.isInteger(m.index) || m.index < 0 || (i > 0 && m.index <= messages[i - 1].index)
    || !["user", "assistant"].includes(m.role) || typeof m.content !== "string"
    || (m.speaker !== undefined && typeof m.speaker !== "string"))) {
    return Response.json({ reply: "群聊上下文无效", status: 400 }, { status: 400 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let connected = true;
      const emit = (event: object) => { if (connected) { try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { connected = false; } } };
      emit({ type: "start", padding: " ".repeat(1100) });
      const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 15_000);
      try {
        const context = await compactContext({
          scope: `group:${body.sessionId}`, messages, budget: GROUP_CONTEXT_BUDGET, kind: "group",
          overhead: 3_000 + estimateTokens(typeof body.systemPrompt === "string" ? body.systemPrompt : ""),
          signal: request.signal, onProgress: (text) => emit({ type: "progress", text }),
        });
        emit({ type: "done", status: 200, ...context });
      } catch (error) {
        emit({ type: "error", status: 502, reply: error instanceof Error ? error.message : "上下文压缩失败；原记录已保留。" });
      } finally {
        clearInterval(heartbeat);
        if (connected) { try { controller.close(); } catch { /* disconnected */ } }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
